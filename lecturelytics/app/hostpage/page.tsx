'use client';

import { useEffect, useState } from 'react';

export default function HostPage() {
  const [transcript, setTranscript] = useState<string[]>([]);
  
  useEffect(() => {
    // Replace with your FastAPI/Ngrok URL
    const socket = new WebSocket('ws://localhost:8000/ws');

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Keep only last 5 sentences for performance
      setTranscript((prev) => [...prev, data.display_text].slice(-5));
    };

    return () => socket.close();
  }, []);

  return (
    <div className="p-10">
      <h2 className="text-2xl font-bold mb-4">Lecturer Dashboard (Recording...)</h2>
      <div className="bg-white border rounded-lg p-6 shadow-md min-h-[300px]">
        {transcript.map((line, index) => (
          <p key={index} className="text-gray-800 mb-2 border-b pb-1">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}