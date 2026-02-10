import { NextRequest, NextResponse } from 'next/server'
import { ObservabilityMetrics } from '@/lib/observability/metrics'

/**
 * Prometheus Metrics Endpoint
 * GET /api/metrics
 * 
 * Returns metrics in Prometheus exposition format
 */
export async function GET(req: NextRequest) {
  try {
    let metrics = await ObservabilityMetrics.exportPrometheusMetrics()
    
    // If no metrics collected yet, return default metrics
    if (!metrics || metrics.trim().length === 0) {
      metrics = `# HELP xase_system_up System uptime indicator
# TYPE xase_system_up gauge
xase_system_up 1

# HELP xase_api_requests_total Total API requests
# TYPE xase_api_requests_total counter
xase_api_requests_total{endpoint="/api/health",method="GET",status="200"} 0

# HELP xase_epsilon_budget_consumed Total epsilon budget consumed
# TYPE xase_epsilon_budget_consumed counter
xase_epsilon_budget_consumed 0

# HELP xase_policy_enforcements_total Total policy enforcements
# TYPE xase_policy_enforcements_total counter
xase_policy_enforcements_total 0

# HELP xase_consent_revocations_total Total consent revocations
# TYPE xase_consent_revocations_total counter
xase_consent_revocations_total 0
`
    }
    
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    })
  } catch (error: any) {
    console.error('[API] /metrics error:', error)
    return new NextResponse('# Error generating metrics\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  }
}
