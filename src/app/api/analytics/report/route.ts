/**
 * Analytics Report API
 * Generate and retrieve analytics reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  generateAnalyticsReport,
  getDatasetUsageStats,
  getTenantGrowthMetrics,
  getComplianceMetrics,
  exportAnalyticsToCSV 
} from '@/lib/analytics/analytics-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/analytics/report
 * Generate analytics report
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

    // Only admins and owners can view analytics
    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { startDate, endDate, format = 'json' } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    const report = await generateAnalyticsReport(
      user.tenantId,
      new Date(startDate),
      new Date(endDate)
    );

    if (format === 'csv') {
      const csv = exportAnalyticsToCSV(report);
      
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${report.period}.csv"`,
        },
      });
    }

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error('Error generating analytics report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/report
 * Get quick analytics summary
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

    if (user.xaseRole !== 'ADMIN' && user.xaseRole !== 'OWNER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const [report, growth, compliance] = await Promise.all([
      generateAnalyticsReport(user.tenantId, startDate, endDate),
      getTenantGrowthMetrics(user.tenantId, 6),
      getComplianceMetrics(user.tenantId),
    ]);

    return NextResponse.json({
      summary: report,
      growth,
      compliance,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
