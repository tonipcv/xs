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

  // Redirect this page to external scheduling link
  useEffect(() => {
    try {
      window.location.replace('https://app.cal.eu/xaseai/30min');
    } catch {}
  }, []);

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
    <div className="min-h-screen bg-[#0e0f12] flex items-center justify-center">
      <div className="text-center text-[#f5f5f7]/80">
        <div className="flex justify-center mb-4">
          <BrandLogo showText={false} />
        </div>
        <p className="text-sm">Redirecting to scheduling...</p>
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
