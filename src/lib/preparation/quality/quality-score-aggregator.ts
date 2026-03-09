/**
 * Quality Score Aggregator and Histogram Generator
 * Aggregates quality metrics and generates distribution histograms
 */

export interface QualityHistogram {
  bins: number[];
  binEdges: number[];
  binLabels: string[];
}

export interface QualityDistribution {
  score: QualityHistogram;
  snr?: QualityHistogram;
  resolution?: QualityHistogram;
  duration?: QualityHistogram;
}

export interface AggregatedQualityMetrics {
  // Overall statistics
  totalRecords: number;
  passedCount: number;
  failedCount: number;
  passRate: number;

  // Score statistics
  meanScore: number;
  medianScore: number;
  stdDevScore: number;
  minScore: number;
  maxScore: number;

  // Percentiles
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };

  // Distribution histograms
  histograms: QualityDistribution;

  // Quality tiers
  tiers: {
    excellent: number;  // >= 0.9
    good: number;       // 0.8 - 0.9
    acceptable: number; // 0.7 - 0.8
    poor: number;       // 0.5 - 0.7
    bad: number;        // < 0.5
  };

  // Time series (if timestamps available)
  timeSeries?: Array<{
    timestamp: Date;
    avgScore: number;
    count: number;
  }>;
}

export interface QualityScoreRecord {
  id: string;
  score: number;
  snr?: number;
  resolution?: number;
  duration?: number;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Quality Score Aggregator
 */
export class QualityScoreAggregator {
  private records: QualityScoreRecord[] = [];

  /**
   * Add a quality score record
   */
  addRecord(record: QualityScoreRecord): void {
    this.records.push(record);
  }

  /**
   * Add multiple records
   */
  addRecords(records: QualityScoreRecord[]): void {
    this.records.push(...records);
  }

  /**
   * Calculate mean
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate median
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Generate histogram
   */
  private generateHistogram(values: number[], numBins: number = 10): QualityHistogram {
    if (values.length === 0) {
      return { bins: [], binEdges: [], binLabels: [] };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / numBins || 1;

    const binEdges: number[] = [];
    for (let i = 0; i <= numBins; i++) {
      binEdges.push(min + i * binWidth);
    }

    const bins = new Array(numBins).fill(0);
    for (const value of values) {
      const binIndex = Math.min(
        Math.floor((value - min) / binWidth),
        numBins - 1
      );
      bins[binIndex]++;
    }

    const binLabels = binEdges.slice(0, -1).map((edge, i) => {
      const nextEdge = binEdges[i + 1];
      return `${edge.toFixed(2)}-${nextEdge.toFixed(2)}`;
    });

    return { bins, binEdges, binLabels };
  }

  /**
   * Generate aggregated quality metrics
   */
  generateReport(threshold: number = 0.7): AggregatedQualityMetrics {
    const scores = this.records.map((r) => r.score);
    const snrValues = this.records.map((r) => r.snr).filter((v): v is number => v !== undefined);
    const resolutionValues = this.records.map((r) => r.resolution).filter((v): v is number => v !== undefined);
    const durationValues = this.records.map((r) => r.duration).filter((v): v is number => v !== undefined);

    const meanScore = this.calculateMean(scores);
    const medianScore = this.calculateMedian(scores);
    const stdDevScore = this.calculateStdDev(scores, meanScore);

    // Count by quality tier
    const tiers = {
      excellent: scores.filter((s) => s >= 0.9).length,
      good: scores.filter((s) => s >= 0.8 && s < 0.9).length,
      acceptable: scores.filter((s) => s >= 0.7 && s < 0.8).length,
      poor: scores.filter((s) => s >= 0.5 && s < 0.7).length,
      bad: scores.filter((s) => s < 0.5).length,
    };

    const passedCount = scores.filter((s) => s >= threshold).length;
    const failedCount = scores.length - passedCount;

    // Generate histograms
    const histograms: QualityDistribution = {
      score: this.generateHistogram(scores, 10),
    };

    if (snrValues.length > 0) {
      histograms.snr = this.generateHistogram(snrValues, 10);
    }

    if (resolutionValues.length > 0) {
      histograms.resolution = this.generateHistogram(resolutionValues, 10);
    }

    if (durationValues.length > 0) {
      histograms.duration = this.generateHistogram(durationValues, 10);
    }

    // Build time series if timestamps available
    let timeSeries: AggregatedQualityMetrics['timeSeries'];
    const recordsWithTimestamp = this.records.filter((r) => r.timestamp);
    
    if (recordsWithTimestamp.length > 0) {
      // Group by hour
      const hourlyGroups = new Map<string, QualityScoreRecord[]>();
      
      for (const record of recordsWithTimestamp) {
        const hour = record.timestamp!.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        const group = hourlyGroups.get(hour) || [];
        group.push(record);
        hourlyGroups.set(hour, group);
      }

      timeSeries = Array.from(hourlyGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hour, group]) => ({
          timestamp: new Date(hour + ':00:00'),
          avgScore: this.calculateMean(group.map((r) => r.score)),
          count: group.length,
        }));
    }

    return {
      totalRecords: this.records.length,
      passedCount,
      failedCount,
      passRate: this.records.length > 0 ? passedCount / this.records.length : 0,
      meanScore,
      medianScore,
      stdDevScore,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      percentiles: {
        p5: this.calculatePercentile(scores, 5),
        p10: this.calculatePercentile(scores, 10),
        p25: this.calculatePercentile(scores, 25),
        p50: this.calculatePercentile(scores, 50),
        p75: this.calculatePercentile(scores, 75),
        p90: this.calculatePercentile(scores, 90),
        p95: this.calculatePercentile(scores, 95),
      },
      histograms,
      tiers,
      timeSeries,
    };
  }

  /**
   * Export histogram as CSV
   */
  exportHistogramCSV(histogram: QualityHistogram): string {
    const lines = ['bin_label,lower_edge,upper_edge,count'];
    
    for (let i = 0; i < histogram.bins.length; i++) {
      const label = histogram.binLabels[i];
      const lower = histogram.binEdges[i];
      const upper = histogram.binEdges[i + 1];
      const count = histogram.bins[i];
      lines.push(`${label},${lower},${upper},${count}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate ASCII visualization of histogram
   */
  visualizeHistogram(histogram: QualityHistogram, width: number = 50): string {
    const maxCount = Math.max(...histogram.bins);
    const lines: string[] = [];

    for (let i = 0; i < histogram.bins.length; i++) {
      const count = histogram.bins[i];
      const barLength = maxCount > 0 ? Math.round((count / maxCount) * width) : 0;
      const bar = '█'.repeat(barLength);
      const label = histogram.binLabels[i].padStart(15);
      lines.push(`${label} | ${bar} ${count}`);
    }

    return lines.join('\n');
  }

  /**
   * Compare two quality distributions
   */
  compareDistributions(
    before: AggregatedQualityMetrics,
    after: AggregatedQualityMetrics
  ): {
    meanDelta: number;
    medianDelta: number;
    passRateDelta: number;
    improvement: boolean;
  } {
    const meanDelta = after.meanScore - before.meanScore;
    const medianDelta = after.medianScore - before.medianScore;
    const passRateDelta = after.passRate - before.passRate;

    return {
      meanDelta,
      medianDelta,
      passRateDelta,
      improvement: meanDelta > 0 || passRateDelta > 0,
    };
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Get record count
   */
  getCount(): number {
    return this.records.length;
  }
}

/**
 * Quality Score Builder - Helper for building quality scores from multiple metrics
 */
export class QualityScoreBuilder {
  private metrics: Map<string, number> = new Map();
  private weights: Map<string, number> = new Map();

  /**
   * Add a metric with weight
   */
  addMetric(name: string, value: number, weight: number = 1.0): void {
    this.metrics.set(name, value);
    this.weights.set(name, weight);
  }

  /**
   * Calculate weighted quality score
   */
  calculateScore(): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [name, value] of this.metrics) {
      const weight = this.weights.get(name) || 1.0;
      weightedSum += value * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get detailed breakdown
   */
  getBreakdown(): Array<{
    metric: string;
    value: number;
    weight: number;
    contribution: number;
  }> {
    const totalWeight = Array.from(this.weights.values()).reduce((sum, w) => sum + w, 0);
    
    return Array.from(this.metrics.entries()).map(([name, value]) => {
      const weight = this.weights.get(name) || 1.0;
      return {
        metric: name,
        value,
        weight,
        contribution: totalWeight > 0 ? (value * weight) / totalWeight : 0,
      };
    });
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.weights.clear();
  }
}
