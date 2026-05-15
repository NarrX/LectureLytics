"use client";
import { useState, useRef } from "react";

interface TopicCard {
  title: string;
  content: string[];
}

export default function TranscribePage() {
  const [roomCode, setRoomCode] = useState<string>("");
  const [isCodeFinalized, setIsCodeFinalized] = useState(false);
  const [activeTunnelUrl, setActiveTunnelUrl] = useState<string>("");
  
  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleGenerateRandomCode = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(randomDigits);
  };

  const initializeHostSession = () => {
    const finalCode = roomCode.trim();
    if (!finalCode) {
      alert("Please enter or generate a room code!");
      return;
    }

    // --- DYNAMIC TUNNEL CONSTRUCTION ---
    // Matches your .bat logic: lectureapp-xxxx
    const tunnelPrefix = `lectureapp-${finalCode}`.toLowerCase();
    const publicUrl = `https://${tunnelPrefix}.loca.lt`;
    const wsUrl = `wss://${tunnelPrefix}.loca.lt/ws/transcribe`;

    setRoomCode(finalCode);
    setActiveTunnelUrl(publicUrl);
    setIsCodeFinalized(true);

    console.log("Connecting to Tunnel:", wsUrl);
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "TOPIC_CARD_COMPLETE") {
        const newCard = { title: data.title, content: data.content };
        setTopicCards((prev) => [...prev, newCard]);
        await broadcastToPusher("topic-complete", newCard, finalCode);
      }

      if (data.full_history) {
        const validTranscripts = data.full_history
          .filter((item: any) => item.final && typeof item.final === "string")
          .map((item: any) => item.final);
        
        setTranscript(validTranscripts);
        await broadcastToPusher("transcript-update", { transcript: validTranscripts }, finalCode);
      }
    };

    socketRef.current.onerror = (err) => {
      console.error("WS Error:", err);
      alert("Connection failed. Check if your .bat script is running!");
    };
  };

  const broadcastToPusher = async (eventName: string, payload: any, code: string) => {
    try {
      await fetch("/api/pusher-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: `room-${code}`, event: eventName, data: payload }),
      });
    } catch (err) {
      console.error("Pusher error:", err);
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
      alert("Microphone access denied.");
    }
  };

  const stopStream = () => {
    audioCtxRef.current?.close();
    setIsRecording(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-10">
        
        {!isCodeFinalized ? (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Host Lecture</h2>
            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-slate-500 uppercase">Room Suffix</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="e.g. 8821"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="flex-grow px-4 py-3 border border-slate-200 rounded-xl font-mono text-center text-slate-700 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={handleGenerateRandomCode} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm border">Random</button>
              </div>
            </div>
            <button onClick={initializeHostSession} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg">
              Start Session
            </button>
          </div>
        ) : (
          <>
            {/* Active Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  Live Stream <span className="text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Host</span>
                </h1>
                <p className="text-slate-500 text-sm">Room Suffix: <span className="font-bold">{roomCode}</span></p>
                <code className="text-[10px] text-slate-400 block mt-1">{activeTunnelUrl}</code>
              </div>
              <button
                onClick={isRecording ? stopStream : startStream}
                className={`px-6 py-2 rounded-full font-bold shadow-md transition-all ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white"}`}
              >
                {isRecording ? "Stop" : "Record"}
              </button>
            </div>

            {/* Transcript Display */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 min-h-[300px]">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <div className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-500 animate-ping' : 'bg-slate-300'}`}></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Transcript</span>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {transcript.length === 0 && <p className="text-slate-400 italic">No audio detected yet...</p>}
                {transcript.map((line, i) => (
                  <p key={i} className="text-lg text-slate-800 leading-relaxed pl-4 border-l-2 border-indigo-500">{line}</p>
                ))}
              </div>
            </div>

            {/* Topic History */}
            <div className="space-y-4">
               <h3 className="text-slate-500 font-bold text-sm uppercase tracking-tighter">Generated Topic Cards</h3>
               <div className="grid gap-4">
                  {topicCards.length === 0 && <div className="text-center p-10 border-2 border-dashed rounded-xl text-slate-300">Topic cards will appear here.</div>}
                  {[...topicCards].reverse().map((card, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                      <h4 className="text-xl font-bold text-slate-800 mb-2">{card.title}</h4>
                      <div className="flex flex-wrap gap-2">
                        {card.content.map((point, i) => (
                          <span key={i} className="bg-slate-50 text-slate-600 text-xs px-3 py-1 rounded-full border">{point}</span>
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