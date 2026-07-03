"use client";
import { useState, useRef, useEffect } from "react";
import Pusher, { PresenceChannel } from "pusher-js";

interface TopicCard {
  title: string;
  content: string[];
  questions: string[];
  toggledGuestIds: string[]; // guest ids who toggled "understood" on this topic
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
  const [connectedGuests, setConnectedGuests] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pusherRef = useRef<Pusher | null>(null);

  const initializeHostSession = async () => {
    const finalCode = roomCode.trim();
    if (!finalCode) {
      alert("Please enter a room code.");
      return;
    }

    setSessionState("connecting");
    setSessionMessage("Connecting to backend...");

    try {

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
          const newCard: TopicCard = {
            title: msg.title,
            content: msg.content,
            questions: [],
            toggledGuestIds: [],
          };
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
        setSessionMessage("Could not connect. Make sure main.py is running.");
      };


      const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

      if (!key || !cluster) {
        console.error("Pusher environment variables are missing");
        return;
      }

      const pusher = new Pusher(key, {
        cluster,
        forceTLS: true,
        channelAuthorization: {
          endpoint: "/api/pusher-auth",
          transport: "ajax",
        },
      });
      pusherRef.current = pusher;

      const presenceChannel = pusher.subscribe(`presence-room-${finalCode}`) as PresenceChannel;

      presenceChannel.bind("pusher:subscription_succeeded", () => {
        setConnectedGuests(presenceChannel.members.count);
      });

      presenceChannel.bind("pusher:member_added", () => {
        setConnectedGuests(presenceChannel.members.count);
      });

      presenceChannel.bind("pusher:member_removed", () => {
        setConnectedGuests(presenceChannel.members.count);
      });

      presenceChannel.bind(
        "question-submitted",
        (data: { topicIndex: number; question: string }) => {
          setTopicCards((prev) =>
            prev.map((c, i) =>
              i === data.topicIndex
                ? { ...c, questions: [...c.questions, data.question] }
                : c
            )
          );
        }
      );

      presenceChannel.bind(
        "topic-toggle",
        (data: { topicIndex: number; guestId: string; toggledOn: boolean }) => {
          setTopicCards((prev) =>
            prev.map((c, i) => {
              if (i !== data.topicIndex) return c;
              const withoutGuest = c.toggledGuestIds.filter(
                (id) => id !== data.guestId
              );
              return {
                ...c,
                toggledGuestIds: data.toggledOn
                  ? [...withoutGuest, data.guestId]
                  : withoutGuest,
              };
            })
          );
        }
      );
    } catch (err) {
      setSessionState("error");
      setSessionMessage("Could not reach backend. Make sure main.py is running.");
    }
  };

  useEffect(() => {
    return () => {
      pusherRef.current?.disconnect();
    };
  }, []);

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
          channel: `presence-room-${code}`,
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

  // STATUS BADGE
  const statusBadge = {
    idle: null,
    connecting: (
      <span className="text-xs text-amber-600 font-medium animate-pulse">
        {sessionMessage}
      </span>
    ),
    ready: (
      <span className="text-xs text-green-600 font-medium">
        {sessionMessage}
      </span>
    ),
    error: (
      <span className="text-xs text-red-500 font-medium">
        {sessionMessage}
      </span>
    ),
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-10">
        {!isCodeFinalized ? (
          /* --- SETUP SCREEN --- */
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

            <div className="min-h-[20px]">{statusBadge[sessionState]}</div>

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
          /*LIVE SESSION SCREEN*/
          <div className="space-y-6">
            {/* Header bar */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  Room:{" "}
                  <span className="font-mono text-indigo-600">{roomCode}</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {connectedGuests} guest{connectedGuests !== 1 ? "s" : ""} connected
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 h-[260px] overflow-hidden">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">
                Live Transcription
              </h3>
              <div className="space-y-3">
                {transcript.length === 0 && (
                  <p className="text-slate-400 italic">
                    Press Record and start speaking
                  </p>
                )}
                {transcript.slice(-5).map((line, i) => (
                  <p
                    key={i}
                    className="text-lg text-slate-800 border-l-2 border-indigo-200 pl-4 truncate"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* Topic Cards */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Topic Cards
              </h3>
              {topicCards.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic">
                  Topic cards will appear as topics shift during the lecture.
                </p>
              )}

              <div className="space-y-4">
                {topicCards.map((card, idx) => {
                  const percentage =
                    connectedGuests > 0
                      ? Math.round(
                          (card.toggledGuestIds.length / connectedGuests) * 100
                        )
                      : 0;

                  return (
                    <div
                      key={idx}
                      className="bg-cyan-400 rounded-3xl border-2 border-slate-900 p-5 flex gap-5 shadow-md h-[220px]"
                    >
                      {/* Left column: title + live percentage */}
                      <div className="flex flex-col justify-between w-48 shrink-0 overflow-hidden">
                        <h4 className="text-2xl font-serif text-white leading-tight line-clamp-4">
                          {card.title}
                        </h4>
                        <div className="bg-white border-2 border-slate-900 rounded-xl px-4 py-2 self-start mt-4">
                          <span className="text-lg font-bold text-slate-800">
                            {percentage}%
                          </span>
                        </div>
                      </div>

                      {/* Right column: live questions panel */}
                      <div className="flex-1 bg-cyan-50 border-2 border-slate-900 rounded-2xl p-3 space-y-2 h-full overflow-y-auto">
                        {card.questions.length === 0 && (
                          <p className="text-cyan-700/60 text-sm italic px-2 py-2">
                            No questions yet for this topic.
                          </p>
                        )}
                        {card.questions.map((q, qi) => (
                          <div
                            key={qi}
                            className="bg-white border border-slate-700 rounded-full px-4 py-2 text-sm text-slate-700"
                          >
                            {q}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}