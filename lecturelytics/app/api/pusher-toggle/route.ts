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
    const { code, topicIndex, guestId, toggledOn } = await request.json();

    if (!code || typeof topicIndex !== 'number' || !guestId) {
      return NextResponse.json({ error: 'Missing code, topicIndex, or guestId' }, { status: 400 });
    }

    await pusher.trigger(`presence-room-${code}`, 'topic-toggle', {
      topicIndex,
      guestId,
      toggledOn: !!toggledOn,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Toggle Submit Error:', error);
    return NextResponse.json({ error: 'Failed to submit toggle' }, { status: 500 });
  }
}