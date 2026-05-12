"use client";
import { useState, useRef, useEffect } from "react";

interface TopicCard {
  title: string;
  content: string[];
}

export default function TranscribePage() {
  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Auto-connect to Python Backend
  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:8000/ws/transcribe");

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Handle Topic Card completion
      if (data.type === "TOPIC_CARD_COMPLETE") {
        setTopicCards((prev) => [
          ...prev,
          { title: data.title, content: data.content },
        ]);
      }

      // Handle Live Transcript Updates
      if (data.full_history) {
        const validTranscripts = data.full_history
          .filter((item: any) => item.final && typeof item.final === "string")
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
      <div className="max-w-6xl w-full space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Lecture Stream</h1>
            <p className="text-slate-500">Topics are generated automatically as you speak.</p>
          </div>
          <button
            onClick={isRecording ? stopStream : startStream}
            className={`px-6 py-3 rounded-full font-semibold transition-all shadow-md ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>
        </div>

        {/* TOPIC CARDS - Horizontal List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-700">Generated Topics</h2>
          <div className="flex space-x-6 overflow-x-auto pb-6 scrollbar-hide">
            {topicCards.length === 0 && (
              <div className="h-48 w-64 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 italic">
                No topics yet
              </div>
            )}
            {topicCards.map((card, idx) => (
              <div
                key={idx}
                className="flex-shrink-0 w-80 bg-white rounded-2xl shadow-lg border border-slate-100 p-6 transition-transform hover:scale-105"
              >
                <div className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded w-fit mb-3">
                  TOPIC {idx + 1}
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3 line-clamp-2">
                  {card.title}
                </h3>
                <div className="text-slate-600 text-sm space-y-1 overflow-y-auto max-h-32">
                  {card.content.map((s, i) => (
                    <p key={i}>• {s}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-slate-200" />

        {/* LIVE TRANSCRIPT */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-700">Live Transcript (Current)</h2>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 min-h-[300px]">
            <div className="space-y-4">
              {transcript.length === 0 && (
                <p className="text-slate-400 italic">Waiting for speech...</p>
              )}
              {transcript.map((line, i) => (
                <p key={i} className="text-xl text-slate-800 leading-relaxed border-l-4 border-indigo-100 pl-4">
                  {line}.
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}