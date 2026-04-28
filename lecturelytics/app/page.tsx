'use client';

import { useRouter } from 'next/navigation';
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-24">
      <h1 className="text-4xl font-bold mb-8 text-black">Lecture Summarizer</h1>
      <div className="flex gap-6">
        <button 
          onClick={() => router.push('/hostpage')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Host / Lecturer Path
        </button>
        <button 
          onClick={() => router.push('/guestpage')}
          className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
        >
          Guest / Student Path
        </button>
      </div>
    </main>
  );
}