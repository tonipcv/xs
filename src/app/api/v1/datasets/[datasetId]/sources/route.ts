// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { decryptToken } from '@/lib/services/encryption'

// Safely convert BigInt values to strings for JSON responses
function toJSONSafe<T = any>(value: T): T {
  if (typeof value === 'bigint') return (value.toString() as unknown) as T
  if (Array.isArray(value)) return (value.map((v) => toJSONSafe(v)) as unknown) as T
  if (value && typeof value === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = toJSONSafe(v as any)
    }
    return out as T
  }
  return value
}

// GET: List all data sources for a dataset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: { id: true, tenantId: true }
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    if (dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sources = await prisma.dataSource.findMany({
      where: { datasetId: dataset.id },
      include: {
        cloudIntegration: {
          select: {
            id: true,
            name: true,
            provider: true,
            status: true
          }
        }
      },
      orderBy: { addedAt: 'desc' }
    })

    return NextResponse.json(toJSONSafe({ sources }))
  } catch (error: any) {
    console.error('GET /datasets/[datasetId]/sources error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST: Add a new data source to a dataset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const BodySchema = z.object({
      name: z.string().min(1),
      cloudIntegrationId: z.string().min(1),
      storageLocation: z.string().min(1),
      description: z.string().optional()
    })

    const body = await request.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, cloudIntegrationId, storageLocation, description } = parsed.data

    const dataset = await prisma.dataset.findUnique({
      where: { datasetId },
      select: { id: true, tenantId: true, language: true }
    })

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    if (dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const integration = await prisma.cloudIntegration.findUnique({
      where: { id: cloudIntegrationId },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        encryptedAccessToken: true,
        region: true,
        accountName: true,
      }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    if (integration.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate credentials presence per provider before scanning
    if (!integration.encryptedAccessToken) {
      return NextResponse.json({ error: 'Integration is missing credentials' }, { status: 400 })
    }

    // Check if a DataSource with same (dataset, integration, storageLocation) already exists
    const existing = await prisma.dataSource.findFirst({
      where: {
        datasetId: dataset.id,
        cloudIntegrationId: integration.id,
        storageLocation,
        status: { in: ['ACTIVE', 'SYNCING', 'ERROR'] },
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'A data source for this location and integration already exists.' }, { status: 409 })
    }

    // Scan the storage location
    let audioFiles: any[] = []
    try {
      audioFiles = await getAllAudioFiles(integration, storageLocation)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Failed to scan storage location' }, { status: 400 })
    }
    
    if (audioFiles.length === 0) {
      return NextResponse.json({ error: 'No audio files found at location' }, { status: 400 })
    }

    // De-duplicate files by fullPath and compute totals
    const seen = new Set<string>()
    const uniqueFiles = [] as typeof audioFiles
    for (const f of audioFiles) {
      if (f.fullPath && !seen.has(f.fullPath)) {
        seen.add(f.fullPath)
        uniqueFiles.push(f)
      }
    }

    const totalSizeBytes = uniqueFiles.reduce((sum, f) => sum + (f.size || 0), 0)
    const totalDurationSeconds = uniqueFiles.reduce((sum, f) => sum + estimateFileDuration(f.size || 0), 0)
    const estimatedDurationHours = totalDurationSeconds / 3600

    // Infer metadata from first file
    const firstFile = audioFiles[0]
    const inferredCodec = firstFile.name.split('.').pop()?.toLowerCase() || 'wav'

    // Create DataSource
    const dataSource = await prisma.dataSource.create({
      data: {
        dataSourceId: `dsrc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        description: description || null,
        datasetId: dataset.id,
        cloudIntegrationId: integration.id,
        storageLocation,
        numRecordings: uniqueFiles.length,
        durationHours: estimatedDurationHours,
        sizeBytes: BigInt(totalSizeBytes),
        language: dataset.language,
        sampleRate: 16000,
        codec: inferredCodec,
        status: 'ACTIVE',
        lastSyncedAt: new Date()
      },
      include: {
        cloudIntegration: {
          select: {
            id: true,
            name: true,
            provider: true,
            status: true
          }
        }
      }
    })

    // Create AudioSegments in batch
    const segments = uniqueFiles.map((file, i) => ({
      datasetId: dataset.id,
      dataSourceId: dataSource.id,
      segmentId: `${datasetId}-${dataSource.dataSourceId}-seg-${String(i + 1).padStart(6, '0')}`,
      fileKey: file.fullPath,
      durationSec: estimateFileDuration(file.size),
      sampleRate: 16000,
      codec: inferredCodec,
      channelCount: 1,
      fileSize: BigInt(file.size),
      language: dataset.language
    }))

    await prisma.audioSegment.createMany({ data: segments, skipDuplicates: true })

    // Recalculate dataset aggregates
    await recalculateDatasetAggregates(dataset.id)

    // Update dataset status to ACTIVE if it was DRAFT
    await prisma.dataset.updateMany({
      where: { id: dataset.id, status: 'DRAFT' },
      data: { status: 'ACTIVE' }
    })

    return NextResponse.json(toJSONSafe({ dataSource }), { status: 201 })
  } catch (error: any) {
    console.error('POST /datasets/[datasetId]/sources error:', error?.message || error, error?.stack)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}

// Helper functions
async function getAllAudioFiles(integration: any, storageLocation: string): Promise<any[]> {
  const { bucket, prefix } = parseStorageLocation(storageLocation, integration.provider)
  switch (integration.provider) {
    case 'GCS':
      return scanGCSFiles(integration, bucket, prefix)
    case 'AWS_S3':
      return scanS3Files(integration, bucket, prefix)
    case 'AZURE_BLOB':
      return scanAzureFiles(integration, bucket, prefix)
    default:
      throw new Error(`Unsupported provider: ${integration.provider}`)
  }
}

function parseStorageLocation(location: string, provider: string): { bucket: string; prefix: string } {
  if (provider === 'GCS') {
    const match = location.match(/^gs:\/\/([^\/]+)\/(.*)$/)
    if (!match) throw new Error('Invalid GCS location format')
    return { bucket: match[1], prefix: match[2] || '' }
  } else if (provider === 'AWS_S3') {
    const match = location.match(/^s3:\/\/([^\/]+)\/(.*)$/)
    if (!match) throw new Error('Invalid S3 location format')
    return { bucket: match[1], prefix: match[2] || '' }
  } else if (provider === 'AZURE_BLOB') {
    const match = location.match(/^https:\/\/([^\.]+)\.blob\.core\.windows\.net\/([^\/]+)\/(.*)$/)
    if (!match) throw new Error('Invalid Azure Blob location format')
    return { bucket: match[2], prefix: match[3] || '' }
  }
  throw new Error('Unsupported provider')
}

async function scanGCSFiles(integration: any, bucket: string, prefix: string): Promise<any[]> {
  let accessToken: string | null = null
  try {
    accessToken = decryptToken(integration.encryptedAccessToken)
  } catch {
    accessToken = null
  }
  if (!accessToken) throw new Error('Invalid GCS credentials')

  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`)
  if (prefix) url.searchParams.set('prefix', `${prefix.replace(/\/$/, '')}/`)
  url.searchParams.set('maxResults', '10000')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error('Failed to list GCS files')
  const data = await resp.json()
  const items = data.items || []
  const audioExtensions = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
  return items
    .filter((item: any) => item.name && !item.name.endsWith('/') && audioExtensions.test(item.name))
    .map((item: any) => ({
      name: item.name.split('/').pop() || item.name,
      fullPath: `gs://${bucket}/${item.name}`,
      size: parseInt(item.size || '0'),
    }))
}

async function scanS3Files(integration: any, bucket: string, prefix: string): Promise<any[]> {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3')
  let credsRaw: any = null
  try {
    credsRaw = JSON.parse(decryptToken(integration.encryptedAccessToken))
  } catch {
    throw new Error('Invalid S3 credentials')
  }
  const client = new S3Client({
    region: integration.region || credsRaw.region || 'us-east-1',
    credentials: {
      accessKeyId: credsRaw.accessKeyId || credsRaw.access_key_id,
      secretAccessKey: credsRaw.secretAccessKey || credsRaw.secret_access_key,
    },
  })
  const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix ? `${prefix.replace(/\/$/, '')}/` : '' })
  const response = await client.send(command)
  const audioRx = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
  return (response.Contents || [])
    .filter((obj: any) => obj.Key && !obj.Key.endsWith('/') && audioRx.test(obj.Key))
    .map((obj: any) => ({
      name: obj.Key.split('/').pop(),
      fullPath: `s3://${bucket}/${obj.Key}`,
      size: obj.Size || 0,
    }))
}

async function scanAzureFiles(integration: any, container: string, prefix: string): Promise<any[]> {
  const { BlobServiceClient } = require('@azure/storage-blob')
  const accountName = integration.accountName
  let accountKey: string | null = null
  try {
    accountKey = decryptToken(integration.encryptedAccessToken)
  } catch {
    accountKey = null
  }
  if (!accountName || !accountKey) throw new Error('Invalid Azure credentials')

  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(container)
  const files: any[] = []
  const audioRx = /\.(wav|mp3|flac|ogg|m4a|aac)$/i
  for await (const blob of containerClient.listBlobsFlat({ prefix: prefix ? `${prefix.replace(/\/$/, '')}/` : '' })) {
    if (audioRx.test(blob.name)) {
      files.push({
        name: blob.name.split('/').pop(),
        fullPath: `https://${accountName}.blob.core.windows.net/${container}/${blob.name}`,
        size: blob.properties.contentLength || 0,
      })
    }
  }
  return files
}

function estimateFileDuration(sizeBytes: number): number {
  const bytesPerSecond = 32000
  return sizeBytes / bytesPerSecond
}

async function recalculateDatasetAggregates(datasetId: string) {
  // Fetch active sources to normalize duration (some legacy rows may store seconds)
  const activeSources = await prisma.dataSource.findMany({
    where: { datasetId, status: 'ACTIVE' },
    select: {
      numRecordings: true,
      durationHours: true,
      sizeBytes: true,
      sampleRate: true,
      codec: true,
      language: true,
    },
  })

  const totalRecordings = activeSources.reduce((a, s) => a + (s.numRecordings || 0), 0)
  const totalSize = activeSources.reduce((a, s) => a + Number(s.sizeBytes || 0n), 0)
  const totalHours = activeSources.reduce((a, s) => {
    const v = Number(s.durationHours || 0)
    const hours = v > 100 ? v / 3600 : v
    return a + hours
  }, 0)

  const sources = activeSources.map(s => ({ sampleRate: s.sampleRate, codec: s.codec, language: s.language }))

  let primarySampleRate = 16000
  let primaryCodec = 'wav'
  let primaryLanguage = 'en-US'

  if (sources.length > 0) {
    const sampleRateFreq: Record<number, number> = {}
    sources.forEach(s => { if (s.sampleRate) sampleRateFreq[s.sampleRate] = (sampleRateFreq[s.sampleRate] || 0) + 1 })
    if (Object.keys(sampleRateFreq).length > 0) {
      primarySampleRate = parseInt(Object.keys(sampleRateFreq).reduce((a, b) => 
        sampleRateFreq[parseInt(a)] > sampleRateFreq[parseInt(b)] ? a : b
      ))
    }

    const codecFreq: Record<string, number> = {}
    sources.forEach(s => { if (s.codec) codecFreq[s.codec] = (codecFreq[s.codec] || 0) + 1 })
    if (Object.keys(codecFreq).length > 0) {
      primaryCodec = Object.keys(codecFreq).reduce((a, b) => codecFreq[a] > codecFreq[b] ? a : b)
    }

    const langFreq: Record<string, number> = {}
    sources.forEach(s => { if (s.language) langFreq[s.language] = (langFreq[s.language] || 0) + 1 })
    if (Object.keys(langFreq).length > 0) {
      primaryLanguage = Object.keys(langFreq).reduce((a, b) => langFreq[a] > langFreq[b] ? a : b)
    }
  }

  await prisma.dataset.update({
    where: { id: datasetId },
    data: {
      numRecordings: totalRecordings,
      totalDurationHours: totalHours,
      storageSize: BigInt(totalSize),
      totalSizeBytes: BigInt(totalSize),
      primarySampleRate,
      primaryCodec,
      primaryLanguage,
      language: primaryLanguage,
    }
  })
}
