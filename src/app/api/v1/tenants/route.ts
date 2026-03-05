import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

/**
 * GET /api/v1/tenants
 * Lista tenants com filtro por tipo
 * Usado para selecionar clients ao criar policies
 */
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    let isAuthorized = false
    if (auth.valid) {
      // API key path
      isAuthorized = true
      // Rate limiting stubbed
    } else {
      // Fallback to session auth (any logged-in user)
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const QuerySchema = z.object({
      type: z.enum(['CLIENT', 'SUPPLIER', 'PLATFORM_ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional(),
    })
    
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    
    const { type, status, q, limit } = parsed.data
    const take = Math.min(limit ?? 200, 1000)

    const tenants = await prisma.tenant.findMany({
      where: {
        organizationType: type || undefined,
        status: status ? (status as any) : undefined,
        OR: q && q.trim()
          ? [
              { name: { contains: q.trim(), mode: 'insensitive' } },
              { email: { contains: q.trim(), mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        email: true,
        organizationType: true,
        status: true,
        plan: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ tenants })
  } catch (err: any) {
    console.error('[API] GET /api/v1/tenants error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
