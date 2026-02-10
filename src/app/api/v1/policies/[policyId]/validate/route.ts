import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validatePolicy } from '@/lib/xase/policy-engine'

/**
 * GET /api/v1/policies/{policyId}/validate
 * Valida uma policy sem consumir quota
 * Usado para testar acesso antes de fazer download real
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  try {
    const auth = await validateApiKey(req)
    let tenantId: string | null = auth.valid && auth.tenantId ? auth.tenantId : null
    if (!tenantId) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
      tenantId = user?.tenantId || null
      if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 1200, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { policyId } = await params
    const url = new URL(req.url)
    const requestedHours = parseFloat(url.searchParams.get('requestedHours') || '0.5')

    // Validar policy usando o Policy Engine
    const decision = await validatePolicy({
      policyId,
      requestedHours,
      clientTenantId: tenantId!,
      apiKeyId: auth.apiKeyId,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      action: 'POLICY_CHECK',
    })

    return NextResponse.json({
      allowed: decision.allowed,
      reason: decision.reason,
      code: decision.code,
      usage: decision.usage,
      policy: decision.policy ? {
        policyId: decision.policy.policyId,
        status: decision.policy.status,
        maxHours: decision.policy.maxHours,
        hoursConsumed: decision.policy.hoursConsumed,
        maxDownloads: decision.policy.maxDownloads,
        downloadsCount: decision.policy.downloadsCount,
        expiresAt: decision.policy.expiresAt,
      } : undefined,
    })
  } catch (err: any) {
    console.error('[API] policies/:policyId/validate error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
