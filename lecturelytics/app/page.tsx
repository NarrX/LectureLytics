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

  const [guestId] = useState(() => `guest_${Math.random().toString(36).slice(2, 11)}`);
  const [toggledIndices, setToggledIndices] = useState<Record<number, boolean>>({});
  const [questionInputs, setQuestionInputs] = useState<Record<number, string>>({});

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

    const pusher = new Pusher(key, { 
      cluster, 
      forceTLS: true,
      authEndpoint: '/api/pusher-auth' 
    });
    pusherRef.current = pusher;

    const channelName = `presence-room-${roomCode}`;
    const channel = pusher.subscribe(channelName);

    console.log(`Subscribed to ${channelName}`);

    channel.bind('transcript-update', (data: any) => {
      if (data.transcript) {
        setTranscript(data.transcript);
      }
    });

    channel.bind('topic-complete', (data: TopicCard) => {
      setTopicCards((prev) => [...prev, data]);
    });

    channel.bind('question-submitted', (data: { topicIndex: number; question: string }) => {
      setTopicCards((prev) => {
        const updated = [...prev];
        const targetIndex = data.topicIndex;
        if (updated[targetIndex]) {
          updated[targetIndex].questions = [
            ...(updated[targetIndex].questions || []),
            data.question
          ];
        }
        return updated;
      });
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [isConnected, roomCode]);

  const submitQuestion = async (originalIdx: number) => {
    const text = questionInputs[originalIdx]?.trim();
    if (!text) return;

    try {
      const res = await fetch('/api/pusher-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: roomCode, topicIndex: originalIdx, question: text })
      });

      if (res.ok) setQuestionInputs(prev => ({ ...prev, [originalIdx]: '' }));
    } catch (err) {
      console.error("Failed to send question:", err);
    }
  };

  const handleToggleUnderstand = async (originalIdx: number) => {
    const nextState = !toggledIndices[originalIdx];
    setToggledIndices(prev => ({ ...prev, [originalIdx]: nextState }));

    try {
      await fetch('/api/pusher-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: roomCode, topicIndex: originalIdx, guestId, toggledOn: nextState })
      });
    } catch (err) {
      console.error("Failed to send toggle status:", err);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8">
        <h2 className="text-3xl font-black text-slate-900 text-center">
          LectureLytics <span className="text-indigo-600">Guest</span>
        </h2>

        {!isConnected ? (
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

            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 h-[260px] overflow-hidden">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">Live Transcription</h3>
              <div className="space-y-3">
                {transcript.length === 0 && <p className="text-slate-400 italic">Waiting for host to start speaking...</p>}
                {transcript.slice(-5).map((line, i) => (
                  <p key={i} className="text-lg text-slate-800 border-l-2 border-indigo-100 pl-4 truncate">{line}</p>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Key Topics</h3>
              {topicCards.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic">
                  Summary cards will appear as the lecture progresses.
                </p>
              )}

              <div className="space-y-4">
                {topicCards.map((card, idx) => {
                  const originalIdx = idx;
                  const isToggled = !!toggledIndices[originalIdx];

                  return (
                    <div
                      key={idx}
                      className="bg-cyan-400 rounded-3xl border-2 border-slate-900 p-5 flex flex-col md:flex-row gap-5 shadow-md h-[260px]"
                    >
                      <div className="flex flex-col justify-between w-48 shrink-0 overflow-hidden">
                        <h4 className="text-2xl font-serif text-white leading-tight line-clamp-4">
                          {card.title}
                        </h4>
                        
                        <div className="mt-4 flex flex-col gap-1">
                          <span className="text-xs font-bold text-cyan-900 uppercase tracking-wider">I Understand:</span>
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={isToggled}
                              onChange={() => handleToggleUnderstand(originalIdx)}
                              className="sr-only peer" 
                            />
                            <div className="w-14 h-7 bg-slate-700/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-slate-900"></div>
                            <span className="ms-2 text-sm font-bold text-slate-900">
                              {isToggled ? "Yes" : "No"}
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col bg-cyan-50 border-2 border-slate-900 rounded-2xl p-4 gap-2 h-full min-h-0">
                        <div className="flex-1 space-y-2 overflow-y-auto min-h-0">
                          {(!card.questions || card.questions.length === 0) && (
                            <p className="text-cyan-700/60 text-sm italic">
                              No questions yet for this topic.
                            </p>
                          )}
                          {card.questions?.map((q, qi) => (
                            <div
                              key={qi}
                              className="bg-white border border-slate-700 rounded-full px-4 py-1.5 text-sm text-slate-700 shadow-sm"
                            >
                              {q}
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-cyan-200 shrink-0">
                          <input
                            type="text"
                            placeholder="Ask a question..."
                            value={questionInputs[originalIdx] || ''}
                            onChange={(e) => setQuestionInputs(prev => ({ ...prev, [originalIdx]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && submitQuestion(originalIdx)}
                            className="flex-1 px-4 py-2 text-sm bg-white border border-slate-400 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-800 placeholder-slate-400"
                          />
                          <button
                            onClick={() => submitQuestion(originalIdx)}
                            className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-slate-800 transition"
                          >
                            Send
                          </button>
                        </div>
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