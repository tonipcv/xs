'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, ArrowLeft } from 'lucide-react';
import Image from 'next/image';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const [emailSent, setEmailSent] = useState(false);
  
  let email: string | null = null;
  if (searchParams) {
    email = searchParams.get('email');
  } else {
    console.error("Parâmetros de busca não encontrados.");
  }

  useEffect(() => {     
    const sendResetEmail = async () => {
      if (email && !emailSent) {
        try {
          const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          });

          if (!response.ok) {
            throw new Error('Erro ao enviar email de recuperação');
          }

          setEmailSent(true);
        } catch (error) {
          console.error("Erro ao enviar e-mail de redefinição de senha:", error);
        }
      }
    };
  
    sendResetEmail();
  }, [email, emailSent]);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[380px] bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 p-8 shadow-lg">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <div className="relative w-16 h-16 grayscale">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 rounded-full p-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <h2 className="text-center text-lg font-medium text-gray-900 mb-4">
            E-mail enviado com sucesso!
          </h2>
          
          <p className="text-center text-gray-500 text-sm mb-2">
            Verifique seu e-mail:
          </p>
          <p className="text-center text-gray-900 font-medium mb-6">
            {email}
          </p>

          <p className="text-center text-gray-500 text-sm">
            Se você possui uma conta, receberá um e-mail com as instruções para redefinir sua senha.
          </p>

          <div className="mt-8 text-center">
            <Link 
              href="/login" 
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para o login
            </Link>
          </div>
        </div>
        
        {/* Footer minimalista */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Secure authentication powered by HTPS.io
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 flex items-center justify-center">
        <div className="text-gray-600">Carregando...</div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
} 