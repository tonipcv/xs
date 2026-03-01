/**
 * GDPR Article 33 - Breach Notification (72h requirement)
 * Report and track data breaches
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { sendEmail } from '@/lib/email';

const prisma = new PrismaClient();

/**
 * POST /api/compliance/gdpr/breach
 * Report a data breach
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
        id: true,
        email: true,
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

    // Only admins can report breaches
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only admins can report breaches.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      breachType,
      description,
      affectedDataTypes,
      affectedRecordsCount,
      discoveredAt,
      containedAt,
      severity,
      affectedUsers,
    } = body;

    // Validate required fields
    if (!breachType || !description || !discoveredAt) {
      return NextResponse.json(
        { error: 'Missing required fields: breachType, description, discoveredAt' },
        { status: 400 }
      );
    }

    const breachId = `breach_${Date.now()}`;
    const reportedAt = new Date();
    const discoveredDate = new Date(discoveredAt);
    
    // Calculate time since discovery
    const hoursSinceDiscovery = (reportedAt.getTime() - discoveredDate.getTime()) / (1000 * 60 * 60);
    const within72Hours = hoursSinceDiscovery <= 72;

    // Create breach record in audit log
    const breachData = {
      breachId,
      breachType,
      description,
      affectedDataTypes: affectedDataTypes || [],
      affectedRecordsCount: affectedRecordsCount || 0,
      affectedUsers: affectedUsers || [],
      discoveredAt: discoveredDate.toISOString(),
      reportedAt: reportedAt.toISOString(),
      containedAt: containedAt ? new Date(containedAt).toISOString() : null,
      severity: severity || 'MEDIUM',
      hoursSinceDiscovery: Math.round(hoursSinceDiscovery * 10) / 10,
      within72Hours,
      reportedBy: user.email,
      status: 'REPORTED',
    };

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'GDPR_BREACH_REPORTED',
        resourceType: 'breach',
        resourceId: breachId,
        metadata: JSON.stringify(breachData),
        status: within72Hours ? 'SUCCESS' : 'WARNING',
        errorMessage: within72Hours ? null : 'Reported after 72-hour deadline',
        timestamp: reportedAt,
      },
    });

    // Send notification emails to all admins
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      include: {
        users: {
          where: {
            xaseRole: {
              in: ['ADMIN', 'OWNER'],
            },
          },
        },
      },
    });

    if (tenant?.users) {
      for (const admin of tenant.users) {
        if (admin.email) {
          await sendEmail({
            to: admin.email,
            subject: `[URGENT] Data Breach Reported - ${breachId}`,
            html: `
              <h2>Data Breach Notification</h2>
              <p>A data breach has been reported for your organization.</p>
              
              <h3>Breach Details:</h3>
              <ul>
                <li><strong>Breach ID:</strong> ${breachId}</li>
                <li><strong>Type:</strong> ${breachType}</li>
                <li><strong>Severity:</strong> ${severity || 'MEDIUM'}</li>
                <li><strong>Discovered:</strong> ${discoveredDate.toISOString()}</li>
                <li><strong>Reported:</strong> ${reportedAt.toISOString()}</li>
                <li><strong>Time Since Discovery:</strong> ${Math.round(hoursSinceDiscovery)} hours</li>
                <li><strong>Within 72h Deadline:</strong> ${within72Hours ? 'YES ✓' : 'NO ✗'}</li>
              </ul>
              
              <h3>Description:</h3>
              <p>${description}</p>
              
              ${affectedRecordsCount ? `<p><strong>Affected Records:</strong> ${affectedRecordsCount}</p>` : ''}
              ${affectedDataTypes?.length ? `<p><strong>Affected Data Types:</strong> ${affectedDataTypes.join(', ')}</p>` : ''}
              
              <p><strong>Reported by:</strong> ${user.email}</p>
              
              ${!within72Hours ? '<p style="color: red;"><strong>WARNING:</strong> This breach was reported after the 72-hour GDPR deadline.</p>' : ''}
              
              <p>Please take immediate action to assess and mitigate this breach.</p>
            `,
          }).catch(err => {
            console.error('Failed to send breach notification email:', err);
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      breachId,
      reportedAt: reportedAt.toISOString(),
      within72Hours,
      hoursSinceDiscovery: Math.round(hoursSinceDiscovery * 10) / 10,
      warning: within72Hours ? null : 'Breach reported after 72-hour GDPR deadline',
      metadata: {
        regulation: 'GDPR',
        article: 'Article 33',
        description: 'Personal Data Breach Notification',
        deadline: '72 hours from discovery',
      },
    });
  } catch (error: any) {
    console.error('Error reporting breach:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compliance/gdpr/breach
 * List all reported breaches for the tenant
 */
export async function GET(request: NextRequest) {
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

    // Only admins can view breaches
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get all breach reports
    const breaches = await prisma.auditLog.findMany({
      where: {
        tenantId: user.tenantId,
        action: 'GDPR_BREACH_REPORTED',
      },
      select: {
        resourceId: true,
        metadata: true,
        timestamp: true,
        status: true,
        errorMessage: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const parsedBreaches = breaches.map(breach => {
      const metadata = JSON.parse(breach.metadata || '{}');
      return {
        breachId: breach.resourceId,
        ...metadata,
        reportedAt: breach.timestamp,
        complianceStatus: breach.status,
        warning: breach.errorMessage,
      };
    });

    return NextResponse.json({
      breaches: parsedBreaches,
      total: parsedBreaches.length,
    });
  } catch (error: any) {
    console.error('Error fetching breaches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/compliance/gdpr/breach/:breachId
 * Update breach status (contained, mitigated, etc.)
 */
export async function PATCH(request: NextRequest) {
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
        id: true,
        email: true,
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

    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const breachId = url.pathname.split('/').pop();

    if (!breachId) {
      return NextResponse.json(
        { error: 'Breach ID required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, containedAt, mitigationSteps, notes } = body;

    // Log the update
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'GDPR_BREACH_UPDATED',
        resourceType: 'breach',
        resourceId: breachId,
        metadata: JSON.stringify({
          status,
          containedAt,
          mitigationSteps,
          notes,
          updatedBy: user.email,
          updatedAt: new Date().toISOString(),
        }),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      breachId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating breach:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
