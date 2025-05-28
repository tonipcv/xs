'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Bot, Cross, User, MessageCircle } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border h-16 px-2 flex items-center justify-around">
      <Link
        href="/planos"
        className={`flex flex-col items-center min-w-0 ${
          pathname === '/planos' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Home size={20} />
        <span className="text-xs">Início</span>
      </Link>

      <Link
        href="/whatsapp"
        className={`flex flex-col items-center min-w-0 ${
          pathname === '/whatsapp' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <MessageCircle size={20} />
        <span className="text-xs">WhatsApp</span>
      </Link>

      <Link
        href="/ai-agent"
        className={`flex flex-col items-center min-w-0 ${
          pathname?.startsWith('/ai-agent') ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Bot size={20} />
        <span className="text-xs">IA</span>
      </Link>

      <Link
        href="/pedidos"
        className={`flex flex-col items-center min-w-0 ${
          pathname === '/pedidos' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Cross size={20} />
        <span className="text-xs">Pedidos</span>
      </Link>

      <Link
        href="/perfil"
        className={`flex flex-col items-center min-w-0 ${
          pathname === '/perfil' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <User size={20} />
        <span className="text-xs">Perfil</span>
      </Link>
    </nav>
  );
} 