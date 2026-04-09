import torch
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import WhisperForConditionalGeneration, WhisperProcessor
import uvicorn

app = FastAPI()

MODEL_ID = "openai/whisper-tiny"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

#Load Model and Processor
model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID)
processor = WhisperProcessor.from_pretrained(MODEL_ID)

#Hard-set the language IDs
forced_decoder_ids = processor.get_decoder_prompt_ids(language="indonesian", task="transcribe")

print("LectureLytics Engine: Running")

def process_audio(audio_np: np.ndarray) -> str:
    try:
        # Convert to Torch Tensor
        waveform = torch.from_numpy(audio_np).float()

        # Peak Normalization
        max_val = waveform.abs().max()
        if max_val > 0:
            waveform = waveform / max_val

        # Feature Extraction
        input_features = processor(
            waveform.numpy(),
            sampling_rate=16000, 
            return_tensors="pt"
        ).input_features
        
        # Move to GPU if available
        input_features = input_features.to(device)

        # 4. Generate Transcription
        with torch.no_grad():
            predicted_ids = model.generate(
                input_features, 
                forced_decoder_ids=forced_decoder_ids
            )
        
        # 5. Decode to Indonesian Text
        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        return transcription.strip()

    except Exception as e:
        print(f"Error during transcription: {e}")
        return ""

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    
    try:
        while True:
            data = await websocket.receive_bytes()
            chunk = np.frombuffer(data, dtype=np.float32)
            
            #RMS Voice Activity Detection
            rms = np.sqrt(np.mean(chunk**2))
            
            if rms > 0.015:
                sentence_buffer.append(chunk)
            elif len(sentence_buffer) > 0:
                full_audio = np.concatenate(sentence_buffer)
                
                if len(full_audio) > 8000: # Min 0.5s audio
                    text = process_audio(full_audio)
                    if text:
                        await websocket.send_json({"text": text})
                
                sentence_buffer = []
    except WebSocketDisconnect:
        print("Client Disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)