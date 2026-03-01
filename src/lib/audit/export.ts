/**
 * Audit Trail Export
 * Export audit logs in PDF and CSV formats for regulators
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuditExportOptions {
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  actions?: string[];
  resourceTypes?: string[];
  format: 'csv' | 'pdf' | 'json';
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  tenantId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  errorMessage: string | null;
}

/**
 * Export audit trail to CSV format
 */
export async function exportAuditTrailCSV(
  options: AuditExportOptions
): Promise<string> {
  try {
    const logs = await getAuditLogs(options);

    // CSV header
    const header = [
      'Timestamp',
      'Tenant ID',
      'User ID',
      'Action',
      'Resource Type',
      'Resource ID',
      'Status',
      'IP Address',
      'User Agent',
      'Error Message',
    ].join(',');

    // CSV rows
    const rows = logs.map(log => {
      return [
        log.timestamp.toISOString(),
        log.tenantId || '',
        log.userId || '',
        log.action,
        log.resourceType,
        log.resourceId || '',
        log.status,
        log.ipAddress || '',
        escapeCSV(log.userAgent || ''),
        escapeCSV(log.errorMessage || ''),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  } catch (error) {
    console.error('Error exporting audit trail to CSV:', error);
    throw error;
  }
}

/**
 * Export audit trail to JSON format
 */
export async function exportAuditTrailJSON(
  options: AuditExportOptions
): Promise<string> {
  try {
    const logs = await getAuditLogs(options);

    const exportData = {
      exportDate: new Date().toISOString(),
      filters: {
        tenantId: options.tenantId,
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
        actions: options.actions,
        resourceTypes: options.resourceTypes,
      },
      totalRecords: logs.length,
      records: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        tenantId: log.tenantId,
        userId: log.userId,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        status: log.status,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
        errorMessage: log.errorMessage,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('Error exporting audit trail to JSON:', error);
    throw error;
  }
}

/**
 * Export audit trail to PDF format (HTML representation)
 */
export async function exportAuditTrailPDF(
  options: AuditExportOptions
): Promise<string> {
  try {
    const logs = await getAuditLogs(options);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Audit Trail Export</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      font-size: 12px;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    .metadata {
      margin: 20px 0;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 5px;
    }
    .metadata p {
      margin: 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #333;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .status-success {
      color: green;
      font-weight: bold;
    }
    .status-failed {
      color: red;
      font-weight: bold;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <h1>Audit Trail Export</h1>
  
  <div class="metadata">
    <p><strong>Export Date:</strong> ${new Date().toISOString()}</p>
    <p><strong>Period:</strong> ${options.startDate?.toISOString() || 'All'} to ${options.endDate?.toISOString() || 'All'}</p>
    ${options.tenantId ? `<p><strong>Tenant ID:</strong> ${options.tenantId}</p>` : ''}
    ${options.actions ? `<p><strong>Actions:</strong> ${options.actions.join(', ')}</p>` : ''}
    ${options.resourceTypes ? `<p><strong>Resource Types:</strong> ${options.resourceTypes.join(', ')}</p>` : ''}
    <p><strong>Total Records:</strong> ${logs.length}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Action</th>
        <th>Resource</th>
        <th>Status</th>
        <th>User ID</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${logs
        .map(
          log => `
        <tr>
          <td>${log.timestamp.toISOString()}</td>
          <td>${escapeHTML(log.action)}</td>
          <td>${escapeHTML(log.resourceType)}<br/><small>${escapeHTML(log.resourceId || '')}</small></td>
          <td class="status-${log.status.toLowerCase()}">${escapeHTML(log.status)}</td>
          <td><small>${escapeHTML(log.userId || 'N/A')}</small></td>
          <td>
            ${log.ipAddress ? `IP: ${escapeHTML(log.ipAddress)}<br/>` : ''}
            ${log.errorMessage ? `<span style="color: red;">Error: ${escapeHTML(log.errorMessage)}</span>` : ''}
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
  
  <div class="footer">
    <p>This audit trail export was generated by XASE Sheets</p>
    <p>Export ID: ${crypto.randomUUID()}</p>
    <p>Generated at: ${new Date().toISOString()}</p>
  </div>
</body>
</html>
    `;

    return html;
  } catch (error) {
    console.error('Error exporting audit trail to PDF:', error);
    throw error;
  }
}

/**
 * Get audit logs based on filters
 */
async function getAuditLogs(
  options: AuditExportOptions
): Promise<AuditLogEntry[]> {
  const where: any = {};

  if (options.tenantId) {
    where.tenantId = options.tenantId;
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
    where.action = {
      in: options.actions,
    };
  }

  if (options.resourceTypes && options.resourceTypes.length > 0) {
    where.resourceType = {
      in: options.resourceTypes,
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: {
      timestamp: 'desc',
    },
    take: 10000, // Limit to 10k records
  });

  return logs;
}

/**
 * Escape CSV special characters
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate signed export bundle with Merkle tree proof
 */
export async function generateSignedExportBundle(
  options: AuditExportOptions
): Promise<{
  data: string;
  signature: string;
  merkleRoot: string;
  timestamp: string;
}> {
  try {
    const logs = await getAuditLogs(options);

    // Generate data export
    const data = JSON.stringify({
      exportDate: new Date().toISOString(),
      filters: options,
      totalRecords: logs.length,
      records: logs,
    });

    // Calculate Merkle root (simplified - in production use proper Merkle tree)
    const crypto = require('crypto');
    const merkleRoot = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');

    // Sign the export (simplified - in production use proper signing)
    const signature = crypto
      .createHmac('sha256', process.env.AUDIT_SIGNING_KEY || 'default_key')
      .update(merkleRoot)
      .digest('hex');

    return {
      data,
      signature,
      merkleRoot,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating signed export bundle:', error);
    throw error;
  }
}

/**
 * Verify signed export bundle
 */
export function verifySignedExportBundle(
  data: string,
  signature: string,
  merkleRoot: string
): boolean {
  try {
    const crypto = require('crypto');

    // Recalculate Merkle root
    const calculatedRoot = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');

    if (calculatedRoot !== merkleRoot) {
      return false;
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.AUDIT_SIGNING_KEY || 'default_key')
      .update(merkleRoot)
      .digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying signed export bundle:', error);
    return false;
  }
}
