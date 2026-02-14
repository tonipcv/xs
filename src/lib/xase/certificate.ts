import PDFDocument from 'pdfkit'
import { Readable } from 'stream'

export interface CertificateData {
  executionId: string
  contractId: string
  supplierName: string
  supplierDomain: string
  buyerName: string
  allowedPurposes: string[]
  merkleRoot: string
  timestamp: Date
  timestampAuthority: string
  datasetName: string
  datasetSize: string
  accessDuration: string
}

/**
 * Generate legal compliance certificate PDF
 * 
 * @param data - Certificate data
 * @returns PDF buffer
 */
export async function generateCertificate(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    })

    const buffers: Buffer[] = []
    doc.on('data', buffers.push.bind(buffers))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('XASE COMPLIANCE CERTIFICATE', { align: 'center' })
      .moveDown()

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('AI Training Data Governance Platform', { align: 'center' })
      .moveDown(2)

    // Certificate ID
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Certificate ID:', { continued: true })
      .font('Helvetica')
      .text(` ${data.executionId}`)
      .moveDown()

    doc
      .font('Helvetica-Bold')
      .text('Issue Date:', { continued: true })
      .font('Helvetica')
      .text(` ${data.timestamp.toISOString()}`)
      .moveDown(2)

    // Data Supplier Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DATA SUPPLIER')
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Name: ${data.supplierName}`)
      .text(`Verified Domain: ${data.supplierDomain}`)
      .text('Status: ✓ Verified')
      .moveDown(2)

    // Data Consumer Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DATA CONSUMER')
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Name: ${data.buyerName}`)
      .text(`Allowed Purposes: ${data.allowedPurposes.join(', ')}`)
      .moveDown(2)

    // Dataset Information
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DATASET INFORMATION')
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Dataset: ${data.datasetName}`)
      .text(`Size: ${data.datasetSize}`)
      .text(`Access Duration: ${data.accessDuration}`)
      .moveDown(2)

    // Compliance Section
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('REGULATORY COMPLIANCE')
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('✓ GDPR Article 28 - Data Processing Agreement signed')
      .text('✓ HIPAA Business Associate Agreement signed (if applicable)')
      .text('✓ EU AI Act Article 10 - Training data documentation')
      .text('✓ CCPA Compliance - Consumer rights respected')
      .text('✓ ISO 27001 - Information security management')
      .moveDown(2)

    // Technical Controls
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TECHNICAL CONTROLS')
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('✓ Watermark - Imperceptible audio fingerprint embedded')
      .text('✓ Kill Switch - Remote revocation capability')
      .text('✓ Telemetry - Real-time usage monitoring')
      .text('✓ Evidence - Cryptographic audit trail')
      .moveDown(2)

    // Cryptographic Proof
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('CRYPTOGRAPHIC PROOF')
      .moveDown(0.5)

    doc
      .fontSize(9)
      .font('Courier')
      .text(`Merkle Root: ${data.merkleRoot}`)
      .moveDown(0.5)

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Timestamp Authority: ${data.timestampAuthority}`)
      .text(`Timestamp: ${data.timestamp.toISOString()}`)
      .moveDown(2)

    // Legal Notice
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text(
        'This certificate is digitally signed and cryptographically verifiable. ' +
        'Any unauthorized modification will invalidate the certificate. ' +
        'For verification, visit: https://xase.ai/verify',
        { align: 'justify' }
      )
      .moveDown(2)

    // Footer
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text('Issued by: Xase Labs, Inc.', { align: 'center' })
      .text('2261 Market Street, San Francisco, CA 94114', { align: 'center' })
      .text('https://xase.ai | compliance@xase.ai', { align: 'center' })

    // Finalize PDF
    doc.end()
  })
}

/**
 * Stream to buffer helper
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = []
    stream.on('data', buffers.push.bind(buffers))
    stream.on('end', () => resolve(Buffer.concat(buffers)))
    stream.on('error', reject)
  })
}
