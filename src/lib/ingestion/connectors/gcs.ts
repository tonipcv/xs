/**
 * Google Cloud Storage Connector for data ingestion
 */

import { BaseConnector, ConnectorConfig, DataSource, IngestionResult, ValidationResult } from './base'

export class GCSConnector extends BaseConnector {
  private storage: any = null

  constructor(config: ConnectorConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      const { Storage } = await import('@google-cloud/storage').catch(() => ({ Storage: null }))
      
      if (!Storage) {
        throw new Error('GCS SDK not installed. Run: npm install @google-cloud/storage')
      }

      this.storage = new Storage({
        projectId: this.config.credentials?.projectId,
        keyFilename: this.config.credentials?.keyFilename,
        credentials: this.config.credentials?.credentials,
        ...this.config.options,
      })

      await this.storage.getBuckets()
      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to GCS: ${error.message}`)
    }
  }

  async disconnect(): Promise<void> {
    this.storage = null
    this.connected = false
  }

  async testConnection(): Promise<boolean> {
    if (!this.storage) return false
    
    try {
      await this.storage.getBuckets()
      return true
    } catch {
      return false
    }
  }

  async listSources(): Promise<DataSource[]> {
    if (!this.storage) throw new Error('Not connected')

    const [buckets] = await this.storage.getBuckets()
    const sources: DataSource[] = []

    for (const bucket of buckets) {
      const [files] = await bucket.getFiles({ maxResults: 100 })
      
      for (const file of files) {
        const [metadata] = await file.getMetadata()
        
        sources.push({
          id: `${bucket.name}/${file.name}`,
          name: file.name,
          type: metadata.contentType || 'file',
          location: `gs://${bucket.name}/${file.name}`,
          schema: {
            bucket: bucket.name,
            size: metadata.size,
            contentType: metadata.contentType,
            updated: metadata.updated,
          },
        })
      }
    }

    return sources
  }

  async ingest(source: DataSource, options?: any): Promise<IngestionResult> {
    if (!this.storage) throw new Error('Not connected')

    const [bucketName, ...pathParts] = source.id.split('/')
    const filePath = pathParts.join('/')
    
    try {
      const bucket = this.storage.bucket(bucketName)
      const file = bucket.file(filePath)
      
      const [exists] = await file.exists()
      if (!exists) {
        return {
          success: false,
          recordsProcessed: 0,
          recordsFailed: 0,
          errors: ['File not found'],
          metadata: { source: source.location },
        }
      }

      const [contents] = await file.download()
      const data = this.parseFileContents(contents, options?.format || 'json')
      
      const validation = await this.validateData(data)
      
      return {
        success: validation.valid,
        recordsProcessed: data.length,
        recordsFailed: validation.errors.length,
        errors: validation.errors,
        metadata: {
          source: source.location,
          rowCount: data.length,
          validation: validation.metrics,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [error.message],
        metadata: { source: source.location },
      }
    }
  }

  async validateData(data: any[]): Promise<ValidationResult> {
    if (!data || data.length === 0) {
      return {
        valid: false,
        errors: ['No data to validate'],
        warnings: [],
        metrics: { completeness: 0, consistency: 0, quality: 0 },
      }
    }

    const errors: string[] = []
    const warnings: string[] = []

    const keys = Object.keys(data[0])
    let nullCount = 0
    let totalFields = 0

    data.forEach(row => {
      keys.forEach(key => {
        totalFields++
        if (row[key] === null || row[key] === undefined) {
          nullCount++
        }
      })
    })

    const completeness = ((totalFields - nullCount) / totalFields) * 100

    if (completeness < 80) {
      warnings.push(`Low completeness: ${completeness.toFixed(2)}%`)
    }

    const typeMap: Record<string, Set<string>> = {}
    data.forEach(row => {
      keys.forEach(key => {
        if (!typeMap[key]) typeMap[key] = new Set()
        typeMap[key].add(typeof row[key])
      })
    })

    let inconsistentFields = 0
    Object.entries(typeMap).forEach(([key, types]) => {
      if (types.size > 2) {
        inconsistentFields++
        warnings.push(`Inconsistent types in field: ${key}`)
      }
    })

    const consistency = ((keys.length - inconsistentFields) / keys.length) * 100
    const quality = (completeness + consistency) / 2

    return {
      valid: quality >= 70,
      errors,
      warnings,
      metrics: {
        completeness: Math.round(completeness),
        consistency: Math.round(consistency),
        quality: Math.round(quality),
      },
    }
  }

  private parseFileContents(contents: Buffer, format: string): any[] {
    const text = contents.toString('utf-8')
    
    if (format === 'json') {
      try {
        const parsed = JSON.parse(text)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return text.split('\n').filter(line => line.trim()).map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return { raw: line }
          }
        })
      }
    } else if (format === 'csv') {
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length === 0) return []
      
      const headers = lines[0].split(',').map(h => h.trim())
      return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((header, i) => {
          obj[header] = values[i]
        })
        return obj
      })
    }
    
    return []
  }
}
