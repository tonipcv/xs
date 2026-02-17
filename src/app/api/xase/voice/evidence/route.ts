import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = await getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })

    const url = new URL(req.url)
    const daysParam = url.searchParams.get('days')
    const datasetIdParam = url.searchParams.get('datasetId')
    const days = daysParam ? Math.max(1, Math.min(90, Number(daysParam))) : 3
    if (!Number.isFinite(days)) return NextResponse.json({ error: 'Invalid days' }, { status: 400 })

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Optional filter by datasetId (public id)
    let datasetFilterId: string | undefined
    if (datasetIdParam) {
      const ds = await prisma.dataset.findFirst({ where: { datasetId: datasetIdParam }, select: { id: true } })
      datasetFilterId = ds?.id
    }

    const logs = await prisma.voiceAccessLog.findMany({
      where: {
        clientTenantId: tenantId,
        timestamp: { gte: since },
        ...(datasetFilterId ? { datasetId: datasetFilterId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      include: {
        dataset: { select: { datasetId: true, name: true, language: true, consentStatus: true, jurisdiction: true } },
        policy: { select: { policyId: true, usagePurpose: true, maxHours: true, hoursConsumed: true, expiresAt: true } },
      }
    })

    const datasetsMap = new Map<string, any>()
    const policiesMap = new Map<string, any>()

    for (const log of logs) {
      if (log.dataset) {
        datasetsMap.set(log.dataset.datasetId, {
          datasetId: log.dataset.datasetId,
          name: log.dataset.name,
          language: log.dataset.language,
          consentStatus: log.dataset.consentStatus,
          jurisdiction: log.dataset.jurisdiction,
        })
      }
      if (log.policy) {
        policiesMap.set(log.policy.policyId, {
          policyId: log.policy.policyId,
          usagePurpose: log.policy.usagePurpose,
          maxHours: log.policy.maxHours,
          hoursConsumed: log.policy.hoursConsumed,
          expiresAt: log.policy.expiresAt,
          // pricePerHour and currency not yet in schema
        })
      }
    }

    const evidence = {
      generatedAt: new Date().toISOString(),
      window: { since: since.toISOString(), days },
      filter: datasetIdParam ? { datasetId: datasetIdParam } : undefined,
      tenantId,
      datasets: Array.from(datasetsMap.values()),
      policies: Array.from(policiesMap.values()),
      events: logs.map((l) => ({
        timestamp: l.timestamp,
        action: l.action,
        outcome: l.outcome,
        reason: l.errorMessage || undefined,
        hoursAccessed: l.hoursAccessed,
        datasetId: l.dataset?.datasetId,
        policyId: l.policy?.policyId,
      })),
    }

    return NextResponse.json(evidence)
  } catch (err: any) {
    console.error('[API] evidence error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
