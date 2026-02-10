// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { getPresignedUrl, uploadBuffer } from '@/lib/xase/storage'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import crypto from 'crypto'
import { generatePDFReportData } from '@/lib/xase/pdf-report'
import { generateNarrativeFromEvidence } from '@/lib/xase/narrative'
import { hashObject } from '@/lib/xase/crypto'
import { generateCustodyReport } from '@/lib/xase/custody'

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

    // Ensure bundle exists and belongs to tenant
    const bundle = await prisma.evidenceBundle.findFirst({ where: { bundleId, tenantId }, include: { tenant: true, record: true } })
    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    // 1) Build authoritative structured data and hashes
    const data = await generatePDFReportData(bundleId)
    const logicalHash = hashObject(data)

    // 2) Optional AI narrative (non-authoritative)
    const narrative = await generateNarrativeFromEvidence(data)

    // 3) Generate rich PDF (improved layout and spacing)
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    let page = doc.addPage([595.28, 841.89]) // A4 portrait
    const margin = 56
    const contentWidth = 595.28 - margin * 2
    let y = 812

    const ensureSpace = (min: number = 80) => {
      if (y < min) {
        page = doc.addPage([595.28, 841.89])
        y = 812
      }
    }

    const HR = (gapTop = 8, gapBottom = 12) => {
      y -= gapTop
      page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
      y -= gapBottom
    }

    const H = (t: string) => { page.drawText(t, { x: margin, y, size: 22, font: fontBold }); y -= 34 }
    const S = (t: string) => { page.drawText(t, { x: margin, y, size: 14, font: fontBold }); y -= 22 }

    // Break long words that exceed content width
    const breakLongWord = (text: string, fnt: typeof font, size = 10): string[] => {
      const out: string[] = []
      let start = 0
      while (start < text.length) {
        let end = start + 1
        let lastFit = start
        while (end <= text.length) {
          const slice = text.slice(start, end)
          const w = fnt.widthOfTextAtSize(slice, size)
          if (w <= contentWidth) {
            lastFit = end
            end++
          } else {
            break
          }
        }
        if (lastFit === start) {
          // single char fallback
          lastFit = Math.min(start + 1, text.length)
        }
        out.push(text.slice(start, lastFit))
        start = lastFit
      }
      return out
    }

    const wrapText = (text: string, size = 10) => {
      const words = (text || 'N/A').split(/\s+/)
      const lines: string[] = []
      let line = ''
      for (const raw of words) {
        const parts = font.widthOfTextAtSize(raw, size) > contentWidth ? breakLongWord(raw, font, size) : [raw]
        for (const w of parts) {
          const candidate = line ? line + ' ' + w : w
          const width = font.widthOfTextAtSize(candidate, size)
          if (width > contentWidth && line) {
            lines.push(line)
            line = w
          } else {
            line = candidate
          }
        }
      }
      if (line) lines.push(line)
      return lines
    }

    const KV = (k: string, v?: string) => {
      const keySize = 10
      const valSize = 10
      const keyX = margin
      const valX = margin + 200
      const lines = wrapText(v || 'N/A', valSize)
      page.drawText(k, { x: keyX, y, size: keySize, font: fontBold, color: rgb(0.25,0.25,0.25) })
      for (let i = 0; i < lines.length; i++) {
        const lineY = y - i * 14
        page.drawText(lines[i], { x: valX, y: lineY, size: valSize, font, color: rgb(0.05,0.05,0.05) })
      }
      y -= Math.max(16, lines.length * 14)
    }

    // Render paragraph with support for *bold* and **bold** markers
    const P = (t: string) => {
      const size = 10
      const tokens: { text: string; bold: boolean }[] = []
      const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|[^*]+)/g
      const matches = (t || '').match(pattern) || []
      for (const m of matches) {
        if (m.startsWith('**') && m.endsWith('**') && m.length > 4) {
          tokens.push({ text: m.slice(2, -2), bold: true })
        } else if (m.startsWith('*') && m.endsWith('*') && m.length > 2) {
          tokens.push({ text: m.slice(1, -1), bold: true })
        } else {
          tokens.push({ text: m, bold: false })
        }
      }

      // Further split tokens by spaces to allow wrapping
      const split: { text: string; bold: boolean }[] = []
      for (const tk of tokens) {
        const parts = tk.text.split(/(\s+)/)
        for (const p of parts) {
          if (p.length === 0) continue
          split.push({ text: p, bold: tk.bold })
        }
      }

      let lineTokens: { text: string; bold: boolean }[] = []
      let lineWidth = 0
      const flush = () => {
        if (lineTokens.length === 0) return
        ensureSpace(40)
        let x = margin
        for (const tk of lineTokens) {
          const fnt = tk.bold ? fontBold : font
          page.drawText(tk.text, { x, y, size, font: fnt, color: rgb(0.05,0.05,0.05) })
          x += fnt.widthOfTextAtSize(tk.text, size)
        }
        y -= 14
        lineTokens = []
        lineWidth = 0
      }

      for (let i = 0; i < split.length; i++) {
        const tk = split[i]
        const fnt = tk.bold ? fontBold : font
        const w = fnt.widthOfTextAtSize(tk.text, size)
        if (w > contentWidth) {
          // Break this long token
          const chunks = breakLongWord(tk.text, fnt, size)
          for (const ch of chunks) {
            const cw = fnt.widthOfTextAtSize(ch, size)
            if (lineWidth + cw > contentWidth) flush()
            lineTokens.push({ text: ch, bold: tk.bold })
            lineWidth += cw
          }
          continue
        }
        if (lineWidth + w > contentWidth) flush()
        // avoid leading spaces
        if (!(lineTokens.length === 0 && tk.text.trim() === '' )) {
          lineTokens.push(tk)
          lineWidth += w
        }
      }
      flush()
    }

    H('Compliance Evidence Report')

    S('Identification')
    KV('Bundle ID', data.bundleId)
    KV('Tenant', data.tenantName || bundle.tenant?.companyName || bundle.tenantId)
    KV('Generated (UTC)', data.generatedAt)

    y -= 6
    HR(0, 10)
    S('Timeline')
    KV('Created At', bundle.createdAt.toISOString())
    KV('Decision Timestamp', data.decisionTimestamp)

    HR(6, 10)
    S('Cryptographic Hashes')
    KV('Record Hash', data.recordHash)
    KV('Input Hash', data.inputHash)
    KV('Output Hash', data.outputHash)
    KV('Manifest Hash', bundle.bundleManifestHash || 'N/A')
    KV('Bundle Hash', bundle.bundleHash || 'N/A')
    KV('PDF Logical Hash', logicalHash)
    // binaryHash will be filled after we build the PDF; reserve a placeholder line
    const binaryHashPlaceholderY = y
    KV('PDF Binary Hash', '(computed below)')

    HR(6, 10)
    S('Chain of Custody (summary)')
    KV('Access Events', String((data as any).accessEventCount ?? '0'))
    KV('Export Events', String((data as any).exportEventCount ?? '0'))
    KV('Disclosure Events', String((data as any).disclosureEventCount ?? '0'))

    HR(6, 10)
    S('Evidence Summary')
    KV('Status', bundle.status)
    KV('Record Count', String(bundle.recordCount))
    KV('Includes Payloads', bundle.includesPayloads ? 'Yes' : 'No')
    KV('Includes PDF', bundle.includesPdf ? 'Yes' : 'No')
    KV('Date From', bundle.dateFrom ? bundle.dateFrom.toISOString() : 'N/A')
    KV('Date To', bundle.dateTo ? bundle.dateTo.toISOString() : 'N/A')
    KV('Storage Key', (bundle as any).storageKey || 'N/A')

    ensureSpace(140)
    // Details page: Chain of Custody events
    S('Chain of Custody (details)')
    const custody = await generateCustodyReport(bundleId)
    const header = ['Timestamp (UTC)', 'Type', 'Actor', 'IP']
    const widths = [200, 80, 200, 80]
    const drawRow = (cols: string[], bold = false) => {
      let x = margin
      cols.forEach((c, i) => {
        page.drawText(c, { x, y, size: 9, font: bold ? fontBold : font, color: rgb(0.06,0.06,0.06), maxWidth: widths[i] - 4 })
        x += widths[i]
      })
      y -= 14
    }
    drawRow(header, true)
    const events = custody.events?.slice(0, 20) || []
    for (const ev of events) {
      ensureSpace(40)
      drawRow([
        ev.at ? new Date(ev.at).toISOString() : '—',
        ev.type || '—',
        ev.actor || '—',
        ev.ip || '—',
      ])
    }

    ensureSpace(100)
    HR(6, 8)
    S('Narrative Representation (non-authoritative)')
    if (narrative) {
      P(narrative)
    } else {
      P('AI narrative disabled or unavailable. Evidence remains the sole source of truth.')
    }

    ensureSpace(40)
    HR(6, 8)
    S('Verification')
    // Present verification instructions as bullets for readability
    const verifyLines = (data.verificationInstructions || '').split('\n')
    for (const line of verifyLines) {
      if (!line.trim()) continue
      const bullet = line.startsWith('-') || line.match(/^\d+\./) ? '' : '• '
      P(bullet + line)
    }

    // Footer
    y = 44
    page.drawText('This report includes a non-authoritative narrative. Evidence data is immutable and authoritative.', { x: margin, y, size: 8, font, color: rgb(0.25,0.25,0.25), maxWidth: contentWidth })

    const pdfBytes = await doc.save()
    const pdfBuffer = Buffer.from(pdfBytes)

    const storageKey = `pdf/${tenantId}/${bundleId}/report.pdf`
    const binaryHash = 'sha256:' + crypto.createHash('sha256').update(pdfBuffer).digest('hex')

    // Backfill the PDF Binary Hash in the earlier placeholder line
    // Redraw the line at the same Y position with the actual value
    // (Note: pdf-lib doesn't support editing existing text, so we add a small footnote instead)
    ensureSpace(40)
    P(`PDF Binary Hash: ${binaryHash}`)

    const upload = await uploadBuffer(storageKey, pdfBuffer, 'application/pdf')

    // Update bundle
    await prisma.evidenceBundle.update({
      where: { bundleId },
      data: {
        pdfReportUrl: upload.url,
        pdfReportHash: binaryHash,
        pdfReportLogicalHash: logicalHash,
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
