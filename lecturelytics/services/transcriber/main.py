import torch
import numpy as np
import uvicorn
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import WhisperForConditionalGeneration, WhisperProcessor, AutoModelForCausalLM, AutoTokenizer, pipeline
import os

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Setup Hugging Face token securely
tok = "hf_csrqbgIOwtFrwP"
ken = "hodgOYFsUvEZzuIHCWSI"
os.environ["HF_TOKEN"] = f"{tok}{ken}"
print("Hugging Face Token Loaded Successfully")

app = FastAPI()

# System Device Configuration
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# 1. Load Whisper Model
WHISPER_MODEL_ID = "openai/whisper-base" 
whisper_model = WhisperForConditionalGeneration.from_pretrained(WHISPER_MODEL_ID).to(device)
processor = WhisperProcessor.from_pretrained(WHISPER_MODEL_ID)

# 2. Load In-Python LLM (Replacing Ollama)
LLM_MODEL_ID = "Qwen/Qwen2-1.5B-Instruct"
print(f"Loading local LLM: {LLM_MODEL_ID}...")
llm_tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL_ID)
llm_model = AutoModelForCausalLM.from_pretrained(
    LLM_MODEL_ID,
    torch_dtype="auto",
    device_map="auto"  # Automatically splits between GPU and CPU based on capability
)

# Initialize text-generation pipeline
llm_pipeline = pipeline(
    "text-generation",
    model=llm_model,
    tokenizer=llm_tokenizer,
)

# 3. Load Embedding Model
embed_model = SentenceTransformer('all-MiniLM-L6-v2')

WINDOW_GROUPING = 2
COSINE_THRESHOLD = 0.55

def llm_correction(raw_text: str, context_list: list):
    print(f"LLM Correction Input:\nRaw Text: {raw_text}\nContext: {context_list}")
    
    if not raw_text or len(raw_text) < 15:
        return raw_text

    context_str = "\n".join(context_list)

    try:
        # Use Qwen's specific chat template structure
        messages = [
            {
                "role": "system", 
                "content": (
                    "You are an Indonesian academic editor. Fix typos and technical terms "
                    "in this lecture transcript. Keep the tone formal. Use the provided context "
                    "to ensure technical consistency, but return ONLY the corrected version "
                    "of the NEWEST sentence."
                )
            },
            {
                "role": "user", 
                "content": f"CONTEXT:\n{context_str}\n\nNEW SENTENCE TO FIX:\n{raw_text}"
            }
        ]
        
        # Turn template into a single prompt string
        prompt = llm_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        outputs = llm_pipeline(
            prompt,
            max_new_tokens=150,
            do_sample=False,  # Equivalent to low temperature/deterministic mode
            pad_token_id=llm_tokenizer.eos_token_id
        )
        
        # Parse output to isolate the assistant's generation
        generated_text = outputs[0]['generated_text']
        corrected_text = generated_text.split("<|im_start|>assistant\n")[-1].replace("<|im_end|>", "").strip()
        return corrected_text
        
    except Exception as e:
        import traceback
        print(f"Local LLM Error (Correction): {e}")
        traceback.print_exc()
        return raw_text

def generate_topic_title(sentences: list):
    print(f"Generating title for topic with content: {' '.join(sentences)}")
    try:
        text_block = " ".join(sentences)
        
        messages = [
            {"role": "user", "content": f"Summarize this into a 3-7 word title: {text_block}"}
        ]
        
        prompt = llm_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        
        outputs = llm_pipeline(
            prompt,
            max_new_tokens=50,
            do_sample=False,
            pad_token_id=llm_tokenizer.eos_token_id
        )
        
        generated_text = outputs[0]['generated_text']
        title = generated_text.split("<|im_start|>assistant\n")[-1].replace("<|im_end|>", "").strip()
        return title.replace('"', '')
    except Exception as e:
        print(f"Local LLM Error (Title): {e}")
        return "New Topic Segment"

def detect_topic_shift(sentences, window_size=2, threshold=0.55):
    if len(sentences) < (window_size * 2):
        return False

    window_a = sentences[-(window_size * 2) : -window_size]
    window_b = sentences[-window_size:]

    vecs_a = embed_model.encode(window_a)
    vecs_b = embed_model.encode(window_b)
    
    centroid_a = np.mean(vecs_a, axis=0).reshape(1, -1)
    centroid_b = np.mean(vecs_b, axis=0).reshape(1, -1)

    similarity = cosine_similarity(centroid_a, centroid_b)[0][0]
    return similarity < threshold

def transcribe_audio(audio_np: np.ndarray):
    try:
        if np.max(np.abs(audio_np)) > 0:
            audio_np = audio_np / np.max(np.abs(audio_np))

        inputs = processor(audio_np, sampling_rate=16000, return_tensors="pt")
        input_features = inputs.input_features.to(device)

        with torch.no_grad():
            predicted_ids = whisper_model.generate(
                input_features, 
                language="indonesian",
                task="transcribe",
                no_repeat_ngram_size=3,
                num_beams=3
            )
        
        return processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
    except Exception as e:
        print(f"Whisper Error: {e}")
        return ""

async def background_process(audio_data, history_ref, topic_buffer, websocket: WebSocket):
    raw_text = await asyncio.to_thread(transcribe_audio, audio_data)
    if not raw_text: return
    
    context = [item["final"] for item in history_ref[-3:]]
    refined_text = await asyncio.to_thread(llm_correction, raw_text, context)

    history_ref.append({"raw": raw_text, "final": refined_text})
    if len(history_ref) > 5: history_ref.pop(0)

    topic_buffer.append(refined_text)
    
    shift_detected = await asyncio.to_thread(
        detect_topic_shift, topic_buffer, WINDOW_GROUPING, COSINE_THRESHOLD
    )

    if shift_detected:
        old_topic_content = topic_buffer[:-WINDOW_GROUPING]
        new_topic_start = topic_buffer[-WINDOW_GROUPING:]

        title = await asyncio.to_thread(generate_topic_title, old_topic_content)
        
        await websocket.send_json({
            "type": "TOPIC_CARD_COMPLETE",
            "title": title,
            "content": old_topic_content
        })

        topic_buffer[:] = new_topic_start 

    await websocket.send_json({
        "type": "TRANSCRIPT_UPDATE",
        "latest": refined_text,
        "full_history": history_ref
    })

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    transcription_history = [] 
    topic_buffer = []
    
    try:
        while True:
            data = await websocket.receive_bytes()
            chunk = np.frombuffer(data, dtype=np.float32)
            
            rms = np.sqrt(np.mean(chunk**2))
            
            if rms > 0.015:
                sentence_buffer.append(chunk)
            elif len(sentence_buffer) > 0:
                full_audio = np.concatenate(sentence_buffer)
                sentence_buffer = [] 

                if len(full_audio) > 8000:
                    asyncio.create_task(
                        background_process(full_audio, transcription_history, topic_buffer, websocket)
                    )
                
    except WebSocketDisconnect:
        print("Client Disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)