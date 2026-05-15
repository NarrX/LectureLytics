"use client";
import { useState, useRef, useEffect } from "react";

interface TopicCard {
  title: string;
  content: string[];
}

export default function TranscribePage() {
  const [roomCode, setRoomCode] = useState<string>("");
  const [isCodeFinalized, setIsCodeFinalized] = useState(false);
  
  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Helper to generate a random 4-digit numeric code
  const handleGenerateRandomCode = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(randomDigits);
  };

  const initializeHostSession = () => {
    const finalCode = roomCode.trim().toUpperCase();
    if (!finalCode) {
      alert("Please enter or generate a room code first!");
      return;
    }
    
    setRoomCode(finalCode);
    setIsCodeFinalized(true);

    // Connect to your local Python FastApi/Uvicorn backend
    socketRef.current = new WebSocket("ws://localhost:8000/ws/transcribe");

    socketRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // --- HANDLE TOPIC CARD COMPLETION ---
      if (data.type === "TOPIC_CARD_COMPLETE") {
        const newCard = { title: data.title, content: data.content };
        setTopicCards((prev) => [...prev, newCard]);
        await broadcastToPusher("topic-complete", newCard, finalCode);
      }

      // --- HANDLE LIVE TRANSCRIPT UPDATES ---
      if (data.full_history) {
        const validTranscripts = data.full_history
          .filter((item: any) => item.final && typeof item.final === "string")
          .map((item: any) => item.final);
        
        setTranscript(validTranscripts);
        await broadcastToPusher("transcript-update", { transcript: validTranscripts }, finalCode);
      }
    };

    socketRef.current.onerror = (err) => console.error("WebSocket Error:", err);
    socketRef.current.onclose = () => console.log("WebSocket connection closed.");
  };

  const broadcastToPusher = async (eventName: string, payload: any, code: string) => {
    try {
      await fetch("/api/pusher-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: `room-${code}`, event: eventName, data: payload }),
      });
    } catch (err) {
      console.error("Failed to broadcast via Pusher:", err);
    }
  };

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
      alert("Please allow microphone access to stream audio.");
    }
  };

  const stopStream = () => {
    audioCtxRef.current?.close();
    setIsRecording(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-10">
        
        {/* STEP 1: ROOM SETUP SCREEN */}
        {!isCodeFinalized ? (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md mx-auto space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Host a New Lecture</h2>
              <p className="text-slate-500 text-sm mt-1">Set a room code for your students to join.</p>
            </div>

            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Room Code</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="4-Digit Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="flex-grow px-4 py-3 border border-slate-200 rounded-xl font-mono text-center uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 font-bold"
                />
                <button
                  type="button"
                  onClick={handleGenerateRandomCode}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all border border-slate-200 active:scale-95"
                >
                  Random
                </button>
              </div>
            </div>

            <button
              onClick={initializeHostSession}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all"
            >
              Start Session as Host
            </button>
          </div>
        ) : (
          
          /* STEP 2: ACTIVE HOSTING DASHBOARD */
          <>
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold text-slate-900">Lecture Stream</h1>
                  <span className="bg-amber-100 text-amber-800 text-xs font-black px-2.5 py-1 rounded-md tracking-wider uppercase border border-amber-200">Host</span>
                </div>
                <p className="text-slate-500 mt-1">
                  Students join using code: <strong className="font-mono text-indigo-600 select-all bg-indigo-50 px-2 py-0.5 rounded">{roomCode}</strong>
                </p>
              </div>
              <button
                onClick={isRecording ? stopStream : startStream}
                className={`px-8 py-3 rounded-full font-bold transition-all shadow-lg ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {isRecording ? "Stop Recording" : "Start Recording"}
              </button>
            </div>

            {/* Live Transcript View */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <span className="relative flex h-3 w-3">
                  {isRecording && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${isRecording ? 'bg-red-500' : 'bg-slate-300'}`}></span>
                </span>
                <h2 className="text-lg font-semibold text-slate-700">Live Transcript (Broadcasting Live)</h2>
              </div>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 min-h-[250px] max-h-[400px] overflow-y-auto scrollbar-thin">
                <div className="space-y-4">
                  {transcript.length === 0 && (
                    <p className="text-slate-400 italic">Waiting for speech input...</p>
                  )}
                  {transcript.map((line, i) => (
                    <p key={i} className="text-xl text-slate-800 leading-relaxed border-l-4 border-indigo-100 pl-4">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
                <hr className="flex-grow border-slate-200" />
                <span className="text-slate-400 text-sm font-medium">TOPIC HISTORY</span>
                <hr className="flex-grow border-slate-200" />
            </div>

            {/* Topic Summary Cards */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-700">Topic Summary Cards</h2>
              <div className="flex flex-col space-y-4">
                {topicCards.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 italic">
                    Topics will appear here as the lecture progresses...
                  </div>
                )}
                {[...topicCards].reverse().map((card, idx) => (
                  <div
                    key={idx}
                    className="w-full bg-white rounded-2xl shadow-md border border-slate-100 p-6 transition-all hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between mb-4">
                        <div className="bg-indigo-600 text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full">
                            Topic {topicCards.length - idx}
                        </div>
                        <span className="text-slate-300 text-xs">Finalized</span>
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-800 mb-4">
                      {card.title}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {card.content.map((s, i) => (
                            <div key={i} className="flex items-start space-x-2 text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="text-indigo-500 font-bold">•</span>
                                <p>{s}</p>
                            </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}