'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { translations } from '@/lib/i18n';
import Image from 'next/image';

export default function Login() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState('pt-BR');
  const router = useRouter();

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
        router.push('/whatsapp');
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
            <h1 className="text-xl font-medium text-gray-900 tracking-tight">
              Sign in to your account
            </h1>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t.login.email}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all duration-200 text-gray-900 placeholder-gray-400"
                placeholder={t.login.emailPlaceholder}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t.login.password}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all duration-200 text-gray-900 placeholder-gray-400"
                placeholder={t.login.passwordPlaceholder}
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-6"
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
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200"
            >
              {t.login.forgotPassword}
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
