/**
 * Azure Blob Storage Connector for data ingestion
 */

import { BaseConnector, ConnectorConfig, DataSource, IngestionResult, ValidationResult } from './base'

export class AzureBlobConnector extends BaseConnector {
  private blobServiceClient: any = null

  constructor(config: ConnectorConfig) {
    super(config)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      const { BlobServiceClient } = await import('@azure/storage-blob').catch(() => ({ BlobServiceClient: null }))
      
      if (!BlobServiceClient) {
        throw new Error('Azure Storage SDK not installed. Run: npm install @azure/storage-blob')
      }

      const connectionString = this.config.connectionString || this.config.credentials?.connectionString
      
      if (!connectionString) {
        throw new Error('Azure connection string is required')
      }

      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
      
      const containerIter = this.blobServiceClient.listContainers()
      await containerIter.next()
      
      this.connected = true
    } catch (error: any) {
      throw new Error(`Failed to connect to Azure Blob Storage: ${error.message}`)
    }
  }

  async disconnect(): Promise<void> {
    this.blobServiceClient = null
    this.connected = false
  }

  async testConnection(): Promise<boolean> {
    if (!this.blobServiceClient) return false
    
    try {
      const containerIter = this.blobServiceClient.listContainers()
      await containerIter.next()
      return true
    } catch {
      return false
    }
  }

  async listSources(): Promise<DataSource[]> {
    if (!this.blobServiceClient) throw new Error('Not connected')

    const sources: DataSource[] = []

    for await (const container of this.blobServiceClient.listContainers()) {
      const containerClient = this.blobServiceClient.getContainerClient(container.name)
      
      let blobCount = 0
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blobCount >= 100) break
        
        sources.push({
          id: `${container.name}/${blob.name}`,
          name: blob.name,
          type: blob.properties.contentType || 'blob',
          location: `https://${this.blobServiceClient.accountName}.blob.core.windows.net/${container.name}/${blob.name}`,
          schema: {
            container: container.name,
            size: blob.properties.contentLength,
            contentType: blob.properties.contentType,
            lastModified: blob.properties.lastModified,
          },
        })
        blobCount++
      }
    }

    return sources
  }

  async ingest(source: DataSource, options?: any): Promise<IngestionResult> {
    if (!this.blobServiceClient) throw new Error('Not connected')

    const [containerName, ...pathParts] = source.id.split('/')
    const blobName = pathParts.join('/')
    
    try {
      const containerClient = this.blobServiceClient.getContainerClient(containerName)
      const blobClient = containerClient.getBlobClient(blobName)
      
      const downloadResponse = await blobClient.download(0)
      const contents = await this.streamToBuffer(downloadResponse.readableStreamBody)
      
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

  private async streamToBuffer(readableStream: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      readableStream.on('data', (data: Buffer) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data))
      })
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
      readableStream.on('error', reject)
    })
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
