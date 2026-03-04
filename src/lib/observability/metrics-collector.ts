/**
 * METRICS COLLECTOR
 * Collect and aggregate application metrics
 */

export interface Metric {
  name: string
  value: number
  type: 'COUNTER' | 'GAUGE' | 'HISTOGRAM' | 'SUMMARY'
  labels?: Record<string, string>
  timestamp: Date
}

export interface MetricAggregation {
  name: string
  count: number
  sum: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
}

export class MetricsCollector {
  private static metrics: Map<string, Metric[]> = new Map()
  private static readonly MAX_METRICS_PER_NAME = 10000
  private static readonly RETENTION_MS = 3600000 // 1 hour

  /**
   * Record counter metric
   */
  static counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'COUNTER',
      labels,
      timestamp: new Date(),
    })
  }

  /**
   * Record gauge metric
   */
  static gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'GAUGE',
      labels,
      timestamp: new Date(),
    })
  }

  /**
   * Record histogram metric
   */
  static histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'HISTOGRAM',
      labels,
      timestamp: new Date(),
    })
  }

  /**
   * Record metric
   */
  private static record(metric: Metric): void {
    const key = this.getMetricKey(metric.name, metric.labels)
    const existing = this.metrics.get(key) || []

    existing.push(metric)

    // Limit size
    if (existing.length > this.MAX_METRICS_PER_NAME) {
      existing.shift()
    }

    this.metrics.set(key, existing)
  }

  /**
   * Get metric key
   */
  private static getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')

    return `${name}{${labelStr}}`
  }

  /**
   * Get metrics
   */
  static getMetrics(name: string, labels?: Record<string, string>): Metric[] {
    const key = this.getMetricKey(name, labels)
    return this.metrics.get(key) || []
  }

  /**
   * Aggregate metrics
   */
  static aggregate(name: string, labels?: Record<string, string>): MetricAggregation | null {
    const metrics = this.getMetrics(name, labels)
    if (metrics.length === 0) return null

    const values = metrics.map(m => m.value).sort((a, b) => a - b)
    const sum = values.reduce((acc, v) => acc + v, 0)

    return {
      name,
      count: values.length,
      sum,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    }
  }

  /**
   * Calculate percentile
   */
  private static percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0

    const index = Math.ceil((p / 100) * sortedValues.length) - 1
    return sortedValues[Math.max(0, index)]
  }

  /**
   * Get all metric names
   */
  static getMetricNames(): string[] {
    const names = new Set<string>()
    
    for (const key of this.metrics.keys()) {
      const name = key.split('{')[0]
      names.add(name)
    }

    return Array.from(names)
  }

  /**
   * Clear old metrics
   */
  static cleanup(): number {
    const cutoff = Date.now() - this.RETENTION_MS
    let removed = 0

    for (const [key, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp.getTime() > cutoff)
      
      if (filtered.length === 0) {
        this.metrics.delete(key)
        removed++
      } else if (filtered.length < metrics.length) {
        this.metrics.set(key, filtered)
      }
    }

    return removed
  }

  /**
   * Get summary
   */
  static getSummary(): {
    totalMetrics: number
    uniqueNames: number
    oldestMetric: Date | null
    newestMetric: Date | null
  } {
    let totalMetrics = 0
    let oldestMetric: Date | null = null
    let newestMetric: Date | null = null

    for (const metrics of this.metrics.values()) {
      totalMetrics += metrics.length

      for (const metric of metrics) {
        if (!oldestMetric || metric.timestamp < oldestMetric) {
          oldestMetric = metric.timestamp
        }
        if (!newestMetric || metric.timestamp > newestMetric) {
          newestMetric = metric.timestamp
        }
      }
    }

    return {
      totalMetrics,
      uniqueNames: this.getMetricNames().length,
      oldestMetric,
      newestMetric,
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  static exportPrometheus(): string {
    const lines: string[] = []
    const names = this.getMetricNames()

    for (const name of names) {
      const aggregation = this.aggregate(name)
      if (!aggregation) continue

      lines.push(`# TYPE ${name} summary`)
      lines.push(`${name}_count ${aggregation.count}`)
      lines.push(`${name}_sum ${aggregation.sum}`)
      lines.push(`${name}_min ${aggregation.min}`)
      lines.push(`${name}_max ${aggregation.max}`)
      lines.push(`${name}_avg ${aggregation.avg}`)
      lines.push(`${name}{quantile="0.5"} ${aggregation.p50}`)
      lines.push(`${name}{quantile="0.95"} ${aggregation.p95}`)
      lines.push(`${name}{quantile="0.99"} ${aggregation.p99}`)
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Time function execution
   */
  static async time<T>(
    name: string,
    fn: () => Promise<T>,
    labels?: Record<string, string>
  ): Promise<T> {
    const start = Date.now()
    
    try {
      const result = await fn()
      const duration = Date.now() - start
      this.histogram(name, duration, labels)
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.histogram(name, duration, { ...labels, error: 'true' })
      throw error
    }
  }

  /**
   * Increment counter
   */
  static increment(name: string, labels?: Record<string, string>): void {
    this.counter(name, 1, labels)
  }

  /**
   * Decrement gauge
   */
  static decrement(name: string, labels?: Record<string, string>): void {
    const current = this.getMetrics(name, labels)
    const lastValue = current.length > 0 ? current[current.length - 1].value : 0
    this.gauge(name, lastValue - 1, labels)
  }

  /**
   * Set gauge value
   */
  static set(name: string, value: number, labels?: Record<string, string>): void {
    this.gauge(name, value, labels)
  }

  /**
   * Observe value
   */
  static observe(name: string, value: number, labels?: Record<string, string>): void {
    this.histogram(name, value, labels)
  }
}
