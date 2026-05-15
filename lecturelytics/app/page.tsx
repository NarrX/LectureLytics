'use client';

import React, { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

export default function GuestPage() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [topicCards, setTopicCards] = useState<any[]>([]);

  const pusherRef = useRef<Pusher | null>(null);

  const handleJoinRoom = () => {
    if (roomCode.length !== 4) {
      alert("Please enter the 4-digit code provided by the host.");
      return;
    }
    // Clear old data and switch view
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

    // 1. Initialize Pusher
    const pusher = new Pusher(key, { cluster, forceTLS: true });
    pusherRef.current = pusher;

    // 2. Subscribe to the specific room channel
    // Matches Host: channel: `room-${code}`
    const channelName = `room-${roomCode}`;
    const channel = pusher.subscribe(channelName);

    console.log(`Subscribed to ${channelName}`);

    // 3. Listen for Live Transcripts
    channel.bind('transcript-update', (data: any) => {
      if (data.transcript) {
        setTranscript(data.transcript);
      }
    });

    // 4. Listen for Finalized Topic Cards
    channel.bind('topic-complete', (data: any) => {
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
        <h2 className="text-3xl font-black text-slate-900 text-center">LectureLytics <span className="text-indigo-600">Guest</span></h2>

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
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 min-h-[200px]">
               <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">Live Transcription</h3>
               <div className="space-y-4">
                 {transcript.length === 0 && <p className="text-slate-400 italic">Waiting for host to start speaking...</p>}
                 {transcript.map((line, i) => (
                   <p key={i} className="text-lg text-slate-800 border-l-2 border-indigo-100 pl-4">{line}</p>
                 ))}
               </div>
            </div>

            {/* Topic Cards View */}
            <div className="grid gap-4">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Key Topics</h3>
               {topicCards.length === 0 && <p className="text-center py-10 text-slate-400 text-sm italic">Summary cards will appear as the lecture progresses.</p>}
               {topicCards.map((card, idx) => (
                 <div key={idx} className="bg-white p-6 rounded-xl border border-slate-100 shadow-md">
                   <h4 className="text-xl font-bold text-slate-800 mb-2">{card.title}</h4>
                   <div className="flex flex-wrap gap-2">
                     {card.content.map((point: string, i: number) => (
                       <span key={i} className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full border border-indigo-100">{point}</span>
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