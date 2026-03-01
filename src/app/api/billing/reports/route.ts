/**
 * Billing Reports API
 * Generate and download billing reports
 * F3-012: Relatório de Billing Exportável
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateBillingReport, getBillingStatistics } from '@/lib/billing/billing-reports';

/**
 * POST /api/billing/reports
 * Generate billing report
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { format, reportType, startDate, endDate, tenantId } = body;

    if (!format || !reportType) {
      return NextResponse.json(
        { error: 'Missing required fields: format, reportType' },
        { status: 400 }
      );
    }

    const result = await generateBillingReport({
      format,
      reportType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      tenantId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('Error generating billing report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/reports/stats
 * Get billing statistics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing required parameter: tenantId' },
        { status: 400 }
      );
    }

    const stats = await getBillingStatistics(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Error fetching billing statistics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
