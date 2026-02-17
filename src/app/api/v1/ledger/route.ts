import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 1200, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const url = new URL(req.url)
    const QuerySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      eventType: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    const { from, to, eventType, limit } = parsed.data
    const take = Math.min(limit ?? 50, 200)

    const entries = await prisma.creditLedger.findMany({
      where: {
        tenantId: auth.tenantId,
        eventType: eventType || undefined,
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        amount: true,
        eventType: true,
        description: true,
        balanceAfter: true,
        createdAt: true,
        metadata: true,
      },
    })

    const balanceAgg = await prisma.creditLedger.aggregate({
      _sum: { amount: true },
      where: { tenantId: auth.tenantId },
    })
    const balance = Number((balanceAgg._sum?.amount as any) ?? 0)

    return NextResponse.json({ balance, entries })
  } catch (err: any) {
    console.error('[API] GET /api/v1/ledger error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
