'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { signIn } from "next-auth/react"
import { ArrowRight, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import BrandLogo from '@/components/BrandLogo';

function LoginContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Initialize from query on first render (decode percent-encoding like %40)
  const qEmailInitialRaw = searchParams?.get('email') ?? '';
  const qEmailInitial = qEmailInitialRaw ? decodeURIComponent(qEmailInitialRaw) : '';
  const [email, setEmail] = useState(qEmailInitial);
  const [step, setStep] = useState<'email' | 'password' | 'totp'>('email');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [requireTotp, setRequireTotp] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const callbackUrl = searchParams?.get('callbackUrl') ?? null;
  const registerHref = callbackUrl !== null
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/register';
  // Prefill from query (?email=) but do not auto-advance step
  useEffect(() => {
    const qRaw = searchParams?.get('email') ?? '';
    const qEmail = qRaw ? decodeURIComponent(qRaw) : '';
    if (qEmail) {
      setEmail(qEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Fallback: read from window.location.search on mount if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qRaw = params.get('email') ?? '';
      const qEmail = qRaw ? decodeURIComponent(qRaw) : '';
      if (qEmail) {
        setEmail(qEmail);
      }
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // If we are still at email step, just advance
      if (step === 'email') {
        if (!email || !email.includes('@')) {
          setError('Please enter a valid email.');
          setIsSubmitting(false);
          return;
        }
        setStep('password');
        setIsSubmitting(false);
        return;
      }

      // Build credentials payload according to step
      const payload: Record<string, any> = { email, password };
      if (step === 'totp' && totp) {
        payload.totp = totp;
      }

      const result = await signIn('credentials', {
        ...payload,
        redirect: false,
      });

      if (!result) {
        console.warn('signIn returned no result');
        setError('Unable to sign in. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (result?.error) {
        // Ask for TOTP only when backend requires it
        if (result.error === '__2FA_REQUIRED__') {
          setRequireTotp(true);
          setStep('totp');
          setError(null);
          setIsSubmitting(false);
          return;
        }
        // Show the actual error message
        setError(result.error === 'CredentialsSignin' ? 'Invalid credentials' : result.error);
        setIsSubmitting(false);
        return;
      }

      if (result?.ok) {
        setConfirmed(true);
        // Redirect to callback URL or default dashboard
        setTimeout(() => {
          router.push('/app/dashboard');
          router.refresh();
        }, 500);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <BrandLogo showText={false} />
            </div>
            <h1 className="text-xl font-medium text-gray-900 tracking-tight">Welcome</h1>
            <p className="text-sm text-gray-600">Log in to continue to XASE</p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* Form - multi-step */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            {step === 'email' && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                    placeholder="name@company.com"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 mt-2"
                  disabled={isSubmitting}
                >
                  Continue
                </button>
              </>
            )}

            {step === 'totp' && (
              <>
                <div>
                  <label htmlFor="totp" className="block text-sm font-medium text-gray-700 mb-1.5">Authenticator code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    id="totp"
                    name="totp"
                    value={totp}
                    onChange={(e) => setTotp(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                    placeholder="000000"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded transition-colors duration-200 mt-2 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
                </button>
                <div className="text-center mt-3">
                  <button
                    type="button"
                    className="text-xs text-gray-600 hover:text-gray-900"
                    onClick={() => { setStep('password'); setTotp(''); setError(null); }}
                  >
                    Back to password
                  </button>
                </div>
              </>
            )}

            {step === 'password' && (
              <>
                <div>
                  <label htmlFor="password" className="block text sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 mt-2 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                  {!isSubmitting && <ArrowRight className="h-4 w-4 text-black/70" />}
                </button>
              </>
            )}
          </form>

          {/* Links */}
          <div className="mt-6 text-center">
            <Link 
              href="/forgot-password" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>
          <div className="mt-4 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link
              href={registerHref}
              className="text-gray-900 hover:text-black transition-colors duration-200 font-medium"
            >
              Get a demo
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
