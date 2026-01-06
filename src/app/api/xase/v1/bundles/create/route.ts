/**
 * XASE CORE - Bundle Create API (API Key)
 *
 * POST /api/xase/v1/bundles/create
 *
 * Cria um EvidenceBundle autenticando via X-API-Key (sem NextAuth UI).
 * Requer permissão 'export' na API Key.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, hasPermission } from '@/lib/xase/auth'
import { enqueueJob } from '@/lib/jobs'
import { randomBytes } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // 1) Auth via API Key
    const auth = await validateApiKey(request)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(auth, 'export')) {
      return NextResponse.json({ error: 'Forbidden: missing export permission' }, { status: 403 })
    }

    // 2) Parse body
    const body = await request.json().catch(() => ({}))
    const { purpose, description, dateFrom, dateTo } = body || {}
    if (!purpose) {
      return NextResponse.json({ error: 'Purpose is required' }, { status: 400 })
    }

    const tenantId = auth.tenantId

    // 3) Build date filter and count records
    const dateFilter: any = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo) dateFilter.lte = new Date(dateTo)

    const recordCount = await prisma.decisionRecord.count({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
      },
    })

    if (recordCount === 0) {
      return NextResponse.json(
        { error: 'No records found for the specified date range' },
        { status: 400 }
      )
    }

    // 4) Create bundle record
    const bundleId = `bundle_${randomBytes(16).toString('hex')}`

    const bundle = await prisma.evidenceBundle.create({
      data: {
        bundleId,
        tenantId,
        status: 'PENDING',
        recordCount,
        purpose,
        description,
        createdBy: `api-key:${auth.apiKeyId}`,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    })

    // 5) Enqueue async job (idempotent by dedupe key)
    await enqueueJob('GENERATE_BUNDLE', { bundleId, tenantId, dateFilter }, { dedupeKey: bundleId, maxAttempts: 5 })

    return NextResponse.json({
      success: true,
      bundleId: bundle.bundleId,
      recordCount: bundle.recordCount,
      message: 'Bundle creation started. You will be notified when it is ready.',
    })
  } catch (error: any) {
    const msg = error?.message || String(error)
    return NextResponse.json({ error: 'Internal server error', message: msg }, { status: 500 })
  }
}
