import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

export async function POST(request: NextRequest) {
  try {
    const { channel, event, data } = await request.json();

    const pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_APP_SECRET!,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    });

    await pusher.trigger(channel, event, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pusher Route Error:', error);
    return NextResponse.json(
      { error: 'Pusher communication failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}