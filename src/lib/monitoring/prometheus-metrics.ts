/**
 * Prometheus Metrics System
 * Comprehensive monitoring and observability
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create registry
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// HTTP Request Metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Database Metrics
export const databaseQueriesTotal = new Counter({
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table'],
  registers: [register],
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Cache Metrics
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheSize = new Gauge({
  name: 'cache_size_bytes',
  help: 'Current size of cache in bytes',
  labelNames: ['cache_type'],
  registers: [register],
});

// Lease Metrics
export const leasesActiveGauge = new Gauge({
  name: 'leases_active',
  help: 'Number of currently active leases',
  registers: [register],
});

export const leasesCreatedTotal = new Counter({
  name: 'leases_created_total',
  help: 'Total number of leases created',
  labelNames: ['dataset_type'],
  registers: [register],
});

export const leasesExpiredTotal = new Counter({
  name: 'leases_expired_total',
  help: 'Total number of leases expired',
  registers: [register],
});

export const leasesRenewedTotal = new Counter({
  name: 'leases_renewed_total',
  help: 'Total number of leases renewed',
  labelNames: ['renewal_type'],
  registers: [register],
});

// Dataset Metrics
export const datasetsPublishedGauge = new Gauge({
  name: 'datasets_published',
  help: 'Number of published datasets',
  labelNames: ['data_type'],
  registers: [register],
});

export const datasetAccessTotal = new Counter({
  name: 'dataset_access_total',
  help: 'Total number of dataset accesses',
  labelNames: ['dataset_id', 'access_type'],
  registers: [register],
});

export const dataProcessedBytes = new Counter({
  name: 'data_processed_bytes_total',
  help: 'Total bytes of data processed',
  labelNames: ['data_type'],
  registers: [register],
});

// Billing Metrics
export const revenueTotal = new Counter({
  name: 'revenue_total_usd',
  help: 'Total revenue in USD',
  labelNames: ['tier', 'region'],
  registers: [register],
});

export const invoicesGeneratedTotal = new Counter({
  name: 'invoices_generated_total',
  help: 'Total number of invoices generated',
  labelNames: ['status'],
  registers: [register],
});

// Security Metrics
export const anomaliesDetectedTotal = new Counter({
  name: 'anomalies_detected_total',
  help: 'Total number of anomalies detected',
  labelNames: ['anomaly_type', 'severity'],
  registers: [register],
});

export const authenticationAttemptsTotal = new Counter({
  name: 'authentication_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['result'],
  registers: [register],
});

export const rateLimitExceededTotal = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'tier'],
  registers: [register],
});

// Worker Queue Metrics
export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs',
  labelNames: ['queue_name', 'status'],
  registers: [register],
});

export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Duration of queue jobs in seconds',
  labelNames: ['queue_name'],
  buckets: [1, 5, 10, 30, 60, 300, 600],
  registers: [register],
});

export const queueSizeGauge = new Gauge({
  name: 'queue_size',
  help: 'Current size of queue',
  labelNames: ['queue_name'],
  registers: [register],
});

// Webhook Metrics
export const webhooksDeliveredTotal = new Counter({
  name: 'webhooks_delivered_total',
  help: 'Total number of webhooks delivered',
  labelNames: ['event_type', 'status'],
  registers: [register],
});

export const webhookDeliveryDuration = new Histogram({
  name: 'webhook_delivery_duration_seconds',
  help: 'Duration of webhook delivery in seconds',
  labelNames: ['event_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Email Metrics
export const emailsSentTotal = new Counter({
  name: 'emails_sent_total',
  help: 'Total number of emails sent',
  labelNames: ['template', 'status'],
  registers: [register],
});

// Compliance Metrics
export const complianceChecksTotal = new Counter({
  name: 'compliance_checks_total',
  help: 'Total number of compliance checks',
  labelNames: ['framework', 'result'],
  registers: [register],
});

export const complianceScoreGauge = new Gauge({
  name: 'compliance_score',
  help: 'Current compliance score',
  labelNames: ['framework'],
  registers: [register],
});

// Evidence Bundle Metrics
export const evidenceBundlesGeneratedTotal = new Counter({
  name: 'evidence_bundles_generated_total',
  help: 'Total number of evidence bundles generated',
  registers: [register],
});

export const evidenceBundleSizeBytes = new Histogram({
  name: 'evidence_bundle_size_bytes',
  help: 'Size of evidence bundles in bytes',
  buckets: [1024, 10240, 102400, 1024000, 10240000],
  registers: [register],
});

// Backup Metrics
export const backupsCompletedTotal = new Counter({
  name: 'backups_completed_total',
  help: 'Total number of backups completed',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const backupSizeBytes = new Histogram({
  name: 'backup_size_bytes',
  help: 'Size of backups in bytes',
  buckets: [1024000, 10240000, 102400000, 1024000000, 10240000000],
  registers: [register],
});

// Feature Flag Metrics
export const featureFlagChecksTotal = new Counter({
  name: 'feature_flag_checks_total',
  help: 'Total number of feature flag checks',
  labelNames: ['flag_name', 'result'],
  registers: [register],
});

// Real-time Notification Metrics
export const notificationsSentTotal = new Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'channel'],
  registers: [register],
});

export const websocketConnectionsGauge = new Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

// System Health Metrics
export const systemHealthGauge = new Gauge({
  name: 'system_health_status',
  help: 'System health status (1=healthy, 0.5=degraded, 0=down)',
  registers: [register],
});

export const uptimeSeconds = new Gauge({
  name: 'uptime_seconds',
  help: 'System uptime in seconds',
  registers: [register],
});

// Error Metrics
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'severity'],
  registers: [register],
});

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
