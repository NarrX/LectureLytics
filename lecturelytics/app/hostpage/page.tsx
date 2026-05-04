'use client';

import React, { useEffect, useState } from 'react';

export default function HostPage() {
  const [transcript, setTranscript] = useState<string[]>([]);
  const [pingStatus, setPingStatus] = useState('Ready to ping guest page');
  const [isPinging, setIsPinging] = useState(false);

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

  const handlePingGuestPage = async () => {
    setIsPinging(true);
    setPingStatus('Sending ping through Pusher...');

    try {
      const response = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Host page pinged guest instance' }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        setPingStatus(payload?.message ?? 'Ping sent successfully');
      } else {
        setPingStatus(`Ping failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setPingStatus(`Ping error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="p-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Lecturer Dashboard (Recording...)</h2>
        <button
          type="button"
          onClick={handlePingGuestPage}
          disabled={isPinging}
          className="mb-3 inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {isPinging ? 'Pinging...' : 'Ping guest page'}
        </button>
        <p className="text-sm text-gray-600">{pingStatus}</p>
      </div>
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