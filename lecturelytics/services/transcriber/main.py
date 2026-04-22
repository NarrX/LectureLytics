import torch
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import WhisperForConditionalGeneration, WhisperProcessor
# NEW: Using a simple LLM call for context correction
import openai 

import os
os.environ["HF_TOKEN"] = "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"

app = FastAPI()

MODEL_ID = "openai/whisper-base" 
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID).to(device)
processor = WhisperProcessor.from_pretrained(MODEL_ID)

# Optional: Initialize OpenAI/Groq for the "Correction Layer"
# client = openai.OpenAI(api_key="YOUR_KEY") 

def llm_correction(raw_text: str):
    
    if not raw_text or len(raw_text) < 5:
        return raw_text

    # Example logic if you use an API:
    # response = client.chat.completions.create(
    #     model="gpt-4o-mini",
    #     messages=[{"role": "system", "content": "Fix Indonesian typos and technical terms. Return only the corrected text."},
    #               {"role": "user", "content": raw_text}]
    # )
    # return response.choices[0].message.content
    
    return raw_text # Placeholder for now

def process_audio(audio_np: np.ndarray):
    try:
        # UPGRADE 2: Audio Normalization
        # Simple volume normalization helps Whisper "hear" better
        if np.max(np.abs(audio_np)) > 0:
            audio_np = audio_np / np.max(np.abs(audio_np))

        inputs = processor(
            audio_np, 
            sampling_rate=16000, 
            return_tensors="pt",
            return_attention_mask=True
        )
        
        input_features = inputs.input_features.to(device)
        attention_mask = inputs.attention_mask.to(device)

        with torch.no_grad():
            # UPGRADE 3: Better Generation Params
            predicted_ids = model.generate(
                input_features, 
                attention_mask=attention_mask,
                language="indonesian",
                task="transcribe",
                use_cache=True,
                # Adding these improves stability:
                no_repeat_ngram_size=3,
                num_beams=1 # Increase to 3-5 if speed isn't an issue
            )
        
        raw_text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
        
        # Apply the LLM correction layer
        refined_text = llm_correction(raw_text)
        
        return {
            "raw": raw_text,
            "refined": refined_text,
        }

    except Exception as e:
        print(f"Error: {e}")
        return None

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    
    # 1. Initialize the rolling history list
    transcription_history = []
    
    try:
        while True:
            data = await websocket.receive_bytes()
            chunk = np.frombuffer(data, dtype=np.float32)
            
            rms = np.sqrt(np.mean(chunk**2))
            
            if rms > 0.015:
                sentence_buffer.append(chunk)
            elif len(sentence_buffer) > 0:
                full_audio = np.concatenate(sentence_buffer)
                
                if len(full_audio) > 8000:
                    result = process_audio(full_audio)
                    
                    if result:
                        # 2. Add new sentence to history
                        transcription_history.append(result)
                        
                        # 3. Keep only the last 5 items
                        if len(transcription_history) > 5:
                            transcription_history = transcription_history[-5:]
                        
                        # 4. Send the updated history to the frontend
                        # Frontend will now receive a list of 5 objects
                        await websocket.send_json({
                            "history": transcription_history,
                            "count": len(transcription_history)
                        })
                
                sentence_buffer = []
    except WebSocketDisconnect:
        print("Client Disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)