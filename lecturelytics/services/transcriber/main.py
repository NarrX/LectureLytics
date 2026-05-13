import torch
import numpy as np
import uvicorn
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import WhisperForConditionalGeneration, WhisperProcessor
import ollama
from ollama import Client
import os

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

import os
os.environ["OLLAMA_HOST"] = "127.0.0.1:11434"
client = Client(host='http://127.0.0.1:11434')

# Initialize the model (it will download automatically on first run)
embed_model = SentenceTransformer('all-MiniLM-L6-v2')

# Set your token
os.environ["HF_TOKEN"] = "hf_VepKxofNESDKF  buaMylHuKmmbTTviDDdbu"

app = FastAPI()

MODEL_ID = "openai/whisper-base" 
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load Whisper
model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID).to(device)
processor = WhisperProcessor.from_pretrained(MODEL_ID)


WINDOW_GROUPING = 2
COSINE_THRESHOLD = 0.55
LLM_MODEL_TYPE = 'qwen2:1.5b'

def llm_correction(raw_text: str, context_list: list):
    print(f"LLM Correction Input:\nRaw Text: {raw_text}\nContext: {context_list}")
    
    if not raw_text or len(raw_text) < 15:
        return raw_text

    # Join the last 3 sentences into a context string
    context_str = "\n".join(context_list)

    try:
        system_msg = (
            "You are an Indonesian academic editor. Fix typos and technical terms "
            "in this lecture transcript. Keep the tone formal. Use the provided context "
            "to ensure technical consistency, but return ONLY the corrected version "
            "of the NEWEST sentence."
        )
        
        user_msg = f"CONTEXT:\n{context_str}\n\nNEW SENTENCE TO FIX:\n{raw_text}"

        response = client.chat(
            model=LLM_MODEL_TYPE,
            messages=[
                {'role': 'system', 'content': system_msg},
                {'role': 'user', 'content': user_msg},
            ],
            options={"temperature": 0.3, "num_predict": 150}
        )
        return response['message']['content'].strip()
    except Exception as e:
        import traceback
        print(f"Ollama Error1: {e}")
        traceback.print_exc() # This will show the full error stack
        return 'failed to correct'

def generate_topic_title(sentences: list):
    print(f"Generating title for topic with content: {' '.join(sentences)}")
    try:
        text_block = " ".join(sentences)
        response = client.chat(
            model=LLM_MODEL_TYPE,
            messages=[{'role': 'user', 'content': f"Summarize this into a 3-7 word title: {text_block}"}]
        )
        return response['message']['content'].strip().replace('"', '')
    except:
        return "New Topic Segment"

def detect_topic_shift(sentences, window_size=2, threshold=0.55):
    if len(sentences) < (window_size * 2):
        return False

    window_a = sentences[-(window_size * 2) : -window_size]
    window_b = sentences[-window_size:]

    # Use embed_model (renamed)
    vecs_a = embed_model.encode(window_a)
    vecs_b = embed_model.encode(window_b)
    
    centroid_a = np.mean(vecs_a, axis=0).reshape(1, -1)
    centroid_b = np.mean(vecs_b, axis=0).reshape(1, -1)

    similarity = cosine_similarity(centroid_a, centroid_b)[0][0]
    return similarity < threshold

def transcribe_audio(audio_np: np.ndarray):
    """
    Handles the pure Whisper transcription logic.
    """
    try:
        # Normalize
        if np.max(np.abs(audio_np)) > 0:
            audio_np = audio_np / np.max(np.abs(audio_np))

        inputs = processor(audio_np, sampling_rate=16000, return_tensors="pt")
        input_features = inputs.input_features.to(device)

        with torch.no_grad():
            predicted_ids = model.generate(
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
    # 1. Transcribe & Correct
    raw_text = await asyncio.to_thread(transcribe_audio, audio_data)
    if not raw_text: return
    
    context = [item["final"] for item in history_ref[-3:]]
    refined_text = await asyncio.to_thread(llm_correction, raw_text, context)

    # 2. Update Rolling History (for correction context)
    history_ref.append({"raw": raw_text, "final": refined_text})
    if len(history_ref) > 5: history_ref.pop(0)

    # 3. Add to Topic Buffer & Check for Shift
    topic_buffer.append(refined_text)
    
    # 
    shift_detected = await asyncio.to_thread(
        detect_topic_shift, topic_buffer, WINDOW_GROUPING, COSINE_THRESHOLD
    )

    if shift_detected:
        # Separate the sentences that belong to the OLD topic and the NEW one
        old_topic_content = topic_buffer[:-WINDOW_GROUPING]
        new_topic_start = topic_buffer[-WINDOW_GROUPING:]

        # Generate Title for the topic that just finished
        title = await asyncio.to_thread(generate_topic_title, old_topic_content)
        
        await websocket.send_json({
            "type": "TOPIC_CARD_COMPLETE",
            "title": title,
            "content": old_topic_content
        })

        # Reset buffer with the sentences that triggered the new topic
        topic_buffer[:] = new_topic_start 

    # 4. Push Live Transcript Update
    await websocket.send_json({
        "type": "TRANSCRIPT_UPDATE",
        "latest": refined_text,
        "full_history": history_ref
    })


@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    transcription_history = [] # Local to this connection
    topic_buffer = []
    
    try:
        while True:
            # receive_bytes blocks ONLY until data arrives
            data = await websocket.receive_bytes()
            chunk = np.frombuffer(data, dtype=np.float32)
            
            rms = np.sqrt(np.mean(chunk**2))
            
            if rms > 0.015:
                sentence_buffer.append(chunk)
            elif len(sentence_buffer) > 0:
                full_audio = np.concatenate(sentence_buffer)
                sentence_buffer = [] # Clear immediately so we don't miss next sound

                if len(full_audio) > 8000:
                    # Fire and forget the background task
                    asyncio.create_task(
                        background_process(full_audio, transcription_history, topic_buffer, websocket)
                    )
                
    except WebSocketDisconnect:
        print("Client Disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)