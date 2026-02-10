/**
 * Snowflake Connector for data ingestion
 */

import { BaseConnector, ConnectorConfig, DataSource, IngestionResult, ValidationResult } from './base'

export class SnowflakeConnector extends BaseConnector {
  private connection: any = null

  constructor(config: ConnectorConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      // Snowflake connection would use snowflake-sdk
      // For now, we'll create a mock implementation
      const snowflake = await import('snowflake-sdk').catch(() => null)
      
      if (!snowflake) {
        throw new Error('Snowflake SDK not installed. Run: npm install snowflake-sdk')
      }

      const connectionOptions = {
        account: this.config.credentials?.account,
        username: this.config.credentials?.username,
        password: this.config.credentials?.password,
        warehouse: this.config.credentials?.warehouse,
        database: this.config.credentials?.database,
        schema: this.config.credentials?.schema,
        ...this.config.options,
      }

      this.connection = snowflake.createConnection(connectionOptions)
      
      await new Promise((resolve, reject) => {
        this.connection.connect((err: any, conn: any) => {
          if (err) reject(err)
          else resolve(conn)
        })
      })

      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to Snowflake: ${error.message}`)
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await new Promise((resolve) => {
        this.connection.destroy((err: any) => {
          resolve(null)
        })
      })
      this.connection = null
      this.connected = false
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.connection) return false
    
    try {
      await this.executeQuery('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  async listSources(): Promise<DataSource[]> {
    if (!this.connection) throw new Error('Not connected')

    const query = `
      SHOW TABLES IN DATABASE ${this.config.credentials?.database}
    `

    const result = await this.executeQuery(query)
    
    return result.map((row: any) => ({
      id: `${row.database_name}.${row.schema_name}.${row.name}`,
      name: row.name,
      type: 'TABLE',
      location: `${row.database_name}.${row.schema_name}.${row.name}`,
      schema: {
        database: row.database_name,
        schema: row.schema_name,
        rows: row.rows,
      },
    }))
  }

  async ingest(source: DataSource, options?: any): Promise<IngestionResult> {
    if (!this.connection) throw new Error('Not connected')

    const limit = options?.limit || 10000
    const offset = options?.offset || 0
    const columns = options?.columns || '*'

    const query = `SELECT ${columns} FROM ${source.location} LIMIT ${limit} OFFSET ${offset}`
    
    try {
      const rows = await this.executeQuery(query)
      
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

  private async executeQuery(query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: query,
        complete: (err: any, stmt: any, rows: any[]) => {
          if (err) reject(err)
          else resolve(rows || [])
        },
      })
    })
  }
}
