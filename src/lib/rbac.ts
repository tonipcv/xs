// @ts-nocheck
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export type OrganizationType = 'SUPPLIER' | 'CLIENT' | 'PLATFORM_ADMIN'

export interface TenantContext {
  userId: string
  userEmail: string
  tenantId: string | null
  organizationType: OrganizationType | null
  xaseRole: string | null
}

/**
 * Get tenant context from current session
 * Returns null if no session
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  // Ensure user exists; create shell if not present
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: {
      email: session.user.email,
      name: session.user.name || null,
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
      xaseRole: true,
      tenant: {
        select: {
          id: true,
          organizationType: true,
        }
      }
    }
  })

  return {
    userId: user.id,
    userEmail: user.email,
    tenantId: user.tenantId,
    organizationType: user.tenant?.organizationType as OrganizationType | null,
    xaseRole: user.xaseRole,
  }
}

/**
 * Require authenticated user with tenant context
 * Redirects to login if not authenticated
 */
export async function requireAuth(): Promise<TenantContext> {
  const context = await getTenantContext()
  if (!context) {
    // Avoid login/public route loop; send to setup which is public
    redirect('/xase/voice/setup')
  }
  return context
}

/**
 * Require SUPPLIER organization type
 * Redirects to appropriate dashboard if not supplier
 */
export async function requireSupplier(): Promise<TenantContext> {
  const context = await requireAuth()
  
  if (!context.tenantId) {
    // User has no tenant - send to setup page to avoid redirect loops
    redirect('/xase/voice/setup')
  }

  if (context.organizationType !== 'SUPPLIER') {
    // Unknown or different org type -> setup to avoid ping-pong
    redirect('/xase/voice/setup')
  }

  return context
}

/**
 * Require CLIENT organization type
 * Redirects to appropriate dashboard if not client
 */
export async function requireClient(): Promise<TenantContext> {
  const context = await requireAuth()
  
  if (!context.tenantId) {
    // User has no tenant - send to setup page to avoid redirect loops
    redirect('/xase/voice/setup')
  }

  if (context.organizationType !== 'CLIENT') {
    // Unknown or different org type -> setup to avoid ping-pong
    redirect('/xase/voice/setup')
  }

  return context
}

/**
 * Check if user is a supplier (without redirecting)
 */
export async function isSupplier(): Promise<boolean> {
  const context = await getTenantContext()
  return context?.organizationType === 'SUPPLIER'
}

/**
 * Check if user is a client (without redirecting)
 */
export async function isClient(): Promise<boolean> {
  const context = await getTenantContext()
  return context?.organizationType === 'CLIENT'
}
