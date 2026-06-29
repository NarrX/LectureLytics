import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_APP_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const socketId = params.get('socket_id');
    const channel = params.get('channel_name');

    if (!socketId || !channel) {
      return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
    }

    // Generate a random anonymous identity for one (this instance) guest connection
    const userId = `guest_${Math.random().toString(36).slice(2, 10)}`;

    const authResponse = pusher.authorizeChannel(socketId, channel, {
      user_id: userId,
      user_info: { joinedAt: Date.now() },
    });

    return NextResponse.json(authResponse);
  } catch (error) {
    console.error('Pusher Auth Error:', error);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}