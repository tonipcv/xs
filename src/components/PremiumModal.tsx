'use client';

import { useRouter } from 'next/navigation';
import { signOut } from "next-auth/react";

interface PremiumModalProps {
  onClose?: () => void;
}

export default function PremiumModal({ onClose }: PremiumModalProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 px-4 backdrop-blur-[2px]">
      <div className="bg-gray-900 rounded-xl p-8 max-w-md w-full border border-gray-800 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-800 mb-4">
            <svg 
              className="h-6 w-6 text-green-500" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              strokeWidth="2"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">Acesso Premium Necessário</h2>
          <p className="mb-8 text-gray-300">
            Faça upgrade para o plano premium para acessar todos os recursos
          </p>
          <a 
            href="https://checkout.k17.com.br/subscribe/anual-ft-promocional"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors block w-full text-center shadow-lg hover:shadow-green-500/20"
          >
            Fazer Upgrade
          </a>
          
          <button
            onClick={onClose}
            className="mt-4 text-gray-400 hover:text-gray-200 transition-colors text-sm w-full"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
} 