'use client';

import React, { useEffect, useState } from 'react';
import Pusher from 'pusher-js';

export default function GuestPage() {
  const [topicSummaries, setTopicSummaries] = useState<any[]>([]);
  const [pingMessages, setPingMessages] = useState<string[]>([]);

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

    const channel = pusher.subscribe('lecture-channel');

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
      <h2 className="text-2xl font-bold mb-4 text-blue-800">Live Lecture View</h2>

      <div className="mb-6 space-y-3">
        <h3 className="font-semibold text-lg">Pusher ping activity</h3>
        {pingMessages.length === 0 ? (
          <p className="italic text-gray-500">Waiting for pings...</p>
        ) : (
          pingMessages.map((message, index) => (
            <div key={index} className="rounded border border-blue-200 bg-white p-3 text-sm text-gray-800 shadow-sm">
              {message}
            </div>
          ))
        )}
      </div>

      <div className="grid gap-4">
        {topicSummaries.length === 0 ? (
          <p className="italic text-gray-500">Waiting for lecture to start...</p>
        ) : (
          topicSummaries.map((topic, i) => (
            <div key={i} className="bg-white p-4 rounded shadow">
              <h3 className="font-bold text-lg">{topic.title}</h3>
              <p className="text-gray-600">{topic.summary}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}