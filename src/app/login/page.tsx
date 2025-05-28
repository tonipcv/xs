'use client';

import { useState, FormEvent, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { translations } from '@/lib/i18n';

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
    <div className="min-h-screen bg-gradient-to-b from-[#D6D2D3] to-[#F8FFFF] font-normal tracking-[-0.03em]">
      {/* Header */}
      <header className="fixed w-full top-0 bg-[#D6D2D3]/80 backdrop-blur-lg z-50 border-b border-gray-100/20">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="p-2">
              <div className="relative w-8 h-8">
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
        </div>
      </header>

      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-100 p-8 shadow-lg">
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2 text-[#35426A]">
              {t.login.welcomeBack}
            </h1>
            <p className="text-[#7286B2] text-sm">
              {t.login.signInContinue}
            </p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 text-red-500 text-center text-sm">{error}</div>
          )}
          
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#35426A] mb-2">
                {t.login.email}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#35426A]/20 focus:border-[#35426A] transition-all duration-200 text-[#35426A]"
                placeholder={t.login.emailPlaceholder}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#35426A] mb-2">
                {t.login.password}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#35426A]/20 focus:border-[#35426A] transition-all duration-200 text-[#35426A]"
                placeholder={t.login.passwordPlaceholder}
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#35426A] hover:bg-[#7286B2] rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? t.login.signingIn : t.login.signIn}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Links */}
          <div className="mt-4 text-center">
            <Link 
              href="/forgot-password" 
              className="text-sm text-[#7286B2] hover:text-[#35426A] transition-colors duration-200"
            >
              {t.login.forgotPassword}
            </Link>
          </div>

          {/* Link para criar conta */}
          <p className="mt-8 text-center text-sm text-[#7286B2]">
            {t.login.noAccount}{' '}
            <Link 
              href="/register" 
              className="text-[#35426A] hover:text-[#7286B2] transition-colors duration-200 font-medium"
            >
              {t.login.createAccount}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
