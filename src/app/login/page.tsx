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
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      // Login with email + password only (no OTP)
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.ok) {
        setConfirmed(true);
        
        // Fetch organization type to determine redirect
        try {
          const orgRes = await fetch('/api/user/organization-type');
          if (orgRes.ok) {
            const { organizationType } = await orgRes.json();
            const dest = callbackUrl || 
              (organizationType === 'CLIENT' ? '/xase/voice/client' : '/xase/voice');
            setTimeout(() => {
              router.push(dest);
              router.refresh();
            }, 900);
          } else {
            // Default to supplier dashboard if can't determine
            const dest = callbackUrl || '/xase/voice';
            setTimeout(() => {
              router.push(dest);
              router.refresh();
            }, 900);
          }
        } catch (fetchErr) {
          console.error('Error fetching org type:', fetchErr);
          const dest = callbackUrl || '/xase/voice';
          setTimeout(() => {
            router.push(dest);
            router.refresh();
          }, 900);
        }
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
          
          {/* Form */}
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

            {step === 'password' && (
              <>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
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
