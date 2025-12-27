import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/lib/xase/server-auth'
import { requireTenant, requireRole, auditDenied, UnauthorizedError, ForbiddenError } from '@/lib/xase/rbac'
import { assertRateLimit, RateLimitError } from '@/lib/xase/rate-limit'
import { enqueueJob } from '@/lib/jobs'
import { logger, ensureRequestId } from '@/lib/observability/logger'
import { captureException, captureMessage } from '@/lib/observability/sentry'

const STUCK_MINUTES = Number(process.env.BUNDLE_STUCK_MINUTES || 15)

export async function POST(_req: NextRequest, { params }: { params: Promise<{ bundleId: string }> }) {
  const requestId = ensureRequestId(null)
  try {
    const ctx = await getTenantContext()
    try {
      requireTenant(ctx)
      requireRole(ctx, ['OWNER', 'ADMIN'])
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (e instanceof ForbiddenError) {
        const { bundleId } = await params
        await auditDenied(ctx, 'BUNDLE_REPROCESS', 'EVIDENCE_BUNDLE', bundleId, 'Insufficient permissions')
        await captureMessage('BUNDLE_REPROCESS denied by RBAC', { requestId, tags: { action: 'BUNDLE_REPROCESS' }, extra: { tenantId: ctx.tenantId, userId: ctx.userId } })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      throw e
    }

    try {
      await assertRateLimit(ctx, 'BUNDLE_REPROCESS', 10, 60 * 60)
    } catch (e: any) {
      if (e instanceof RateLimitError) {
        const { bundleId } = await params
        await auditDenied(ctx, 'BUNDLE_REPROCESS', 'EVIDENCE_BUNDLE', bundleId, e.message, { limit: 10, windowSeconds: 3600 })
        return NextResponse.json({ error: e.message }, { status: 429 })
      }
      throw e
    }

    const tenantId = ctx.tenantId!
    const { bundleId } = await params

    const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId } })
    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    // Policy: allow reprocess if FAILED, or PROCESSING but stuck beyond STUCK_MINUTES
    const now = new Date()
    const updatedAt = (bundle as any).updatedAt ? new Date((bundle as any).updatedAt) : bundle.completedAt || bundle.createdAt
    const minutesSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / 60000)

    if (bundle.status === 'READY') {
      return NextResponse.json({ error: 'Bundle already READY' }, { status: 400 })
    }

    if (bundle.status === 'PROCESSING' && minutesSinceUpdate < STUCK_MINUTES) {
      return NextResponse.json({ error: 'Bundle is processing; try again later' }, { status: 409 })
    }

    // Try to reset an existing job by dedupe_key (bundleId)
    const reset = await prisma.$executeRawUnsafe(
      `UPDATE xase_jobs
       SET status='PENDING', run_at=NOW(), last_error=NULL
       WHERE dedupe_key = $1`,
      bundleId
    )

    if (reset === 0) {
      // No existing job: enqueue new (idempotent via dedupe_key)
      await enqueueJob('GENERATE_BUNDLE', { bundleId, tenantId, dateFilter: buildDateFilter(bundle) }, { dedupeKey: bundleId, maxAttempts: 5 })
    }

    // Do not update EvidenceBundle here (immutable updates are blocked). The worker will set status accordingly.

    logger.info('bundle.reprocess:ok', { requestId, tenantId, bundleId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('bundle.reprocess:error', { requestId }, error)
    await captureException(error, { requestId, tags: { action: 'BUNDLE_REPROCESS' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildDateFilter(bundle: any) {
  const f: any = {}
  if (bundle.dateFrom) f.gte = new Date(bundle.dateFrom)
  if (bundle.dateTo) f.lte = new Date(bundle.dateTo)
  return f
}
