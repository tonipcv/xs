/**
 * BigQuery Connector for data ingestion
 */

import { BaseConnector, ConnectorConfig, DataSource, IngestionResult, ValidationResult } from './base'

export class BigQueryConnector extends BaseConnector {
  private client: any = null

  constructor(config: ConnectorConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      const { BigQuery } = await import('@google-cloud/bigquery').catch(() => ({ BigQuery: null }))
      
      if (!BigQuery) {
        throw new Error('BigQuery SDK not installed. Run: npm install @google-cloud/bigquery')
      }

      this.client = new BigQuery({
        projectId: this.config.credentials?.projectId,
        keyFilename: this.config.credentials?.keyFilename,
        credentials: this.config.credentials?.credentials,
        ...this.config.options,
      })

      await this.client.getDatasets()
      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to BigQuery: ${error.message}`)
    }
  }

  async disconnect(): Promise<void> {
    this.client = null
    this.connected = false
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false
    
    try {
      await this.client.getDatasets()
      return true
    } catch {
      return false
    }
  }

  async listSources(): Promise<DataSource[]> {
    if (!this.client) throw new Error('Not connected')

    const [datasets] = await this.client.getDatasets()
    const sources: DataSource[] = []

    for (const dataset of datasets) {
      const [tables] = await dataset.getTables()
      
      for (const table of tables) {
        const [metadata] = await table.getMetadata()
        
        sources.push({
          id: `${dataset.id}.${table.id}`,
          name: table.id,
          type: metadata.type || 'TABLE',
          location: `${dataset.id}.${table.id}`,
          schema: {
            dataset: dataset.id,
            numRows: metadata.numRows,
            numBytes: metadata.numBytes,
          },
        })
      }
    }

    return sources
  }

  async ingest(source: DataSource, options?: any): Promise<IngestionResult> {
    if (!this.client) throw new Error('Not connected')

    const limit = options?.limit || 10000
    const offset = options?.offset || 0
    const columns = options?.columns || '*'

    const query = `SELECT ${columns} FROM \`${source.location}\` LIMIT ${limit} OFFSET ${offset}`
    
    try {
      const [job] = await this.client.createQueryJob({
        query,
        location: this.config.options?.location || 'US',
      })

      const [rows] = await job.getQueryResults()
      
      const validation = await this.validateData(rows)
      
      return {
        success: validation.valid,
        recordsProcessed: rows.length,
        recordsFailed: validation.errors.length,
        errors: validation.errors,
        metadata: {
          source: source.location,
          rowCount: rows.length,
          validation: validation.metrics,
          jobId: job.id,
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

  async getTableSchema(tableId: string): Promise<Record<string, any>> {
    if (!this.client) throw new Error('Not connected')

    const [datasetId, tableName] = tableId.split('.')
    const dataset = this.client.dataset(datasetId)
    const table = dataset.table(tableName)
    const [metadata] = await table.getMetadata()

    const schema: Record<string, any> = {}
    if (metadata.schema && metadata.schema.fields) {
      metadata.schema.fields.forEach((field: any) => {
        schema[field.name] = {
          type: field.type,
          mode: field.mode,
          description: field.description,
        }
      })
    }

    return schema
  }
}
