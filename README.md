# LectureLytics

App to help with lectures

## Features

* Real-Time Audio Streaming & ASR: Captures browser audio using the Web Audio API / AudioWorklet and streams 16kHz PCM audio to FastAPI via WebSockets for live transcription.
* On-Device VAD Filtering: Uses Silero VAD to isolate human voice activity from background noise prior to transcription.
* Real-Time Topic Segmentation & Summarization:
  * Uses `faster-whisper` for low-latency ASR.
  * Computes sentence embeddings using `SentenceTransformer` and cosine similarity over a sliding window to detect sub-topic transitions.
  * Refines transcripts and generates dynamic Topic Cards using quantized local LLMs via `llama-cpp-python` in GGUF format.
* Role-Based User Interfaces:
  * Host Interface: Allows lecturers to initiate recording sessions, review live transcripts, and manage topic cards.
  * Guest Interface: Enables students to view incoming transcripts, track topic cards, and toggle understanding status in real time.
* Distributed Pub/Sub Synchronization: Uses Pusher Channels for real-time presence management and multi-client broadcast without overloading the main ML backend.

## System Workflow

1. Host Audio Capture: Browser microphone captures audio via Web Audio API (16kHz PCM).
2. Streaming: Raw audio chunks are sent via WebSocket to the FastAPI backend (`main.py`).
3. Voice Activity Detection: Silero VAD filters out non-speech audio segments.
4. Transcription: `faster-whisper` converts incoming audio into text.
5. Topic Segmentation & Extraction: `SentenceTransformer` detects sub-topic boundaries via cosine similarity, and `llama-cpp-python` generates structured topic cards.
6. Real-Time Broadcast: Pusher Channels broadcasts transcript and topic updates to connected Host and Guest clients.

# Requirements
- Python 3.12+ (and the respective libraries in requirements.txt)
- Node.js 18+
- C++ Compilation Toolchain (required for llama-cpp-python)

# To start

As Host:
- Clone the "main" repo into your personal desktop
- Open LectureLytics.bat (A python cmd and node.js cmd should open, along with reditecting you to the main page)
- Confirm that main.py backend is fully running/loaded in before continuing.
- Enter a 4-digit code of your choosing into the field to be set as the room ID.
- Click "Record" to start lecture.

As Guest:
- Go to https://lecture-lytics.vercel.app to enter the guest view.
- Enter the room number the host gave you.
