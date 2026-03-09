import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import { validateBearer } from '@/lib/xase/bearer'

export async function GET(req: NextRequest, context: any) {
  try {
    const { params } = context as { params: { leaseId: string } }
    // Auth: prefer Bearer (CLI), else API key (with RL)
    const authz = req.headers.get('authorization') || ''
    const bearerToken = authz.startsWith('Bearer ')
      ? authz.slice('Bearer '.length)
      : ''
    const bearer = await validateBearer(bearerToken)
    let tenantId: string | null = null
    if (bearer.valid) {
      tenantId = bearer.tenantId || null
    } else {
      const apiKey = req.headers.get('x-api-key') || ''
      const auth = await validateApiKey(apiKey)
      if (!auth.valid || !auth.tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      tenantId = auth.tenantId as string
      // Rate limiting stubbed
    }

    const { leaseId } = params
    if (!leaseId) return NextResponse.json({ error: 'Missing leaseId' }, { status: 400 })

    const lease = await prisma.accessLease.findFirst({
      where: {
        leaseId,
        clientTenantId: tenantId as string,
      },
      select: {
        leaseId: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
        policy: {
          select: {
            policyId: true,
            dataset: { select: { datasetId: true, name: true } },
            status: true,
            expiresAt: true,
          },
        },
      },
    })

    if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

    // Flatten a bit for convenience
    const dataset = lease.policy?.dataset
    return NextResponse.json({
      id: lease.leaseId,
      leaseId: lease.leaseId,
      status: lease.status,
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      revokedAt: lease.revokedAt,
      policy: lease.policy ? {
        policyId: lease.policy.policyId,
        status: lease.policy.status,
        expiresAt: lease.policy.expiresAt,
      } : null,
      dataset: dataset ? { datasetId: dataset.datasetId, name: dataset.name } : null,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/leases/[leaseId] error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
