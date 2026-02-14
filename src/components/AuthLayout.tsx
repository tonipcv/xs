'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center">
            <BrandLogo />
          </Link>
        </div>

        {children}
      </div>
      
      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">Xase Voice Data Governance</p>
      </div>
    </div>
  );
} 