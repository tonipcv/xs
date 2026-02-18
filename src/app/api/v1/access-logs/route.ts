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
      datasetId: z.string().min(1).optional(),
      clientTenantId: z.string().min(1).optional(),
      action: z.string().min(1).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    const qp = Object.fromEntries(url.searchParams.entries())
    const parsed = QuerySchema.safeParse(qp)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    const { datasetId: datasetPublicId, clientTenantId, action, from, to, limit } = parsed.data
    const take = Math.min(limit ?? 50, 200)

    // Optionally map public datasetId to internal id
    let datasetIdInternal: string | undefined = undefined
    if (datasetPublicId) {
      const ds = await prisma.dataset.findFirst({ where: { datasetId: datasetPublicId, tenantId: auth.tenantId }, select: { id: true } })
      if (!ds) {
        return NextResponse.json({ logs: [] })
      }
      datasetIdInternal = ds.id
    }

    const logs = await prisma.accessLog.findMany({
      where: {
        clientTenantId: clientTenantId || undefined,
        action: action as any || undefined,
        datasetId: datasetIdInternal || undefined,
        timestamp: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { timestamp: 'desc' },
      take,
      select: {
        id: true,
        datasetId: true,
        policyId: true,
        clientTenantId: true,
        action: true,
        filesAccessed: true,
        hoursAccessed: true,
        bytesTransferred: true,
        outcome: true,
        errorMessage: true,
        ipAddress: true,
        userAgent: true,
        requestId: true,
        timestamp: true,
      },
    })

    return NextResponse.json({ logs })
  } catch (err: any) {
    console.error('[API] GET /api/v1/access-logs error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
