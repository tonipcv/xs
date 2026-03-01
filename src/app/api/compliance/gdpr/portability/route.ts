/**
 * GDPR Article 20 - Right to Data Portability
 * Export user data in a structured, machine-readable format
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

/**
 * POST /api/compliance/gdpr/portability
 * Export all personal data in portable format (JSON, CSV, or XML)
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
      include: {
        accounts: true,
        sessions: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { format = 'json' } = body;

    // Validate format
    if (!['json', 'csv', 'xml'].includes(format.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid format. Supported: json, csv, xml' },
        { status: 400 }
      );
    }

    // Collect all portable data
    const portableData: any = {
      exportId: `export_${Date.now()}`,
      exportDate: new Date().toISOString(),
      format: format.toLowerCase(),
      dataSubject: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        language: user.language,
        region: user.region,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      authentication: {
        emailVerified: user.emailVerified?.toISOString() || null,
        twoFactorEnabled: user.twoFactorEnabled,
        accounts: user.accounts.map(account => ({
          provider: account.provider,
          type: account.type,
        })),
      },
    };

    // Get tenant-related data
    if (user.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });

      if (tenant) {
        portableData.organization = {
          name: tenant.name,
          role: user.xaseRole,
          joinedAt: user.createdAt.toISOString(),
        };
      }

      // Get datasets
      const datasets = await prisma.dataset.findMany({
        where: { tenantId: user.tenantId },
        select: {
          datasetId: true,
          name: true,
          description: true,
          language: true,
          totalDurationHours: true,
          numRecordings: true,
          createdAt: true,
        },
      });

      portableData.datasets = datasets.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }));

      // Get policies
      const policies = await prisma.accessPolicy.findMany({
        where: { clientTenantId: user.tenantId },
        select: {
          policyId: true,
          purposeCategory: true,
          retentionDays: true,
          createdAt: true,
        },
      });

      portableData.policies = policies.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      }));

      // Get leases
      const leases = await prisma.accessLease.findMany({
        where: { clientTenantId: user.tenantId },
        select: {
          leaseId: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
        },
      });

      portableData.leases = leases.map(l => ({
        ...l,
        issuedAt: l.issuedAt.toISOString(),
        expiresAt: l.expiresAt?.toISOString() || null,
      }));

      // Get usage statistics
      const billingSnapshots = await prisma.billingSnapshot.findMany({
        where: { tenantId: user.tenantId },
        select: {
          period: true,
          audioMinutes: true,
          bytesTotal: true,
          snapshotDate: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
        take: 12,
      });

      portableData.usage = billingSnapshots.map(b => ({
        ...b,
        snapshotDate: b.snapshotDate.toISOString(),
      }));
    }

    // Log the portability request
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'GDPR_PORTABILITY_REQUESTED',
        resourceType: 'user',
        resourceId: user.id,
        metadata: JSON.stringify({
          exportId: portableData.exportId,
          format: format.toLowerCase(),
          dataCategories: Object.keys(portableData),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    // Return data in requested format
    if (format.toLowerCase() === 'json') {
      return NextResponse.json({
        success: true,
        data: portableData,
        metadata: {
          regulation: 'GDPR',
          article: 'Article 20',
          description: 'Right to Data Portability',
          format: 'JSON',
          generatedAt: new Date().toISOString(),
        },
      });
    } else if (format.toLowerCase() === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(portableData);
      
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="data-export-${portableData.exportId}.csv"`,
        },
      });
    } else if (format.toLowerCase() === 'xml') {
      // Convert to XML format
      const xml = convertToXML(portableData);
      
      return new NextResponse(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="data-export-${portableData.exportId}.xml"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Unsupported format' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error processing portability request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: any): string {
  const lines: string[] = [];
  
  // Add header
  lines.push('Category,Key,Value');
  
  // Flatten data structure
  function flatten(obj: any, prefix = '') {
    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, newKey);
      } else if (Array.isArray(value)) {
        lines.push(`${newKey},count,${value.length}`);
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            flatten(item, `${newKey}[${index}]`);
          } else {
            lines.push(`${newKey}[${index}],,${item}`);
          }
        });
      } else {
        lines.push(`${newKey},,${value}`);
      }
    }
  }
  
  flatten(data);
  
  return lines.join('\n');
}

/**
 * Convert data to XML format
 */
function convertToXML(data: any): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<dataExport>\n';
  
  function toXML(obj: any, indent = '  '): string {
    let result = '';
    
    for (const key in obj) {
      const value = obj[key];
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      
      if (value === null || value === undefined) {
        result += `${indent}<${sanitizedKey} />\n`;
      } else if (Array.isArray(value)) {
        result += `${indent}<${sanitizedKey}>\n`;
        value.forEach(item => {
          result += `${indent}  <item>\n`;
          if (typeof item === 'object') {
            result += toXML(item, indent + '    ');
          } else {
            result += `${indent}    ${escapeXML(String(item))}\n`;
          }
          result += `${indent}  </item>\n`;
        });
        result += `${indent}</${sanitizedKey}>\n`;
      } else if (typeof value === 'object') {
        result += `${indent}<${sanitizedKey}>\n`;
        result += toXML(value, indent + '  ');
        result += `${indent}</${sanitizedKey}>\n`;
      } else {
        result += `${indent}<${sanitizedKey}>${escapeXML(String(value))}</${sanitizedKey}>\n`;
      }
    }
    
    return result;
  }
  
  function escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  xml += toXML(data);
  xml += '</dataExport>';
  
  return xml;
}
