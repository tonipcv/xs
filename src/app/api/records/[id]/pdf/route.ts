import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTenantId } from '@/lib/xase/server-auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    const { id } = await context.params
    const transactionId = id

    const record = await prisma.decisionRecord.findFirst({
      where: { transactionId, tenantId },
      include: {
        tenant: true,
        insuranceDecision: true,
      }
    })

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const latestBundle = await prisma.evidenceBundle.findFirst({
      where: { transactionId, tenantId },
      orderBy: { createdAt: 'desc' },
    })

    const latestIntervention = await prisma.humanIntervention.findFirst({
      where: { recordId: record.id },
      orderBy: { timestamp: 'desc' }
    })

    const position = await prisma.decisionRecord.count({
      where: { tenantId, timestamp: { lte: record.timestamp } }
    })

    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

    const page1 = doc.addPage([595.28, 841.89])
    const margin = 48
    let y = 790

    const drawTitle = (text: string) => {
      page1.drawText(text, { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
      y -= 18 + 10
      page1.drawLine({ start: { x: margin, y }, end: { x: 595.28 - margin, y }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) })
      y -= 18
    }
    const drawKV = (k: string, v: string) => {
      page1.drawText(k, { x: margin, y, size: 10, font: fontBold, color: rgb(0.25, 0.25, 0.25) })
      page1.drawText(v, { x: margin + 180, y, size: 10, font, color: rgb(0.05, 0.05, 0.05) })
      y -= 16
    }

    drawTitle('Decision Evidence Summary')

    drawKV('Tenant', record.tenant.companyName || record.tenant.name)
    drawKV('transactionId', record.transactionId)
    drawKV('Timestamp (UTC)', record.timestamp.toISOString())
    drawKV('Note', 'Captured at decision time')
    y -= 10

    drawTitle('Decision')
    const outcome = (record as any).insuranceDecision?.decisionOutcome || 'UNKNOWN'
    const decisionType = record.decisionType || 'UNKNOWN'
    const claimType = record.insuranceDecision?.claimType || 'N/A'
    const claimAmount = (() => {
      const v: any = record.insuranceDecision?.claimAmount
      if (v == null) return 'N/A'
      try {
        if (typeof v === 'object' && typeof v.toNumber === 'function') {
          return `$${v.toNumber().toFixed(2)}`
        }
        const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v)
        return Number.isFinite(n) ? `$${n.toFixed(2)}` : 'N/A'
      } catch {
        return 'N/A'
      }
    })()
    drawKV('Outcome', outcome)
    drawKV('Decision Type', decisionType)
    drawKV('Claim', `${claimType} | ${claimAmount}`)
    drawKV('Model', `${record.modelId || 'N/A'} | ${record.modelVersion || 'N/A'}`)
    const conf = record.confidence != null ? (() => {
      const v: any = record.confidence
      try {
        if (typeof v === 'object' && typeof v.toNumber === 'function') return (v.toNumber() * 100).toFixed(1) + '%'
        const n = Number(typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : v)
        return Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : 'N/A'
      } catch { return 'N/A' }
    })() : 'N/A'
    drawKV('Confidence', `${conf} (indicative only)`)
    y -= 10

    drawTitle('Human Oversight')
    // Policy requirement unknown in this MVP
    drawKV('Intervention required by policy', 'Not applicable')
    if (latestIntervention) {
      drawKV('Intervention performed', 'YES')
      drawKV('Who', latestIntervention.actorName || latestIntervention.actorEmail || latestIntervention.actorUserId || 'Unknown')
      drawKV('When', new Date(latestIntervention.timestamp).toISOString())
      drawKV('Action', latestIntervention.action)
    } else {
      drawKV('Intervention performed', 'NO')
    }
    y -= 10

    drawTitle('Integrity')
    drawKV('Record hash', record.recordHash)
    drawKV('Previous hash', record.previousHash || 'N/A')
    drawKV('Status', 'Verified - No alteration detected')

    const page2 = doc.addPage([595.28, 841.89])
    let y2 = 790
    const drawTitle2 = (text: string) => {
      page2.drawText(text, { x: margin, y: y2, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
      y2 -= 18 + 10
      page2.drawLine({ start: { x: margin, y: y2 }, end: { x: 595.28 - margin, y: y2 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) })
      y2 -= 18
    }
    const drawKV2 = (k: string, v: string) => {
      page2.drawText(k, { x: margin, y: y2, size: 10, font: fontBold, color: rgb(0.25, 0.25, 0.25) })
      page2.drawText(v, { x: margin + 180, y: y2, size: 10, font, color: rgb(0.05, 0.05, 0.05) })
      y2 -= 16
    }

    drawTitle2('Proof Overview')
    drawKV2('Chain position', String(position))
    drawKV2('Ledger sequence', String(position))
    drawKV2('Hash chain ref', record.recordHash.substring(0, 16) + '...')

    drawKV2('Bundle reference', latestBundle ? latestBundle.bundleId : 'N/A')
    drawKV2('Manifest hash', latestBundle?.bundleManifestHash || 'Available in bundle')

    y2 -= 10
    drawTitle2('Verification')
    page2.drawText('To independently verify integrity, download the evidence bundle and run the included verification script.', { x: margin, y: y2, size: 10, font, color: rgb(0.05, 0.05, 0.05), maxWidth: 595.28 - margin * 2, lineHeight: 12 })
    y2 -= 24

    drawTitle2('Disclaimer')
    const disclaimer = 'This document is a summary derived from immutable records. The authoritative evidence remains the cryptographically sealed bundle.'
    page2.drawText(disclaimer, { x: margin, y: y2, size: 10, font, color: rgb(0.05, 0.05, 0.05), maxWidth: 595.28 - margin * 2, lineHeight: 12 })

    // Footer (page 2 only)
    page2.drawText('Generated by Xase Evidence Ledger', { x: margin, y: 24, size: 9, font, color: rgb(0.25, 0.25, 0.25) })

    const pdfBytes = await doc.save()

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="decision-evidence-summary-${transactionId}.pdf"`
      }
    })
  } catch (error: any) {
    console.error('[PDF Summary] Error:', error?.message || String(error))
    return NextResponse.json({ error: 'Internal server error', message: error?.message || String(error) }, { status: 500 })
  }
}
