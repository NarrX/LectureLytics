'use client';

import { useEffect, useState } from 'react';

export default function GuestPage() {
  const [topicSummaries, setTopicSummaries] = useState<any[]>([]);

  useEffect(() => {
    // In a real setup, this would connect to Pusher or your WebSocket
    // to receive the 'Analysis Path' data
  }, []);

  return (
    <div className="p-10 bg-gray-100 min-h-screen">
      <h2 className="text-2xl font-bold mb-4 text-blue-800">Live Lecture View</h2>
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