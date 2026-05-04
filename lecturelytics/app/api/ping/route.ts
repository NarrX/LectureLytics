import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = body?.message || 'Host page pinged guest instance';

    // Initialize Pusher - Ensure these names match Vercel exactly
    const pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_APP_SECRET!, 
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });

    // Trigger the event
    await pusher.trigger('lecture-channel', 'ping-event', { message });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pusher Route Error:', error);
    return NextResponse.json(
      { error: 'Pusher communication failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}