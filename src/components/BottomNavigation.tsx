'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Database, ShoppingCart, User } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-200/50 h-16 px-2 flex items-center justify-around shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
      <Link
        href="/xase/ai-holder"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname?.startsWith('/xase/ai-holder') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Home size={18} />
        <span className="text-xs font-medium">Início</span>
      </Link>

      <Link
        href="/xase/ai-holder/datasets"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname?.includes('/datasets') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Database size={18} />
        <span className="text-xs font-medium">Datasets</span>
      </Link>

      <Link
        href="/xase/ai-lab"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname?.startsWith('/xase/ai-lab') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <ShoppingCart size={18} />
        <span className="text-xs font-medium">Marketplace</span>
      </Link>

      <Link
        href="/profile"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname === '/profile' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <User size={18} />
        <span className="text-xs font-medium">Perfil</span>
      </Link>
    </nav>
  );
} 