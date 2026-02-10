'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from "next-auth/react";
import { PlayIcon, UserCircleIcon, Brain, BarChart2, MessageCircle, Heart } from 'lucide-react';
import { satoshi } from '../fonts/fonts';

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (path: string) => {
    return pathname === path;
  };

  const navigationItems = [
    {
      href: '/series-restrito',
      icon: PlayIcon,
      label: 'Programs'
    },
    {
      href: '/planos',
      icon: MessageCircle,
      label: 'Chat'
    },
    {
      href: '/ia',
      icon: Brain,
      label: 'IA Bíblica'
    },
    {
      href: '/pedidos',
      icon: Heart,
      label: 'Pedidos'
    },
    {
      href: '/grafico',
      icon: BarChart2,
      label: 'Gráfico'
    },
    {
      href: '/perfil',
      icon: UserCircleIcon,
      label: 'Profile'
    }
  ];

  return (
    <nav className={`fixed bottom-0 w-full bg-white/90 backdrop-blur-sm border-t border-gray-100 ${satoshi.variable}`}>
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-around items-center h-16">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 w-20 h-full
                ${isActive(item.href) ? 'text-[#35426A]' : 'text-[#7286B2] hover:text-[#35426A]'}
                transition-colors`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .font-satoshi {
          font-family: var(--font-satoshi);
          letter-spacing: -0.03em;
        }
      `}</style>
    </nav>
  );
} 