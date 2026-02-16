import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'
import crypto from 'crypto'
import { z } from 'zod'

function genDatasetId() {
  return 'ds_' + crypto.randomBytes(12).toString('hex')
}

export async function POST(req: NextRequest) {
  try {
    // Support two auth modes: API key OR user session
    const auth = await validateApiKey(req)
    let tenantId: string | null = auth.valid ? auth.tenantId : null

    if (!tenantId) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
      tenantId = user?.tenantId || null
      if (!tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 600, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const BodySchema = z.object({
      name: z.string().min(1),
      language: z.string().min(1),
      description: z.string().optional(),
      // Legacy fields (deprecated but kept for backwards compatibility)
      storageLocation: z.string().min(1).optional(),
      region: z.string().optional(),
      integrationMode: z.enum(['aws-s3', 'gcs', 'azure-blob', 'snowflake', 'bigquery', 'postgres']).optional(),
      integrationId: z.string().optional(),
    })

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { name, description, language, storageLocation: bodyStorageLocation, integrationId } = parsed.data

    const datasetId = genDatasetId()
    const storageLocation = bodyStorageLocation && bodyStorageLocation.trim().length > 0
      ? bodyStorageLocation.trim()
      : `datasets/${datasetId}/`

    // If integrationId provided, scan folder to get files and create AudioSegments
    let numRecordings = 0
    let totalDurationHours = 0
    let totalSizeBytes = 0
    let audioFiles: Array<{ name: string; fullPath: string; size: number }> = []

    if (integrationId && storageLocation) {
      try {
        // Scan folder to get all audio files
        const scanRes = await fetch(`${process.env.NEXTAUTH_URL}/api/cloud-integrations/${integrationId}/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageLocation })
        })

        if (scanRes.ok) {
          const scanData = await scanRes.json()
          numRecordings = scanData.numRecordings || 0
          totalDurationHours = scanData.estimatedDurationHours || 0
          totalSizeBytes = scanData.totalSizeBytes || 0

          // Get full file list (not just preview)
          const integration = await prisma.cloudIntegration.findUnique({
            where: { id: integrationId }
          })

          if (integration) {
            audioFiles = await getAllAudioFiles(integration, storageLocation)
          }
        }
      } catch (err) {
        console.error('Failed to scan folder:', err)
        // Continue with dataset creation even if scan fails
      }
    }

    const dataset = await prisma.dataset.create({
      data: {
        tenantId: tenantId!,
        datasetId,
        name,
        description: description || null,
        language,
        primaryLanguage: language,
        totalDurationHours,
        numRecordings,
        storageSize: totalSizeBytes > 0 ? BigInt(totalSizeBytes) : null,
        totalSizeBytes: totalSizeBytes > 0 ? BigInt(totalSizeBytes) : BigInt(0),
        storageLocation,
        cloudIntegrationId: integrationId || null,
        processingStatus: 'PENDING',
        status: numRecordings > 0 ? 'ACTIVE' : 'DRAFT',
      },
      select: {
        id: true,
        datasetId: true,
        name: true,
        primaryLanguage: true,
        status: true,
        processingStatus: true,
        storageLocation: true,
        numRecordings: true,
        totalDurationHours: true,
        createdAt: true,
      },
    })

    // Create AudioSegments in batch if we have files
    if (audioFiles.length > 0) {
      const segments = audioFiles.map((file, i) => ({
        datasetId: dataset.id,
        dataSourceId: integrationId || 'manual',
        segmentId: `${datasetId}-seg-${String(i + 1).padStart(6, '0')}`,
        fileKey: file.fullPath,
        durationSec: estimateFileDuration(file.size),
        sampleRate: 16000, // Default, will be refined by background job
        codec: file.name.split('.').pop()?.toLowerCase() || 'wav',
        channelCount: 1,
        fileSize: BigInt(file.size),
        language,
      }))

      // Batch insert (Prisma supports up to 1000 at a time)
      const batchSize = 1000
      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize)
        await prisma.audioSegment.createMany({
          data: batch,
          skipDuplicates: true,
        })
      }
    }

    return NextResponse.json(dataset, { status: 201 })
  } catch (err) {
    console.error('[API] POST /api/v1/datasets error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Helper functions
async function getAllAudioFiles(integration: { provider: string; encryptedAccessToken?: string | null; region?: string | null; accountName?: string | null }, storageLocation: string): Promise<Array<{ name: string; fullPath: string; size: number }>> {
  const { decryptToken } = await import('@/lib/services/encryption')
  
  // Parse storage location
  const { bucket, prefix } = parseStorageLocation(storageLocation)
  
  // Get files based on provider
  switch (integration.provider) {
    case 'GCS':
      return await scanGCSFiles(integration, bucket, prefix, decryptToken)
    case 'AWS_S3':
      return await scanS3Files(integration, bucket, prefix, decryptToken)
    case 'AZURE_BLOB':
      return await scanAzureFiles(integration, bucket, prefix, decryptToken)
    default:
      return []
  }
}

function parseStorageLocation(location: string): { bucket: string; prefix: string } {
  if (location.startsWith('gs://')) {
    const parts = location.replace('gs://', '').split('/')
    return { bucket: parts[0], prefix: parts.slice(1).join('/').replace(/\/$/, '') }
  }
  if (location.startsWith('s3://')) {
    const parts = location.replace('s3://', '').split('/')
    return { bucket: parts[0], prefix: parts.slice(1).join('/').replace(/\/$/, '') }
  }
  if (location.includes('.blob.core.windows.net')) {
    const url = new URL(location)
    const pathParts = url.pathname.split('/').filter(Boolean)
    return { bucket: pathParts[0], prefix: pathParts.slice(1).join('/').replace(/\/$/, '') }
  }
  throw new Error('Invalid storage location')
}

async function scanGCSFiles(integration: { encryptedAccessToken?: string | null }, bucket: string, prefix: string, decryptToken: (token: string) => string): Promise<Array<{ name: string; fullPath: string; size: number }>> {
  let accessToken = integration.encryptedAccessToken ? decryptToken(integration.encryptedAccessToken) : null
  
  if (!accessToken) return []

  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`)
  if (prefix) url.searchParams.set('prefix', `${prefix}/`)
  url.searchParams.set('maxResults', '10000')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!resp.ok) return []

  const data = await resp.json()
  const items = data.items || []

  return items
    .filter((item: any) => !item.name.endsWith('/') && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(item.name))
    .map((item: any) => ({
      name: item.name.split('/').pop() || item.name,
      fullPath: `gs://${bucket}/${item.name}`,
      size: parseInt(item.size || '0')
    }))
}

async function scanS3Files(integration: { encryptedAccessToken?: string | null; region?: string | null }, bucket: string, prefix: string, decryptToken: (token: string) => string): Promise<Array<{ name: string; fullPath: string; size: number }>> {
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
  
  let credentials: { accessKeyId: string; secretAccessKey: string }
  try {
    if (!integration.encryptedAccessToken) return []
    const creds = JSON.parse(decryptToken(integration.encryptedAccessToken))
    credentials = {
      accessKeyId: creds.accessKeyId || creds.access_key_id,
      secretAccessKey: creds.secretAccessKey || creds.secret_access_key
    }
  } catch {
    return []
  }

  const s3Client = new S3Client({
    region: integration.region || 'us-east-1',
    credentials
  })

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix ? `${prefix}/` : '',
    MaxKeys: 10000
  })

  const response = await s3Client.send(command)
  const objects = response.Contents || []

  return objects
    .filter(obj => obj.Key && !obj.Key.endsWith('/') && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(obj.Key))
    .map(obj => ({
      name: obj.Key!.split('/').pop() || obj.Key!,
      fullPath: `s3://${bucket}/${obj.Key}`,
      size: obj.Size || 0
    }))
}

async function scanAzureFiles(integration: { accountName?: string | null; encryptedAccessToken?: string | null }, container: string, prefix: string, decryptToken: (token: string) => string): Promise<Array<{ name: string; fullPath: string; size: number }>> {
  const { BlobServiceClient } = await import('@azure/storage-blob')
  
  const accountName = integration.accountName
  if (!integration.encryptedAccessToken || !accountName) return []
  const accountKey = decryptToken(integration.encryptedAccessToken)
  
  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(container)

  const files: Array<{ name: string; fullPath: string; size: number }> = []
  
  for await (const blob of containerClient.listBlobsFlat({
    prefix: prefix ? `${prefix}/` : ''
  })) {
    if (!blob.name.endsWith('/') && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(blob.name)) {
      files.push({
        name: blob.name.split('/').pop() || blob.name,
        fullPath: `https://${accountName}.blob.core.windows.net/${container}/${blob.name}`,
        size: blob.properties.contentLength || 0
      })
    }
  }

  return files
}

function estimateFileDuration(sizeBytes: number): number {
  // Estimate duration based on file size
  // Assume 256 kbps average bitrate (32 KB/s)
  const bytesPerSecond = 32000
  return sizeBytes / bytesPerSecond
}

export async function GET(req: NextRequest) {
  try {
    const auth = await validateApiKey(req)
    let tenantId: string | null = auth.valid ? auth.tenantId : null

    // Fallback to session auth when no valid API key
    if (!tenantId) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
      }
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { tenantId: true } })
      tenantId = user?.tenantId || null
      if (!tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (auth.apiKeyId) {
      const rl = await checkApiRateLimit(auth.apiKeyId, 1200, 60)
      if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const url = new URL(req.url)
    const QuerySchema = z.object({
      language: z.string().min(1).optional(),
      consentStatus: z.enum(['VERIFIED_BY_XASE', 'MISSING', 'SUPPLIER_ATTESTED']).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
    }
    const { language, consentStatus, status, limit } = parsed.data
    const take = Math.min(limit ?? 20, 100)

    const datasets = await prisma.dataset.findMany({
      where: {
        tenantId: tenantId!,
        primaryLanguage: language || undefined,
        consentStatus: consentStatus as any || undefined,
        status: status as any || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        datasetId: true,
        name: true,
        primaryLanguage: true,
        status: true,
        processingStatus: true,
        consentStatus: true,
        totalDurationHours: true,
        numRecordings: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ datasets })
  } catch (err) {
    console.error('[API] GET /api/v1/datasets error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
