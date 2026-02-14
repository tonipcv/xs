import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const { params } = context as { params: { executionId: string } }
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    })

    if (!user?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 })
    }

    const { executionId } = params

    const execution = await prisma.policyExecution.findUnique({
      where: { executionId },
      include: {
        offer: true,
        policy: true,
        lease: true,
        buyer: true,
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    if (execution.buyerTenantId !== user.tenant.id) {
      return NextResponse.json(
        { error: 'You do not own this execution' },
        { status: 403 }
      )
    }

    // Generate cryptographic evidence bundle
    const evidenceBundle = {
      executionId: execution.executionId,
      offerId: execution.offer.offerId,
      buyerTenant: {
        id: execution.buyer.id,
        name: execution.buyer.name,
      },
      contract: {
        allowedPurposes: execution.allowedPurposes,
        constraints: execution.constraints,
        jurisdiction: execution.offer.jurisdiction,
        complianceLevel: execution.offer.complianceLevel,
      },
      usage: {
        hoursUsed: execution.hoursUsed,
        requestCount: execution.requestCount,
        bytesStreamed: execution.bytesStreamed.toString(),
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
      },
      financials: {
        totalCost: execution.totalCost,
        currency: execution.currency,
        pricePerHour: execution.offer.pricePerHour,
      },
      policy: {
        policyId: execution.policy.policyId,
        usagePurpose: execution.policy.usagePurpose,
      },
      lease: {
        leaseId: execution.lease.leaseId,
        issuedAt: execution.lease.issuedAt,
        expiresAt: execution.lease.expiresAt,
      },
      generatedAt: new Date().toISOString(),
    }

    // Create cryptographic hash
    const bundleString = JSON.stringify(evidenceBundle, null, 2)
    const hash = crypto.createHash('sha256').update(bundleString).digest('hex')

    const signedEvidence = {
      ...evidenceBundle,
      cryptographicProof: {
        algorithm: 'SHA-256',
        hash,
        timestamp: new Date().toISOString(),
      },
    }

    // Update execution with evidence hash
    await prisma.policyExecution.update({
      where: { id: execution.id },
      data: {
        evidenceHash: hash,
        evidenceGeneratedAt: new Date(),
      },
    })

    return NextResponse.json({
      evidence: signedEvidence,
      downloadUrl: `/api/v1/executions/${executionId}/evidence/download`,
    })
  } catch (error: any) {
    console.error('Generate evidence error:', error)
    return NextResponse.json(
      { error: 'Failed to generate evidence' },
      { status: 500 }
    )
  }
}
