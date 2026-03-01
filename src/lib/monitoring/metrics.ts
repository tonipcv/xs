/**
 * Performance Monitoring and Observability
 * Metrics collection and monitoring system
 */

import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

let isConnected = false;

async function ensureRedisConnection() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  successRate: number;
}

/**
 * Record a metric
 */
export async function recordMetric(metric: Metric): Promise<void> {
  try {
    await ensureRedisConnection();

    const key = `metrics:${metric.name}`;
    const timestamp = metric.timestamp || Date.now();
    
    // Store metric in sorted set with timestamp as score
    await redisClient.zAdd(key, {
      score: timestamp,
      value: JSON.stringify({
        value: metric.value,
        tags: metric.tags,
        timestamp,
      }),
    });

    // Keep only last 24 hours of metrics
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    await redisClient.zRemRangeByScore(key, 0, oneDayAgo);
  } catch (error) {
    console.error('Error recording metric:', error);
  }
}

/**
 * Record HTTP request metrics
 */
export async function recordRequest(
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number
): Promise<void> {
  const timestamp = Date.now();

  await Promise.all([
    // Total requests
    recordMetric({
      name: 'http.requests',
      value: 1,
      timestamp,
      tags: { endpoint, method, status: statusCode.toString() },
    }),

    // Response time
    recordMetric({
      name: 'http.response_time',
      value: responseTime,
      timestamp,
      tags: { endpoint, method },
    }),

    // Errors
    statusCode >= 400 && recordMetric({
      name: 'http.errors',
      value: 1,
      timestamp,
      tags: { endpoint, method, status: statusCode.toString() },
    }),
  ]);
}

/**
 * Record database query metrics
 */
export async function recordDatabaseQuery(
  operation: string,
  table: string,
  duration: number,
  success: boolean
): Promise<void> {
  const timestamp = Date.now();

  await Promise.all([
    recordMetric({
      name: 'db.queries',
      value: 1,
      timestamp,
      tags: { operation, table, success: success.toString() },
    }),

    recordMetric({
      name: 'db.query_time',
      value: duration,
      timestamp,
      tags: { operation, table },
    }),
  ]);
}

/**
 * Record cache metrics
 */
export async function recordCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete',
  key: string,
  duration?: number
): Promise<void> {
  const timestamp = Date.now();

  await recordMetric({
    name: `cache.${operation}`,
    value: 1,
    timestamp,
    tags: { key },
  });

  if (duration !== undefined) {
    await recordMetric({
      name: 'cache.operation_time',
      value: duration,
      timestamp,
      tags: { operation, key },
    });
  }
}

/**
 * Get metrics for a time range
 */
export async function getMetrics(
  metricName: string,
  startTime: number,
  endTime: number
): Promise<Metric[]> {
  try {
    await ensureRedisConnection();

    const key = `metrics:${metricName}`;
    const results = await redisClient.zRangeByScore(key, startTime, endTime);

    return results.map(result => {
      const data = JSON.parse(result);
      return {
        name: metricName,
        value: data.value,
        timestamp: data.timestamp,
        tags: data.tags,
      };
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    return [];
  }
}

/**
 * Calculate performance metrics
 */
export async function getPerformanceMetrics(
  endpoint?: string,
  timeRangeMs: number = 60 * 60 * 1000 // Last hour
): Promise<PerformanceMetrics> {
  const endTime = Date.now();
  const startTime = endTime - timeRangeMs;

  try {
    // Get request metrics
    const requests = await getMetrics('http.requests', startTime, endTime);
    const responseTimes = await getMetrics('http.response_time', startTime, endTime);
    const errors = await getMetrics('http.errors', startTime, endTime);

    // Filter by endpoint if specified
    const filteredRequests = endpoint
      ? requests.filter(m => m.tags?.endpoint === endpoint)
      : requests;

    const filteredResponseTimes = endpoint
      ? responseTimes.filter(m => m.tags?.endpoint === endpoint)
      : responseTimes;

    const filteredErrors = endpoint
      ? errors.filter(m => m.tags?.endpoint === endpoint)
      : errors;

    // Calculate metrics
    const requestCount = filteredRequests.reduce((sum, m) => sum + m.value, 0);
    const errorCount = filteredErrors.reduce((sum, m) => sum + m.value, 0);

    const times = filteredResponseTimes.map(m => m.value).sort((a, b) => a - b);
    const averageResponseTime = times.length > 0
      ? times.reduce((sum, t) => sum + t, 0) / times.length
      : 0;

    const p95Index = Math.floor(times.length * 0.95);
    const p99Index = Math.floor(times.length * 0.99);
    const p95ResponseTime = times[p95Index] || 0;
    const p99ResponseTime = times[p99Index] || 0;

    const successRate = requestCount > 0
      ? ((requestCount - errorCount) / requestCount) * 100
      : 100;

    return {
      requestCount,
      errorCount,
      averageResponseTime: Math.round(averageResponseTime),
      p95ResponseTime: Math.round(p95ResponseTime),
      p99ResponseTime: Math.round(p99ResponseTime),
      successRate: Math.round(successRate * 100) / 100,
    };
  } catch (error) {
    console.error('Error calculating performance metrics:', error);
    return {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      successRate: 100,
    };
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  metrics: PerformanceMetrics;
}> {
  const checks: Record<string, boolean> = {};

  // Check Redis connection
  try {
    await ensureRedisConnection();
    await redisClient.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  // Get performance metrics
  const metrics = await getPerformanceMetrics();

  // Determine overall health
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!checks.redis) {
    status = 'degraded';
  }

  if (metrics.successRate < 95) {
    status = 'degraded';
  }

  if (metrics.successRate < 90 || metrics.p99ResponseTime > 5000) {
    status = 'unhealthy';
  }

  return {
    status,
    checks,
    metrics,
  };
}

/**
 * Record custom business metric
 */
export async function recordBusinessMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): Promise<void> {
  await recordMetric({
    name: `business.${name}`,
    value,
    timestamp: Date.now(),
    tags,
  });
}

/**
 * Get top endpoints by request count
 */
export async function getTopEndpoints(
  limit: number = 10,
  timeRangeMs: number = 60 * 60 * 1000
): Promise<Array<{ endpoint: string; count: number }>> {
  const endTime = Date.now();
  const startTime = endTime - timeRangeMs;

  const requests = await getMetrics('http.requests', startTime, endTime);

  const endpointCounts = requests.reduce((acc, metric) => {
    const endpoint = metric.tags?.endpoint || 'unknown';
    acc[endpoint] = (acc[endpoint] || 0) + metric.value;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get error rate by endpoint
 */
export async function getErrorRates(
  timeRangeMs: number = 60 * 60 * 1000
): Promise<Array<{ endpoint: string; errorRate: number }>> {
  const endTime = Date.now();
  const startTime = endTime - timeRangeMs;

  const requests = await getMetrics('http.requests', startTime, endTime);
  const errors = await getMetrics('http.errors', startTime, endTime);

  const endpointRequests = requests.reduce((acc, metric) => {
    const endpoint = metric.tags?.endpoint || 'unknown';
    acc[endpoint] = (acc[endpoint] || 0) + metric.value;
    return acc;
  }, {} as Record<string, number>);

  const endpointErrors = errors.reduce((acc, metric) => {
    const endpoint = metric.tags?.endpoint || 'unknown';
    acc[endpoint] = (acc[endpoint] || 0) + metric.value;
    return acc;
  }, {} as Record<string, number>);

  return Object.keys(endpointRequests).map(endpoint => ({
    endpoint,
    errorRate: endpointRequests[endpoint] > 0
      ? (endpointErrors[endpoint] || 0) / endpointRequests[endpoint] * 100
      : 0,
  }));
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isConnected) {
    await redisClient.quit();
  }
});
