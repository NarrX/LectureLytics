import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message : 'Host page pinged guest instance';

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_APP_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    return NextResponse.json(
      { error: 'Missing Pusher env vars. Set PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_KEY, PUSHER_APP_SECRET, and NEXT_PUBLIC_PUSHER_CLUSTER.' },
      { status: 500 }
    );
  }

  const url = `https://api-${cluster}.pusher.com/apps/${appId}/events`;
  const payload = {
    name: 'ping-event',
    channels: ['lecture-channel'],
    data: { message },
  };

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { error: `Pusher error: ${response.status}`, detail: responseText },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true, message: 'Ping sent through Pusher', pusherResponse: responseText });
}
