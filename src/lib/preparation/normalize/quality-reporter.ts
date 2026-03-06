import fs from 'fs/promises';
import path from 'path';

export interface QualityMetrics {
  totalRecords: number;
  recordsProcessed: number;
  recordsFiltered: number;
  deduplicatedCount: number;
  qualityScoreAvg: number;
  qualityScoreMin: number;
  qualityScoreMax: number;
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
   * Generate quality report from normalization results
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
    .metric { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .metric-label { font-weight: bold; color: #666; }
    .metric-value { font-size: 24px; color: #2196F3; }
    .recommendations { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
    .good { color: #4caf50; }
    .warning { color: #ff9800; }
    .error { color: #f44336; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #2196F3; color: white; }
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
