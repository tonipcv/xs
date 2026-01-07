
'use client';

import { useState, FormEvent, Suspense } from 'react';
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
  const [step, setStep] = useState<'email' | 'password' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [isTotp, setIsTotp] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? null;
  const registerHref = callbackUrl !== null
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/register';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Step 1: only confirm email UI and go to password step
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

    try {
      // Stage 2: request OTP challenge after we have email+password
      if (!needsOtp && step === 'password') {
        const res = await fetch('/api/auth/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to start login');
          return;
        }
        if (data.next === 'totp') {
          setNeedsOtp(true);
          setIsTotp(true);
          setStep('otp');
          setError(null);
          return;
        }
        if (data.next === 'otp') {
          setNeedsOtp(true);
          setIsTotp(false);
          setStep('otp');
          setError(null);
          return;
        }
      }

      // Final step: complete login with NextAuth (sends OTP/TOTP when necessary)
      const result = await signIn('credentials', {
        email,
        password,
        otp: needsOtp ? (otp || undefined) : undefined,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'OTP_INVALID') {
          setError('Invalid code. Try again.');
          return;
        }
        if (result.error === 'OTP_EXPIRED') {
          setError('Code expired. Please log in again to resend.');
          setNeedsOtp(false);
          setIsTotp(false);
          setOtp('');
          return;
        }
        if (result.error === 'TOTP_INVALID') {
          setError('Invalid authenticator code.');
          return;
        }
        setError(result.error);
        return;
      }

      if (result?.ok) {
        // Marca como confirmado visualmente e só depois redireciona
        setConfirmed(true);
        const dest = callbackUrl || '/xase';
        setTimeout(() => {
          router.push(dest);
          router.refresh();
        }, 900);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login error');
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
            <h1 className="text-xl font-medium text-[#f5f5f7] tracking-tight">Welcome</h1>
            <p className="text-sm text-[#f5f5f7]/70">Log in to continue to XASE</p>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="mb-6 p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            {step === 'email' && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">Email address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
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

            {step === 'password' && !needsOtp && (
              <>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
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

            {needsOtp && step === 'otp' && (
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">{isTotp ? 'Authenticator code' : 'Code sent by email'}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  id="otp"
                  name="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                  placeholder="000000"
                />
                {!isTotp && (
                  <p className="text-xs text-[#f5f5f7]/50 mt-1">We sent a 6-digit code to your email.</p>
                )}
                <button 
                  type="submit" 
                  className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 flex items-center justify-center gap-2 mt-4"
                  disabled={isSubmitting || confirmed}
                >
                  {confirmed ? 'Code confirmed' : (isSubmitting ? 'Confirming…' : 'Confirm code')}
                  {confirmed ? (
                    <Check className="h-4 w-4 text-black/70" />
                  ) : (
                    !isSubmitting && <ArrowRight className="h-4 w-4 text-black/70" />
                  )}
                </button>
              </div>
            )}
          </form>

          {/* Links */}
          <div className="mt-6 text-center">
            <Link 
              href="/forgot-password" 
              className="text-sm text-[#f5f5f7]/60 hover:text-[#f5f5f7]/90 transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>
          <div className="mt-4 text-center text-sm text-[#f5f5f7]/60">
            Don't have an account?{' '}
            <Link
              href={registerHref}
              className="text-[#f5f5f7] hover:text-white transition-colors duration-200 font-medium"
            >
              Create account
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
