/**
 * System Statistics API
 */

import { NextRequest, NextResponse } from 'next/server'
import { MetricsCollector } from '@/lib/observability/metrics-collector'
import { RequestLogger } from '@/lib/logging/request-logger'
import { ErrorHandler } from '@/lib/helpers/error-handler'
import { TaskScheduler } from '@/lib/tasks/task-scheduler'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || 'all'

    const stats: any = {}

    if (category === 'all' || category === 'metrics') {
      stats.metrics = MetricsCollector.getStatistics()
    }

    if (category === 'all' || category === 'requests') {
      stats.requests = RequestLogger.getStatistics()
    }

    if (category === 'all' || category === 'errors') {
      stats.errors = ErrorHandler.getStatistics()
    }

    if (category === 'all' || category === 'tasks') {
      stats.tasks = TaskScheduler.getStatistics()
    }

    return NextResponse.json({
      category,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
