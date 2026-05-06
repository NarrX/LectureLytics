import torch
import numpy as np
import uvicorn
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import WhisperForConditionalGeneration, WhisperProcessor
import ollama
import os

# Set your token
os.environ["HF_TOKEN"] = "hf_VepKxofNESDKFbua   MylHuKmmbTTviDDdbu"

app = FastAPI()

MODEL_ID = "openai/whisper-base" 
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load Whisper
model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID).to(device)
processor = WhisperProcessor.from_pretrained(MODEL_ID)

LLM_MODEL_TYPE = 'qwen2:1.5b'

def llm_correction(raw_text: str, context_list: list):
    """
    Sends the current raw text + the last 3 corrected sentences to Ollama.
    """
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

        response = ollama.chat(
            model=LLM_MODEL_TYPE,
            messages=[
                {'role': 'system', 'content': system_msg},
                {'role': 'user', 'content': user_msg},
            ],
            options={"temperature": 0.3, "num_predict": 150}
        )
        return response['message']['content'].strip()
    except Exception as e:
        print(f"Ollama Error: {e}")
        return raw_text

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

async def background_process(audio_data, history_ref, websocket: WebSocket):

    # 1. Transcription (Whisper)

    raw_text = await asyncio.to_thread(transcribe_audio, audio_data)
    
    if not raw_text:
        return

    # 2. Get Context (Last 3 refined sentences)
    context = [item["final"] for item in history_ref[-3:]]

    # 3. Correction (Ollama)
    refined_text = await asyncio.to_thread(llm_correction, raw_text, context)

    # 4. Update History
    new_entry = {"raw": raw_text, "final": refined_text}
    history_ref.append(new_entry)
    
    # Maintain max 5 for frontend
    if len(history_ref) > 5:
        history_ref.pop(0)

    # 5. Push to Client
    await websocket.send_json({
        "history": history_ref,
        "count": len(history_ref)
    })
    print(f"Pushing refined: {refined_text}")

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    transcription_history = [] # Local to this connection
    
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
                        background_process(full_audio, transcription_history, websocket)
                    )
                
    except WebSocketDisconnect:
        print("Client Disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)