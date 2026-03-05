/**
 * Advanced Analytics API
 * Provides funnel, cohort, conversion, and journey analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  trackEvent,
  queryAnalytics,
  getRealtimeAnalytics,
  getFunnelAnalytics,
  getCohortAnalysis,
  getUserJourney,
  getConversionRate,
  clearAnalyticsCache,
} from '@/lib/analytics/advanced-analytics';

/**
 * POST /api/analytics/advanced
 * Track analytics event
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventType, metadata } = body;

    if (!eventType) {
      return NextResponse.json(
        { error: 'Event type is required' },
        { status: 400 }
      );
    }

    await trackEvent({
      eventType,
      userId: session.user.id,
      tenantId: (session.user as any).tenantId,
      metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error tracking analytics event:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/advanced
 * Query analytics data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'query';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    switch (type) {
      case 'query': {
        const eventTypes = searchParams.get('eventTypes')?.split(',');
        const groupBy = searchParams.get('groupBy') as 'hour' | 'day' | 'week' | 'month' | undefined;

        const result = await queryAnalytics({
          startDate: start,
          endDate: end,
          eventTypes,
          tenantId: (session.user as any).tenantId,
          groupBy,
        });

        return NextResponse.json(result);
      }

      case 'realtime': {
        const data = await getRealtimeAnalytics(
          (session.user as any).tenantId,
          session.user.id
        );
        return NextResponse.json(data);
      }

      case 'funnel': {
        const steps = searchParams.get('steps')?.split(',');
        if (!steps || steps.length === 0) {
          return NextResponse.json(
            { error: 'Steps are required for funnel analysis' },
            { status: 400 }
          );
        }

        const result = await getFunnelAnalytics(
          steps,
          start,
          end,
          (session.user as any).tenantId
        );

        return NextResponse.json(result);
      }

      case 'cohort': {
        const cohortDate = searchParams.get('cohortDate');
        const retentionDays = searchParams.get('retentionDays')?.split(',').map(Number);

        if (!cohortDate || !retentionDays) {
          return NextResponse.json(
            { error: 'Cohort date and retention days are required' },
            { status: 400 }
          );
        }

        const result = await getCohortAnalysis(
          new Date(cohortDate),
          retentionDays,
          (session.user as any).tenantId
        );

        return NextResponse.json(result);
      }

      case 'journey': {
        const userId = searchParams.get('userId');
        if (!userId) {
          return NextResponse.json(
            { error: 'User ID is required for journey analysis' },
            { status: 400 }
          );
        }

        const result = await getUserJourney(userId, start, end);
        return NextResponse.json(result);
      }

      case 'conversion': {
        const fromEvent = searchParams.get('fromEvent');
        const toEvent = searchParams.get('toEvent');

        if (!fromEvent || !toEvent) {
          return NextResponse.json(
            { error: 'From event and to event are required' },
            { status: 400 }
          );
        }

        const result = await getConversionRate(
          fromEvent,
          toEvent,
          start,
          end,
          (session.user as any).tenantId
        );

        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid analytics type' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error querying analytics:', error);
    return NextResponse.json(
      { error: 'Failed to query analytics' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analytics/advanced
 * Clear analytics cache
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await clearAnalyticsCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error clearing analytics cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
