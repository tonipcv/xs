import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/voice/evidence
 * Export evidence bundle for training compliance
 * 
 * Query params:
 * - days: number of days to include (default: 3)
 * - datasetId: optional dataset filter
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '3')
    const datasetId = searchParams.get('datasetId')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Build where clause
    const whereClause: any = {
      clientTenantId: auth.tenantId,
      timestamp: { gte: startDate },
    }

    if (datasetId) {
      const dataset = await prisma.dataset.findFirst({
        where: { datasetId },
        select: { id: true },
      })
      if (dataset) {
        whereClause.datasetId = dataset.id
      }
    }

    // Fetch access logs
    const accessLogs = await prisma.voiceAccessLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: 1000,
      select: {
        id: true,
        action: true,
        outcome: true,
        hoursAccessed: true,
        filesAccessed: true,
        bytesTransferred: true,
        errorMessage: true,
        ipAddress: true,
        userAgent: true,
        timestamp: true,
        dataset: {
          select: {
            datasetId: true,
            name: true,
            language: true,
          },
        },
        policy: {
          select: {
            policyId: true,
            usagePurpose: true,
            maxHours: true,
          },
        },
      },
    })

    // Fetch policies
    const policies = await prisma.voiceAccessPolicy.findMany({
      where: {
        clientTenantId: auth.tenantId,
        updatedAt: { gte: startDate },
      },
      select: {
        policyId: true,
        usagePurpose: true,
        maxHours: true,
        hoursConsumed: true,
        maxDownloads: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        datasetId: true,
      },
    })

    // Fetch datasets for policies
    const datasetIds = [...new Set(policies.map(p => p.datasetId))]
    const datasets = await prisma.dataset.findMany({
      where: { id: { in: datasetIds } },
      select: {
        id: true,
        datasetId: true,
        name: true,
        description: true,
        language: true,
        consentStatus: true,
        jurisdiction: true,
      },
    })
    const datasetMap = new Map(datasets.map(d => [d.id, d]))

    // Fetch ledger entries
    const ledgerEntries = await prisma.creditLedger.findMany({
      where: {
        tenantId: auth.tenantId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        eventType: true,
        amount: true,
        description: true,
        createdAt: true,
      },
    })

    // Build evidence bundle
    const evidenceBundle = {
      metadata: {
        generatedAt: new Date().toISOString(),
        tenantId: auth.tenantId,
        periodDays: days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        datasetFilter: datasetId || null,
      },
      summary: {
        totalAccessEvents: accessLogs.length,
        totalPolicies: policies.length,
        totalLedgerEntries: ledgerEntries.length,
        totalHoursAccessed: accessLogs.reduce((sum, log) => sum + log.hoursAccessed, 0),
        totalBytesTransferred: accessLogs.reduce(
          (sum, log) => sum + (log.bytesTransferred ? Number(log.bytesTransferred) : 0),
          0
        ),
        grantedAccess: accessLogs.filter((l) => l.outcome === 'GRANTED').length,
        deniedAccess: accessLogs.filter((l) => l.outcome === 'DENIED').length,
      },
      accessLogs: accessLogs.map((log) => ({
        id: log.id,
        action: log.action,
        outcome: log.outcome,
        hoursAccessed: log.hoursAccessed,
        filesAccessed: log.filesAccessed,
        bytesTransferred: log.bytesTransferred ? log.bytesTransferred.toString() : null,
        errorMessage: log.errorMessage,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp.toISOString(),
        dataset: log.dataset,
        policy: log.policy,
      })),
      policies: policies.map((policy) => ({
        policyId: policy.policyId,
        usagePurpose: policy.usagePurpose,
        maxHours: policy.maxHours,
        hoursConsumed: policy.hoursConsumed,
        maxDownloads: policy.maxDownloads,
        // pricePerHour: null, // Pricing not yet implemented
        // currency: "USD", // Pricing not yet implemented
        status: policy.status,
        expiresAt: policy.expiresAt?.toISOString() || null,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
        dataset: datasetMap.get(policy.datasetId) || null,
      })),
      ledger: ledgerEntries.map((entry) => ({
        id: entry.id,
        eventType: entry.eventType,
        amount: entry.amount.toString(),
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
      compliance: {
        purpose: 'Training Evidence Bundle for AI Model Compliance',
        note: 'This bundle contains all access events, policies, and billing records for the specified period. Use for audit trails, compliance reporting, and training documentation.',
        generatedBy: 'Xase Voice Data Governance Platform',
      },
    }

    return NextResponse.json(evidenceBundle, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="evidence-bundle-${auth.tenantId}-${Date.now()}.json"`,
      },
    })
  } catch (error: any) {
    console.error('[Voice Evidence] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
