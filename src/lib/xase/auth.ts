// Stub for backward compatibility after Sprint 1 cleanup
// This module was deleted but is still referenced in many routes
// TODO: Refactor routes to use NextAuth directly

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  const tenantId = (session.user as any).tenantId;
  
  if (!tenantId) {
    throw new Error('No tenant ID');
  }
  
  return {
    user: session.user,
    tenantId,
  };
}

export async function getAuthUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function getTenantId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.tenantId || null;
}

export async function validateApiKey(apiKey: string) {
  console.warn('API key validation stubbed');
  return { valid: false, tenantId: null };
}

export async function checkApiRateLimit(apiKey: string) {
  console.warn('API rate limit check stubbed');
  return { allowed: true, remaining: 100 };
}

export function hashApiKey(apiKey: string) {
  console.warn('API key hashing stubbed');
  return `hashed-${apiKey}`;
}
