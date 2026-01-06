import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { getPresignedUrl, uploadBuffer } from '@/lib/xase/storage'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(
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

    const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId } })
    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    // Generate PDF inline (valid binary) to avoid text-based placeholder issues
    const fullBundle = await prisma.evidenceBundle.findFirst({
      where: { bundleId, tenantId },
      include: {
        record: true,
        tenant: true,
      },
    })

    if (!fullBundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const page = doc.addPage([595.28, 841.89])
    const margin = 48
    let y = 790
    const H = (t: string) => { page.drawText(t, { x: margin, y, size: 18, font: fontBold, color: rgb(0.1,0.1,0.1) }); y -= 28 }
    const KV = (k: string, v: string) => { page.drawText(k, { x: margin, y, size: 10, font: fontBold, color: rgb(0.25,0.25,0.25) }); page.drawText(v, { x: margin+180, y, size: 10, font, color: rgb(0.05,0.05,0.05) }); y -= 16 }

    H('Compliance Evidence Report')
    KV('Bundle ID', fullBundle.bundleId)
    KV('Tenant', fullBundle.tenant?.companyName || fullBundle.tenantId)
    KV('Generated (UTC)', new Date().toISOString())
    y -= 10
    H('Timeline')
    KV('Created At', fullBundle.createdAt.toISOString())
    if (fullBundle.record?.timestamp) KV('Decision Timestamp', fullBundle.record.timestamp.toISOString())
    y -= 10
    H('Cryptographic Hashes')
    KV('Record Hash', fullBundle.record?.recordHash || 'N/A')
    KV('Input Hash', fullBundle.record?.inputHash || 'N/A')
    KV('Output Hash', fullBundle.record?.outputHash || 'N/A')
    y -= 10
    H('Verification')
    page.drawText('To verify this evidence bundle, extract the ZIP and run: node verify.js', { x: margin, y, size: 10, font, color: rgb(0.05,0.05,0.05), maxWidth: 595.28 - margin*2, lineHeight: 12 })

    const pdfBytes = await doc.save()
    const pdfBuffer = Buffer.from(pdfBytes)

    const storageKey = `pdf/${tenantId}/${bundleId}/report.pdf`
    const binaryHash = 'sha256:' + crypto.createHash('sha256').update(pdfBuffer).digest('hex')

    const upload = await uploadBuffer(storageKey, pdfBuffer, 'application/pdf')

    // Update bundle
    await prisma.evidenceBundle.update({
      where: { bundleId },
      data: {
        pdfReportUrl: upload.url,
        pdfReportHash: binaryHash,
        pdfReportLogicalHash: binaryHash,
        includesPdf: true,
      }
    })

    // Build storage key presigned URL (bucket may be private)
    let presignedUrl: string | null = null
    try {
      presignedUrl = await getPresignedUrl(storageKey, 60 * 10) // 10 minutes
    } catch {}

    return NextResponse.json({
      bundleId,
      pdfReportUrl: upload.url,
      pdfReportHash: binaryHash,
      pdfReportLogicalHash: binaryHash,
      presignedUrl,
      generatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error', message: error?.message || String(error) }, { status: 500 })
  }
}
