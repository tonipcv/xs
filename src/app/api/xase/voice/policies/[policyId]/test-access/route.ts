// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { validatePolicy, logAccess } from '@/lib/xase/policy-engine'

export async function GET(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = await getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })

    const url = new URL(req.url)
    const { policyId } = await params
    const requestedHoursParam = url.searchParams.get('requestedHours')

    const policy = await prisma.voiceAccessPolicy.findFirst({
      where: { policyId },
      select: {
        id: true,
        policyId: true,
        clientTenantId: true,
        dataset: { select: { id: true, datasetId: true } },
      },
    })

    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    if (policy.clientTenantId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Default requested hours (0.5h) if not provided
    let requestedHours = 0.5
    if (requestedHoursParam) {
      const v = Number(requestedHoursParam)
      if (!Number.isFinite(v) || v <= 0) {
        return NextResponse.json({ error: 'Invalid requestedHours' }, { status: 400 })
      }
      requestedHours = v
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    const validation = await validatePolicy({
      policyId,
      requestedHours,
      clientTenantId: tenantId,
      userId: undefined,
      apiKeyId: undefined,
      ipAddress,
      userAgent,
    })

    // Log POLICY_CHECK without side effects
    await logAccess(
      {
        policyId,
        requestedHours,
        clientTenantId: tenantId,
        userId: undefined,
        apiKeyId: undefined,
        ipAddress,
        userAgent,
      },
      validation.allowed ? 'GRANTED' : 'DENIED',
      policy.dataset.id,
      0,
      requestedHours,
      validation.allowed ? undefined : validation.reason,
      'POLICY_CHECK',
    )

    return NextResponse.json({
      allowed: validation.allowed,
      reason: validation.reason,
      requestedHours,
      policyId,
      datasetId: policy.dataset.datasetId,
    })
  } catch (err: any) {
    console.error('[API] policies/:policyId/test-access error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
