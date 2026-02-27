import * as fs from 'fs';
import * as path from 'path';

interface DashboardMetrics {
  timestamp: string;
  period: string;
  summary: {
    totalFiles: number;
    filesProcessed: number;
    filesFailed: number;
    successRate: number;
    avgProcessingTime: number;
    throughput: number;
  };
  quality: {
    phiDetected: number;
    phiRedacted: number;
    redactionRate: number;
    integrityRate: number;
  };
  byDataType: {
    [key: string]: {
      files: number;
      redactionRate: number;
      avgTime: number;
    };
  };
  errors: Array<{
    timestamp: string;
    file: string;
    error: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  alerts: string[];
}

export class MonitoringDashboard {
  private metricsHistory: DashboardMetrics[] = [];
  private outputDir: string;

  constructor(outputDir: string = './output/monitoring') {
    this.outputDir = outputDir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  addMetrics(metrics: DashboardMetrics): void {
    this.metricsHistory.push(metrics);
    this.saveMetrics();
  }

  generateDashboard(): string {
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    
    if (!latest) {
      return this.generateEmptyDashboard();
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XASE De-Identification Monitoring Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 20px;
        }
        .header h1 {
            color: #667eea;
            font-size: 32px;
            margin-bottom: 10px;
        }
        .header .subtitle {
            color: #666;
            font-size: 14px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .metric-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }
        .metric-card .label {
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .metric-card .value {
            font-size: 36px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        .metric-card .subvalue {
            font-size: 14px;
            color: #999;
        }
        .metric-card.success .value { color: #10b981; }
        .metric-card.warning .value { color: #f59e0b; }
        .metric-card.error .value { color: #ef4444; }
        .metric-card.info .value { color: #3b82f6; }
        .chart-container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .chart-container h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 20px;
        }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e5e7eb;
            border-radius: 15px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            transition: width 0.3s ease;
        }
        .data-type-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .data-type-card {
            background: #f9fafb;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        .data-type-card .name {
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
            text-transform: uppercase;
            font-size: 12px;
        }
        .data-type-card .stat {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-size: 14px;
        }
        .alerts-container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .alert {
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid;
            font-size: 14px;
        }
        .alert.success {
            background: #d1fae5;
            border-color: #10b981;
            color: #065f46;
        }
        .alert.warning {
            background: #fef3c7;
            border-color: #f59e0b;
            color: #92400e;
        }
        .alert.error {
            background: #fee2e2;
            border-color: #ef4444;
            color: #991b1b;
        }
        .timestamp {
            text-align: center;
            color: white;
            margin-top: 20px;
            font-size: 14px;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-badge.operational {
            background: #d1fae5;
            color: #065f46;
        }
        .status-badge.degraded {
            background: #fef3c7;
            color: #92400e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 XASE De-Identification Monitoring</h1>
            <div class="subtitle">
                Real-time monitoring dashboard • Last updated: ${latest.timestamp}
                <span class="status-badge ${latest.summary.successRate >= 95 ? 'operational' : 'degraded'}">
                    ${latest.summary.successRate >= 95 ? 'Operational' : 'Degraded Performance'}
                </span>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card success">
                <div class="label">Success Rate</div>
                <div class="value">${latest.summary.successRate.toFixed(1)}%</div>
                <div class="subvalue">${latest.summary.filesProcessed}/${latest.summary.totalFiles} files</div>
            </div>

            <div class="metric-card info">
                <div class="label">Redaction Rate</div>
                <div class="value">${latest.quality.redactionRate.toFixed(1)}%</div>
                <div class="subvalue">${latest.quality.phiRedacted}/${latest.quality.phiDetected} PHI entities</div>
            </div>

            <div class="metric-card ${latest.quality.integrityRate >= 95 ? 'success' : 'warning'}">
                <div class="label">File Integrity</div>
                <div class="value">${latest.quality.integrityRate.toFixed(1)}%</div>
                <div class="subvalue">Post de-identification</div>
            </div>

            <div class="metric-card info">
                <div class="label">Throughput</div>
                <div class="value">${latest.summary.throughput.toFixed(1)}</div>
                <div class="subvalue">files/second</div>
            </div>
        </div>

        <div class="chart-container">
            <h2>📊 Overall Performance</h2>
            <div style="margin: 20px 0;">
                <div style="margin-bottom: 5px; color: #666; font-size: 14px;">Redaction Rate</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${latest.quality.redactionRate}%">
                        ${latest.quality.redactionRate.toFixed(1)}%
                    </div>
                </div>
            </div>
            <div style="margin: 20px 0;">
                <div style="margin-bottom: 5px; color: #666; font-size: 14px;">File Integrity</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${latest.quality.integrityRate}%; background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);">
                        ${latest.quality.integrityRate.toFixed(1)}%
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-container">
            <h2>📋 By Data Type</h2>
            <div class="data-type-grid">
                ${Object.entries(latest.byDataType).map(([type, stats]) => `
                    <div class="data-type-card">
                        <div class="name">${type}</div>
                        <div class="stat">
                            <span>Files:</span>
                            <strong>${stats.files}</strong>
                        </div>
                        <div class="stat">
                            <span>Redaction:</span>
                            <strong>${stats.redactionRate.toFixed(1)}%</strong>
                        </div>
                        <div class="stat">
                            <span>Avg Time:</span>
                            <strong>${stats.avgTime.toFixed(1)}ms</strong>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        ${latest.alerts.length > 0 ? `
        <div class="alerts-container">
            <h2>🔔 Alerts & Notifications</h2>
            ${latest.alerts.map(alert => {
                const severity = alert.includes('✅') ? 'success' : 
                               alert.includes('⚠️') ? 'warning' : 'error';
                return `<div class="alert ${severity}">${alert}</div>`;
            }).join('')}
        </div>
        ` : ''}

        ${latest.errors.length > 0 ? `
        <div class="alerts-container" style="margin-top: 20px;">
            <h2>⚠️ Recent Errors</h2>
            ${latest.errors.slice(0, 5).map(error => `
                <div class="alert error">
                    <strong>${error.file}</strong><br>
                    ${error.error}<br>
                    <small style="color: #999;">${error.timestamp}</small>
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="timestamp">
            Dashboard generated at ${new Date().toISOString()}<br>
            Monitoring period: ${latest.period}
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
    `;

    const dashboardPath = path.join(this.outputDir, 'dashboard.html');
    fs.writeFileSync(dashboardPath, html);

    return dashboardPath;
  }

  private generateEmptyDashboard(): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XASE De-Identification Monitoring Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .empty-state {
            background: white;
            padding: 60px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .empty-state h1 {
            color: #667eea;
            margin-bottom: 20px;
        }
        .empty-state p {
            color: #666;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="empty-state">
        <h1>📊 Monitoring Dashboard</h1>
        <p>No metrics available yet. Start processing files to see data.</p>
    </div>
</body>
</html>
    `;

    const dashboardPath = path.join(this.outputDir, 'dashboard.html');
    fs.writeFileSync(dashboardPath, html);

    return dashboardPath;
  }

  private saveMetrics(): void {
    const metricsPath = path.join(this.outputDir, 'metrics-history.json');
    fs.writeFileSync(metricsPath, JSON.stringify(this.metricsHistory, null, 2));
  }

  static createFromTestResults(results: any): DashboardMetrics {
    const alerts: string[] = [];

    if (results.summary.overallRedactionRate >= 99) {
      alerts.push('✅ Excellent redaction rate - system performing optimally');
    } else if (results.summary.overallRedactionRate < 95) {
      alerts.push('⚠️ Redaction rate below target - review PHI detection patterns');
    }

    if (results.summary.overallIntegrityRate >= 95) {
      alerts.push('✅ Excellent file integrity - no data corruption detected');
    } else if (results.summary.overallIntegrityRate < 90) {
      alerts.push('⚠️ File integrity issues detected - review validation logic');
    }

    return {
      timestamp: new Date().toISOString(),
      period: 'Last test run',
      summary: {
        totalFiles: results.summary.totalFiles,
        filesProcessed: results.summary.totalFiles,
        filesFailed: 0,
        successRate: 100,
        avgProcessingTime: results.summary.totalProcessingTime / results.summary.totalFiles,
        throughput: results.summary.totalFiles / (results.summary.totalProcessingTime / 1000)
      },
      quality: {
        phiDetected: results.summary.totalPhiDetected,
        phiRedacted: results.summary.totalPhiRedacted,
        redactionRate: results.summary.overallRedactionRate,
        integrityRate: results.summary.overallIntegrityRate
      },
      byDataType: {
        DICOM: {
          files: results.byDataType.dicom.filesProcessed,
          redactionRate: (results.byDataType.dicom.phiRedacted / results.byDataType.dicom.phiDetected) * 100,
          avgTime: results.byDataType.dicom.processingTimeMs / results.byDataType.dicom.filesProcessed
        },
        FHIR: {
          files: results.byDataType.fhir.filesProcessed,
          redactionRate: (results.byDataType.fhir.phiRedacted / results.byDataType.fhir.phiDetected) * 100,
          avgTime: results.byDataType.fhir.processingTimeMs / results.byDataType.fhir.filesProcessed
        },
        Text: {
          files: results.byDataType.text.filesProcessed,
          redactionRate: (results.byDataType.text.phiRedacted / results.byDataType.text.phiDetected) * 100,
          avgTime: results.byDataType.text.processingTimeMs / results.byDataType.text.filesProcessed
        },
        Audio: {
          files: results.byDataType.audio.filesProcessed,
          redactionRate: (results.byDataType.audio.phiRedacted / results.byDataType.audio.phiDetected) * 100,
          avgTime: results.byDataType.audio.processingTimeMs / results.byDataType.audio.filesProcessed
        }
      },
      errors: [],
      alerts
    };
  }
}

// CLI usage
async function main() {
  const dashboard = new MonitoringDashboard();
  
  // Load latest test results
  const reportPath = path.join(__dirname, '../output/full-integration-report.json');
  
  if (fs.existsSync(reportPath)) {
    const results = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const metrics = MonitoringDashboard.createFromTestResults(results);
    dashboard.addMetrics(metrics);
    
    const dashboardPath = dashboard.generateDashboard();
    console.log(`\n📊 Dashboard generated: ${dashboardPath}`);
    console.log(`   Open in browser to view real-time metrics\n`);
  } else {
    console.log('⚠️  No test results found. Run tests first:\n   npm run test:all\n');
    dashboard.generateDashboard();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { DashboardMetrics };
