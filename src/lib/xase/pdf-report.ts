// @ts-nocheck
/**
 * XASE CORE - PDF Legal Report Generator
 * 
 * Gera relatório PDF court-ready para bundles de evidência
 * Hash lógico (conteúdo estruturado) + hash binário (PDF final)
 */

import { prisma } from '../prisma';
import { hashObject, hashString } from './crypto';
import { uploadBuffer } from './storage';
import { logAudit } from './audit';
import { generateCustodyReport, formatCustodyReportAsText } from './custody';

export interface PDFReportData {
  bundleId: string;
  tenantName: string;
  generatedAt: string;
  
  // Identification
  claimNumber?: string;
  policyNumber?: string;
  caseId?: string;
  
  // Timeline
  decisionTimestamp: string;
  checkpointTimestamp?: string;
  
  // Hashes principais
  recordHash: string;
  inputHash: string;
  outputHash: string;
  checkpointHash?: string;
  
  // Signatures
  kmsSignature?: string;
  qtspTimestamp?: string;
  qtspProvider?: string;
  
  // Chain of custody summary
  accessEventCount: number;
  exportEventCount: number;
  disclosureEventCount: number;
  
  // Verification instructions
  verificationInstructions: string;
}

/**
 * Gera dados estruturados para o PDF (hash lógico)
 */
export async function generatePDFReportData(bundleId: string): Promise<PDFReportData> {
  // 1. Buscar bundle
  const bundle = await prisma.evidenceBundle.findUnique({
    where: { bundleId },
    include: {
      tenant: {
        select: {
          name: true,
          companyName: true,
        },
      },
      record: {
        include: {
          insuranceDecision: true,
        },
      },
    },
  });

  if (!bundle) {
    throw new Error(`Bundle not found: ${bundleId}`);
  }

  // 2. Se bundle não tem record vinculado, buscar records do período
  let recordData = bundle.record;
  if (!recordData && bundle.dateFrom && bundle.dateTo) {
    const records = await prisma.decisionRecord.findMany({
      where: {
        tenantId: bundle.tenantId,
        timestamp: {
          gte: bundle.dateFrom,
          lte: bundle.dateTo,
        },
      },
      include: {
        insuranceDecision: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    recordData = records[0] || null;
  }

  // 3. Se ainda não tem record, buscar o mais recente do tenant
  if (!recordData) {
    const records = await prisma.decisionRecord.findMany({
      where: { tenantId: bundle.tenantId },
      include: { insuranceDecision: true },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    recordData = records[0] || null;
  }

  // 4. Gerar custody report para contagem de eventos
  const custodyReport = await generateCustodyReport(bundleId);
  
  const accessEventCount = custodyReport.events.filter(e => e.type === 'ACCESS').length;
  const exportEventCount = custodyReport.events.filter(e => e.type === 'EXPORT').length;
  const disclosureEventCount = custodyReport.events.filter(e => e.type === 'DISCLOSURE').length;

  // 5. Montar dados estruturados
  const data: PDFReportData = {
    bundleId: bundle.bundleId,
    tenantName: bundle.tenant.companyName || bundle.tenant.name,
    generatedAt: new Date().toISOString(),
    
    // Identification
    claimNumber: recordData?.insuranceDecision?.claimNumber || undefined,
    policyNumber: recordData?.insuranceDecision?.policyNumber || undefined,
    caseId: recordData?.insuranceDecision?.regulatoryCaseId || undefined,
    
    // Timeline
    decisionTimestamp: recordData?.timestamp.toISOString() || bundle.createdAt.toISOString(),
    checkpointTimestamp: undefined,
    
    // Hashes
    recordHash: recordData?.recordHash || 'N/A',
    inputHash: recordData?.inputHash || 'N/A',
    outputHash: recordData?.outputHash || 'N/A',
    checkpointHash: undefined,
    
    // Signatures
    kmsSignature: undefined,
    qtspTimestamp: undefined,
    qtspProvider: undefined,
    
    // Chain of custody
    accessEventCount,
    exportEventCount,
    disclosureEventCount,
    
    // Verification
    verificationInstructions: `To verify this evidence bundle:
1. Download the bundle ZIP file
2. Extract all files
3. Run: node verify.js
4. The script will validate:
   - Manifest hash
   - All file hashes
   - Chain integrity
   - Cryptographic signatures
   - QTSP timestamps (if present)`,
  };

  return data;
}

/**
 * Gera PDF report em formato texto (MVP - substituir por PDF real depois)
 */
export function generatePDFReportText(data: PDFReportData): string {
  let text = '';

  text += '═══════════════════════════════════════════════════════════\n';
  text += '                  EVIDENCE REPORT\n';
  text += '           Court-Ready Legal Documentation\n';
  text += '═══════════════════════════════════════════════════════════\n\n';

  text += `Bundle ID: ${data.bundleId}\n`;
  text += `Tenant: ${data.tenantName}\n`;
  text += `Generated: ${data.generatedAt}\n\n`;

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 1: IDENTIFICATION\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  if (data.claimNumber) text += `Claim Number: ${data.claimNumber}\n`;
  if (data.policyNumber) text += `Policy Number: ${data.policyNumber}\n`;
  if (data.caseId) text += `Regulatory Case ID: ${data.caseId}\n`;
  text += '\n';

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 2: TIMELINE\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += `Decision Timestamp: ${data.decisionTimestamp}\n`;
  if (data.checkpointTimestamp) {
    text += `Checkpoint Timestamp: ${data.checkpointTimestamp}\n`;
  }
  text += '\n';

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 3: CRYPTOGRAPHIC HASHES\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += `Record Hash: ${data.recordHash}\n`;
  text += `Input Hash: ${data.inputHash}\n`;
  text += `Output Hash: ${data.outputHash}\n`;
  if (data.checkpointHash) {
    text += `Checkpoint Hash: ${data.checkpointHash}\n`;
  }
  text += '\n';

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 4: CRYPTOGRAPHIC SIGNATURES\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  if (data.kmsSignature) {
    text += `KMS Signature: ${data.kmsSignature.substring(0, 64)}...\n`;
  }
  if (data.qtspTimestamp && data.qtspProvider) {
    text += `QTSP Provider: ${data.qtspProvider}\n`;
    text += `QTSP Timestamp: ${data.qtspTimestamp.substring(0, 64)}...\n`;
  }
  if (!data.kmsSignature && !data.qtspTimestamp) {
    text += 'No signatures applied yet.\n';
  }
  text += '\n';

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 5: CHAIN OF CUSTODY SUMMARY\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += `Access Events: ${data.accessEventCount}\n`;
  text += `Export Events: ${data.exportEventCount}\n`;
  text += `Disclosure Events: ${data.disclosureEventCount}\n\n`;

  text += '───────────────────────────────────────────────────────────\n';
  text += 'SECTION 6: VERIFICATION INSTRUCTIONS\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += data.verificationInstructions + '\n\n';

  text += '═══════════════════════════════════════════════════════════\n';
  text += '                    END OF REPORT\n';
  text += '           Generated by Xase Evidence Platform\n';
  text += '═══════════════════════════════════════════════════════════\n';

  return text;
}

/**
 * Gera e armazena PDF report para um bundle
 */
export async function generateAndStorePDFReport(
  bundleId: string,
  tenantId: string
): Promise<{
  pdfReportUrl: string;
  pdfReportHash: string;
  pdfReportLogicalHash: string;
}> {
  // 1. Gerar dados estruturados
  const data = await generatePDFReportData(bundleId);

  // 2. Calcular hash lógico (dos dados estruturados)
  const logicalHash = hashObject(data);

  // 3. Gerar PDF (por enquanto texto, depois substituir por PDF real)
  const pdfText = generatePDFReportText(data);
  const pdfBuffer = Buffer.from(pdfText, 'utf-8');

  // 4. Calcular hash binário (do PDF final)
  const binaryHash = `sha256:${hashString(pdfText)}`;

  // 5. Upload para S3
  const storageKey = `pdf/${tenantId}/${bundleId}/report.pdf`;
  
  const uploadResult = await uploadBuffer(
    storageKey,
    pdfBuffer,
    'application/pdf'
  );

  // 6. Atualizar bundle com URLs e hashes
  await prisma.evidenceBundle.update({
    where: { bundleId },
    data: {
      pdfReportUrl: uploadResult.url,
      pdfReportHash: binaryHash,
      pdfReportLogicalHash: logicalHash,
      includesPdf: true,
    },
  });

  // 7. Log audit
  await logAudit({
    tenantId,
    action: 'PDF_REPORT_GENERATED',
    resourceType: 'EVIDENCE_BUNDLE',
    resourceId: bundleId,
    metadata: JSON.stringify({
      logicalHash,
      binaryHash,
      size: pdfBuffer.length,
    }),
    status: 'SUCCESS',
  });

  return {
    pdfReportUrl: uploadResult.url,
    pdfReportHash: binaryHash,
    pdfReportLogicalHash: logicalHash,
  };
}
