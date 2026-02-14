// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { 
        tenantId: true,
        tenant: {
          select: { organizationType: true },
        },
      },
    })

    if (!user || !user.tenantId || user.tenant?.organizationType !== 'CLIENT') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tenantId = user.tenantId

    // Políticas ativas
    const activePolicies = await prisma.voiceAccessPolicy.count({
      where: { clientTenantId: tenantId, status: 'ACTIVE' },
    })

    // Horas usadas (consumidas)
    const policiesAgg = await prisma.voiceAccessPolicy.aggregate({
      where: { clientTenantId: tenantId, status: 'ACTIVE' },
      _sum: { hoursConsumed: true },
    })
    const hoursUsed = policiesAgg._sum?.hoursConsumed || 0

    // Créditos restantes (via CreditLedger)
    const lastLedger = await prisma.creditLedger.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    })
    const creditsRemaining = lastLedger ? Number(lastLedger.balanceAfter) : 0

    // Total gasto (soma de USAGE_DEBIT)
    const debitsAgg = await prisma.creditLedger.aggregate({
      where: { tenantId, eventType: 'USAGE_DEBIT' },
      _sum: { amount: true },
    })
    const totalSpent = Math.abs(Number(debitsAgg._sum?.amount || 0))

    // Máximo de horas disponíveis (soma de maxHours de policies ativas)
    const maxHoursAgg = await prisma.voiceAccessPolicy.aggregate({
      where: { clientTenantId: tenantId, status: 'ACTIVE' },
      _sum: { maxHours: true },
    })
    const maxHoursAvailable = maxHoursAgg._sum?.maxHours || 0

    return NextResponse.json({
      activePolicies,
      hoursUsed,
      creditsRemaining,
      totalSpent,
      maxHoursAvailable,
      hoursRemaining: Math.max(0, maxHoursAvailable - hoursUsed),
    })
  } catch (err: any) {
    console.error('[API] metrics/client error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
