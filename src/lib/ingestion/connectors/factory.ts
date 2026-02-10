/**
 * Connector Factory - creates appropriate connector based on type
 */

import { BaseConnector, ConnectorConfig } from './base'
import { PostgresConnector } from './postgres'
import { BigQueryConnector } from './bigquery'
import { GCSConnector } from './gcs'
import { AzureBlobConnector } from './azure'

export class ConnectorFactory {
  static create(config: ConnectorConfig): BaseConnector {
    switch (config.type) {
      case 'postgres':
        return new PostgresConnector(config)
      // snowflake temporarily disabled to avoid bundling issues
      case 'bigquery':
        return new BigQueryConnector(config)
      case 'gcs':
        return new GCSConnector(config)
      case 'azure-blob':
        return new AzureBlobConnector(config)
      default:
        throw new Error(`Unsupported connector type: ${config.type}`)
    }
  }

  static getSupportedTypes(): string[] {
    // snowflake temporarily disabled
    return ['postgres', 'bigquery', 'gcs', 'azure-blob']
  }

  static validateConfig(config: ConnectorConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!config.type) {
      errors.push('Connector type is required')
    } else if (!this.getSupportedTypes().includes(config.type)) {
      errors.push(`Unsupported connector type: ${config.type}`)
    }

    if (config.type === 'postgres' && !config.connectionString) {
      errors.push('Connection string is required for Postgres')
    }

    // snowflake disabled

    if (config.type === 'bigquery' && !config.credentials) {
      errors.push('Credentials are required for BigQuery')
    }

    if (config.type === 'gcs' && !config.credentials) {
      errors.push('Credentials are required for GCS')
    }

    if (config.type === 'azure-blob' && !config.connectionString && !config.credentials?.connectionString) {
      errors.push('Connection string is required for Azure Blob Storage')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
