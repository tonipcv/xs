/**
 * Billing Reports System
 * Export billing reports in multiple formats
 * F3-012: Relatório de Billing Exportável (PDF/CSV)
 */

import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify';

const prisma = new PrismaClient();

export interface BillingReportOptions {
  tenantId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  format: 'pdf' | 'csv' | 'json';
  reportType: 'usage' | 'revenue' | 'invoices' | 'summary';
}

export interface BillingReportResult {
  reportId: string;
  format: string;
  reportType: string;
  recordCount: number;
  filePath: string;
  fileSize: number;
  totalAmount: number;
  currency: string;
  generatedAt: Date;
}

export interface UsageRecord {
  date: Date;
  datasetId: string;
  datasetName: string;
  leaseId: string;
  durationHours: number;
  bytesProcessed: number;
  cost: number;
}

export interface RevenueRecord {
  date: Date;
  datasetId: string;
  datasetName: string;
  totalLeases: number;
  totalRevenue: number;
  platformFee: number;
  netRevenue: number;
}

/**
 * Generate billing report
 */
export async function generateBillingReport(
  options: BillingReportOptions
): Promise<BillingReportResult> {
  const reportId = `billing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`Generating billing report: ${reportId}`);

  // Fetch billing data based on report type
  const data = await fetchBillingData(options);

  console.log(`Found ${data.records.length} billing records`);

  // Generate report based on format
  let filePath: string;
  let fileSize: number;

  switch (options.format) {
    case 'pdf':
      ({ filePath, fileSize } = await generatePDFReport(reportId, data, options));
      break;
    case 'csv':
      ({ filePath, fileSize } = await generateCSVReport(reportId, data, options));
      break;
    case 'json':
      ({ filePath, fileSize } = await generateJSONReport(reportId, data, options));
      break;
    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }

  const result: BillingReportResult = {
    reportId,
    format: options.format,
    reportType: options.reportType,
    recordCount: data.records.length,
    filePath,
    fileSize,
    totalAmount: data.totalAmount,
    currency: 'USD',
    generatedAt: new Date(),
  };

  // Log report generation
  await prisma.auditLog.create({
    data: {
      action: 'BILLING_REPORT_GENERATED',
      resourceType: 'billing_report',
      resourceId: reportId,
      tenantId: options.tenantId,
      userId: options.userId,
      metadata: JSON.stringify({
        format: options.format,
        reportType: options.reportType,
        recordCount: data.records.length,
        totalAmount: data.totalAmount,
      }),
      status: 'SUCCESS',
      timestamp: new Date(),
    },
  });

  return result;
}

/**
 * Fetch billing data
 */
async function fetchBillingData(options: BillingReportOptions): Promise<any> {
  const where: any = {};

  if (options.tenantId) {
    where.tenantId = options.tenantId;
  }

  if (options.userId) {
    where.userId = options.userId;
  }

  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate;
    }
  }

  let records: any[] = [];
  let totalAmount = 0;

  switch (options.reportType) {
    case 'usage':
      records = await fetchUsageRecords(where);
      totalAmount = records.reduce((sum, r) => sum + (r.cost || 0), 0);
      break;

    case 'revenue':
      records = await fetchRevenueRecords(where);
      totalAmount = records.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
      break;

    case 'invoices':
      records = await fetchInvoiceRecords(where);
      totalAmount = records.reduce((sum, r) => sum + (r.amount || 0), 0);
      break;

    case 'summary':
      records = await fetchSummaryRecords(where);
      totalAmount = records.reduce((sum, r) => sum + (r.total || 0), 0);
      break;
  }

  return { records, totalAmount };
}

/**
 * Fetch usage records
 */
async function fetchUsageRecords(where: any): Promise<UsageRecord[]> {
  const leases = await prisma.accessLease.findMany({
    where,
    include: {
      dataset: {
        select: {
          datasetId: true,
          name: true,
        },
      },
    },
    orderBy: {
      issuedAt: 'desc',
    },
  });

  return leases.map((lease) => ({
    date: lease.issuedAt,
    datasetId: lease.dataset?.datasetId || '',
    datasetName: lease.dataset?.name || 'Unknown',
    leaseId: (lease as any).leaseId || lease.id,
    durationHours: Math.round(
      (lease.expiresAt.getTime() - lease.issuedAt.getTime()) / (1000 * 60 * 60)
    ),
    bytesProcessed: 0, // TODO: Get from usage metrics
    cost: 0, // TODO: Calculate from pricing
  }));
}

/**
 * Fetch revenue records
 */
async function fetchRevenueRecords(where: any): Promise<RevenueRecord[]> {
  // Group leases by dataset and date
  const leases = await prisma.accessLease.findMany({
    where,
    include: {
      dataset: {
        select: {
          datasetId: true,
          name: true,
        },
      },
    },
  });

  const revenueByDataset = new Map<string, RevenueRecord>();

  for (const lease of leases) {
    const key = `${lease.dataset?.datasetId || ''}_${lease.issuedAt.toISOString().split('T')[0]}`;
    
    if (!revenueByDataset.has(key)) {
      revenueByDataset.set(key, {
        date: lease.issuedAt,
        datasetId: lease.dataset?.datasetId || '',
        datasetName: lease.dataset?.name || 'Unknown',
        totalLeases: 0,
        totalRevenue: 0,
        platformFee: 0,
        netRevenue: 0,
      });
    }

    const record = revenueByDataset.get(key)!;
    record.totalLeases++;
    // TODO: Calculate actual revenue from pricing
    const revenue = 10; // Placeholder
    record.totalRevenue += revenue;
    record.platformFee += revenue * 0.1; // 10% platform fee
    record.netRevenue += revenue * 0.9;
  }

  return Array.from(revenueByDataset.values());
}

/**
 * Fetch invoice records
 */
async function fetchInvoiceRecords(where: any): Promise<any[]> {
  // TODO: Fetch from Stripe invoices or internal invoices table
  return [];
}

/**
 * Fetch summary records
 */
async function fetchSummaryRecords(where: any): Promise<any[]> {
  const usage = await fetchUsageRecords(where);
  const revenue = await fetchRevenueRecords(where);

  return [
    {
      metric: 'Total Leases',
      value: usage.length,
      total: 0,
    },
    {
      metric: 'Total Revenue',
      value: revenue.reduce((sum, r) => sum + r.totalRevenue, 0),
      total: revenue.reduce((sum, r) => sum + r.totalRevenue, 0),
    },
    {
      metric: 'Platform Fees',
      value: revenue.reduce((sum, r) => sum + r.platformFee, 0),
      total: revenue.reduce((sum, r) => sum + r.platformFee, 0),
    },
    {
      metric: 'Net Revenue',
      value: revenue.reduce((sum, r) => sum + r.netRevenue, 0),
      total: revenue.reduce((sum, r) => sum + r.netRevenue, 0),
    },
  ];
}

/**
 * Generate PDF report
 */
async function generatePDFReport(
  reportId: string,
  data: any,
  options: BillingReportOptions
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${reportId}.pdf`;
  const doc = new PDFDocument({ margin: 50 });
  const stream = createWriteStream(filePath);

  doc.pipe(stream);

  // Header
  doc
    .fontSize(20)
    .text('XASE Sheets - Billing Report', { align: 'center' })
    .moveDown();

  doc
    .fontSize(12)
    .text(`Report ID: ${reportId}`)
    .text(`Report Type: ${options.reportType.toUpperCase()}`)
    .text(`Generated: ${new Date().toISOString()}`)
    .text(`Total Records: ${data.records.length}`)
    .text(`Total Amount: $${data.totalAmount.toFixed(2)} USD`)
    .moveDown();

  // Period
  if (options.startDate || options.endDate) {
    doc.fontSize(14).text('Period:', { underline: true }).moveDown(0.5);
    
    if (options.startDate) {
      doc.fontSize(10).text(`From: ${options.startDate.toLocaleDateString()}`);
    }
    if (options.endDate) {
      doc.fontSize(10).text(`To: ${options.endDate.toLocaleDateString()}`);
    }
    
    doc.moveDown();
  }

  // Table header
  doc
    .fontSize(10)
    .text('─'.repeat(100))
    .moveDown(0.5);

  // Records
  for (const record of data.records) {
    if (doc.y > 700) {
      doc.addPage();
    }

    doc.fontSize(9);

    switch (options.reportType) {
      case 'usage':
        doc
          .text(`Date: ${record.date.toLocaleDateString()}`)
          .text(`Dataset: ${record.datasetName} (${record.datasetId})`)
          .text(`Lease: ${record.leaseId}`)
          .text(`Duration: ${record.durationHours}h`)
          .text(`Cost: $${record.cost.toFixed(2)}`);
        break;

      case 'revenue':
        doc
          .text(`Date: ${record.date.toLocaleDateString()}`)
          .text(`Dataset: ${record.datasetName}`)
          .text(`Leases: ${record.totalLeases}`)
          .text(`Revenue: $${record.totalRevenue.toFixed(2)}`)
          .text(`Platform Fee: $${record.platformFee.toFixed(2)}`)
          .text(`Net Revenue: $${record.netRevenue.toFixed(2)}`);
        break;

      case 'summary':
        doc
          .text(`${record.metric}: ${record.value}`)
          .text(`Amount: $${record.total.toFixed(2)}`);
        break;
    }

    doc
      .text('─'.repeat(100))
      .moveDown(0.5);
  }

  // Footer
  doc
    .fontSize(8)
    .text(
      'This report is confidential and intended for authorized recipients only.',
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
 * Generate CSV report
 */
async function generateCSVReport(
  reportId: string,
  data: any,
  options: BillingReportOptions
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${reportId}.csv`;
  const stream = createWriteStream(filePath);

  let columns: string[] = [];

  switch (options.reportType) {
    case 'usage':
      columns = ['date', 'datasetId', 'datasetName', 'leaseId', 'durationHours', 'bytesProcessed', 'cost'];
      break;
    case 'revenue':
      columns = ['date', 'datasetId', 'datasetName', 'totalLeases', 'totalRevenue', 'platformFee', 'netRevenue'];
      break;
    case 'summary':
      columns = ['metric', 'value', 'total'];
      break;
  }

  const stringifier = stringify({
    header: true,
    columns,
  });

  const records = data.records.map((record: any) => {
    const formatted: any = {};
    for (const col of columns) {
      if (record[col] instanceof Date) {
        formatted[col] = record[col].toISOString();
      } else {
        formatted[col] = record[col] || '';
      }
    }
    return formatted;
  });

  const readable = Readable.from(records);
  await pipeline(readable, stringifier, stream);

  const stats = require('fs').statSync(filePath);
  return { filePath, fileSize: stats.size };
}

/**
 * Generate JSON report
 */
async function generateJSONReport(
  reportId: string,
  data: any,
  options: BillingReportOptions
): Promise<{ filePath: string; fileSize: number }> {
  const filePath = `/tmp/${reportId}.json`;

  const reportData = {
    reportId,
    reportType: options.reportType,
    generatedAt: new Date().toISOString(),
    period: {
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
    },
    summary: {
      recordCount: data.records.length,
      totalAmount: data.totalAmount,
      currency: 'USD',
    },
    records: data.records,
  };

  require('fs').writeFileSync(filePath, JSON.stringify(reportData, null, 2));

  const stats = require('fs').statSync(filePath);
  return { filePath, fileSize: stats.size };
}

/**
 * Get billing statistics
 */
export async function getBillingStatistics(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<any> {
  const where: any = { tenantId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  const leases = await prisma.accessLease.findMany({ where });

  const stats = {
    totalLeases: leases.length,
    activeLeases: leases.filter(l => l.expiresAt > new Date()).length,
    expiredLeases: leases.filter(l => l.expiresAt <= new Date()).length,
    totalRevenue: 0, // TODO: Calculate from pricing
    averageLeaseValue: 0,
    topDatasets: [] as any[],
  };

  return stats;
}
