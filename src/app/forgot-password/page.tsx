'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';

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
        throw new Error(data.error || 'Algo deu errado');
      }

      setSuccess('Se o email existir, você receberá as instruções de recuperação.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Algo deu errado');
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
            <h1 className="text-xl font-medium text-gray-900 tracking-tight mb-2">
              Reset your password
            </h1>
            <p className="text-gray-500 text-sm">
              Digite seu e-mail para receber as instruções
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 text-sm text-center">{success}</p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="off"
                className="w-full px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all duration-200 text-gray-900 placeholder-gray-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu e-mail"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 mt-6"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar instruções'}
            </button>
          </form>

          {/* Link para login */}
          <div className="mt-6 text-center">
            <Link 
              href="/login" 
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para login
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
