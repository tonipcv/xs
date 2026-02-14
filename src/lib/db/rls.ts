/**
 * Row Level Security (RLS) Helper
 * Sets tenant context for database queries
 */

import { prisma } from '@/lib/prisma'

/**
 * Execute query with tenant context (RLS)
 * Sets app.current_tenant for Row Level Security policies
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: () => Promise<T>
): Promise<T> {
  // Set tenant context
  await prisma.$executeRawUnsafe(
    `SET LOCAL app.current_tenant = '${tenantId.replace(/'/g, "''")}'`
  )
  
  try {
    return await callback()
  } finally {
    // Reset context
    await prisma.$executeRawUnsafe(`RESET app.current_tenant`)
  }
}

/**
 * Middleware to automatically set tenant context
 * Use in API routes
 */
export function createTenantMiddleware(tenantId: string) {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    return withTenantContext(tenantId, operation)
  }
}
