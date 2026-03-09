import fs from 'fs/promises';
import path from 'path';

export interface QualityHistogram {
  buckets: Array<{
    range: string;
    min: number;
    max: number;
    count: number;
    percentage: number;
  }>;
  bucketSize: number;
}

export interface QualityScoreDistribution {
  histogram: QualityHistogram;
  percentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  byRange: {
    excellent: number; // 0.9 - 1.0
    good: number;      // 0.7 - 0.9
    acceptable: number; // 0.5 - 0.7
    poor: number;      // 0.3 - 0.5
    critical: number;  // 0.0 - 0.3
  };
}

export interface QualityMetrics {
  totalRecords: number;
  recordsProcessed: number;
  recordsFiltered: number;
  deduplicatedCount: number;
  qualityScoreAvg: number;
  qualityScoreMin: number;
  qualityScoreMax: number;
  qualityScoreDistribution?: QualityScoreDistribution;
  filterReasons: Record<string, number>;
}

export interface QualityReport {
  version: string;
  datasetId: string;
  jobId: string;
  timestamp: string;
  metrics: QualityMetrics;
  config: {
    deduplicate: boolean;
    quality_threshold: number;
  };
  recommendations: string[];
}

export class QualityReporter {
  /**
   * Calculate quality score distribution from individual scores
   */
  calculateScoreDistribution(scores: number[]): QualityScoreDistribution {
    if (scores.length === 0) {
      return {
        histogram: { buckets: [], bucketSize: 0.1 },
        percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
        byRange: { excellent: 0, good: 0, acceptable: 0, poor: 0, critical: 0 },
      };
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const total = scores.length;

    // Calculate percentiles
    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * total) - 1;
      return sorted[Math.max(0, Math.min(index, total - 1))];
    };

    // Build histogram with 10 buckets (0.0-0.1, 0.1-0.2, etc.)
    const bucketSize = 0.1;
    const bucketCount = 10;
    const buckets: QualityHistogram['buckets'] = [];

    for (let i = 0; i < bucketCount; i++) {
      const min = i * bucketSize;
      const max = (i + 1) * bucketSize;
      const count = scores.filter(s => s >= min && s < max).length;
      
      // Handle edge case for last bucket (include 1.0)
      const actualMax = i === bucketCount - 1 ? 1.0 : max;
      const actualCount = i === bucketCount - 1 
        ? scores.filter(s => s >= min && s <= actualMax).length
        : count;

      buckets.push({
        range: `${min.toFixed(1)}-${actualMax.toFixed(1)}`,
        min,
        max: actualMax,
        count: actualCount,
        percentage: (actualCount / total) * 100,
      });
    }

    // Calculate by quality range
    const byRange = {
      excellent: scores.filter(s => s >= 0.9).length,
      good: scores.filter(s => s >= 0.7 && s < 0.9).length,
      acceptable: scores.filter(s => s >= 0.5 && s < 0.7).length,
      poor: scores.filter(s => s >= 0.3 && s < 0.5).length,
      critical: scores.filter(s => s < 0.3).length,
    };

    return {
      histogram: { buckets, bucketSize },
      percentiles: {
        p50: percentile(50),
        p75: percentile(75),
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
      },
      byRange,
    };
  }

  /**
   * Generate quality report from normalization results with score distribution
   */
  generateReport(
    datasetId: string,
    jobId: string,
    metrics: QualityMetrics,
    config: { deduplicate: boolean; quality_threshold: number }
  ): QualityReport {
    const recommendations = this.generateRecommendations(metrics, config);

    return {
      version: '1.0',
      datasetId,
      jobId,
      timestamp: new Date().toISOString(),
      metrics,
      config,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on quality metrics
   */
  private generateRecommendations(
    metrics: QualityMetrics,
    config: { deduplicate: boolean; quality_threshold: number }
  ): string[] {
    const recommendations: string[] = [];

    const filterRate = metrics.recordsFiltered / metrics.totalRecords;

    if (filterRate > 0.5) {
      recommendations.push(
        `High filter rate (${(filterRate * 100).toFixed(1)}%). Consider lowering quality_threshold from ${config.quality_threshold}.`
      );
    }

    if (filterRate < 0.05 && config.quality_threshold < 0.8) {
      recommendations.push(
        `Low filter rate (${(filterRate * 100).toFixed(1)}%). Consider increasing quality_threshold for better data quality.`
      );
    }

    if (metrics.deduplicatedCount > metrics.totalRecords * 0.2) {
      recommendations.push(
        `High duplication rate (${((metrics.deduplicatedCount / metrics.totalRecords) * 100).toFixed(1)}%). Review data sources for duplicate ingestion.`
      );
    }

    if (metrics.qualityScoreAvg < 0.6) {
      recommendations.push(
        `Low average quality score (${metrics.qualityScoreAvg.toFixed(2)}). Review data sources and consider additional preprocessing.`
      );
    }

    if (metrics.recordsProcessed < 100) {
      recommendations.push(
        'Small dataset size. Consider collecting more data for better model performance.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Dataset quality is good. No major issues detected.');
    }

    return recommendations;
  }

  /**
   * Save report to JSON file
   */
  async saveReport(report: QualityReport, outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, 'quality_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  /**
   * Generate HTML report section for quality distribution
   */
  private generateDistributionHTML(distribution?: QualityScoreDistribution): string {
    if (!distribution) {
      return '<p>No quality score distribution available.</p>';
    }

    const maxCount = Math.max(...distribution.histogram.buckets.map(b => b.count));
    
    const histogramBars = distribution.histogram.buckets.map(bucket => {
      const height = maxCount > 0 ? (bucket.count / maxCount) * 200 : 0;
      const colorClass = bucket.min >= 0.9 ? 'good' : 
                        bucket.min >= 0.7 ? 'acceptable' : 
                        bucket.min >= 0.5 ? 'warning' : 'error';
      return `
        <div class="histogram-bar" style="height: ${height}px;">
          <div class="bar ${colorClass}" title="${bucket.range}: ${bucket.count} (${bucket.percentage.toFixed(1)}%)"></div>
          <div class="bar-label">${bucket.range}</div>
          <div class="bar-count">${bucket.count}</div>
        </div>
      `;
    }).join('');

    return `
      <h2>Quality Score Distribution</h2>
      
      <h3>Percentiles</h3>
      <div class="percentiles">
        <div class="percentile">
          <span class="label">P50 (Median)</span>
          <span class="value">${distribution.percentiles.p50.toFixed(3)}</span>
        </div>
        <div class="percentile">
          <span class="label">P75</span>
          <span class="value">${distribution.percentiles.p75.toFixed(3)}</span>
        </div>
        <div class="percentile">
          <span class="label">P90</span>
          <span class="value">${distribution.percentiles.p90.toFixed(3)}</span>
        </div>
        <div class="percentile">
          <span class="label">P95</span>
          <span class="value">${distribution.percentiles.p95.toFixed(3)}</span>
        </div>
        <div class="percentile">
          <span class="label">P99</span>
          <span class="value">${distribution.percentiles.p99.toFixed(3)}</span>
        </div>
      </div>

      <h3>Quality Ranges</h3>
      <table>
        <tr>
          <th>Range</th>
          <th>Score</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
        <tr class="good">
          <td>Excellent</td>
          <td>0.9 - 1.0</td>
          <td>${distribution.byRange.excellent}</td>
          <td>${((distribution.byRange.excellent / distribution.histogram.buckets.reduce((sum, b) => sum + b.count, 0)) * 100).toFixed(1)}%</td>
        </tr>
        <tr class="acceptable">
          <td>Good</td>
          <td>0.7 - 0.9</td>
          <td>${distribution.byRange.good}</td>
          <td>${((distribution.byRange.good / distribution.histogram.buckets.reduce((sum, b) => sum + b.count, 0)) * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td>Acceptable</td>
          <td>0.5 - 0.7</td>
          <td>${distribution.byRange.acceptable}</td>
          <td>${((distribution.byRange.acceptable / distribution.histogram.buckets.reduce((sum, b) => sum + b.count, 0)) * 100).toFixed(1)}%</td>
        </tr>
        <tr class="warning">
          <td>Poor</td>
          <td>0.3 - 0.5</td>
          <td>${distribution.byRange.poor}</td>
          <td>${((distribution.byRange.poor / distribution.histogram.buckets.reduce((sum, b) => sum + b.count, 0)) * 100).toFixed(1)}%</td>
        </tr>
        <tr class="error">
          <td>Critical</td>
          <td>0.0 - 0.3</td>
          <td>${distribution.byRange.critical}</td>
          <td>${((distribution.byRange.critical / distribution.histogram.buckets.reduce((sum, b) => sum + b.count, 0)) * 100).toFixed(1)}%</td>
        </tr>
      </table>

      <h3>Score Histogram</h3>
      <div class="histogram">
        ${histogramBars}
      </div>
    `;
  }

  /**
   * Generate HTML report (optional)
   */
  generateHTML(report: QualityReport): string {
    const filterRate = ((report.metrics.recordsFiltered / report.metrics.totalRecords) * 100).toFixed(1);
    const deduplicationRate = ((report.metrics.deduplicatedCount / report.metrics.totalRecords) * 100).toFixed(1);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quality Report - ${report.jobId}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #2196F3; border-bottom: 2px solid #2196F3; padding-bottom: 8px; margin-top: 30px; }
    h3 { color: #666; margin-top: 20px; }
    .metric { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .metric-label { font-weight: bold; color: #666; }
    .metric-value { font-size: 24px; color: #2196F3; }
    .recommendations { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
    .good { color: #4caf50; }
    .acceptable { color: #8bc34a; }
    .warning { color: #ff9800; }
    .error { color: #f44336; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #2196F3; color: white; }
    /* Histogram styles */
    .histogram { display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 250px; padding: 20px; background: #f9f9f9; border-radius: 8px; margin: 20px 0; }
    .histogram-bar { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 40px; }
    .bar { width: 100%; min-height: 2px; border-radius: 4px 4px 0 0; transition: opacity 0.2s; }
    .bar:hover { opacity: 0.8; }
    .bar.good { background: #4caf50; }
    .bar.acceptable { background: #8bc34a; }
    .bar.warning { background: #ff9800; }
    .bar.error { background: #f44336; }
    .bar-label { font-size: 10px; color: #666; margin-top: 4px; text-align: center; transform: rotate(-45deg); transform-origin: center; white-space: nowrap; }
    .bar-count { font-size: 11px; color: #999; margin-top: 2px; }
    /* Percentiles */
    .percentiles { display: flex; gap: 20px; flex-wrap: wrap; margin: 20px 0; }
    .percentile { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; flex: 1; min-width: 100px; }
    .percentile .label { display: block; font-size: 12px; color: #666; margin-bottom: 5px; }
    .percentile .value { display: block; font-size: 20px; font-weight: bold; color: #2196F3; }
  </style>
</head>
<body>
  <h1>Quality Report</h1>
  <p><strong>Dataset:</strong> ${report.datasetId}</p>
  <p><strong>Job:</strong> ${report.jobId}</p>
  <p><strong>Generated:</strong> ${new Date(report.timestamp).toLocaleString()}</p>

  <h2>Summary Metrics</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>Total Records</td>
      <td>${report.metrics.totalRecords.toLocaleString()}</td>
    </tr>
    <tr>
      <td>Records Processed</td>
      <td class="${report.metrics.recordsProcessed > 0 ? 'good' : 'error'}">${report.metrics.recordsProcessed.toLocaleString()}</td>
    </tr>
    <tr>
      <td>Records Filtered</td>
      <td class="${parseFloat(filterRate) > 50 ? 'warning' : 'good'}">${report.metrics.recordsFiltered.toLocaleString()} (${filterRate}%)</td>
    </tr>
    <tr>
      <td>Duplicates Removed</td>
      <td class="${parseFloat(deduplicationRate) > 20 ? 'warning' : 'good'}">${report.metrics.deduplicatedCount.toLocaleString()} (${deduplicationRate}%)</td>
    </tr>
    <tr>
      <td>Avg Quality Score</td>
      <td class="${report.metrics.qualityScoreAvg >= 0.7 ? 'good' : report.metrics.qualityScoreAvg >= 0.5 ? 'warning' : 'error'}">${report.metrics.qualityScoreAvg.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Quality Score Range</td>
      <td>${report.metrics.qualityScoreMin.toFixed(2)} - ${report.metrics.qualityScoreMax.toFixed(2)}</td>
    </tr>
  </table>

  ${this.generateDistributionHTML(report.metrics.qualityScoreDistribution)}

  <h2>Configuration</h2>
  <div class="metric">
    <div class="metric-label">Deduplication</div>
    <div>${report.config.deduplicate ? 'Enabled' : 'Disabled'}</div>
  </div>
  <div class="metric">
    <div class="metric-label">Quality Threshold</div>
    <div>${report.config.quality_threshold}</div>
  </div>

  <h2>Recommendations</h2>
  <div class="recommendations">
    <ul>
      ${report.recommendations.map(r => `<li>${r}</li>`).join('\n      ')}
    </ul>
  </div>

  <hr>
  <p style="color: #666; font-size: 12px;">Generated by XASE Data Preparation Pipeline v${report.version}</p>
</body>
</html>`;
  }

  /**
   * Save HTML report
   */
  async saveHTMLReport(report: QualityReport, outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const html = this.generateHTML(report);
    const reportPath = path.join(outputDir, 'quality_report.html');
    await fs.writeFile(reportPath, html);
    return reportPath;
  }
}
