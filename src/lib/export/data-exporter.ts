/**
 * DATA EXPORTER
 * Export data in multiple formats (CSV, JSON, Parquet)
 */

import { Readable } from 'stream'

export type ExportFormat = 'csv' | 'json' | 'jsonl' | 'parquet'

export interface ExportOptions {
  format: ExportFormat
  fields?: string[]
  filter?: any
  limit?: number
  compress?: boolean
  includeMetadata?: boolean
}

export interface ExportResult {
  exportId: string
  format: ExportFormat
  recordCount: number
  sizeBytes: number
  downloadUrl?: string
  expiresAt: Date
}

export class DataExporter {
  /**
   * Export to CSV
   */
  static async exportToCSV(
    data: any[],
    fields?: string[]
  ): Promise<string> {
    if (data.length === 0) {
      return ''
    }

    // Determine fields
    const exportFields = fields || Object.keys(data[0])

    // Create header
    const header = exportFields.join(',')

    // Create rows
    const rows = data.map(record => {
      return exportFields.map(field => {
        const value = record[field]
        
        // Handle different types
        if (value === null || value === undefined) {
          return ''
        }
        
        if (typeof value === 'string') {
          // Escape quotes and wrap in quotes if contains comma
          const escaped = value.replace(/"/g, '""')
          return value.includes(',') || value.includes('"') || value.includes('\n')
            ? `"${escaped}"`
            : escaped
        }
        
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`
        }
        
        return String(value)
      }).join(',')
    })

    return [header, ...rows].join('\n')
  }

  /**
   * Export to JSON
   */
  static async exportToJSON(
    data: any[],
    pretty: boolean = false
  ): Promise<string> {
    return JSON.stringify(data, null, pretty ? 2 : 0)
  }

  /**
   * Export to JSONL (JSON Lines)
   */
  static async exportToJSONL(data: any[]): Promise<string> {
    return data.map(record => JSON.stringify(record)).join('\n')
  }

  /**
   * Create streaming export
   */
  static createStreamingExport(
    dataGenerator: AsyncGenerator<any[], void, unknown>,
    format: ExportFormat
  ): Readable {
    const stream = new Readable({
      async read() {
        try {
          const { value, done } = await dataGenerator.next()
          
          if (done) {
            this.push(null)
            return
          }

          let chunk: string
          
          switch (format) {
            case 'csv':
              chunk = await DataExporter.exportToCSV(value)
              break
            case 'json':
              chunk = await DataExporter.exportToJSON(value)
              break
            case 'jsonl':
              chunk = await DataExporter.exportToJSONL(value)
              break
            default:
              chunk = JSON.stringify(value)
          }

          this.push(chunk + '\n')
        } catch (error) {
          this.destroy(error as Error)
        }
      },
    })

    return stream
  }

  /**
   * Export with pagination
   */
  static async *paginatedExport(
    fetchFn: (page: number, limit: number) => Promise<any[]>,
    pageSize: number = 1000
  ): AsyncGenerator<any[], void, unknown> {
    let page = 1
    let hasMore = true

    while (hasMore) {
      const data = await fetchFn(page, pageSize)
      
      if (data.length === 0) {
        hasMore = false
      } else {
        yield data
        page++
        hasMore = data.length === pageSize
      }
    }
  }

  /**
   * Compress export data
   */
  static async compress(data: string): Promise<Buffer> {
    const { gzip } = await import('zlib')
    const { promisify } = await import('util')
    const gzipAsync = promisify(gzip)
    
    return gzipAsync(Buffer.from(data))
  }

  /**
   * Generate export metadata
   */
  static generateMetadata(
    recordCount: number,
    fields: string[],
    format: ExportFormat
  ): {
    version: string
    exportedAt: string
    recordCount: number
    fields: string[]
    format: ExportFormat
  } {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      recordCount,
      fields,
      format,
    }
  }

  /**
   * Export with metadata
   */
  static async exportWithMetadata(
    data: any[],
    format: ExportFormat,
    fields?: string[]
  ): Promise<{
    metadata: any
    data: string
  }> {
    const exportFields = fields || (data.length > 0 ? Object.keys(data[0]) : [])
    
    let exportData: string
    
    switch (format) {
      case 'csv':
        exportData = await this.exportToCSV(data, exportFields)
        break
      case 'json':
        exportData = await this.exportToJSON(data, true)
        break
      case 'jsonl':
        exportData = await this.exportToJSONL(data)
        break
      default:
        exportData = await this.exportToJSON(data)
    }

    const metadata = this.generateMetadata(data.length, exportFields, format)

    return {
      metadata,
      data: exportData,
    }
  }

  /**
   * Estimate export size
   */
  static estimateSize(
    recordCount: number,
    avgRecordSize: number,
    format: ExportFormat
  ): {
    estimatedBytes: number
    estimatedMB: number
  } {
    let multiplier = 1

    switch (format) {
      case 'csv':
        multiplier = 0.7 // CSV is more compact
        break
      case 'json':
        multiplier = 1.2 // JSON has overhead
        break
      case 'jsonl':
        multiplier = 1.0
        break
    }

    const estimatedBytes = recordCount * avgRecordSize * multiplier

    return {
      estimatedBytes,
      estimatedMB: estimatedBytes / (1024 * 1024),
    }
  }

  /**
   * Validate export request
   */
  static validateExportRequest(options: ExportOptions): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!options.format) {
      errors.push('Export format is required')
    }

    if (!['csv', 'json', 'jsonl', 'parquet'].includes(options.format)) {
      errors.push('Invalid export format')
    }

    if (options.limit && options.limit > 1000000) {
      errors.push('Export limit cannot exceed 1,000,000 records')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Create export job
   */
  static async createExportJob(
    tenantId: string,
    datasetId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const exportId = `export_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    // In production, would queue background job
    // For now, return placeholder
    return {
      exportId,
      format: options.format,
      recordCount: 0,
      sizeBytes: 0,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    }
  }

  /**
   * Sanitize field names for export
   */
  static sanitizeFieldNames(fields: string[]): string[] {
    return fields.map(field => 
      field
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    )
  }

  /**
   * Apply field transformations
   */
  static transformFields(
    data: any[],
    transformations: Record<string, (value: any) => any>
  ): any[] {
    return data.map(record => {
      const transformed = { ...record }
      
      for (const [field, transform] of Object.entries(transformations)) {
        if (field in transformed) {
          transformed[field] = transform(transformed[field])
        }
      }
      
      return transformed
    })
  }

  /**
   * Filter sensitive fields
   */
  static filterSensitiveFields(
    data: any[],
    sensitiveFields: string[]
  ): any[] {
    return data.map(record => {
      const filtered = { ...record }
      
      for (const field of sensitiveFields) {
        if (field in filtered) {
          filtered[field] = '[REDACTED]'
        }
      }
      
      return filtered
    })
  }

  /**
   * Batch export with progress tracking
   */
  static async batchExport(
    data: any[],
    batchSize: number,
    onProgress: (completed: number, total: number) => void
  ): Promise<string[]> {
    const batches: string[] = []
    const total = data.length

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      const exported = await this.exportToJSON(batch)
      batches.push(exported)
      
      onProgress(Math.min(i + batchSize, total), total)
    }

    return batches
  }
}
