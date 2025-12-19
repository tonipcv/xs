/**
 * XASE CORE - Storage Client (MinIO/S3)
 * 
 * Cliente para upload de bundles e geração de URLs assinados
 * Compatível com MinIO e AWS S3
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

interface StorageConfig {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  forcePathStyle: boolean
}

let s3Client: S3Client | null = null
let storageConfig: StorageConfig | null = null

/**
 * Inicializa cliente S3/MinIO
 */
function getS3Client(): S3Client {
  if (s3Client) return s3Client

  const endpoint = process.env.MINIO_SERVER_URL || process.env.S3_ENDPOINT
  const region = process.env.S3_REGION || 'us-east-1'
  const accessKeyId = process.env.MINIO_ROOT_USER || process.env.S3_ACCESS_KEY
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || process.env.S3_SECRET_KEY
  const bucket = process.env.BUCKET_NAME || process.env.S3_BUCKET || 'xase'
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true' || !!process.env.MINIO_SERVER_URL

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Storage not configured: missing MINIO_SERVER_URL/S3_ENDPOINT or credentials')
  }

  storageConfig = {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle,
  }

  s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle,
  })

  console.log(`[Storage] Initialized: ${endpoint} (bucket: ${bucket}, forcePathStyle: ${forcePathStyle})`)

  return s3Client
}

/**
 * Upload de buffer para storage
 */
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string = 'application/octet-stream'
): Promise<{
  url: string
  key: string
  size: number
  etag?: string
  hash: string
}> {
  const client = getS3Client()
  const bucket = storageConfig!.bucket

  // Calcular hash SHA-256 do buffer
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: {
      'x-xase-hash': hash,
      'x-xase-uploaded-at': new Date().toISOString(),
    },
  })

  const result = await client.send(command)

  const url = `${storageConfig!.endpoint}/${bucket}/${key}`

  console.log(`[Storage] Uploaded: ${key} (${buffer.length} bytes, hash: ${hash.substring(0, 16)}...)`)

  return {
    url,
    key,
    size: buffer.length,
    etag: result.ETag,
    hash,
  }
}

/**
 * Gera URL assinado para download
 */
export async function getPresignedUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const client = getS3Client()
  const bucket = storageConfig!.bucket

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds })

  console.log(`[Storage] Generated presigned URL for: ${key} (expires in ${expiresInSeconds}s)`)

  return url
}

/**
 * Verifica se storage está configurado
 */
export function isStorageConfigured(): boolean {
  try {
    const endpoint = process.env.MINIO_SERVER_URL || process.env.S3_ENDPOINT
    const accessKeyId = process.env.MINIO_ROOT_USER || process.env.S3_ACCESS_KEY
    const secretAccessKey = process.env.MINIO_ROOT_PASSWORD || process.env.S3_SECRET_KEY
    return !!(endpoint && accessKeyId && secretAccessKey)
  } catch {
    return false
  }
}

/**
 * Retorna configuração atual (para debug/logs)
 */
export function getStorageInfo(): {
  configured: boolean
  endpoint?: string
  bucket?: string
  region?: string
} {
  if (!storageConfig) {
    return { configured: false }
  }

  return {
    configured: true,
    endpoint: storageConfig.endpoint,
    bucket: storageConfig.bucket,
    region: storageConfig.region,
  }
}
