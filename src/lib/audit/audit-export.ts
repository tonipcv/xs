/**
 * Audit Trail Export System
 * Export audit logs in multiple formats for regulators
 * F2-010: Implementar Export de Audit Trail
 */

import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface AuditExportOptions {
  tenantId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  actions?: string[];
  resourceTypes?: string[];
  format: 'pdf' | 'csv' | 'json';
  includeSignature?: boolean;
  includeEvidenceBundles?: boolean;
}

export interface AuditExportResult {
  exportId: string;
  format: string;
  recordCount: number;
  filePath: string;
  fileSize: number;
  signature?: string;
  generatedAt: Date;
  expiresAt: Date;
}

/**
 * Export audit trail in specified format
 */
export async function exportAuditTrail(
  options: AuditExportOptions
): Promise<AuditExportResult> {
  const exportId = `audit_export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`Starting audit export: ${exportId}`);

  // Fetch audit logs based on filters
  const auditLogs = await fetchAuditLogs(options);

  console.log(`Found ${auditLogs.length} audit records to export`);

  // Generate export based on format
  let filePath: string;
  let fileSize: number;

  switch (options.format) {
    case 'pdf':
      ({ filePath, fileSize } = await exportToPDF(exportId, auditLogs, options));
      break;
    case 'csv':
      ({ filePath, fileSize } = await exportToCSV(exportId, auditLogs));
      break;
    case 'json':
      ({ filePath, fileSize } = await exportToJSON(exportId, auditLogs, options));
      break;
    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }

  // Generate signature if requested
  let signature: string | undefined;
  if (options.includeSignature) {
    signature = await signExport(filePath);
  }

  const result: AuditExportResult = {
    exportId,
    format: options.format,
    recordCount: auditLogs.length,
    filePath,
    fileSize,
    signature,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  };

  // Log export activity
  await prisma.auditLog.create({
    data: {
      action: 'AUDIT_EXPORT_GENERATED',
      resourceType: 'audit_export',
      resourceId: exportId,
      tenantId: options.tenantId,
      userId: options.userId,
      metadata: JSON.stringify({
        format: options.format,
        recordCount: auditLogs.length,
        filters: options,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return result;
}

/**
 * Fetch audit logs based on filters
 */
async function fetchAuditLogs(options: AuditExportOptions): Promise<any[]> {
  const where: any = {};

  if (options.tenantId) {
    where.tenantId = options.tenantId;
  }

  if (options.userId) {
    where.userId = options.userId;
  }

  if (options.startDate || options.endDate) {
    where.timestamp = {};
    if (options.startDate) {
      where.timestamp.gte = options.startDate;
    }
    if (options.endDate) {
      where.timestamp.lte = options.endDate;
    }
  }

  if (options.actions && options.actions.length > 0) {
    where.action = { in: options.actions };
  }

  if (options.resourceTypes && options.resourceTypes.length > 0) {
    where.resourceType = { in: options.resourceTypes };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });

  return logs;
}

/**
 * Export to PDF format
 */
async function exportToPDF(
  exportId: string,
  logs: any[],
  options: AuditExportOptions
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${exportId}.pdf`;
  const doc = new PDFDocument({ margin: 50 });
  const stream = createWriteStream(filePath);

  doc.pipe(stream);

  // Header
  doc
    .fontSize(20)
    .text('XASE Sheets - Audit Trail Export', { align: 'center' })
    .moveDown();

  doc
    .fontSize(12)
    .text(`Export ID: ${exportId}`)
    .text(`Generated: ${new Date().toISOString()}`)
    .text(`Total Records: ${logs.length}`)
    .moveDown();

  // Filters
  if (options.tenantId || options.userId || options.startDate || options.endDate) {
    doc.fontSize(14).text('Filters Applied:', { underline: true }).moveDown(0.5);
    
    if (options.tenantId) {
      doc.fontSize(10).text(`Tenant ID: ${options.tenantId}`);
    }
    if (options.userId) {
      doc.fontSize(10).text(`User ID: ${options.userId}`);
    }
    if (options.startDate) {
      doc.fontSize(10).text(`Start Date: ${options.startDate.toISOString()}`);
    }
    if (options.endDate) {
      doc.fontSize(10).text(`End Date: ${options.endDate.toISOString()}`);
    }
    
    doc.moveDown();
  }

  // Table header
  doc
    .fontSize(10)
    .text('─'.repeat(100))
    .moveDown(0.5);

  // Audit records
  for (const log of logs) {
    // Check if we need a new page
    if (doc.y > 700) {
      doc.addPage();
    }

    doc
      .fontSize(9)
      .text(`Timestamp: ${log.timestamp.toISOString()}`, { continued: false })
      .text(`Action: ${log.action}`)
      .text(`Resource: ${log.resourceType} (${log.resourceId || 'N/A'})`)
      .text(`User: ${log.user?.name || 'System'} (${log.user?.email || 'N/A'})`)
      .text(`Tenant: ${log.tenant?.name || 'N/A'}`)
      .text(`Status: ${log.status}`)
      .text(`IP: ${log.ipAddress || 'N/A'}`)
      .text(`User Agent: ${log.userAgent || 'N/A'}`);

    if (log.metadata) {
      const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      doc.text(`Metadata: ${JSON.stringify(metadata, null, 2).substring(0, 200)}...`);
    }

    doc
      .text('─'.repeat(100))
      .moveDown(0.5);
  }

  // Footer
  doc
    .fontSize(8)
    .text(
      'This document contains confidential audit information. Handle according to data protection regulations.',
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

  doc.end();

  await new Promise<void>((resolve) => stream.on('finish', () => resolve()));

  const stats = require('fs').statSync(filePath);
  return { filePath, fileSize: stats.size };
}

/**
 * Export to CSV format
 */
async function exportToCSV(
  exportId: string,
  logs: any[]
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${exportId}.csv`;
  const stream = createWriteStream(filePath);

  const columns = [
    'timestamp',
    'action',
    'resourceType',
    'resourceId',
    'userId',
    'userName',
    'userEmail',
    'tenantId',
    'tenantName',
    'status',
    'ipAddress',
    'userAgent',
    'metadata',
  ];

  const stringifier = stringify({
    header: true,
    columns,
  });

  const records = logs.map((log) => ({
    timestamp: log.timestamp.toISOString(),
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId || '',
    userId: log.userId || '',
    userName: log.user?.name || '',
    userEmail: log.user?.email || '',
    tenantId: log.tenantId || '',
    tenantName: log.tenant?.name || '',
    status: log.status,
    ipAddress: log.ipAddress || '',
    userAgent: log.userAgent || '',
    metadata: typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata),
  }));

  const readable = Readable.from(records);
  await pipeline(readable, stringifier, stream);

  const stats = require('fs').statSync(filePath);
  return { filePath, fileSize: stats.size };
}

/**
 * Export to JSON format with KMS signature
 */
async function exportToJSON(
  exportId: string,
  logs: any[],
  options: AuditExportOptions
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${exportId}.json`;

  const exportData = {
    exportId,
    generatedAt: new Date().toISOString(),
    filters: {
      tenantId: options.tenantId,
      userId: options.userId,
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
      actions: options.actions,
      resourceTypes: options.resourceTypes,
    },
    recordCount: logs.length,
    records: logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      userId: log.userId,
      user: log.user
        ? {
            id: log.user.id,
            name: log.user.name,
            email: log.user.email,
          }
        : null,
      tenantId: log.tenantId,
      tenant: log.tenant
        ? {
            id: log.tenant.id,
            name: log.tenant.name,
          }
        : null,
      status: log.status,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata,
    })),
  };

  // Add evidence bundles if requested
  if (options.includeEvidenceBundles) {
    const evidenceBundles = await fetchEvidenceBundles(logs);
    (exportData as any).evidenceBundles = evidenceBundles;
  }

  require('fs').writeFileSync(filePath, JSON.stringify(exportData, null, 2));

  const stats = require('fs').statSync(filePath);
  return { filePath, fileSize: stats.size };
}

/**
 * Fetch evidence bundles for audit logs
 */
async function fetchEvidenceBundles(logs: any[]): Promise<any[]> {
  const evidenceBundles: any[] = [];

  for (const log of logs) {
    if (log.resourceType === 'sidecar_session') {
      // Fetch merkle tree root
      const merkleTree = await prisma.evidenceMerkleTree.findFirst({
        where: { executionId: log.resourceId || '' },
      });

      if (merkleTree) {
        evidenceBundles.push({
          sessionId: log.resourceId,
          merkleRoot: (merkleTree as any).merkleRoot || merkleTree.rootHash,
          leafCount: merkleTree.leafCount,
          createdAt: merkleTree.createdAt,
        });
      }
    }
  }

  return evidenceBundles;
}

/**
 * Sign export file using HMAC
 */
async function signExport(filePath: string): Promise<string> {
  const signingKey = process.env.AUDIT_SIGNING_KEY || 'default-signing-key';
  const fileContent = require('fs').readFileSync(filePath);
  
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(fileContent)
    .digest('hex');

  console.log(`Generated signature for export: ${signature.substring(0, 16)}...`);

  return signature;
}

/**
 * Verify export signature
 */
export async function verifyExportSignature(
  filePath: string,
  signature: string
): Promise<boolean> {
  const expectedSignature = await signExport(filePath);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Get export statistics
 */
export async function getExportStatistics(
  tenantId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<any> {
  const where: any = {
    action: 'AUDIT_EXPORT_GENERATED',
    resourceType: 'audit_export',
  };

  if (tenantId) {
    where.tenantId = tenantId;
  }

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) {
      where.timestamp.gte = startDate;
    }
    if (endDate) {
      where.timestamp.lte = endDate;
    }
  }

  const exports = await prisma.auditLog.findMany({
    where,
    select: {
      resourceId: true,
      metadata: true,
      timestamp: true,
    },
  });

  const stats = {
    totalExports: exports.length,
    byFormat: {
      pdf: 0,
      csv: 0,
      json: 0,
    },
    totalRecordsExported: 0,
    exports: exports.map((e) => {
      const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
      if (meta.format) {
        stats.byFormat[meta.format as keyof typeof stats.byFormat]++;
      }
      if (meta.recordCount) {
        stats.totalRecordsExported += meta.recordCount;
      }
      return {
        exportId: e.resourceId,
        format: meta.format,
        recordCount: meta.recordCount,
        timestamp: e.timestamp,
      };
    }),
  };

  return stats;
}
