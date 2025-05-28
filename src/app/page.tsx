'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from "next-auth/react";
import { AppLayout } from '@/components/AppSidebar';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (session) {
      router.push('/whatsapp');
    } else {
      router.push('/login');
    }
  }, [router, session, status]);

  // Show loading while redirecting
  return (
    <AppLayout>
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    </AppLayout>
  );
}
