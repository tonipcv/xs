import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { validateBearer } from '@/lib/xase/bearer'
import { listObjectsByPrefix, getPresignedUrl } from '@/lib/xase/storage'
import { EpsilonBudgetTracker } from '@/lib/xase/epsilon-budget-tracker'
import { z } from 'zod'

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(256).optional(),
  cursor: z.string().min(1).optional(),
  expiresIn: z.coerce.number().int().min(60).max(3600).optional(),
  estimatedHours: z.coerce.number().min(0).max(24).optional(),
  leaseId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  env: z.string().min(1).optional(),
})

export async function GET(
  req: NextRequest, 
  context: { params: Promise<{ datasetId: string }> }
) {
  try {
    const t0 = Date.now()
    // Prefer Bearer (CLI), fallback to API key with rate limiting
    const authHeader = req.headers.get('authorization') || ''
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''
    const bearer = bearerToken ? await validateBearer(bearerToken) : { valid: false, userId: null, tenantId: null }
    let clientTenantId: string | null = null
    let apiKeyId: string | null = null
    if (bearer.valid) {
      const bTenant: string | null = (bearer as any)?.tenantId ?? null
      clientTenantId = bTenant
    } else {
      const apiKey = req.headers.get('x-api-key') || ''
      const auth = await validateApiKey(apiKey)
      if (!auth.valid || !auth.tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      clientTenantId = auth.tenantId as string
      // Rate limiting stubbed; record apiKey as identifier for auditing
      apiKeyId = apiKey || null
    }

    const { datasetId } = await context.params
    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    const { limit = 64, cursor, expiresIn = 900, estimatedHours = 0, leaseId, jobId, env } = parsed.data

    // 1) Dataset must be ACTIVE
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: { id: true, datasetId: true, tenantId: true, status: true, storageLocation: true },
    })
    if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    if (dataset.status !== 'ACTIVE') return NextResponse.json({ error: 'Dataset not active' }, { status: 400 })

    // 2) Validate active lease for this client and dataset
    const now = new Date()
    const lease = await prisma.accessLease.findFirst({
      where: {
        leaseId,
        clientTenantId: clientTenantId as string,
        datasetId: dataset.id,
        status: 'ACTIVE',
        expiresAt: { gt: now },
      },
      select: { id: true, policyId: true, expiresAt: true },
    })
    if (!lease) return NextResponse.json({ error: 'Lease invalid or expired' }, { status: 403 })

    // 2.1) Active streaming policy for client (derived from lease)
    const policy = await prisma.accessPolicy.findFirst({
      where: {
        id: lease.policyId,
        datasetId: dataset.id,
        clientTenantId: clientTenantId as string,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      select: {
        id: true,
        policyId: true,
        canStream: true,
        hoursConsumed: true,
        maxHours: true,
        allowedEnvironment: true,
      },
    })
    if (!policy) return NextResponse.json({ error: 'No active policy for this dataset' }, { status: 403 })
    if (!policy.canStream) return NextResponse.json({ error: 'Streaming not allowed by policy' }, { status: 403 })
    // Environment control: if policy specifies allowedEnvironment, require env param to match
    if (policy.allowedEnvironment && env && env !== policy.allowedEnvironment) {
      return NextResponse.json({ error: 'Environment not allowed by policy' }, { status: 403 })
    }
    if (policy.allowedEnvironment && !env) {
      return NextResponse.json({ error: 'Environment required by policy' }, { status: 400 })
    }

    // Optional global IP whitelist via env XASE_IP_WHITELIST_CSV="ip1,ip2,..."
    const whitelistCsv = process.env.XASE_IP_WHITELIST_CSV
    if (whitelistCsv) {
      const list = whitelistCsv.split(',').map(s => s.trim()).filter(Boolean)
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
                 (req.headers.get('x-real-ip') || '').trim()
      if (!ip || !list.includes(ip)) {
        return NextResponse.json({ error: 'IP not allowed' }, { status: 403 })
      }
    }

    // 3) List objects by prefix and build batch of presigned URLs
    const prefix = dataset.storageLocation || ''
    const { keys, nextContinuationToken } = await listObjectsByPrefix(prefix, limit, cursor)

    // Generate presigned URLs
    let batch: { key: string; url: string }[] = []
    for (const key of keys) {
      try {
        const url = await getPresignedUrl(key, expiresIn)
        batch.push({ key, url })
      } catch {
        // skip invalid objects
      }
    }

    // Apply PEP enforcement if policy has YAML document
    // TODO: Fetch and apply YAML policy enforcement here
    // For now, basic enforcement is done via policy.canStream check above

    // 3.5) Check and consume epsilon budget for differential privacy
    const budgetTracker = new EpsilonBudgetTracker()
    const epsilon = 0.1 // Small epsilon per streaming batch
    const budgetCheck = await budgetTracker.canExecuteQuery(
      clientTenantId as string,
      dataset.id,
      epsilon
    )
    if (!budgetCheck.allowed) {
      return NextResponse.json(
        { error: budgetCheck.reason || 'Epsilon budget exhausted' },
        { status: 429 }
      )
    }

    // 4) Optional soft metering and auditing (estimate hours per batch if provided)
    if (estimatedHours > 0) {
      await prisma.$transaction(async (tx) => {
        // Enforce hours limit if any
        const nextHours = (policy.hoursConsumed ?? 0) + estimatedHours
        if (policy.maxHours && nextHours > policy.maxHours) {
          throw Object.assign(new Error('Quota exceeded (hours)'), { statusCode: 403 })
        }

        // Update counters
        await tx.accessPolicy.update({
          where: { id: policy.id },
          data: { hoursConsumed: nextHours, lastAccessAt: new Date() },
        })

        // Update PolicyExecution metrics (if exists)
        const execution = await tx.policyExecution.findFirst({
          where: {
            policyId: policy.id,
            leaseId: lease.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
        })
        if (execution) {
          const estimatedBytes = batch.length * 1024 * 1024 // Rough estimate: 1MB per file
          await tx.policyExecution.update({
            where: { id: execution.id },
            data: {
              hoursUsed: { increment: estimatedHours },
              requestCount: { increment: 1 },
              bytesStreamed: { increment: BigInt(estimatedBytes) },
            },
          })
        }

        // Access log
        await tx.accessLog.create({
          data: {
            datasetId: dataset.id,
            policyId: policy.id,
            clientTenantId: clientTenantId as string,
            userId: null,
            apiKeyId: apiKeyId || null,
            action: 'STREAM_ACCESS',
            filesAccessed: batch.length,
            hoursAccessed: estimatedHours,
            bytesTransferred: null,
            outcome: 'GRANTED',
            errorMessage: null,
            ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            requestId: jobId ?? null,
          },
        })
      }).catch((e: any) => {
        if (e?.statusCode === 403) {
          throw e
        }
      })

      // Consume epsilon budget after successful access
      await budgetTracker.consumeBudgetDetailed(
        clientTenantId as string,
        dataset.id,
        epsilon,
        (apiKeyId as string) || 'system',
        'streaming_access',
        jobId || `stream_${Date.now()}`
      )
    } else {
      // Even without estimatedHours, consume epsilon budget
      await budgetTracker.consumeBudgetDetailed(
        clientTenantId as string,
        dataset.id,
        epsilon,
        (apiKeyId as string) || 'system',
        'streaming_access',
        jobId || `stream_${Date.now()}`
      )
    }

    const body = {
      datasetId: dataset.datasetId,
      expiresIn,
      batch,
      nextCursor: nextContinuationToken,
      leaseExpiresAt: lease.expiresAt.toISOString(),
    }
    const genMs = Date.now() - t0
    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-stream-gen-ms': String(genMs),
      },
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    const status = err?.statusCode || 500
    const stack = err?.stack || null
    console.error('[API] datasets/:datasetId/stream error:', msg, stack)
    return NextResponse.json({ 
      error: status === 500 ? 'Internal error' : msg,
      ...(process.env.NODE_ENV !== 'production' ? { details: msg, stack } : {})
    }, { status })
  }
}
