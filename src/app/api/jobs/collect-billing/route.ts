import { NextRequest, NextResponse } from 'next/server';
import { collectBillingMetrics } from '@/lib/jobs/collect-billing-metrics';

// POST /api/jobs/collect-billing
// Trigger billing metrics collection manually or via cron
export async function POST(req: NextRequest) {
  try {
    // Optional: Add auth check here (API key or internal secret)
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.INTERNAL_JOB_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[API] Starting billing metrics collection job...');
    const results = await collectBillingMetrics();
    
    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] Billing collection job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET /api/jobs/collect-billing (status check)
export async function GET() {
  return NextResponse.json({
    job: 'collect-billing-metrics',
    description: 'Collects billing metrics from all tenant Sidecars',
    schedule: 'Daily at 00:00 UTC (via cron or Vercel Cron)',
    trigger: 'POST /api/jobs/collect-billing with Bearer token',
  });
}
