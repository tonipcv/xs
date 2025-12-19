/**
 * API para listar bundles de evidência de um record
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantId } from '@/lib/xase/server-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 })
    }

    const { id } = await context.params
    const transactionId = id

    // Verificar se record pertence ao tenant
    const record = await prisma.decisionRecord.findFirst({
      where: {
        transactionId,
        tenantId,
      },
      select: {
        id: true,
        transactionId: true,
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Buscar bundles
    const bundles = await prisma.evidenceBundle.findMany({
      where: {
        transactionId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bundleId: true,
        transactionId: true,
        storageUrl: true,
        storageKey: true,
        bundleHash: true,
        bundleSize: true,
        format: true,
        includesPayloads: true,
        includesPdf: true,
        createdAt: true,
        accessedAt: true,
        retentionUntil: true,
        legalHold: true,
      },
    })

    return NextResponse.json({
      transaction_id: transactionId,
      bundles,
      total: bundles.length,
    })
  } catch (error: any) {
    console.error('[Bundles List] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
