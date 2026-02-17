import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'

export async function GET(req: NextRequest) {
  try {
    // Tentar autenticação via API key primeiro
    const auth = await validateApiKey(req)
    
    let tenantId: string | null = null
    
    if (auth.valid && auth.tenantId) {
      // Autenticado via API key
      tenantId = auth.tenantId
    } else {
      // Tentar autenticação via session
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

      if (!user || !user.tenantId || user.tenant?.organizationType !== 'SUPPLIER') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      tenantId = user.tenantId
    }
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Total de datasets
    const totalDatasets = await prisma.dataset.count({
      where: { tenantId, status: 'ACTIVE' },
    })

    // Total de horas fornecidas
    const datasetsAgg = await prisma.dataset.aggregate({
      where: { tenantId, status: 'ACTIVE' },
      _sum: { totalDurationHours: true },
    })
    const totalHoursProvided = datasetsAgg._sum?.totalDurationHours || 0

    // Horas consumidas (via policies)
    const policiesAgg = await prisma.voiceAccessPolicy.aggregate({
      where: {
        dataset: { tenantId },
        status: 'ACTIVE',
      },
      _sum: { hoursConsumed: true },
    })
    const hoursConsumed = policiesAgg._sum?.hoursConsumed || 0

    // Receita acumulada (via AccessLogs GRANTED)
    const accessLogs = await prisma.voiceAccessLog.findMany({
      where: {
        dataset: { tenantId },
        outcome: 'GRANTED',
      },
      select: {
        hoursAccessed: true,
        policyId: true,
      },
    })
    
    // Calcular receita via policies (pricing not yet implemented in schema)
    const revenue = 0; // Placeholder until pricing fields are added to schema

    // Clientes ativos (unique clientTenantId em policies ativas)
    const activePolicies = await prisma.voiceAccessPolicy.findMany({
      where: {
        dataset: { tenantId },
        status: 'ACTIVE',
      },
      select: { clientTenantId: true },
      distinct: ['clientTenantId'],
    })
    const activeClients = activePolicies.length

    return NextResponse.json({
      totalDatasets,
      totalHoursProvided,
      hoursConsumed,
      totalRevenue: revenue,
      activeClients,
    })
  } catch (err: any) {
    console.error('[API] metrics/supplier error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
