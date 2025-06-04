import Image from 'next/image';
// ou import { TrendingUp, CandlestickChart } from 'lucide-react';

export default function XLogo() {
  return (
    <div className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500">
      <Image
        src="/logo.png"
        alt="Cxlus Logo"
        width={80}
        height={24}
        className="h-auto"
        priority
      />
    </div>
  );
} 