'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { translations } from '@/lib/i18n';
import BrandLogo from '@/components/BrandLogo';

function LoginContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState('pt-BR');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? null;
  const registerHref = callbackUrl !== null
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/register';

  useEffect(() => {
    // Detecta o idioma do navegador
    const browserLang = navigator.language;
    // Verifica se temos tradução para o idioma, senão usa inglês como fallback
    const supportedLocale = translations[browserLang] ? browserLang : 
                          browserLang.startsWith('pt') ? 'pt-BR' :
                          browserLang.startsWith('es') ? 'es' : 'en';
    setLocale(supportedLocale);
  }, []);

  const t = translations[locale];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      console.log('Tentando fazer login...', { email });
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      console.log('Resultado do login:', result);

      if (result?.error) {
        setError(result.error);
        return;
      }


      if (result?.ok) {
        console.log('Login bem sucedido, redirecionando para WhatsApp...');
        
        // Redireciona direto para a página das instâncias do WhatsApp
        router.push('/xase');
        router.refresh();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1d20] font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[380px] bg-[#1c1d20] p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <BrandLogo />
            </div>
            <h1 className="text-xl font-medium text-[#f5f5f7] tracking-tight">
              Sign in to your account
            </h1>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.login.email}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-[#2a2b2d] border-none rounded focus:outline-none focus:ring-1 focus:ring-[#f5f5f7]/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.login.emailPlaceholder}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.login.password}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm bg-[#2a2b2d] border-none rounded focus:outline-none focus:ring-1 focus:ring-[#f5f5f7]/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.login.passwordPlaceholder}
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 px-4 text-sm font-medium text-[#f5f5f7] bg-[#2a2b2d] hover:bg-[#3a3b3d] rounded transition-colors duration-200 flex items-center justify-center gap-2 mt-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? t.login.signingIn : t.login.signIn}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center">
            <Link 
              href="/forgot-password" 
              className="text-sm text-[#f5f5f7]/60 hover:text-[#f5f5f7]/90 transition-colors duration-200"
            >
              {t.login.forgotPassword}
            </Link>
          </div>
          <div className="mt-4 text-center text-sm text-[#f5f5f7]/60">
            {t.login.noAccount} {' '}
            <Link
              href={registerHref}
              className="text-[#f5f5f7] hover:text-white transition-colors duration-200 font-medium"
            >
              {t.login.createAccount}
            </Link>
          </div>
        </div>
        
        
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}> 
      <LoginContent />
    </Suspense>
  );
}
