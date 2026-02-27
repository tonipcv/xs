import * as fs from 'fs';
import * as path from 'path';

interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export class PrometheusMetrics {
  private metrics: Map<string, Metric> = new Map();
  private histograms: Map<string, number[]> = new Map();

  // Counters
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const key = this.getKey(name, labels);
    const existing = this.metrics.get(key);
    
    if (existing) {
      existing.value += value;
    } else {
      this.metrics.set(key, {
        name,
        type: 'counter',
        help: `Counter for ${name}`,
        value,
        labels
      });
    }
  }

  // Gauges
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.metrics.set(key, {
      name,
      type: 'gauge',
      help: `Gauge for ${name}`,
      value,
      labels
    });
  }

  // Histograms
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    
    this.histograms.get(key)!.push(value);
    
    // Calculate histogram metrics
    const values = this.histograms.get(key)!;
    const sorted = [...values].sort((a, b) => a - b);
    
    this.metrics.set(key + '_count', {
      name: name + '_count',
      type: 'counter',
      help: `Count for ${name}`,
      value: values.length,
      labels
    });
    
    this.metrics.set(key + '_sum', {
      name: name + '_sum',
      type: 'counter',
      help: `Sum for ${name}`,
      value: values.reduce((a, b) => a + b, 0),
      labels
    });
    
    // Percentiles
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    this.metrics.set(key + '_p50', {
      name: name + '_p50',
      type: 'gauge',
      help: `50th percentile for ${name}`,
      value: p50 || 0,
      labels
    });
    
    this.metrics.set(key + '_p95', {
      name: name + '_p95',
      type: 'gauge',
      help: `95th percentile for ${name}`,
      value: p95 || 0,
      labels
    });
    
    this.metrics.set(key + '_p99', {
      name: name + '_p99',
      type: 'gauge',
      help: `99th percentile for ${name}`,
      value: p99 || 0,
      labels
    });
  }

  // Export in Prometheus format
  export(): string {
    const lines: string[] = [];
    const grouped = new Map<string, Metric[]>();
    
    // Group metrics by name
    for (const metric of this.metrics.values()) {
      const baseName = metric.name.replace(/_count|_sum|_p50|_p95|_p99/, '');
      if (!grouped.has(baseName)) {
        grouped.set(baseName, []);
      }
      grouped.get(baseName)!.push(metric);
    }
    
    // Format metrics
    for (const [baseName, metrics] of grouped.entries()) {
      const firstMetric = metrics[0];
      lines.push(`# HELP ${baseName} ${firstMetric.help}`);
      lines.push(`# TYPE ${baseName} ${firstMetric.type}`);
      
      for (const metric of metrics) {
        const labelStr = metric.labels 
          ? '{' + Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
          : '';
        lines.push(`${metric.name}${labelStr} ${metric.value}`);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  }

  // Export as JSON
  exportJSON(): any {
    const result: any = {};
    
    for (const [key, metric] of this.metrics.entries()) {
      result[key] = {
        type: metric.type,
        value: metric.value,
        labels: metric.labels
      };
    }
    
    return result;
  }

  // Save to file
  saveToFile(filepath: string, format: 'prometheus' | 'json' = 'prometheus'): void {
    const content = format === 'prometheus' ? this.export() : JSON.stringify(this.exportJSON(), null, 2);
    fs.writeFileSync(filepath, content);
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  // Reset all metrics
  reset(): void {
    this.metrics.clear();
    this.histograms.clear();
  }
}

// Application-specific metrics
export class DeidentificationMetrics extends PrometheusMetrics {
  // Track file processing
  recordFileProcessed(dataType: string, success: boolean, processingTime: number): void {
    this.incrementCounter('deidentification_files_processed_total', { 
      data_type: dataType,
      status: success ? 'success' : 'failure'
    });
    
    this.observeHistogram('deidentification_processing_duration_ms', processingTime, {
      data_type: dataType
    });
  }

  // Track PHI detection
  recordPHIDetection(dataType: string, phiType: string, count: number): void {
    this.incrementCounter('deidentification_phi_detected_total', {
      data_type: dataType,
      phi_type: phiType
    }, count);
  }

  // Track PHI redaction
  recordPHIRedaction(dataType: string, phiType: string, count: number): void {
    this.incrementCounter('deidentification_phi_redacted_total', {
      data_type: dataType,
      phi_type: phiType
    }, count);
  }

  // Track validation failures
  recordValidationFailure(dataType: string, errorType: string): void {
    this.incrementCounter('deidentification_validation_failures_total', {
      data_type: dataType,
      error_type: errorType
    });
  }

  // Track quality gates
  recordQualityGate(gateName: string, passed: boolean, value: number): void {
    this.setGauge('deidentification_quality_gate_value', value, {
      gate_name: gateName
    });
    
    this.incrementCounter('deidentification_quality_gate_checks_total', {
      gate_name: gateName,
      status: passed ? 'pass' : 'fail'
    });
  }

  // Track API requests
  recordAPIRequest(endpoint: string, method: string, statusCode: number, duration: number): void {
    this.incrementCounter('deidentification_api_requests_total', {
      endpoint,
      method,
      status: String(statusCode)
    });
    
    this.observeHistogram('deidentification_api_request_duration_ms', duration, {
      endpoint,
      method
    });
  }

  // Track memory usage
  recordMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.setGauge('deidentification_memory_heap_used_bytes', usage.heapUsed);
    this.setGauge('deidentification_memory_heap_total_bytes', usage.heapTotal);
    this.setGauge('deidentification_memory_rss_bytes', usage.rss);
  }

  // Track active connections
  setActiveConnections(count: number): void {
    this.setGauge('deidentification_active_connections', count);
  }
}

// Example usage
export async function exampleMetricsUsage() {
  const metrics = new DeidentificationMetrics();

  // Record file processing
  metrics.recordFileProcessed('text', true, 45);
  metrics.recordFileProcessed('fhir', true, 32);
  metrics.recordFileProcessed('dicom', false, 120);

  // Record PHI detection
  metrics.recordPHIDetection('text', 'NAME', 5);
  metrics.recordPHIDetection('text', 'DATE', 3);
  metrics.recordPHIDetection('text', 'PHONE', 2);

  // Record PHI redaction
  metrics.recordPHIRedaction('text', 'NAME', 5);
  metrics.recordPHIRedaction('text', 'DATE', 3);
  metrics.recordPHIRedaction('text', 'PHONE', 2);

  // Record quality gates
  metrics.recordQualityGate('redaction_rate', true, 100);
  metrics.recordQualityGate('file_integrity', true, 100);

  // Record memory usage
  metrics.recordMemoryUsage();

  // Export metrics
  console.log('Prometheus format:');
  console.log(metrics.export());
  
  console.log('\nJSON format:');
  console.log(JSON.stringify(metrics.exportJSON(), null, 2));

  // Save to file
  metrics.saveToFile('/tmp/metrics.prom', 'prometheus');
  metrics.saveToFile('/tmp/metrics.json', 'json');
}
