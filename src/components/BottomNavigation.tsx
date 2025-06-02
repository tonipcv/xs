'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Bot, Cross, User, MessageCircle } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-200/50 h-16 px-2 flex items-center justify-around shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
      <Link
        href="/planos"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname === '/planos' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Home size={18} />
        <span className="text-xs font-medium">Início</span>
      </Link>

      <Link
        href="/whatsapp"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname === '/whatsapp' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <MessageCircle size={18} />
        <span className="text-xs font-medium">WhatsApp</span>
      </Link>

      <Link
        href="/ai-agent"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname?.startsWith('/ai-agent') ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Bot size={18} />
        <span className="text-xs font-medium">IA</span>
      </Link>

      <Link
        href="/pedidos"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname === '/pedidos' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Cross size={18} />
        <span className="text-xs font-medium">Pedidos</span>
      </Link>

      <Link
        href="/perfil"
        className={`flex flex-col items-center min-w-0 transition-colors duration-200 ${
          pathname === '/perfil' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <User size={18} />
        <span className="text-xs font-medium">Perfil</span>
      </Link>
    </nav>
  );
} 