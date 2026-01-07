'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { signIn } from "next-auth/react";
import { ArrowRight } from 'lucide-react';
import { REGION_NAMES, type Region } from '@/lib/prices';
import { detectUserRegion } from '@/lib/geo';
import { translations } from '@/lib/i18n';
import BrandLogo from '@/components/BrandLogo';

function RegisterContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>('OTHER');
  const [locale, setLocale] = useState('pt-BR');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? null;
  const loginHref = callbackUrl !== null
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/login';

  useEffect(() => {
    // Detecta região e idioma do usuário quando o componente montar
    const detectedRegion = detectUserRegion();
    setRegion(detectedRegion);

    const browserLang = navigator.language;
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
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // Validações
    if (!name || !email || !password || !confirmPassword) {
      setError(t.register.errors.requiredFields);
      setIsSubmitting(false);
      return;
    }

    if (!email.includes('@')) {
      setError(t.register.errors.invalidEmail);
      setIsSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setError(t.register.errors.weakPassword);
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t.register.errors.passwordsDoNotMatch);
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          region,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError(t.register.errors.emailInUse);
          return;
        }
        throw new Error(data.error || 'Error during registration');
      }

      // Fazer login automaticamente após o registro
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error('Error during automatic login');
      }

      // Após o login bem-sucedido, redireciona para o callbackUrl (ou fallback)
      router.push(callbackUrl || '/xase');
      router.refresh();
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Error during registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f12] font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <BrandLogo showText={false} />
            </div>
            <h1 className="text-xl font-medium text-[#f5f5f7] tracking-tight">
              {t.register.createAccount}
            </h1>
            <p className="text-sm text-[#f5f5f7]/70 mt-1">{t.register.startJourney}</p>
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
              <label htmlFor="name" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.register.name}
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.register.namePlaceholder}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.register.email}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.register.emailPlaceholder}
              />
            </div>

            <div>
              <label htmlFor="region" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                Region
              </label>
              <select
                id="region"
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
              >
                {Object.entries(REGION_NAMES).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.register.password}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.register.passwordPlaceholder}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                {t.register.confirmPassword}
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                placeholder={t.register.confirmPasswordPlaceholder}
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 flex items-center justify-center gap-2 mt-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? t.register.signingUp : t.register.signUp}
              <ArrowRight className="h-4 w-4 text-black/70" />
            </button>
          </form>

          {/* Link para login */}
          <div className="mt-6 text-center text-sm text-[#f5f5f7]/60">
            {t.register.alreadyHaveAccount}{' '}
            <Link
              href={loginHref}
              className="text-[#f5f5f7] hover:text-white transition-colors duration-200 font-medium"
            >
              {t.register.signIn}
            </Link>
          </div>
        </div>

        
      </div>
    </div>
  );
}
export default function Register() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}> 
      <RegisterContent />
    </Suspense>
  );
}
