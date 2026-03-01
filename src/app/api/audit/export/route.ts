/**
 * Audit Trail Export API
 * Export audit logs for regulatory compliance
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import {
  exportAuditTrailCSV,
  exportAuditTrailJSON,
  exportAuditTrailPDF,
  generateSignedExportBundle,
} from '@/lib/audit/export';

const prisma = new PrismaClient();

/**
 * POST /api/audit/export
 * Export audit trail in specified format
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        tenantId: true,
        xaseRole: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Only admins can export audit trails
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      format = 'json',
      startDate,
      endDate,
      actions,
      resourceTypes,
      signed = false,
    } = body;

    // Validate format
    if (!['csv', 'pdf', 'json'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Supported: csv, pdf, json' },
        { status: 400 }
      );
    }

    const options = {
      tenantId: user.tenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      actions,
      resourceTypes,
      format,
    };

    // Log the export request
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        action: 'AUDIT_TRAIL_EXPORTED',
        resourceType: 'audit_log',
        resourceId: `export_${Date.now()}`,
        metadata: JSON.stringify({
          format,
          startDate,
          endDate,
          actions,
          resourceTypes,
          signed,
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    // Generate signed bundle if requested
    if (signed) {
      const bundle = await generateSignedExportBundle(options);
      
      return NextResponse.json({
        success: true,
        format: 'signed_bundle',
        data: bundle.data,
        signature: bundle.signature,
        merkleRoot: bundle.merkleRoot,
        timestamp: bundle.timestamp,
      });
    }

    // Generate export based on format
    let exportData: string;
    let contentType: string;
    let filename: string;

    if (format === 'csv') {
      exportData = await exportAuditTrailCSV(options);
      contentType = 'text/csv';
      filename = `audit-trail-${Date.now()}.csv`;
    } else if (format === 'pdf') {
      exportData = await exportAuditTrailPDF(options);
      contentType = 'text/html'; // In production, convert to PDF
      filename = `audit-trail-${Date.now()}.html`;
    } else {
      exportData = await exportAuditTrailJSON(options);
      contentType = 'application/json';
      filename = `audit-trail-${Date.now()}.json`;
    }

    // Return as downloadable file
    return new NextResponse(exportData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting audit trail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
