'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, ArrowLeft } from 'lucide-react';

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
    <div className="min-h-screen bg-black font-normal tracking-[-0.03em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 p-8 shadow-2xl">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2 text-black">
              HTPS.io
            </h1>
          </div>
          
          <div className="flex justify-center mb-6">
            <div className="bg-green-100 rounded-full p-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <h2 className="text-center text-lg font-semibold text-black mb-4">
            E-mail enviado com sucesso!
          </h2>
          
          <p className="text-center text-gray-600 text-sm mb-2">
            Verifique seu e-mail:
          </p>
          <p className="text-center text-black font-medium mb-6">
            {email}
          </p>

          <p className="text-center text-gray-600 text-sm">
            Se você possui uma conta, receberá um e-mail com as instruções para redefinir sua senha.
          </p>

          <div className="mt-8 text-center">
            <Link 
              href="/login" 
              className="text-sm text-gray-600 hover:text-black transition-colors duration-200 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Carregando...</div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
} 