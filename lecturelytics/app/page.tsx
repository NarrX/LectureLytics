"use client";
import { useState, useRef } from "react";

interface TopicCard {
  title: string;
  content: string[];
}

type SessionState = "idle" | "connecting" | "ready" | "error";

export default function TranscribePage() {
  const [roomCode, setRoomCode] = useState<string>("");
  const [isCodeFinalized, setIsCodeFinalized] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [sessionMessage, setSessionMessage] = useState<string>("");

  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initializeHostSession = async () => {
    const finalCode = roomCode.trim();
    if (!finalCode) {
      alert("Please enter a room code.");
      return;
    }

    setSessionState("connecting");
    setSessionMessage("Connecting to backend");

    try {
      // Connect to local backend
      const wsUrl = "ws://127.0.0.1:8000/ws/transcribe";
      socketRef.current = new WebSocket(wsUrl);

      socketRef.current.onopen = () => {
        setSessionState("ready");
        setSessionMessage("Connected.");
        setIsCodeFinalized(true);
      };

      socketRef.current.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "TOPIC_CARD_COMPLETE") {
          const newCard = { title: msg.title, content: msg.content };
          setTopicCards((prev) => [...prev, newCard]);
          await broadcastToPusher("topic-complete", newCard, finalCode);
        }

        if (msg.full_history) {
          const validTranscripts = msg.full_history
            .filter((item: any) => item.final && typeof item.final === "string")
            .map((item: any) => item.final);
          setTranscript(validTranscripts);
          await broadcastToPusher(
            "transcript-update",
            { transcript: validTranscripts },
            finalCode
          );
        }
      };

      socketRef.current.onerror = () => {
        setSessionState("error");
        setSessionMessage("Could not connect. make sure main.py is running.");
      };

    } catch (err) {
      setSessionState("error");
      setSessionMessage("Could not reach backend. Make sure main.py is running.");
    }
  };

  const broadcastToPusher = async (
    eventName: string,
    payload: any,
    code: string
  ) => {
    try {
      await fetch("/api/pusher-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: `room-${code}`,
          event: eventName,
          data: payload,
        }),
      });
    } catch (err) {}
  };

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

      workletNode.port.onmessage = (e) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(e.data.buffer);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      setIsRecording(true);
    } catch (err) {
      alert("Mic access denied.");
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
          /*START SCREEN*/
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">
              LectureLytics <span className="text-indigo-600">Host</span>
            </h2>
            <p className="text-slate-500 text-sm">
              Enter a room code. Students will use this to join.
            </p>

            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="e.g. 1234"
                disabled={sessionState === "connecting"}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl font-mono text-center text-slate-700 font-bold text-2xl focus:border-indigo-400 outline-none disabled:opacity-50"
              />
            </div>

            <button
              onClick={initializeHostSession}
              disabled={sessionState === "connecting" || !roomCode.trim()}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl shadow-lg transition"
            >
              {sessionState === "connecting" ? "Connecting..." : "Start Session"}
            </button>

            {sessionState === "error" && (
              <button
                onClick={() => {
                  setSessionState("idle");
                  setSessionMessage("");
                }}
                className="w-full py-2 text-sm text-slate-500 underline"
              >
                Reset and try again
              </button>
            )}
          </div>
        ) : (
          /* LIVE SESSION SCREEN */
          <div className="space-y-6">
            {/* Header bar */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  Room:{" "}
                  <span className="font-mono text-indigo-600">{roomCode}</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Broadcasting via Pusher → guests on room-{roomCode}
                </p>
              </div>
              <button
                onClick={isRecording ? stopStream : startStream}
                className={`px-6 py-2 rounded-full font-bold transition ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {isRecording ? "Stop" : "Record"}
              </button>
            </div>

            {/* Live Transcript */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[200px]">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">
                Live Transcription
              </h3>
              <div className="space-y-4">
                {transcript.length === 0 && (
                  <p className="text-slate-400 italic">
                    Press Record and start speaking...
                  </p>
                )}
                {transcript.map((line, i) => (
                  <p
                    key={i}
                    className="text-lg text-slate-800 border-l-2 border-indigo-200 pl-4"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/*Topic cards*/}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Topic Cards
              </h3>
              {topicCards.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic">
                  Topic cards will appear as topics shift during the lecture.
                </p>
              )}
              {topicCards.map((card, idx) => (
                <div
                  key={idx}
                  className="bg-white p-6 rounded-xl border border-slate-100 shadow-md"
                >
                  <h4 className="text-xl font-bold text-slate-800 mb-3">
                    {card.title}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {card.content.map((point, i) => (
                      <span
                        key={i}
                        className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full border border-indigo-100"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
