/**
 * Prometheus Metrics System
 * Comprehensive monitoring and observability (no-op fallback)
 */

type LabelValues = Record<string, string>

class NoopMetric {
  inc(_labels?: LabelValues, _value?: number) {}
  observe(_labels?: LabelValues, _value?: number) {}
  set(_value: number) {}
  reset() {}
}

class NoopRegistry {
  metrics(): string {
    return '# No metrics available in stub registry\n'
  }

  resetMetrics(): void {}
}

export const register = new NoopRegistry()

function createCounter() {
  return new NoopMetric()
}

function createHistogram() {
  return new NoopMetric()
}

function createGauge() {
  return new NoopMetric()
}

// HTTP Request Metrics
export const httpRequestsTotal = createCounter()

export const httpRequestDuration = createHistogram()

// Database Metrics
export const databaseQueriesTotal = createCounter()

export const databaseQueryDuration = createHistogram()

// Cache Metrics
export const cacheHitsTotal = createCounter()

export const cacheMissesTotal = createCounter()

export const cacheSize = createGauge()

// Lease Metrics
export const leasesActiveGauge = createGauge()

export const leasesCreatedTotal = createCounter()

export const leasesExpiredTotal = createCounter()

export const leasesRenewedTotal = createCounter()

// Dataset Metrics
export const datasetsPublishedGauge = createGauge()

export const datasetAccessTotal = createCounter()

export const dataProcessedBytes = createCounter()

// Billing Metrics
export const revenueTotal = createCounter()

export const invoicesGeneratedTotal = createCounter()

// Security Metrics
export const anomaliesDetectedTotal = createCounter()

export const authenticationAttemptsTotal = createCounter()

export const rateLimitExceededTotal = createCounter()

// Worker Queue Metrics
export const queueJobsTotal = createCounter()

export const queueJobDuration = createHistogram()

export const queueSizeGauge = createGauge()

// Webhook Metrics
export const webhooksDeliveredTotal = createCounter()

export const webhookDeliveryDuration = createHistogram()

// Email Metrics
export const emailsSentTotal = createCounter()

// Compliance Metrics
export const complianceChecksTotal = createCounter()

export const complianceScoreGauge = createGauge()

// Evidence Bundle Metrics
export const evidenceBundlesGeneratedTotal = createCounter()

export const evidenceBundleSizeBytes = createHistogram()

// Backup Metrics
export const backupsCompletedTotal = createCounter()

export const backupSizeBytes = createHistogram()

// Feature Flag Metrics
export const featureFlagChecksTotal = createCounter()

// Real-time Notification Metrics
export const notificationsSentTotal = createCounter()

export const websocketConnectionsGauge = createGauge()

// System Health Metrics
export const systemHealthGauge = createGauge()

export const uptimeSeconds = createGauge()

// Error Metrics
export const errorsTotal = createCounter()

/**
 * Helper function to record HTTP request
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, durationSeconds);
}

/**
 * Helper function to record database query
 */
export function recordDatabaseQuery(
  operation: string,
  table: string,
  durationSeconds: number
) {
  databaseQueriesTotal.inc({ operation, table });
  databaseQueryDuration.observe({ operation, table }, durationSeconds);
}

/**
 * Helper function to record cache access
 */
export function recordCacheAccess(cacheType: string, hit: boolean) {
  if (hit) {
    cacheHitsTotal.inc({ cache_type: cacheType });
  } else {
    cacheMissesTotal.inc({ cache_type: cacheType });
  }
}

/**
 * Helper function to update system health
 */
export function updateSystemHealth(status: 'healthy' | 'degraded' | 'down') {
  const value = status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0;
  systemHealthGauge.set(value);
}

/**
 * Initialize metrics with default values
 */
export function initializeMetrics() {
  systemHealthGauge.set(1); // Start as healthy
  uptimeSeconds.set(0);
  
  // Start uptime counter
  const startTime = Date.now();
  setInterval(() => {
    uptimeSeconds.set((Date.now() - startTime) / 1000);
  }, 10000); // Update every 10 seconds
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}
