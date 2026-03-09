/**
 * API endpoint for usage metering and billing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MeteringService } from '@/lib/billing/metering-service';
import { validateApiKey } from '@/lib/xase/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    const action = url.searchParams.get('action')

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
    }

    if (action === 'realtime') {
      const usage = await MeteringService.getRealTimeUsage(tenantId)
      return NextResponse.json({ usage })
    }

    if (action === 'summary') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const summary = await MeteringService.getUsageSummary(tenantId, start, end)
      return NextResponse.json(summary)
    }

    if (action === 'events') {
      const start = new Date(url.searchParams.get('start') || Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = new Date(url.searchParams.get('end') || Date.now())
      const events = await MeteringService.getBillingEvents(tenantId, start, end)
      return NextResponse.json({ events, count: events.length })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] GET /api/v1/billing/usage error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // Support both API key and session auth
    const apiKey = req.headers.get('x-api-key') || '';
    let auth = await validateApiKey(apiKey);
    let tenantId: string | null = auth.valid ? (auth.tenantId || null) : null;

    if (!tenantId) {
      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Get tenantId from session user
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { tenantId: true },
      });
      tenantId = user?.tenantId || null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { leaseId, bytesProcessed, duration, eventType, action, metric, value, datasetId } = body;

    // Handle test format: leaseId, bytesProcessed, duration, eventType
    if (leaseId && (bytesProcessed !== undefined || duration !== undefined)) {
      // Validate leaseId exists
      if (!leaseId) {
        return NextResponse.json({ error: 'leaseId required' }, { status: 400 });
      }

      // Check for negative values
      if (bytesProcessed !== undefined && bytesProcessed < 0) {
        return NextResponse.json({ error: 'bytesProcessed cannot be negative' }, { status: 400 });
      }
      if (duration !== undefined && duration < 0) {
        return NextResponse.json({ error: 'duration cannot be negative' }, { status: 400 });
      }

      await MeteringService.recordUsage({
        tenantId,
        leaseId,
        datasetId,
        metric: eventType || metric || 'STREAM',
        value: bytesProcessed || value || 0,
        timestamp: new Date(),
        metadata: { duration, eventType },
      });
      return NextResponse.json({ success: true }, { status: 201 });
    }

    // Handle original format with action
    if (action === 'record') {
      await MeteringService.recordUsage({
        tenantId,
        leaseId,
        datasetId,
        metric,
        value,
        timestamp: new Date(),
        metadata: body.metadata,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'calculate-bill') {
      const start = new Date(body.start);
      const end = new Date(body.end);
      const rates = body.rates || { hours: 0.1, requests: 0.001, bytes: 0.00001, storage_gb_hours: 0.000032 };
      const bill = await MeteringService.calculateBill(tenantId, start, end, rates);
      return NextResponse.json(bill);
    }

    return NextResponse.json({ error: 'Invalid action or missing required fields' }, { status: 400 });
  } catch (error: any) {
    console.error('[API] POST /api/v1/billing/usage error:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    );
  }
}
