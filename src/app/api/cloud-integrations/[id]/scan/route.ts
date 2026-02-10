// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/services/encryption'

interface FileMetadata {
  name: string
  fullPath: string
  size: number
  created?: Date
  contentType?: string
}

interface ScanResults {
  numRecordings: number
  totalSizeBytes: number
  estimatedDurationHours: number
  inferredMetadata: {
    sampleRate: number
    codec: string
    channelCount: number
    language: string
  }
  files: FileMetadata[]
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storageLocation } = await request.json()
    
    if (!storageLocation) {
      return NextResponse.json({ error: 'storageLocation required' }, { status: 400 })
    }

    // Get integration and verify ownership
    const integration = await prisma.cloudIntegration.findUnique({
      where: { id },
      include: { tenant: true }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Verify user has access to this tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (user?.tenantId !== integration.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse storage location to get bucket and prefix
    const { bucket, prefix } = parseStorageLocation(storageLocation)

    // Scan folder based on provider
    let files: FileMetadata[] = []
    
    switch (integration.provider) {
      case 'GCS':
        files = await scanGCSFolder(integration, bucket, prefix)
        break
      case 'AWS_S3':
        files = await scanS3Folder(integration, bucket, prefix)
        break
      case 'AZURE_BLOB':
        files = await scanAzureFolder(integration, bucket, prefix)
        break
      default:
        return NextResponse.json(
          { error: 'Provider not supported for scanning' },
          { status: 400 }
        )
    }

    // Filter audio files only
    const audioFiles = files.filter(f => 
      /\.(wav|mp3|flac|ogg|m4a|aac|wma|opus)$/i.test(f.name)
    )

    if (audioFiles.length === 0) {
      return NextResponse.json(
        { error: 'No audio files found in this folder' },
        { status: 400 }
      )
    }

    // Calculate aggregates
    const totalSize = audioFiles.reduce((sum, f) => sum + f.size, 0)
    const estimatedDuration = estimateTotalDuration(audioFiles)

    // Infer metadata from file extensions
    const inferredMetadata = inferMetadataFromFiles(audioFiles)

    const results: ScanResults = {
      numRecordings: audioFiles.length,
      totalSizeBytes: totalSize,
      estimatedDurationHours: estimatedDuration,
      inferredMetadata,
      files: audioFiles.slice(0, 10) // Preview first 10
    }

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to scan folder' },
      { status: 500 }
    )
  }
}

function parseStorageLocation(location: string): { bucket: string; prefix: string } {
  // gs://bucket/path/to/folder/
  // s3://bucket/path/to/folder/
  // https://account.blob.core.windows.net/container/path/
  
  if (location.startsWith('gs://')) {
    const parts = location.replace('gs://', '').split('/')
    const bucket = parts[0]
    const prefix = parts.slice(1).join('/')
    return { bucket, prefix: prefix.replace(/\/$/, '') }
  }
  
  if (location.startsWith('s3://')) {
    const parts = location.replace('s3://', '').split('/')
    const bucket = parts[0]
    const prefix = parts.slice(1).join('/')
    return { bucket, prefix: prefix.replace(/\/$/, '') }
  }
  
  if (location.includes('.blob.core.windows.net')) {
    const url = new URL(location)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const bucket = pathParts[0]
    const prefix = pathParts.slice(1).join('/')
    return { bucket, prefix: prefix.replace(/\/$/, '') }
  }
  
  throw new Error('Invalid storage location format')
}

async function scanGCSFolder(
  integration: any,
  bucket: string,
  prefix: string
): Promise<FileMetadata[]> {
  let accessToken: string
  
  if (integration.encryptedAccessToken) {
    accessToken = decryptToken(integration.encryptedAccessToken)
  } else if (integration.encryptedRefreshToken) {
    // Refresh token if needed
    accessToken = await refreshGoogleAccessToken(integration)
  } else {
    throw new Error('No credentials found')
  }

  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`)
  if (prefix) url.searchParams.set('prefix', prefix)
  url.searchParams.set('maxResults', '10000')

  let resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (resp.status === 401 || resp.status === 403) {
    accessToken = await refreshGoogleAccessToken(integration)
    resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GCS scan failed: ${text}`)
  }

  const data = await resp.json()
  const items = data.items || []

  return items
    .filter((item: any) => !item.name.endsWith('/')) // Skip folders
    .map((item: any) => ({
      name: item.name.split('/').pop() || item.name,
      fullPath: `gs://${bucket}/${item.name}`,
      size: parseInt(item.size || '0'),
      created: item.timeCreated ? new Date(item.timeCreated) : undefined,
      contentType: item.contentType
    }))
}

async function scanS3Folder(
  integration: any,
  bucket: string,
  prefix: string
): Promise<FileMetadata[]> {
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
  
  let credentials: any
  try {
    const creds = JSON.parse(decryptToken(integration.encryptedAccessToken))
    credentials = {
      accessKeyId: creds.accessKeyId || creds.access_key_id,
      secretAccessKey: creds.secretAccessKey || creds.secret_access_key
    }
  } catch {
    throw new Error('Invalid S3 credentials')
  }

  const s3Client = new S3Client({
    region: integration.region || 'us-east-1',
    credentials
  })

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix || '',
    MaxKeys: 10000
  })

  const response = await s3Client.send(command)
  const objects = response.Contents || []

  return objects
    .filter(obj => obj.Key && !obj.Key.endsWith('/'))
    .map(obj => ({
      name: obj.Key!.split('/').pop() || obj.Key!,
      fullPath: `s3://${bucket}/${obj.Key}`,
      size: obj.Size || 0,
      created: obj.LastModified,
      contentType: undefined
    }))
}

async function scanAzureFolder(
  integration: any,
  container: string,
  prefix: string
): Promise<FileMetadata[]> {
  const { BlobServiceClient } = await import('@azure/storage-blob')
  
  const accountName = integration.accountName
  const accountKey = decryptToken(integration.encryptedAccessToken)
  
  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(container)

  const files: FileMetadata[] = []
  
  for await (const blob of containerClient.listBlobsFlat({
    prefix: prefix || ''
  })) {
    if (!blob.name.endsWith('/')) {
      files.push({
        name: blob.name.split('/').pop() || blob.name,
        fullPath: `https://${accountName}.blob.core.windows.net/${container}/${blob.name}`,
        size: blob.properties.contentLength || 0,
        created: blob.properties.createdOn,
        contentType: blob.properties.contentType
      })
    }
  }

  return files
}

async function refreshGoogleAccessToken(integration: any): Promise<string> {
  if (!integration.encryptedRefreshToken) {
    throw new Error('No refresh token available')
  }
  
  const refreshToken = decryptToken(integration.encryptedRefreshToken)
  const clientId = process.env.GCS_CLIENT_ID
  const clientSecret = process.env.GCS_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured')
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }) as any,
  })

  if (!resp.ok) {
    throw new Error('Failed to refresh token')
  }

  const data = await resp.json()
  const newAccessToken = data.access_token

  // Update in database
  const { encryptToken } = await import('@/lib/services/encryption')
  await prisma.cloudIntegration.update({
    where: { id: integration.id },
    data: {
      encryptedAccessToken: encryptToken(newAccessToken),
      tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    },
  })

  return newAccessToken
}

function estimateTotalDuration(files: FileMetadata[]): number {
  // Conservative estimate for audio files
  // Assume average bitrate of 256 kbps (32 KB/s)
  // 1 hour = 32 KB/s × 3600 sec = 115.2 MB
  
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const avgBytesPerSecond = 32000 // 256 kbps
  const totalSeconds = totalBytes / avgBytesPerSecond
  
  return totalSeconds / 3600 // hours
}

function inferMetadataFromFiles(files: FileMetadata[]): {
  sampleRate: number
  codec: string
  channelCount: number
  language: string
} {
  // Infer codec from most common extension
  const extensions = files.map(f => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ext || 'unknown'
  })
  
  const codecCounts: Record<string, number> = {}
  extensions.forEach(ext => {
    codecCounts[ext] = (codecCounts[ext] || 0) + 1
  })
  
  const mostCommonCodec = Object.entries(codecCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'wav'

  // Default assumptions (can be refined with actual file analysis later)
  return {
    sampleRate: 16000, // Common for voice
    codec: mostCommonCodec,
    channelCount: 1, // Mono is common for voice
    language: 'en-US' // Default, should be user-selectable
  }
}
