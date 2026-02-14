'use client';

import Image from 'next/image';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center">
      <div className="relative w-16 h-16 mb-4">
        <Image
          src="/ft-icone.png"
          alt="Futuros Tech Logo"
          width={64}
          height={64}
          className="animate-pulse"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
} 