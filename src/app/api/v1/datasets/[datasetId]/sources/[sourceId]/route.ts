import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/services/encryption'

// DELETE: Remove a data source
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; sourceId: string }> }
) {
  try {
    const { datasetId, sourceId } = await params
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

    if (!dataset || dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const source = await prisma.dataSource.findFirst({
      where: { dataSourceId: sourceId, datasetId: dataset.id }
    })

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    // Soft delete: mark as REMOVED
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { status: 'REMOVED' }
    })

    // Delete associated DataAssets
    await prisma.dataAsset.deleteMany({
      where: { dataSourceId: source.id }
    })

    // Recalculate aggregates
    await recalculateDatasetAggregates(dataset.id)

    // If no active sources remain, set dataset to DRAFT
    const activeSources = await prisma.dataSource.count({
      where: { datasetId: dataset.id, status: 'ACTIVE' }
    })

    if (activeSources === 0) {
      await prisma.dataset.update({
        where: { id: dataset.id },
        data: { status: 'DRAFT' }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /datasets/[datasetId]/sources/[sourceId] error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH: Re-sync a data source
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string; sourceId: string }> }
) {
  try {
    const { datasetId, sourceId } = await params
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
      select: { id: true, tenantId: true, language: true }
    })

    if (!dataset || dataset.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const source = await prisma.dataSource.findFirst({
      where: { dataSourceId: sourceId, datasetId: dataset.id },
      include: {
        cloudIntegration: true
      }
    })

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    // Mark as SYNCING
    await prisma.dataSource.update({
      where: { id: source.id },
      data: { status: 'SYNCING' }
    })

    // Re-scan storage location
    const audioFiles = await getAllAudioFiles(source.cloudIntegration, source.storageLocation)

    // Delete old segments
    await prisma.dataAsset.deleteMany({
      where: { dataSourceId: source.id }
    })

    const totalSizeBytes = audioFiles.reduce((sum, f) => sum + f.size, 0)
    const estimatedDurationHours = audioFiles.reduce((sum, f) => sum + estimateFileDuration(f.size), 0)
    const inferredCodec = audioFiles[0]?.name.split('.').pop()?.toLowerCase() || 'wav'

    // Create new segments
    const segments = audioFiles.map((file, i) => ({
      datasetId: dataset.id,
      dataSourceId: source.id,
      segmentId: `${datasetId}-${sourceId}-seg-${String(i + 1).padStart(6, '0')}`,
      fileKey: file.fullPath,
      durationSec: estimateFileDuration(file.size),
      sampleRate: 16000,
      codec: inferredCodec,
      channelCount: 1,
      fileSize: BigInt(file.size),
      language: dataset.language
    }))

    await prisma.dataAsset.createMany({ data: segments.map((s: any) => ({ ...s, dataSourceId: sourceId })) })

    // Update source stats
    await prisma.dataSource.update({
      where: { id: source.id },
      data: {
        numRecordings: audioFiles.length,
        durationHours: estimatedDurationHours,
        sizeBytes: BigInt(totalSizeBytes),
        codec: inferredCodec,
        status: 'ACTIVE',
        lastSyncedAt: new Date()
      }
    })

    // Recalculate dataset aggregates
    await recalculateDatasetAggregates(dataset.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('PATCH /datasets/[datasetId]/sources/[sourceId] error:', error)
    
    // Mark source as ERROR on failure
    try {
      const { sourceId } = await params
      const source = await prisma.dataSource.findFirst({
        where: { dataSourceId: sourceId }
      })
      if (source) {
        await prisma.dataSource.update({
          where: { id: source.id },
          data: { status: 'ERROR' }
        })
      }
    } catch {}

    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

// Helper functions (same as in sources/route.ts)
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
  const { Storage } = require('@google-cloud/storage')
  
  let credentials
  try {
    const decrypted = decryptToken(integration.encryptedToken)
    credentials = JSON.parse(decrypted)
  } catch {
    throw new Error('Invalid GCS credentials')
  }

  const storage = new Storage({ credentials })
  const [files] = await storage.bucket(bucket).getFiles({ prefix })
  
  const audioExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac']
  return files
    .filter((f: any) => audioExtensions.some(ext => f.name.toLowerCase().endsWith(ext)))
    .map((f: any) => ({
      name: f.name.split('/').pop(),
      fullPath: `gs://${bucket}/${f.name}`,
      size: parseInt(f.metadata.size || '0')
    }))
}

async function scanS3Files(integration: any, bucket: string, prefix: string): Promise<any[]> {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3')
  
  let credentials
  try {
    const decrypted = decryptToken(integration.encryptedToken)
    credentials = JSON.parse(decrypted)
  } catch {
    throw new Error('Invalid S3 credentials')
  }

  const client = new S3Client({
    region: credentials.region || 'us-east-1',
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  })

  const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  const response = await client.send(command)
  
  const audioExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac']
  return (response.Contents || [])
    .filter((obj: any) => audioExtensions.some(ext => obj.Key.toLowerCase().endsWith(ext)))
    .map((obj: any) => ({
      name: obj.Key.split('/').pop(),
      fullPath: `s3://${bucket}/${obj.Key}`,
      size: obj.Size || 0
    }))
}

async function scanAzureFiles(integration: any, container: string, prefix: string): Promise<any[]> {
  const { BlobServiceClient } = require('@azure/storage-blob')
  
  let connectionString
  try {
    connectionString = decryptToken(integration.encryptedToken)
  } catch {
    throw new Error('Invalid Azure credentials')
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(container)
  
  const audioExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac']
  const files: any[] = []
  
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (audioExtensions.some(ext => blob.name.toLowerCase().endsWith(ext))) {
      files.push({
        name: blob.name.split('/').pop(),
        fullPath: `https://${containerClient.accountName}.blob.core.windows.net/${container}/${blob.name}`,
        size: blob.properties.contentLength || 0
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
  const aggregates = await prisma.dataSource.aggregate({
    where: { datasetId, status: 'ACTIVE' },
    _sum: {
      numRecordings: true,
      durationHours: true,
      sizeBytes: true
    }
  })

  const sources = await prisma.dataSource.findMany({
    where: { datasetId, status: 'ACTIVE' },
    select: { sampleRate: true, codec: true, language: true }
  })

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
      numRecordings: aggregates._sum.numRecordings || 0,
      totalDurationHours: aggregates._sum.durationHours || 0,
      storageSize: aggregates._sum.sizeBytes || BigInt(0),
      totalSizeBytes: aggregates._sum.sizeBytes || BigInt(0),
      primarySampleRate,
      primaryCodec,
      primaryLanguage,
      language: primaryLanguage,
    }
  })
}
