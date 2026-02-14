import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/xase/auth'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: { executionId: string } }
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const { executionId } = params

    // Get execution
    const execution = await prisma.policyExecution.findUnique({
      where: { id: executionId },
      include: {
        policy: true,
        offer: true,
        lease: true,
      },
    })

    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    if (execution.buyerTenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Create immutable contract snapshot
    const rawContract = {
      executionId: execution.executionId,
      offerId: execution.offerId,
      policyId: execution.policyId,
      leaseId: execution.leaseId,
      allowedPurposes: execution.allowedPurposes,
      constraints: execution.constraints,
      pricePerHour: execution.offer.pricePerHour,
      currency: execution.currency,
      startedAt: execution.startedAt,
      expiresAt: execution.expiresAt,
      policy: {
        maxHours: execution.policy.maxHours,
        canStream: execution.policy.canStream,
        canBatchDownload: execution.policy.canBatchDownload,
      },
    }

    const contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(rawContract))
      .digest('hex')

    // Store snapshot
    const snapshot = await prisma.executionContractSnapshot.create({
      data: {
        id: `snap_${crypto.randomBytes(16).toString('hex')}`,
        executionId: execution.id,
        rawContract,
        contractHash,
      },
    })

    return NextResponse.json({
      snapshotId: snapshot.id,
      contractHash: snapshot.contractHash,
      createdAt: snapshot.createdAt,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] POST /api/v1/executions/:id/snapshot error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: { executionId: string } }
    const auth = await validateApiKey(req)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const { executionId } = params

    const execution = await prisma.policyExecution.findUnique({
      where: { id: executionId },
      select: { buyerTenantId: true },
    })

    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    if (execution.buyerTenantId !== auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const snapshots = await prisma.executionContractSnapshot.findMany({
      where: { executionId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ snapshots })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[API] GET /api/v1/executions/:id/snapshot error:', msg)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
