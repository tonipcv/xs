import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'

// DELETE /api/v1/policies/:policyId - Revoke/Delete a policy
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { policyId } = await params

    const policy = await prisma.accessPolicy.findFirst({
      where: { id: policyId },
      include: { dataset: { select: { tenantId: true } } },
    })
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    // Only the dataset owner (SUPPLIER) can revoke
    if (policy.dataset.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (policy.status === 'REVOKED') {
      return NextResponse.json({ status: 'REVOKED', revokedAt: policy.revokedAt })
    }

    const updated = await prisma.accessPolicy.update({
      where: { id: policy.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: 'deleted_by_supplier',
      },
      select: { status: true, revokedAt: true, revokedReason: true },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        action: 'POLICY_DELETED',
        resourceType: 'POLICY',
        resourceId: policyId,
        metadata: JSON.stringify({ reason: updated.revokedReason }),
        status: 'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (err: any) {
    console.error('[API] DELETE /api/v1/policies/:policyId error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
