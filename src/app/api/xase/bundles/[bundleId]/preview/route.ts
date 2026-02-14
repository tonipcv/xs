// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { generatePDFReportData } from '@/lib/xase/pdf-report'
import { generateNarrativeFromEvidence } from '@/lib/xase/narrative'
import { getPresignedUrl } from '@/lib/xase/storage'

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
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            companyName: true,
          },
        },
      },
    })

    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    // Generate report data
    const reportData = await generatePDFReportData(bundleId)

    // Generate AI narrative (optional)
    const narrative = await generateNarrativeFromEvidence(reportData)

    // Presign PDF URL for viewing (bucket may be private)
    let pdfPresignedUrl: string | null = null
    try {
      pdfPresignedUrl = await getPresignedUrl(`pdf/${tenantId}/${bundleId}/report.pdf`, 60 * 10)
    } catch {}

    return NextResponse.json({
      bundle: {
        bundleId: bundle.bundleId,
        tenantId: bundle.tenantId,
        createdAt: bundle.createdAt.toISOString(),
        pdfReportUrl: bundle.pdfReportUrl,
        bundleManifestHash: bundle.bundleManifestHash,
        bundleHash: bundle.bundleHash,
        tenant: bundle.tenant,
      },
      pdfPresignedUrl,
      reportData,
      narrative,
    })
  } catch (error: any) {
    console.error('[Preview API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
