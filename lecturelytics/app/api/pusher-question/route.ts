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
    const { code, topicIndex, question } = await request.json();

    if (!code || typeof topicIndex !== 'number' || !question?.trim()) {
      return NextResponse.json({ error: 'Missing code, topicIndex, or question' }, { status: 400 });
    }

    await pusher.trigger(`presence-room-${code}`, 'question-submitted', {
      topicIndex,
      question: question.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Question Submit Error:', error);
    return NextResponse.json({ error: 'Failed to submit question' }, { status: 500 });
  }
}