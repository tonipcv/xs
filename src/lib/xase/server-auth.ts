// Stub for backward compatibility after Sprint 1 cleanup
// Server-side authentication utilities
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { redirect } from 'next/navigation';

export async function requireServerAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect('/login');
  }
  
  const tenantId = (session.user as any).tenantId;
  
  return {
    user: session.user,
    tenantId: tenantId || null,
  };
}

export async function getServerAuthUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function getTenantId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.tenantId || null;
}
