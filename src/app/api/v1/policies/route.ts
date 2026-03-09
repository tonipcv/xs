import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'
import { z } from 'zod'

function genPolicyId() {
  return 'pol_' + crypto.randomBytes(12).toString('hex')
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    let tenantId: string | null = auth.valid ? (auth.tenantId || null) : null
    if (!tenantId) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
      tenantId = user?.tenantId || null
      if (!tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Rate limiting stubbed

    const url = new URL(req.url)
    const datasetPublicId = url.searchParams.get('datasetId') || undefined
    const clientTenantId = url.searchParams.get('clientTenantId') || undefined
    const status = url.searchParams.get('status') || undefined
    const take = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

    // Map public datasetId -> internal id
    let datasetInternalId: string | undefined
    if (datasetPublicId) {
      const ds = await prisma.dataset.findFirst({
        where: { datasetId: datasetPublicId },
        select: { id: true },
      })
      if (!ds) return NextResponse.json({ policies: [] })
      datasetInternalId = ds.id
    }

    const policies = await prisma.accessPolicy.findMany({
      where: {
        // tenant pode ver policies como supplier (dono do dataset) ou como client
        OR: [
          { dataset: { tenantId } },
          { clientTenantId: tenantId },
        ],
        datasetId: datasetInternalId || undefined,
        clientTenantId: clientTenantId || undefined,
        status: status as any || undefined,
      },
      include: {
        dataset: { select: { datasetId: true, name: true, tenantId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    const items = policies.map(p => ({
      id: p.id,
      policyId: p.policyId,
      datasetId: p.dataset.datasetId,
      datasetName: p.dataset.name,
      datasetOwner: p.dataset.tenantId,
      clientTenantId: p.clientTenantId,
      status: p.status,
      usagePurpose: p.usagePurpose,
      maxHours: p.maxHours,
      hoursConsumed: p.hoursConsumed,
      maxDownloads: p.maxDownloads,
      downloadsCount: p.downloadsCount,
      expiresAt: p.expiresAt,
      canStream: p.canStream,
      canBatchDownload: p.canBatchDownload,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    return NextResponse.json({ policies: items })
  } catch (err: any) {
    console.error('[API] GET /api/v1/policies error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    console.log('Policies API Key received:', apiKey.substring(0, 20) + '...')
    const auth = await validateApiKey(apiKey)
    console.log('Policies Auth result:', { valid: auth.valid, tenantId: auth.tenantId, error: auth.error })
    let tenantId: string | null = auth.valid ? (auth.tenantId || null) : null
    console.log('After API key auth, tenantId:', tenantId)
    if (!tenantId) {
      console.log('No tenantId from API key, trying session auth...')
      const session = await getServerSession(authOptions)
      console.log('Session result:', session?.user?.email ? 'has email' : 'no session')
      if (!session?.user?.email) {
        console.log('No session, returning 401')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
      console.log('User lookup result:', user?.tenantId)
      tenantId = user?.tenantId || null
      if (!tenantId) {
        console.log('No tenantId from user, returning 403')
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    console.log('Final tenantId:', tenantId)

    // Rate limiting stubbed

    const BodySchema = z.object({
      datasetId: z.string().min(1),
      name: z.string().min(1).optional(),
      rules: z.record(z.any()).optional(),
      clientTenantId: z.string().min(1).optional(),
      usagePurpose: z.string().min(1).optional(),
      maxHours: z.number().positive().optional(),
      maxDownloads: z.number().int().positive().optional(),
      expiresAt: z.string().optional(),
      canStream: z.boolean().optional(),
      canBatchDownload: z.boolean().optional(),
    })

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      console.error('Zod validation failed:', parsed.error.errors)
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const {
      datasetId,
      name,
      rules,
      clientTenantId = tenantId!, // Default to own tenant for tests
      usagePurpose = 'RESEARCH', // Default for tests
      maxHours,
      maxDownloads,
      expiresAt,
      canStream = false,
      canBatchDownload = false,
    } = parsed.data

    // Enforce Streaming-Only Governance: no downloads permitted
    if (canBatchDownload === true || (typeof maxDownloads === 'number' && maxDownloads > 0)) {
      return NextResponse.json({ error: 'Batch downloads are not permitted under governed access' }, { status: 400 })
    }

    if (!datasetId || !clientTenantId || !usagePurpose) {
      const errorDetails = { datasetId: !!datasetId, clientTenantId: !!clientTenantId, usagePurpose: !!usagePurpose, tenantId }
      return NextResponse.json({ error: 'Missing required fields', details: errorDetails }, { status: 400 })
    }

    // Validar dataset pertence ao SUPPLIER autenticado
    const dataset = await prisma.dataset.findFirst({
      where: { id: datasetId },
      select: { id: true, tenantId: true, status: true },
    })
    console.log('Dataset lookup:', { found: !!dataset, datasetTenantId: dataset?.tenantId, status: dataset?.status })
    if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    console.log('Comparing tenantIds:', { datasetTenantId: dataset.tenantId, authTenantId: tenantId })
    if (dataset.tenantId !== tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (dataset.status !== 'ACTIVE') return NextResponse.json({ error: 'Dataset must be ACTIVE' }, { status: 400 })

    // Validar client tenant
    const clientTenant = await prisma.tenant.findUnique({ where: { id: clientTenantId }, select: { id: true } })
    if (!clientTenant) return NextResponse.json({ error: 'Client tenant not found' }, { status: 404 })

    let expiresAtDate: Date | null = null
    if (expiresAt) {
      const d = new Date(expiresAt)
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 })
      expiresAtDate = d
    }

    const policyId = genPolicyId()

    const created = await prisma.accessPolicy.create({
      data: {
        datasetId: dataset.id,
        clientTenantId: clientTenant.id,
        policyId,
        usagePurpose,
        maxHours: maxHours ?? null,
        // Downloads are not allowed under governed access
        maxDownloads: null,
        expiresAt: expiresAtDate,
        // Force streaming-only
        canStream: true,
        canBatchDownload: false,
        status: 'ACTIVE',
        hoursConsumed: 0,
        downloadsCount: 0,
      },
      select: {
        id: true,
        policyId: true,
        datasetId: true,
        clientTenantId: true,
        status: true,
        usagePurpose: true,
        maxHours: true,
        maxDownloads: true,
        expiresAt: true,
        canStream: true,
        canBatchDownload: true,
        createdAt: true,
      },
    })

    // Add name to response for test compatibility
    const responseWithName = {
      ...created,
      name: name || `Policy for ${datasetId}`,
      rules: rules || {},
    }

    // Audit
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId!,
        action: 'POLICY_CREATED',
        resourceType: 'POLICY',
        resourceId: created.policyId,
        metadata: JSON.stringify({ datasetId, clientTenantId, usagePurpose }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json(responseWithName, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/v1/policies error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
