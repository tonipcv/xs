/**
 * Filtered Record Tracking
 * Detailed tracking of records filtered out during data preparation
 */

export type FilterReason =
  | 'empty_content'
  | 'too_short'
  | 'too_long'
  | 'low_quality'
  | 'duplicate'
  | 'near_duplicate'
  | 'pii_detected'
  | 'phi_detected'
  | 'invalid_format'
  | 'missing_required_field'
  | 'encoding_error'
  | 'language_mismatch'
  | 'out_of_domain'
  | 'user_defined';

export interface FilteredRecord {
  recordId: string;
  reason: FilterReason;
  subReason?: string;
  stage: 'normalization' | 'validation' | 'deid' | 'quality' | 'dedup';
  timestamp: Date;
  metadata?: {
    originalLength?: number;
    qualityScore?: number;
    detectedPII?: string[];
    duplicateOf?: string;
    [key: string]: unknown;
  };
  sampleContent?: string; // Truncated sample for debugging
}

export interface FilterReport {
  totalRecords: number;
  filteredCount: number;
  retainedCount: number;
  filterRate: number;
  byReason: Record<FilterReason, {
    count: number;
    percentage: number;
    examples: FilteredRecord[];
  }>;
  byStage: Record<string, {
    count: number;
    filters: FilterReason[];
  }>;
  timeline: Array<{
    timestamp: Date;
    stage: string;
    recordsFiltered: number;
  }>;
  recommendations: string[];
}

/**
 * Filter Tracker - Tracks records filtered out during pipeline processing
 */
export class FilterTracker {
  private filteredRecords: FilteredRecord[] = [];
  private totalRecords: number = 0;
  private stageCounts: Map<string, number> = new Map();

  /**
   * Set total number of records at start
   */
  setTotalRecords(count: number): void {
    this.totalRecords = count;
  }

  /**
   * Track a filtered record with detailed reason
   */
  trackFilter(
    recordId: string,
    reason: FilterReason,
    stage: FilteredRecord['stage'],
    options?: {
      subReason?: string;
      metadata?: FilteredRecord['metadata'];
      sampleContent?: string;
    }
  ): void {
    const record: FilteredRecord = {
      recordId,
      reason,
      subReason: options?.subReason,
      stage,
      timestamp: new Date(),
      metadata: options?.metadata,
      sampleContent: options?.sampleContent
        ? this.truncateSample(options.sampleContent)
        : undefined,
    };

    this.filteredRecords.push(record);
    
    // Update stage count
    const current = this.stageCounts.get(stage) || 0;
    this.stageCounts.set(stage, current + 1);
  }

  /**
   * Track multiple filters at once
   */
  trackFilters(
    records: Array<{
      recordId: string;
      reason: FilterReason;
      options?: {
        subReason?: string;
        metadata?: FilteredRecord['metadata'];
        sampleContent?: string;
      };
    }>,
    stage: FilteredRecord['stage']
  ): void {
    for (const { recordId, reason, options } of records) {
      this.trackFilter(recordId, reason, stage, options);
    }
  }

  /**
   * Get all filtered records
   */
  getFilteredRecords(): FilteredRecord[] {
    return [...this.filteredRecords];
  }

  /**
   * Get filters by reason
   */
  getByReason(reason: FilterReason): FilteredRecord[] {
    return this.filteredRecords.filter((r) => r.reason === reason);
  }

  /**
   * Get filters by stage
   */
  getByStage(stage: string): FilteredRecord[] {
    return this.filteredRecords.filter((r) => r.stage === stage);
  }

  /**
   * Generate comprehensive filter report
   */
  generateReport(): FilterReport {
    const filteredCount = this.filteredRecords.length;
    const retainedCount = this.totalRecords - filteredCount;
    const filterRate = this.totalRecords > 0 ? filteredCount / this.totalRecords : 0;

    // Group by reason
    const byReason = {} as FilterReport['byReason'];
    const reasonCounts = new Map<FilterReason, FilteredRecord[]>();

    for (const record of this.filteredRecords) {
      const existing = reasonCounts.get(record.reason) || [];
      existing.push(record);
      reasonCounts.set(record.reason, existing);
    }

    for (const [reason, records] of reasonCounts) {
      byReason[reason] = {
        count: records.length,
        percentage: this.totalRecords > 0 ? records.length / this.totalRecords : 0,
        examples: records.slice(0, 5), // Keep first 5 examples
      };
    }

    // Group by stage
    const byStage: FilterReport['byStage'] = {};
    for (const [stage, count] of this.stageCounts) {
      const filters = this.filteredRecords
        .filter((r) => r.stage === stage)
        .map((r) => r.reason);
      byStage[stage] = {
        count,
        filters: [...new Set(filters)],
      };
    }

    // Build timeline
    const timeline: FilterReport['timeline'] = [];
    const stageTimestamps = new Map<string, Date>();
    
    for (const record of this.filteredRecords) {
      const key = `${record.stage}_${record.timestamp.toISOString().slice(0, 16)}`;
      if (!stageTimestamps.has(key)) {
        stageTimestamps.set(key, record.timestamp);
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(byReason, filterRate);

    return {
      totalRecords: this.totalRecords,
      filteredCount,
      retainedCount,
      filterRate,
      byReason,
      byStage,
      timeline,
      recommendations,
    };
  }

  /**
   * Export filter data for analysis
   */
  exportData(): {
    summary: {
      totalRecords: number;
      filteredCount: number;
      filterRate: number;
    };
    records: FilteredRecord[];
  } {
    return {
      summary: {
        totalRecords: this.totalRecords,
        filteredCount: this.filteredRecords.length,
        filterRate: this.totalRecords > 0 ? this.filteredRecords.length / this.totalRecords : 0,
      },
      records: this.filteredRecords,
    };
  }

  /**
   * Clear all tracked filters
   */
  clear(): void {
    this.filteredRecords = [];
    this.totalRecords = 0;
    this.stageCounts.clear();
  }

  /**
   * Generate recommendations based on filter analysis
   */
  private generateRecommendations(
    byReason: FilterReport['byReason'],
    filterRate: number
  ): string[] {
    const recommendations: string[] = [];

    // Check filter rate
    if (filterRate > 0.5) {
      recommendations.push(
        'High filter rate detected (>50%). Consider reviewing quality thresholds or data source.'
      );
    }

    // Check specific reasons
    if (byReason.duplicate?.count > this.totalRecords * 0.1) {
      recommendations.push(
        'High duplication rate detected. Consider improving deduplication strategy or data collection.'
      );
    }

    if (byReason.low_quality?.count > this.totalRecords * 0.1) {
      recommendations.push(
        'Many records filtered due to low quality. Consider lowering quality threshold or improving data cleaning.'
      );
    }

    if (byReason.pii_detected?.count > 0) {
      recommendations.push(
        'PII detected in some records. Ensure de-identification pipeline is properly configured.'
      );
    }

    if (byReason.invalid_format?.count > this.totalRecords * 0.05) {
      recommendations.push(
        'High rate of format errors. Validate data format before ingestion.'
      );
    }

    return recommendations;
  }

  /**
   * Truncate sample content for storage
   */
  private truncateSample(content: string, maxLength: number = 200): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }
}

/**
 * Integration helper for QualityGate
 */
export function createFilterReasonFromQualityIssue(
  issue: string
): FilterReason {
  const issueMap: Record<string, FilterReason> = {
    'empty': 'empty_content',
    'too_short': 'too_short',
    'too_long': 'too_long',
    'low_alpha_ratio': 'low_quality',
    'encoding_error': 'encoding_error',
    'language_mismatch': 'language_mismatch',
    'missing_field': 'missing_required_field',
  };

  return issueMap[issue] || 'user_defined';
}
