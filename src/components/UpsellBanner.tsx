'use client';

import { ArrowRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface UpsellBannerProps {
  title?: string;
  description?: string;
}

export default function UpsellBanner({ 
  title = "Desbloqueie o Acesso Completo",
  description = "Tenha acesso a todos os recursos e maximize seus resultados"
}: UpsellBannerProps) {
  return (
    <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20 rounded-lg p-4 mb-6">
      <div className="flex flex-col space-y-3">
        <h3 className="text-lg font-semibold text-green-400">{title}</h3>
        <p className="text-sm text-gray-300">{description}</p>
        
        {/* Botão de Upgrade */}
        <a
          href="https://checkout.k17.com.br/subscribe/anual-ft-promocional"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between bg-green-500 text-black px-4 py-2 rounded-lg font-medium hover:bg-green-400 transition-colors group"
        >
          <span>Fazer Upgrade Agora</span>
          <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </a>

        {/* Link para criar conta */}
        <div className="text-center pt-2">
          <p className="text-sm text-gray-400">Ainda não tem uma conta?</p>
          <Link 
            href="/register" 
            className="text-green-400 hover:text-green-300 text-sm font-medium inline-flex items-center gap-1 mt-1"
          >
            Criar conta agora
            <ArrowRightIcon className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
} 