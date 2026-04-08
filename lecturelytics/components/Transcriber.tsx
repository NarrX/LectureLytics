"use client";
import { useState, useRef } from "react";

export default function Transcriber() {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = async () => {
    try {
      setTranscript("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: 16000 });
      
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioCtxRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // --- NOISE REDUCTION ---
      const hpf = audioContext.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 150; // Slightly higher to cut more room rumble

      const processor = audioContext.createScriptProcessor(16384, 1, 1);
      
      source.connect(hpf);
      hpf.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = async (e) => {
        if (audioContext.state === 'closed') return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Energy check (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        if (rms < 0.012) return; 

        // Normalization
        const normalizedData = new Float32Array(inputData.length);
        let max = 0;
        for (let i = 0; i < inputData.length; i++) if (Math.abs(inputData[i]) > max) max = Math.abs(inputData[i]);
        if (max > 0) {
          for (let i = 0; i < inputData.length; i++) normalizedData[i] = (inputData[i] / max) * 0.9;
        }

        const formData = new FormData();
        formData.append("audio", new Blob([normalizedData.buffer], { type: 'application/octet-stream' }));

        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          const data = await res.json();

          if (data.text && data.text.trim()) {
            let text = data.text.toLowerCase();

            // --- ADVANCED PHONETIC BRIDGE ---
            // Maps messy phonetic guesses to clean lecture terms
            const phoneticMap: Record<string, string> = {
              "fes": "testing",
              "tassing": "testing",
              "sascripti": "transcription",
              "ription": "transcription",
              "lecturlitics": "LectureLytics",
              "lectur": "lecture",
              "ac": "the"
            };

            Object.keys(phoneticMap).forEach(key => {
              const regex = new RegExp(`\\b${key}\\b`, 'gi');
              text = text.replace(regex, phoneticMap[key]);
            });

            // Clean up double words (like "testing testing") created by the bridge
            // Clean up double words (like "testing testing") created by the bridge
            const words = text.split(/\s+/);

            // Explicitly define types: w is string, i is number
            const cleanWords = words.filter((w: string, i: number) => w !== words[i - 1]);

            text = cleanWords.join(" ");

            setTranscript((prev) => {
              if (!prev) return text;
              const prevWords = prev.trim().split(/\s+/);
              const nextWords = text.trim().split(/\s+/);

              let overlap = 0;
              for (let i = 1; i <= Math.min(prevWords.length, nextWords.length, 4); i++) {
                if (prevWords.slice(-i).join(" ") === nextWords.slice(0, i).join(" ")) overlap = i;
              }
              const result = [...prevWords, ...nextWords.slice(overlap)].join(" ");
              return result.charAt(0).toUpperCase() + result.slice(1); // Auto-capitalize
            });
          }
        } catch (err) {
          console.error(err);
        }
      };

      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (audioCtxRef.current) audioCtxRef.current.close();
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-10 font-sans">
      <button 
        onClick={isRecording ? stopRecording : startRecording}
        className={`px-12 py-5 rounded-full text-white font-bold text-xl transition-all shadow-xl active:scale-95 ${
          isRecording ? "bg-red-500 animate-pulse" : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {isRecording ? "Stop Recording" : "Start Lecture"}
      </button>

      <div className="w-full max-w-3xl p-8 bg-white border border-gray-200 rounded-3xl shadow-2xl min-h-[350px]">
        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Live Transcription</h3>
        <p className="text-2xl text-gray-800 leading-relaxed font-medium">
          {transcript || <span className="text-gray-300 italic">Waiting for your voice...</span>}
        </p>
      </div>
    </div>
  );
}