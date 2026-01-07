
'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function ForgotPassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccess('If the email exists, you will receive reset instructions.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0f12] font-normal tracking-[-0.01em]">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <div className="mb-3 flex justify-center">
              <BrandLogo showText={false} />
            </div>
            <h1 className="text-xl font-medium text-[#f5f5f7] tracking-tight mb-1">
              Reset your password
            </h1>
            <p className="text-sm text-[#f5f5f7]/70">Enter your email to receive reset instructions</p>
          </div>

          {error && (
            <div className="mb-6 p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-3">
              <p className="text-green-400 text-sm text-center">{success}</p>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit} autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#f5f5f7]/80 mb-1.5">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-transparent border border-white/[0.08] rounded focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 text-[#f5f5f7] placeholder-[#f5f5f7]/40"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 text-sm font-medium text-black bg-white hover:bg-white/90 rounded transition-colors duration-200 mt-6"
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/login" 
              className="text-sm text-[#f5f5f7]/60 hover:text-[#f5f5f7]/90 transition-colors duration-200 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </div>
        
        
      </div>
    </div>
  );
}
