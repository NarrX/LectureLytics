'use client';

import React, { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

interface TopicCard {
  title: string;
  content: string[];
  questions?: string[];
  confidence?: number;
}

export default function GuestPage() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);

  const pusherRef = useRef<Pusher | null>(null);

  const handleJoinRoom = () => {
    if (roomCode.length !== 4) {
      alert("Please enter the 4-digit code provided by the host.");
      return;
    }
    setTranscript([]);
    setTopicCards([]);
    setIsConnected(true);
  };

  useEffect(() => {
    if (!isConnected || !roomCode) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.error("Pusher environment variables are missing!");
      return;
    }

    const pusher = new Pusher(key, { cluster, forceTLS: true });
    pusherRef.current = pusher;

    const channelName = `room-${roomCode}`;
    const channel = pusher.subscribe(channelName);

    console.log(`Subscribed to ${channelName}`);

    channel.bind('transcript-update', (data: any) => {
      if (data.transcript) {
        setTranscript(data.transcript);
      }
    });

    channel.bind('topic-complete', (data: TopicCard) => {
      setTopicCards((prev) => [data, ...prev]);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [isConnected, roomCode]);

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <h2 className="text-3xl font-black text-slate-900 text-center">
          LectureLytics <span className="text-indigo-600">Guest</span>
        </h2>

        {!isConnected ? (
          /* --- JOIN SCREEN --- */
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-md mx-auto space-y-6">
            <p className="text-slate-500">Enter the 4-digit code from the lecturer's screen.</p>
            <input
              type="text"
              maxLength={4}
              placeholder="0000"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
              className="w-full p-4 border-2 border-slate-100 rounded-xl text-center text-3xl font-mono font-bold focus:border-indigo-500 outline-none"
            />
            <button
              onClick={handleJoinRoom}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition shadow-lg"
            >
              Join Lecture
            </button>
          </div>
        ) : (
          /* --- LIVE CONTENT VIEW --- */
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
              <span className="flex items-center gap-2 text-slate-600 font-medium">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                Live in Room: <strong>{roomCode}</strong>
              </span>
              <button onClick={() => setIsConnected(false)} className="text-xs text-slate-400 hover:text-red-500 underline">
                Leave
              </button>
            </div>

            {/* Live Transcript View (Synced with Host) */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 h-[260px]">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">Live Transcription</h3>
              <div className="space-y-4">
                {transcript.length === 0 && <p className="text-slate-400 italic">Waiting for host to start speaking...</p>}
                {transcript.slice(-5).map((line, i) => (
                  <p key={i} className="text-lg text-slate-800 border-l-2 border-indigo-100 pl-4">{line}</p>
                ))}
              </div>
            </div>

            {/* Topic Cards View */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Key Topics</h3>
              {topicCards.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic">
                  Summary cards will appear as the lecture progresses.
                </p>
              )}

              <div className="space-y-4">
                {topicCards.map((card, idx) => (
                  <div
                    key={idx}
                    className="bg-cyan-400 rounded-3xl border-2 border-slate-900 p-5 flex gap-5 shadow-md"
                  >
                    {/* Left column: title + confidence */}
                    <div className="flex flex-col justify-between w-48 shrink-0">
                      <h4 className="text-2xl font-serif text-white leading-tight">
                        {card.title}
                      </h4>
                      <div className="bg-white border-2 border-slate-900 rounded-xl px-4 py-2 self-start mt-4">
                        <span className="text-lg font-bold text-slate-800">
                          {card.confidence ?? 95}%
                        </span>
                      </div>
                    </div>

                    {/* Right column: questions panel */}
                    <div className="flex-1 bg-cyan-50 border-2 border-slate-900 rounded-2xl p-3 space-y-2 min-h-[120px]">
                      {(!card.questions || card.questions.length === 0) && (
                        <p className="text-cyan-700/60 text-sm italic px-2 py-2">
                          No questions yet for this topic.
                        </p>
                      )}
                      {card.questions?.map((q, qi) => (
                        <div
                          key={qi}
                          className="bg-white border border-slate-700 rounded-full px-4 py-2 text-sm text-slate-700"
                        >
                          {q}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
