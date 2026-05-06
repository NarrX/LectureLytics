"use client";
import { useState, useRef, useEffect } from "react";

export default function TranscribePage() {
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Auto-connect to Python Backend
  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:8000/ws/transcribe");
    
    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Use history from backend (already limited to last 5)
      if (data.history && Array.isArray(data.history)) {
        const validTranscripts = data.history
          .filter((item: any) => item.final && typeof item.final === 'string')
          .map((item: any) => item.final);
        setTranscript(validTranscripts);
      }
    };

    return () => socketRef.current?.close();
  }, []);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      // Process chunks of 4096 samples
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          const input = e.inputBuffer.getChannelData(0);
          socketRef.current.send(input.buffer);
        }
      };

      setIsRecording(true);
    } catch (err) {
      alert("Please allow microphone access");
    }
  };

  const stopStream = () => {
    audioCtxRef.current?.close();
    setIsRecording(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-slate-900">Transcript Test</h1>
          <button 
            onClick={isRecording ? stopStream : startStream}
            className={`px-6 py-3 rounded-full font-semibold transition-all shadow-md ${
              isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {isRecording ? "Stop Test" : "Start Test"}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 min-h-[500px]">
          <div className="space-y-4">
            {transcript.length === 0 && (
              <p className="text-slate-400 italic">nothing yet.</p>
            )}
            {transcript.map((line, i) => (
              <p key={i} className="text-xl text-slate-800 leading-relaxed border-l-4 border-indigo-100 pl-4">
                {line && typeof line === 'string' ? line.charAt(0).toUpperCase() + line.slice(1) : ''}.
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}