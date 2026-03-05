import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { validateBearer } from '@/lib/xase/bearer'
import { validatePolicy } from '@/lib/xase/policy-engine'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/policies/{policyId}/validate
 * Valida uma policy sem consumir quota
 * Usado para testar acesso antes de fazer download real
 */
export async function GET(req: NextRequest, context: any) {
  try {
    const { params } = context as { params: Promise<{ policyId: string }> }
    // Prefer Bearer (CLI), fallback to API key or session
    const authz = req.headers.get('authorization') || ''
    const bearerToken = authz.startsWith('Bearer ')
      ? authz.slice('Bearer '.length)
      : ''
    const bearer = await validateBearer(bearerToken)
    let tenantId: string | null = null
    let apiKeyId: string | undefined
    if (bearer.valid) {
      tenantId = bearer.tenantId || null
    } else {
      const apiKey = req.headers.get('x-api-key') || ''
      const auth = await validateApiKey(apiKey)
      if (auth.valid && auth.tenantId) {
        tenantId = auth.tenantId
        apiKeyId = apiKey || undefined
      } else {
        // Fallback to session-based auth for browser usage
        const session = await getServerSession(authOptions)
        if (!session?.user?.email) {
          return NextResponse.json({ error: 'Unauthorized', details: 'Missing bearer/api key and no active session' }, { status: 401 })
        }
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
        tenantId = user?.tenantId || null
        if (!tenantId) return NextResponse.json({ error: 'Forbidden', details: 'User has no tenant assigned' }, { status: 403 })
      }
    }

    const { policyId } = await params
    const url = new URL(req.url)
    const requestedHoursRaw = url.searchParams.get('requestedHours') ?? '0.5'
    const requestedHours = Number(requestedHoursRaw)

    if (!Number.isFinite(requestedHours) || requestedHours <= 0) {
      return NextResponse.json({
        error: 'Invalid requestedHours',
        details: 'requestedHours must be a positive number (e.g., 0.5)'
      }, { status: 400 })
    }

    // Validar policy usando o Policy Engine
    const decision = await validatePolicy({
      policyId,
      requestedHours,
      clientTenantId: tenantId!,
      apiKeyId,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      action: 'POLICY_CHECK',
    })

    const d: any = decision as any
    const safeUsage = d.usage ? {
      hoursRemaining: Number.isFinite(d.usage.hoursRemaining as any) ? d.usage.hoursRemaining : null,
      downloadsRemaining: Number.isFinite(d.usage.downloadsRemaining as any) ? d.usage.downloadsRemaining : null,
      utilizationPercent: Number.isFinite(d.usage.utilizationPercent as any) ? d.usage.utilizationPercent : null,
    } : undefined

    return NextResponse.json({
      allowed: decision.allowed,
      reason: decision.reason,
      code: d.code,
      usage: safeUsage,
      policy: d.policy ? {
        policyId: d.policy.policyId,
        status: d.policy.status,
        maxHours: d.policy.maxHours,
        hoursConsumed: d.policy.hoursConsumed,
        maxDownloads: d.policy.maxDownloads,
        downloadsCount: d.policy.downloadsCount,
        expiresAt: d.policy.expiresAt,
      } : undefined,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    const stack = err?.stack || null
    console.error('[API] policies/:policyId/validate error:', msg, stack)
    return NextResponse.json({ 
      error: 'Internal error',
      ...(process.env.NODE_ENV !== 'production' ? { details: msg, stack } : {})
    }, { status: 500 })
  }
}
