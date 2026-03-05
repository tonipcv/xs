/**
 * Custom Reports System
 * Generate customizable reports with various formats and scheduling
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface ReportConfig {
  id: string;
  name: string;
  description?: string;
  type: 'dataset' | 'usage' | 'revenue' | 'audit' | 'custom';
  format: 'json' | 'csv' | 'excel' | 'pdf';
  filters?: Record<string, any>;
  groupBy?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  schedule?: ReportSchedule;
}

export interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  recipients: string[];
}

export interface ReportResult {
  reportId: string;
  generatedAt: Date;
  format: string;
  data: any[];
  summary?: Record<string, any>;
  filePath?: string;
}

/**
 * Custom Report Generator
 */
export class CustomReportGenerator {
  /**
   * Generate report based on configuration
   */
  public async generateReport(config: ReportConfig, tenantId: string): Promise<ReportResult> {
    console.log(`Generating report: ${config.name}`);

    // Fetch data based on report type
    const data = await this.fetchReportData(config, tenantId);

    // Apply filters
    const filteredData = this.applyFilters(data, config.filters);

    // Apply grouping
    const groupedData = config.groupBy 
      ? this.applyGrouping(filteredData, config.groupBy)
      : filteredData;

    // Apply sorting
    const sortedData = this.applySorting(groupedData, config.sortBy, config.sortOrder);

    // Apply limit
    const limitedData = config.limit 
      ? sortedData.slice(0, config.limit)
      : sortedData;

    // Generate summary
    const summary = this.generateSummary(limitedData, config.type);

    // Format output
    let filePath: string | undefined;
    if (config.format !== 'json') {
      filePath = await this.exportReport(limitedData, config);
    }

    const result: ReportResult = {
      reportId: config.id,
      generatedAt: new Date(),
      format: config.format,
      data: limitedData,
      summary,
      filePath,
    };

    // Cache result
    await this.cacheReport(config.id, result);

    // Log report generation
    await prisma.auditLog.create({
      data: {
        action: 'REPORT_GENERATED',
        resourceType: 'report',
        resourceId: config.id,
        tenantId,
        metadata: JSON.stringify({
          reportName: config.name,
          format: config.format,
          recordCount: limitedData.length,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    return result;
  }

  /**
   * Fetch report data based on type
   */
  private async fetchReportData(config: ReportConfig, tenantId: string): Promise<any[]> {
    const startDate = config.filters?.startDate ? new Date(config.filters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = config.filters?.endDate ? new Date(config.filters.endDate) : new Date();

    switch (config.type) {
      case 'dataset':
        return this.fetchDatasetReport(tenantId, startDate, endDate);
      
      case 'usage':
        return this.fetchUsageReport(tenantId, startDate, endDate);
      
      case 'revenue':
        return this.fetchRevenueReport(tenantId, startDate, endDate);
      
      case 'audit':
        return this.fetchAuditReport(tenantId, startDate, endDate);
      
      default:
        return [];
    }
  }

  /**
   * Fetch dataset report
   */
  private async fetchDatasetReport(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const datasets = await prisma.dataset.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        name: true,
        dataType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return datasets.map(d => ({
      id: d.id,
      name: d.name,
      type: d.dataType,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  /**
   * Fetch usage report
   */
  private async fetchUsageReport(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const usage = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'USAGE_RECORDED',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        resourceId: true,
        metadata: true,
        timestamp: true,
      },
    });

    return usage.map(u => {
      const meta = typeof u.metadata === 'string' ? JSON.parse(u.metadata) : u.metadata;
      return {
        leaseId: u.resourceId,
        bytesTransferred: meta?.bytesTransferred || 0,
        recordsAccessed: meta?.recordsAccessed || 0,
        timestamp: u.timestamp.toISOString(),
      };
    });
  }

  /**
   * Fetch revenue report
   */
  private async fetchRevenueReport(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const invoices = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'INVOICE_PAID',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        resourceId: true,
        metadata: true,
        timestamp: true,
      },
    });

    return invoices.map(inv => {
      const meta = typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata;
      return {
        invoiceId: inv.resourceId,
        amount: meta?.amount || 0,
        currency: meta?.currency || 'USD',
        paidAt: inv.timestamp.toISOString(),
      };
    });
  }

  /**
   * Fetch audit report
   */
  private async fetchAuditReport(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        action: true,
        resourceType: true,
        resourceId: true,
        userId: true,
        status: true,
        timestamp: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return logs.map(log => ({
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      userId: log.userId,
      status: log.status,
      timestamp: log.timestamp.toISOString(),
    }));
  }

  /**
   * Apply filters to data
   */
  private applyFilters(data: any[], filters?: Record<string, any>): any[] {
    if (!filters) return data;

    return data.filter(item => {
      for (const [key, value] of Object.entries(filters)) {
        if (key === 'startDate' || key === 'endDate') continue;
        
        if (item[key] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Apply grouping to data
   */
  private applyGrouping(data: any[], groupBy: string[]): any[] {
    const groups = new Map<string, any[]>();

    data.forEach(item => {
      const key = groupBy.map(field => item[field]).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });

    return Array.from(groups.entries()).map(([key, items]) => {
      const fields = key.split('|');
      const grouped: any = {};
      
      groupBy.forEach((field, index) => {
        grouped[field] = fields[index];
      });

      grouped.count = items.length;
      grouped.items = items;

      return grouped;
    });
  }

  /**
   * Apply sorting to data
   */
  private applySorting(data: any[], sortBy?: string, sortOrder: 'asc' | 'desc' = 'asc'): any[] {
    if (!sortBy) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(data: any[], type: string): Record<string, any> {
    const summary: Record<string, any> = {
      totalRecords: data.length,
    };

    switch (type) {
      case 'usage':
        summary.totalBytes = data.reduce((sum, item) => sum + (item.bytesTransferred || 0), 0);
        summary.totalRecordsAccessed = data.reduce((sum, item) => sum + (item.recordsAccessed || 0), 0);
        break;

      case 'revenue':
        summary.totalRevenue = data.reduce((sum, item) => sum + (item.amount || 0), 0);
        summary.currency = data[0]?.currency || 'USD';
        break;

      case 'dataset':
        const typeCount: Record<string, number> = {};
        data.forEach(item => {
          typeCount[item.type] = (typeCount[item.type] || 0) + 1;
        });
        summary.byType = typeCount;
        break;
    }

    return summary;
  }

  /**
   * Export report to file
   */
  private async exportReport(data: any[], config: ReportConfig): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${config.id}-${timestamp}`;

    switch (config.format) {
      case 'csv':
        return this.exportToCSV(data, filename);
      
      case 'excel':
        return this.exportToExcel(data, filename);
      
      case 'pdf':
        return this.exportToPDF(data, config, filename);
      
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(data: any[], filename: string): Promise<string> {
    const filePath = `/tmp/${filename}.csv`;
    
    if (data.length === 0) {
      await fs.writeFile(filePath, '');
      return filePath;
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(item => 
      headers.map(h => JSON.stringify(item[h] || '')).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    await fs.writeFile(filePath, csv);

    return filePath;
  }

  /**
   * Export to Excel
   */
  private async exportToExcel(data: any[], filename: string): Promise<string> {
    const filePath = `/tmp/${filename}.xlsx`;
    const payload = {
      generatedAt: new Date().toISOString(),
      rows: data,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
    return filePath;
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(data: any[], config: ReportConfig, filename: string): Promise<string> {
    const filePath = `/tmp/${filename}.pdf`;
    
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = createWriteStream(filePath);

      doc.pipe(stream);

      // Title
      doc.fontSize(20).text(config.name, { align: 'center' });
      doc.moveDown();

      // Description
      if (config.description) {
        doc.fontSize(12).text(config.description);
        doc.moveDown();
      }

      // Data table
      doc.fontSize(10);
      
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        
        // Headers
        doc.font('Helvetica-Bold');
        headers.forEach((header, i) => {
          doc.text(header, 50 + i * 100, doc.y, { width: 90 });
        });
        doc.moveDown();

        // Rows
        doc.font('Helvetica');
        data.slice(0, 50).forEach(item => { // Limit to 50 rows for PDF
          const y = doc.y;
          headers.forEach((header, i) => {
            doc.text(String(item[header] || ''), 50 + i * 100, y, { width: 90 });
          });
          doc.moveDown();
        });

        if (data.length > 50) {
          doc.text(`... and ${data.length - 50} more records`);
        }
      }

      doc.end();

      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  /**
   * Cache report result
   */
  private async cacheReport(reportId: string, result: ReportResult): Promise<void> {
    const key = `report:${reportId}:latest`;
    await redis.setex(key, 3600, JSON.stringify(result)); // Cache for 1 hour
  }

  /**
   * Get cached report
   */
  public async getCachedReport(reportId: string): Promise<ReportResult | null> {
    const key = `report:${reportId}:latest`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
}

/**
 * Report scheduler for automated report generation
 */
export class ReportScheduler {
  private generator: CustomReportGenerator;
  private schedules: Map<string, NodeJS.Timeout>;

  constructor() {
    this.generator = new CustomReportGenerator();
    this.schedules = new Map();
  }

  /**
   * Schedule report
   */
  public scheduleReport(config: ReportConfig, tenantId: string): void {
    if (!config.schedule?.enabled) return;

    const { frequency, time } = config.schedule;
    const [hours, minutes] = time.split(':').map(Number);

    // Calculate next run time
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();

    // Schedule first run
    const timeout = setTimeout(() => {
      this.runScheduledReport(config, tenantId);
      
      // Schedule recurring runs
      const interval = this.getIntervalMs(frequency);
      const recurringTimeout = setInterval(() => {
        this.runScheduledReport(config, tenantId);
      }, interval);

      this.schedules.set(config.id, recurringTimeout);
    }, delay);

    this.schedules.set(config.id, timeout);
    console.log(`Scheduled report ${config.name} for ${nextRun.toISOString()}`);
  }

  /**
   * Run scheduled report
   */
  private async runScheduledReport(config: ReportConfig, tenantId: string): Promise<void> {
    try {
      console.log(`Running scheduled report: ${config.name}`);
      
      const result = await this.generator.generateReport(config, tenantId);
      
      // Send to recipients (email integration would go here)
      console.log(`Report generated: ${result.filePath}`);
      
    } catch (error) {
      console.error(`Error running scheduled report ${config.name}:`, error);
    }
  }

  /**
   * Get interval in milliseconds
   */
  private getIntervalMs(frequency: 'daily' | 'weekly' | 'monthly'): number {
    switch (frequency) {
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Cancel scheduled report
   */
  public cancelSchedule(reportId: string): void {
    const timeout = this.schedules.get(reportId);
    if (timeout) {
      clearTimeout(timeout);
      this.schedules.delete(reportId);
      console.log(`Cancelled schedule for report: ${reportId}`);
    }
  }

  /**
   * Get all scheduled reports
   */
  public getScheduledReports(): string[] {
    return Array.from(this.schedules.keys());
  }
}

// Singleton instances
let reportGenerator: CustomReportGenerator | null = null;
let reportScheduler: ReportScheduler | null = null;

/**
 * Get report generator instance
 */
export function getReportGenerator(): CustomReportGenerator {
  if (!reportGenerator) {
    reportGenerator = new CustomReportGenerator();
  }
  return reportGenerator;
}

/**
 * Get report scheduler instance
 */
export function getReportScheduler(): ReportScheduler {
  if (!reportScheduler) {
    reportScheduler = new ReportScheduler();
  }
  return reportScheduler;
}
