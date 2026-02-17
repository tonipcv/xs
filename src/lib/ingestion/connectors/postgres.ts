/**
 * PostgreSQL Connector for data ingestion
 */

import { Pool, PoolConfig } from 'pg'
import { BaseConnector, ConnectorConfig, DataSource, IngestionResult, ValidationResult } from './base'

export class PostgresConnector extends BaseConnector {
  private pool: Pool | null = null

  constructor(config: ConnectorConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    const poolConfig: PoolConfig = {
      connectionString: this.config.connectionString,
      max: this.config.options?.maxConnections || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }

    this.pool = new Pool(poolConfig)
    
    try {
      await this.pool.query('SELECT 1')
      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to PostgreSQL: ${error.message}`)
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
      this.connected = false
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) return false
    
    try {
      await this.pool.query('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  async listSources(): Promise<DataSource[]> {
    if (!this.pool) throw new Error('Not connected')

    const query = `
      SELECT 
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `

    const result = await this.pool.query(query)
    
    return result.rows.map(row => ({
      id: `${row.table_schema}.${row.table_name}`,
      name: row.table_name,
      type: row.table_type,
      location: `${row.table_schema}.${row.table_name}`,
    }))
  }

  async ingest(source: DataSource, options?: any): Promise<IngestionResult> {
    if (!this.pool) throw new Error('Not connected')

    const limit = options?.limit || 10000
    const offset = options?.offset || 0
    const columns = options?.columns || '*'

    const query = `SELECT ${columns} FROM ${source.location} LIMIT $1 OFFSET $2`
    
    try {
      const result = await this.pool.query(query, [limit, offset])
      
      const validation = await this.validateData(result.rows)
      
      return {
        success: validation.valid,
        recordsProcessed: result.rows.length,
        recordsFailed: validation.errors.length,
        errors: validation.errors,
        metadata: {
          source: source.location,
          rowCount: result.rows.length,
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

    // Completeness check
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

    // Consistency check (basic type consistency)
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

    // Quality score
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

  async getSchema(tableName: string): Promise<Record<string, any>> {
    if (!this.pool) throw new Error('Not connected')

    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `

    const result = await this.pool.query(query, [tableName])
    
    const schema: Record<string, any> = {}
    result.rows.forEach(row => {
      schema[row.column_name] = {
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default,
      }
    })

    return schema
  }
}
