import { NextResponse } from 'next/server';
import { pipeline } from '@xenova/transformers';

let transcriber: any = null;
let contextBuffer: Float32Array | null = null;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob;
    const arrayBuffer = await audioBlob.arrayBuffer();
    const currentAudio = new Float32Array(arrayBuffer);

    if (!transcriber) {
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/wav2vec2-base-960h');
    }

    // Sliding Window: Glue 50% of the previous chunk to the current one
    let combined = currentAudio;
    if (contextBuffer) {
      combined = new Float32Array(contextBuffer.length + currentAudio.length);
      combined.set(contextBuffer);
      combined.set(currentAudio, contextBuffer.length);
    }

    // Update context with the last 0.5s of current audio
    contextBuffer = currentAudio.slice(-8000);

    const output = await transcriber(combined);
    
    // Final text cleanup
    const text = output.text.toLowerCase().replace(/[^\w\s]/g, "").trim();

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ text: "" }, { status: 500 });
  }
}