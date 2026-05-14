'use client';

import React, { useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

export default function GuestPage() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [topicSummaries, setTopicSummaries] = useState<any[]>([]);
  const [pingMessages, setPingMessages] = useState<string[]>([]);

  const pusherRef = useRef<Pusher | null>(null);

  const handleJoinRoom = () => {
    if (roomCode.length !== 4) {
      alert("Please enter a valid 4-digit code.");
      return;
    }

    setTopicSummaries([]);
    setPingMessages([]);
    setIsConnected(true);
  };
  
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;



    if (!key || !cluster) {
      setPingMessages([
        'Missing Pusher configuration. Set NEXT_PUBLIC_PUSHER_KEY and NEXT_PUBLIC_PUSHER_CLUSTER in Vercel.',
      ]);
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
    });
    pusherRef.current = pusher;

    const channel = pusher.subscribe('lecture-channel');
    const channelName = `lecture-room-${roomCode}`;

    channel.bind('new-topic-card', (data: any) => {
      setTopicSummaries((prev) => [data, ...prev]);
    });

    channel.bind('ping-event', (data: any) => {
      const message = typeof data === 'object' && data?.message ? data.message : 'Ping received from Pusher';
      setPingMessages((prev) => [message, ...prev].slice(0, 10));
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe('lecture-channel');
      pusher.disconnect();
    };
  }, []);

  return (
    <div className="p-10 bg-gray-100 min-h-screen">
      <h2 className="text-2xl font-bold mb-4 text-blue-800">LectureLytics Guest</h2>

      {/* --- ROOM INPUT SECTION --- */}
      {!isConnected ? (
        <div className="bg-white p-6 rounded-lg shadow-md max-w-sm mx-auto text-center">
          <h3 className="text-gray-700 font-semibold mb-4">Enter Lecture Code</h3>
          <input
            type="text"
            maxLength={4}
            placeholder="e.g. 1234"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
            className="w-full p-3 border-2 border-blue-100 rounded-md text-center text-2xl tracking-widest focus:border-blue-500 outline-none mb-4"
          />
          <button
            onClick={handleJoinRoom}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-md hover:bg-blue-700 transition"
          >
            Join Session
          </button>
        </div>
      ) : (
        /* --- ACTIVE SESSION VIEW --- */
        <div>
          <div className="flex justify-between items-center mb-6">
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
              Connected to Room: <strong>{roomCode}</strong>
            </span>
            <button 
              onClick={() => setIsConnected(false)} 
              className="text-sm text-gray-500 underline"
            >
              Leave Room
            </button>
          </div>

          <div className="grid gap-4">
            {topicSummaries.length === 0 ? (
              <p className="italic text-gray-500">Waiting for {roomCode}'s host to send cards...</p>
            ) : (
              topicSummaries.map((topic, i) => (
                <div key={i} className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
                  <h3 className="font-bold text-lg text-gray-900">{topic.title}</h3>
                  <p className="text-gray-600 mt-1">{topic.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}