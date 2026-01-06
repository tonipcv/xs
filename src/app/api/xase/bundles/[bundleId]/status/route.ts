import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ bundleId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 })
    }

    const { bundleId } = await context.params

    const bundle = await prisma.evidenceBundle.findFirst({
      where: { bundleId, tenantId },
      select: {
        status: true,
        bundleId: true,
        pdfReportUrl: true,
        includesPdf: true,
        bundleManifestHash: true,
        storageKey: true,
        completedAt: true,
      },
    })

    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    return NextResponse.json({
      bundleId,
      status: bundle.status,
      includesPdf: bundle.includesPdf,
      pdfReportUrl: bundle.pdfReportUrl || null,
      manifestHash: bundle.bundleManifestHash || null,
      readyAt: bundle.completedAt || null,
      hasStorage: !!bundle.storageKey,
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error', message: error?.message || String(error) }, { status: 500 })
  }
}
