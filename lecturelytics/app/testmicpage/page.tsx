import Transcriber from "@/components/Transcriber";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8 text-gray-900">LectureLytics</h1>
      <Transcriber />
    </main>
  );
}