/**
 * Base connector interface for data ingestion
 * Supports: Postgres, Snowflake, BigQuery, GCS, Azure Blob
 */

export interface ConnectorConfig {
  type: 'postgres' | 'snowflake' | 'bigquery' | 'gcs' | 'azure-blob'
  connectionString?: string
  credentials?: Record<string, any>
  options?: Record<string, any>
}

export interface DataSource {
  id: string
  name: string
  type: string
  location: string
  schema?: Record<string, any>
}

export interface IngestionResult {
  success: boolean
  recordsProcessed: number
  recordsFailed: number
  errors: string[]
  metadata: Record<string, any>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  metrics: {
    completeness: number
    consistency: number
    quality: number
  }
}

export abstract class BaseConnector {
  protected config: ConnectorConfig
  protected connected: boolean = false

  constructor(config: ConnectorConfig) {
    this.config = config
  }

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract testConnection(): Promise<boolean>
  abstract listSources(): Promise<DataSource[]>
  abstract ingest(source: DataSource, options?: any): Promise<IngestionResult>
  abstract validateData(data: any[]): Promise<ValidationResult>

  isConnected(): boolean {
    return this.connected
  }

  getConfig(): ConnectorConfig {
    return { ...this.config }
  }
}

export interface ConnectorFactory {
  create(config: ConnectorConfig): BaseConnector
}
