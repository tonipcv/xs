// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

/**
 * GET /api/v1/tenants/me
 * Retorna informações do tenant autenticado
 */
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

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        organizationType: true,
        plan: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Estatísticas básicas
        _count: {
          select: {
            datasets: true,
            apiKeys: true,
          },
        },
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Calcular saldo atual do ledger
    const balanceAgg = await prisma.creditLedger.aggregate({
      _sum: { amount: true },
      where: { tenantId: auth.tenantId },
    })
    const currentBalance = Number(balanceAgg._sum?.amount || 0)

    return NextResponse.json({
      ...tenant,
      balance: currentBalance,
      stats: {
        datasetsCount: tenant._count.datasets,
        apiKeysCount: tenant._count.apiKeys,
      },
    })
  } catch (err: any) {
    console.error('[API] GET /api/v1/tenants/me error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
