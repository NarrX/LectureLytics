import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = body?.message || 'Host page pinged guest instance';

    // Initialize Pusher with your env vars
    const pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_APP_SECRET!, // <--- Ensure this matches Vercel exactly!
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });

    // Trigger the event
    await pusher.trigger('lecture-channel', 'ping-event', {
      message: message,
    });

    return NextResponse.json({ success: true, message: 'Ping sent through Pusher' });
  } catch (error) {
    console.error('Pusher Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}