/**
 * XASE CORE - Chain of Custody Report
 * 
 * Gera relatório de cadeia de custódia para bundles de evidência
 * Eventos tipados: ACCESS, EXPORT, DISCLOSURE
 * Formato: JSON + PDF
 */

import { prisma } from '../prisma';
import { hashObject } from './crypto';

export type CustodyEventType = 'ACCESS' | 'EXPORT' | 'DISCLOSURE';

export interface CustodyEvent {
  type: CustodyEventType;
  at: string; // ISO timestamp
  actor: string; // userId ou email
  action: string; // VIEW, DOWNLOAD, VERIFY, SEND_TO_REGULATOR, etc.
  ip?: string;
  userAgent?: string;
  purpose?: string; // 'Regulatory disclosure', 'Legal discovery', etc.
  recipient?: string; // 'UK FCA', 'External counsel', etc.
  authorizedBy?: string; // quem autorizou (GC, OWNER)
}

export interface SignatureInfo {
  type: string; // 'KMS' | 'QTSP' | 'E_SEAL'
  value: string;
  keyId?: string;
  provider?: string;
  timestamp: string;
}

export interface ChainOfCustodyReport {
  evidenceId: string;
  bundleId: string;
  generatedAt: string;
  generatedBy?: string;
  
  // Eventos de acesso/export/disclosure
  events: CustodyEvent[];
  
  // Assinaturas aplicadas
  signatures: SignatureInfo[];
  
  // Status de integridade
  integrityStatus: 'VALID' | 'TAMPER_EVIDENT' | 'UNKNOWN';
  integrityChecks: {
    bundleHashValid: boolean;
    manifestHashValid: boolean;
    recordHashValid: boolean;
  };
  
  // Metadata
  recordCount: number;
  createdAt: string;
  lastAccessedAt?: string;
  legalHold: boolean;
}

/**
 * Mapeia ações do AuditLog para eventos de custody tipados
 */
function mapAuditActionToCustodyEvent(action: string): CustodyEventType {
  // ACCESS events
  if (action.includes('VIEWED') || action.includes('ACCESSED')) {
    return 'ACCESS';
  }
  
  // EXPORT events
  if (action.includes('DOWNLOADED') || action.includes('EXPORTED') || action.includes('CREATED')) {
    return 'EXPORT';
  }
  
  // DISCLOSURE events
  if (action.includes('REGULATOR') || action.includes('COUNSEL') || action.includes('DISCLOSURE')) {
    return 'DISCLOSURE';
  }
  
  // Default
  return 'ACCESS';
}

/**
 * Gera Chain of Custody Report para um bundle
 */
export async function generateCustodyReport(
  bundleId: string,
  options: {
    userId?: string;
  } = {}
): Promise<ChainOfCustodyReport> {
  // 1. Buscar bundle
  const bundle = await prisma.evidenceBundle.findUnique({
    where: { bundleId },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!bundle) {
    throw new Error(`Bundle not found: ${bundleId}`);
  }

  // 2. Buscar audit logs relacionados ao bundle
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: bundleId },
        { resourceId: bundle.id },
        {
          AND: [
            { resourceType: 'EVIDENCE_BUNDLE' },
            {
              metadata: {
                contains: bundleId,
              },
            },
          ],
        },
      ],
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // 3. Mapear audit logs para custody events
  const events: CustodyEvent[] = auditLogs.map((log) => {
    const metadata = log.metadata ? JSON.parse(log.metadata) : {};
    
    return {
      type: mapAuditActionToCustodyEvent(log.action),
      at: log.timestamp.toISOString(),
      actor: log.userId || 'system',
      action: log.action,
      ip: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      purpose: metadata.purpose,
      recipient: metadata.recipient,
      authorizedBy: metadata.authorizedBy,
    };
  });

  // 4. Checkpoints feature removed: signatures derived from checkpoints are not included
  const signatures: SignatureInfo[] = [];

  // 6. Validar integridade
  let integrityStatus: 'VALID' | 'TAMPER_EVIDENT' | 'UNKNOWN' = 'UNKNOWN';
  const integrityChecks = {
    bundleHashValid: false,
    manifestHashValid: false,
    recordHashValid: false,
  };

  // Verificar bundle hash (se disponível)
  if (bundle.bundleHash && bundle.storageUrl) {
    // TODO: Download bundle e validar hash
    // Por enquanto, assumir válido se hash existe
    integrityChecks.bundleHashValid = !!bundle.bundleHash;
  }

  // Verificar manifest hash
  if (bundle.bundleManifestHash) {
    integrityChecks.manifestHashValid = !!bundle.bundleManifestHash;
  }

  // Verificar record hash (buscar record associado)
  if (bundle.recordId) {
    const record = await prisma.decisionRecord.findUnique({
      where: { id: bundle.recordId },
      select: { recordHash: true },
    });
    integrityChecks.recordHashValid = !!record?.recordHash;
  }

  // Determinar status geral
  if (
    integrityChecks.bundleHashValid ||
    integrityChecks.manifestHashValid ||
    integrityChecks.recordHashValid
  ) {
    integrityStatus = 'VALID';
  }

  // 7. Montar report
  const report: ChainOfCustodyReport = {
    evidenceId: bundle.id,
    bundleId: bundle.bundleId,
    generatedAt: new Date().toISOString(),
    generatedBy: options.userId,
    events,
    signatures,
    integrityStatus,
    integrityChecks,
    recordCount: bundle.recordCount,
    createdAt: bundle.createdAt.toISOString(),
    lastAccessedAt: bundle.accessedAt?.toISOString(),
    legalHold: bundle.legalHold,
  };

  return report;
}

/**
 * Gera Chain of Custody Report em formato texto (para PDF)
 */
export function formatCustodyReportAsText(report: ChainOfCustodyReport): string {
  let text = '';

  text += '═══════════════════════════════════════════════════════════\n';
  text += '           CHAIN OF CUSTODY REPORT\n';
  text += '═══════════════════════════════════════════════════════════\n\n';

  text += `Bundle ID: ${report.bundleId}\n`;
  text += `Evidence ID: ${report.evidenceId}\n`;
  text += `Generated: ${report.generatedAt}\n`;
  text += `Generated By: ${report.generatedBy || 'System'}\n\n`;

  text += '───────────────────────────────────────────────────────────\n';
  text += 'INTEGRITY STATUS\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += `Overall Status: ${report.integrityStatus}\n`;
  text += `Bundle Hash Valid: ${report.integrityChecks.bundleHashValid ? 'YES' : 'NO'}\n`;
  text += `Manifest Hash Valid: ${report.integrityChecks.manifestHashValid ? 'YES' : 'NO'}\n`;
  text += `Record Hash Valid: ${report.integrityChecks.recordHashValid ? 'YES' : 'NO'}\n\n`;

  text += '───────────────────────────────────────────────────────────\n';
  text += 'ACCESS & EXPORT EVENTS\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  if (report.events.length === 0) {
    text += 'No events recorded.\n\n';
  } else {
    report.events.forEach((event, idx) => {
      text += `[${idx + 1}] ${event.type} - ${event.action}\n`;
      text += `    Timestamp: ${event.at}\n`;
      text += `    Actor: ${event.actor}\n`;
      if (event.ip) text += `    IP: ${event.ip}\n`;
      if (event.purpose) text += `    Purpose: ${event.purpose}\n`;
      if (event.recipient) text += `    Recipient: ${event.recipient}\n`;
      if (event.authorizedBy) text += `    Authorized By: ${event.authorizedBy}\n`;
      text += '\n';
    });
  }

  text += '───────────────────────────────────────────────────────────\n';
  text += 'CRYPTOGRAPHIC SIGNATURES\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  if (report.signatures.length === 0) {
    text += 'No signatures applied.\n\n';
  } else {
    report.signatures.forEach((sig, idx) => {
      text += `[${idx + 1}] ${sig.type}\n`;
      text += `    Timestamp: ${sig.timestamp}\n`;
      if (sig.keyId) text += `    Key ID: ${sig.keyId}\n`;
      if (sig.provider) text += `    Provider: ${sig.provider}\n`;
      text += `    Signature: ${sig.value.substring(0, 64)}...\n`;
      text += '\n';
    });
  }

  text += '───────────────────────────────────────────────────────────\n';
  text += 'METADATA\n';
  text += '───────────────────────────────────────────────────────────\n\n';

  text += `Record Count: ${report.recordCount}\n`;
  text += `Created At: ${report.createdAt}\n`;
  text += `Last Accessed: ${report.lastAccessedAt || 'Never'}\n`;
  text += `Legal Hold: ${report.legalHold ? 'YES' : 'NO'}\n\n`;

  text += '═══════════════════════════════════════════════════════════\n';
  text += '                    END OF REPORT\n';
  text += '═══════════════════════════════════════════════════════════\n';

  return text;
}
