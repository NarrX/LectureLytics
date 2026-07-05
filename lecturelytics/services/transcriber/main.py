import torch
import numpy as np
import uvicorn
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from llama_cpp import Llama
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import os

# Setup Hugging Face token
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
print("Hugging Face Token Loaded Successfully")

# Model Storage Configuration
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_MODEL_DIR = os.path.join(PROJECT_ROOT, "models")
os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)

os.environ["HF_HOME"] = os.path.join(LOCAL_MODEL_DIR, "hf_cache")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# System Device Configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Load whisper-base
whisper_cache_dir = os.path.join(LOCAL_MODEL_DIR, "whisper-base")
print(f"Loading whisper-base (cache: {whisper_cache_dir})...")
whisper_model = WhisperModel(
    "base",
    device="cpu",
    compute_type="int8",
    download_root=whisper_cache_dir
)
print("whisper-base loaded.")

# Load Qwen2 via llama.cpp
llm_cache_dir = os.path.join(LOCAL_MODEL_DIR, "qwen-1.5b-gguf")
os.makedirs(llm_cache_dir, exist_ok=True)
print(f"Loading LLM via llama.cpp (cache: {llm_cache_dir})...")
llm = Llama.from_pretrained(
    repo_id="Qwen/Qwen2-1.5B-Instruct-GGUF",
    filename="qwen2-1_5b-instruct-q4_k_m.gguf",
    cache_dir=llm_cache_dir,
    n_ctx=2048,
    n_threads=4,
    n_gpu_layers=0,
    verbose=False
)
print("llama.cpp LLM loaded.")

# Load Embedding Model
st_cache_dir = os.path.join(LOCAL_MODEL_DIR, "sentence-transformers")
print(f"Loading Embedding Model (cache: {st_cache_dir})...")
embed_model = SentenceTransformer('all-MiniLM-L6-v2', cache_folder=st_cache_dir)
print("Embedding model loaded.")

# Load Silero VAD
print("Loading Silero VAD...")
vad_model, vad_utils = torch.hub.load(
    'snakers4/silero-vad', 'silero_vad', trust_repo=True
)
(get_speech_timestamps, _, _, *_) = vad_utils
print("Silero VAD loaded.")



WINDOW_GROUPING = 2
COSINE_THRESHOLD = 0.55
VAD_BUFFER_SIZE = 8000

# Asyncio lock to prevent race conditions on shared topic_buffer
buffer_lock = asyncio.Lock()


# funcs

def is_speech(audio_np: np.ndarray, sample_rate: int = 16000) -> bool:
    tensor = torch.from_numpy(audio_np.copy()).float()
    print(f"VAD input shape: {audio_np.shape}, min: {audio_np.min():.3f}, max: {audio_np.max():.3f}")
    timestamps = get_speech_timestamps(tensor, vad_model, sampling_rate=sample_rate)
    print(f"VAD result: {len(timestamps)} speech segments found")
    return len(timestamps) > 0


def run_llm(messages: list, max_tokens: int = 150) -> str:
    """Shared llama.cpp inference call."""
    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.0
    )
    return response["choices"][0]["message"]["content"].strip()


def llm_correction(raw_text: str, context_list: list) -> str:
    print(f"LLM Correction Input:\nRaw Text: {raw_text}\nContext: {context_list}")

    if not raw_text or len(raw_text) < 15:
        return raw_text

    context_str = "\n".join(context_list)

    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an Indonesian academic editor. Fix typos and technical terms in this lecture transcript. Keep the tone formal. Use the provided context to ensure technical consistency, but return ONLY the corrected version of the NEWEST sentence."
                )
            },
            {
                "role": "user",
                "content": f"CONTEXT:\n{context_str}\n\nNEW SENTENCE TO FIX:\n{raw_text}"
            }
        ]
        return run_llm(messages, max_tokens=150)

    except Exception as e:
        import traceback
        print(f"LLM Error (Correction): {e}")
        traceback.print_exc()
        return raw_text


def generate_topic_title(sentences: list) -> str:
    print(f"Generating title for: {' '.join(sentences)}")
    try:
        text_block = " ".join(sentences)
        messages = [
            {"role": "user", "content": f"Summarize this into a 3-7 word title: {text_block}"}
        ]
        return run_llm(messages, max_tokens=50).replace('"', '')
    except Exception as e:
        print(f"LLM Error (Title): {e}")
        return "New Topic Segment"


def detect_topic_shift(sentences: list, window_size: int = 2, threshold: float = 0.55) -> bool:
    if len(sentences) < (window_size * 2):
        return False

    window_a = sentences[-(window_size * 2): -window_size]
    window_b = sentences[-window_size:]

    vecs_a = embed_model.encode(window_a)
    vecs_b = embed_model.encode(window_b)

    centroid_a = np.mean(vecs_a, axis=0).reshape(1, -1)
    centroid_b = np.mean(vecs_b, axis=0).reshape(1, -1)

    similarity = cosine_similarity(centroid_a, centroid_b)[0][0]
    return similarity < threshold


def transcribe_audio(audio_np: np.ndarray) -> str:
    try:
        if np.max(np.abs(audio_np)) > 0:
            audio_np = audio_np / np.max(np.abs(audio_np))

        segments, _ = whisper_model.transcribe(
            audio_np,
            language="id",
            beam_size=3,
            no_repeat_ngram_size=3
        )
        return " ".join([s.text for s in segments]).strip()

    except Exception as e:
        print(f"Whisper Error: {e}")
        return ""


async def background_process(
    audio_data: np.ndarray,
    history_ref: list,
    topic_buffer: list,
    websocket: WebSocket
):
    raw_text = await asyncio.to_thread(transcribe_audio, audio_data)
    if not raw_text:
        return

    context = [item["final"] for item in history_ref[-3:]]
    refined_text = await asyncio.to_thread(llm_correction, raw_text, context)

    history_ref.append({"raw": raw_text, "final": refined_text})
    if len(history_ref) > 5:
        history_ref.pop(0)

    topic_buffer.append(refined_text)

    shift_detected = await asyncio.to_thread(
        detect_topic_shift, topic_buffer, WINDOW_GROUPING, COSINE_THRESHOLD
    )

    if shift_detected:
        async with buffer_lock:
            old_topic_content = topic_buffer[:-WINDOW_GROUPING]
            new_topic_start = topic_buffer[-WINDOW_GROUPING:]
            topic_buffer[:] = new_topic_start

        title = await asyncio.to_thread(generate_topic_title, old_topic_content)

        await websocket.send_json({
            "type": "TOPIC_CARD_COMPLETE",
            "title": title,
            "content": old_topic_content
        })

    await websocket.send_json({
        "type": "TRANSCRIPT_UPDATE",
        "latest": refined_text,
        "full_history": history_ref
    })


# routing

@app.get("/")
async def root():
    return {"status": "success", "message": "LectureLytics Backend is running"}


@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sentence_buffer = []
    transcription_history = []
    topic_buffer = []
    vad_buffer = []     # accumulates small chunks until VAD has enough samples

    try:
        while True:
            data = await websocket.receive_bytes()
            chunk = np.frombuffer(data, dtype=np.float32)

            # Accumulate chunks into vad_buffer until we have enough for Silero
            vad_buffer.extend(chunk.tolist())

            if len(vad_buffer) >= VAD_BUFFER_SIZE:
                vad_chunk = np.array(vad_buffer[:VAD_BUFFER_SIZE], dtype=np.float32)
                vad_buffer = vad_buffer[VAD_BUFFER_SIZE:]

                if is_speech(vad_chunk):
                    sentence_buffer.append(vad_chunk)
                elif len(sentence_buffer) > 0:
                    full_audio = np.concatenate(sentence_buffer)
                    sentence_buffer = []

                    if len(full_audio) > 16000:     # at least 1 second of audio
                        asyncio.create_task(
                            background_process(full_audio, transcription_history, topic_buffer, websocket)
                        )

    except WebSocketDisconnect:
        print("Client Disconnected")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
