export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptToken, encryptToken } from '@/lib/services/encryption'
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { Storage } from '@google-cloud/storage'
import { BlobServiceClient } from '@azure/storage-blob'
import { BigQuery } from '@google-cloud/bigquery'
import { OAuth2Client } from 'google-auth-library'

interface Asset {
  name: string
  path: string
  fullPath: string
  type: 'folder' | 'file'
  size?: number
  lastModified?: string
}

// Helper to get decrypted credentials
function getCredentials(integration: any): string {
  if (integration.encryptedAccessToken) {
    return decryptToken(integration.encryptedAccessToken)
  }
  if (integration.encryptedRefreshToken) {
    return decryptToken(integration.encryptedRefreshToken)
  }
  throw new Error('No credentials found')
}

// Refresh Google OAuth access token using refresh_token and persist
async function refreshGoogleAccessToken(integration: any): Promise<string> {
  if (!integration.encryptedRefreshToken) {
    throw new Error('No refresh token available. Please reconnect your integration.')
  }
  const refreshToken = decryptToken(integration.encryptedRefreshToken)
  const clientId = process.env.GCS_CLIENT_ID
  const clientSecret = process.env.GCS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client not configured on server')
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
    const text = await resp.text()
    throw new Error(`Failed to refresh Google token: ${text}`)
  }
  const data = await resp.json()
  const newAccessToken: string = data.access_token
  const expiresIn: number | undefined = data.expires_in

  await prisma.cloudIntegration.update({
    where: { id: integration.id },
    data: {
      encryptedAccessToken: encryptToken(newAccessToken),
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    },
  })

  return newAccessToken
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path') || ''
    const projectIdParam = (searchParams.get('projectId') || '').trim() || undefined

    // Validate path format
    if (path && (path.includes('..') || path.startsWith('/'))) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }

    // Get integration and verify ownership
    const integration = await prisma.cloudIntegration.findUnique({
      where: { id },
      include: { tenant: true }
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Check integration status
    if (integration.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Integration is ${integration.status}. Please reconnect.` },
        { status: 400 }
      )
    }

    // Verify user has access to this tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    })

    if (user?.tenantId !== integration.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate required credentials exist
    if (!integration.encryptedAccessToken && !integration.encryptedRefreshToken) {
      return NextResponse.json(
        { error: 'Integration credentials not found. Please reconnect.' },
        { status: 400 }
      )
    }

    // Browse based on provider
    let assets: Asset[] = []

    try {
      switch (integration.provider) {
        case 'AWS_S3':
          assets = await browseS3(integration, path)
          break
        case 'GCS':
          assets = await browseGCS(integration, path, projectIdParam)
          break
        case 'AZURE_BLOB':
          assets = await browseAzure(integration, path)
          break
        case 'BIGQUERY':
          assets = await browseBigQuery(integration, path, projectIdParam)
          break
        default:
          return NextResponse.json(
            { error: 'Provider not supported for browsing' },
            { status: 400 }
          )
      }
    } catch (providerError: any) {
      console.error(`${integration.provider} browse error:`, providerError)
      
      // Check for common authentication errors
      if (providerError.message?.includes('credentials') || 
          providerError.message?.includes('authentication') ||
          providerError.message?.includes('unauthorized') ||
          providerError.message?.includes('access denied')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please reconnect your integration.' },
          { status: 401 }
        )
      }
      
      throw providerError
    }

    return NextResponse.json({ assets })
  } catch (error: any) {
    console.error('Browse error:', error)
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

async function browseS3(integration: any, path: string): Promise<Asset[]> {
  try {
    // For S3, credentials might be stored as JSON with accessKeyId and secretAccessKey
    // or as separate fields. Try to parse from encrypted token first.
    let accessKeyId: string
    let secretAccessKey: string
    
    try {
      const credentials = JSON.parse(getCredentials(integration))
      accessKeyId = credentials.accessKeyId || credentials.access_key_id
      secretAccessKey = credentials.secretAccessKey || credentials.secret_access_key
    } catch {
      // If not JSON, assume it's the secret key and look for accessKeyId in metadata
      secretAccessKey = getCredentials(integration)
      accessKeyId = integration.accountName || integration.projectId || ''
    }
    
    const s3Client = new S3Client({
      region: integration.region || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })

    // If no path, list buckets
    if (!path) {
      const command = new ListBucketsCommand({})
      const response = await s3Client.send(command)
      
      return (response.Buckets || []).map(bucket => ({
        name: bucket.Name!,
        path: bucket.Name!,
        fullPath: `s3://${bucket.Name}/`,
        type: 'folder' as const
      }))
    }

    // Parse bucket and prefix
    const parts = path.split('/').filter(Boolean)
    const bucket = parts[0]
    const prefix = parts.slice(1).join('/')

    // List objects in bucket with prefix
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix ? `${prefix}/` : '',
      Delimiter: '/'
    })
    
    const response = await s3Client.send(command)
    const assets: Asset[] = []

    // Add folders (common prefixes)
    if (response.CommonPrefixes) {
      for (const prefix of response.CommonPrefixes) {
        const folderName = prefix.Prefix!.split('/').filter(Boolean).pop()!
        const folderPath = prefix.Prefix!.replace(/\/$/, '')
        assets.push({
          name: folderName,
          path: `${bucket}/${folderPath}`,
          fullPath: `s3://${bucket}/${folderPath}/`,
          type: 'folder'
        })
      }
    }

    // Add files
    if (response.Contents) {
      for (const obj of response.Contents) {
        // Skip the folder itself
        if (obj.Key!.endsWith('/')) continue
        
        const fileName = obj.Key!.split('/').pop()!
        assets.push({
          name: fileName,
          path: `${bucket}/${obj.Key}`,
          fullPath: `s3://${bucket}/${obj.Key}`,
          type: 'file',
          size: obj.Size,
          lastModified: obj.LastModified?.toISOString()
        })
      }
    }

    return assets
  } catch (error: any) {
    console.error('S3 browse error:', error)
    throw new Error(`Failed to browse S3: ${error.message}`)
  }
}

async function browseGCS(integration: any, path: string, projectIdOverride?: string): Promise<Asset[]> {
  try {
    // Decide between Service Account JSON vs OAuth tokens
    let decrypted: string | null = null
    if (integration.encryptedAccessToken) {
      decrypted = decryptToken(integration.encryptedAccessToken)
    } else if (integration.encryptedRefreshToken) {
      // We only have a refresh token; we'll refresh to get an access token
      decrypted = decryptToken(integration.encryptedRefreshToken)
    } else {
      throw new Error('No credentials found')
    }

    let projectId = projectIdOverride || integration.projectId

    // Try to parse as Service Account JSON; if it parses and has private_key, use SDK path
    let parsed: any | null = null
    try {
      parsed = JSON.parse(decrypted!)
    } catch {}

    const looksLikeServiceAccount = parsed && typeof parsed === 'object' && !!parsed.private_key

    // OAuth token path (string token)
    if (!looksLikeServiceAccount) {
      // Ensure we have a valid access token
      let accessToken: string
      if (integration.encryptedAccessToken) {
        accessToken = decryptToken(integration.encryptedAccessToken)
      } else if (integration.encryptedRefreshToken) {
        // Proactively refresh to obtain a fresh access token
        accessToken = await refreshGoogleAccessToken(integration)
      } else {
        throw new Error('Missing OAuth credentials')
      }
      if (!projectId) {
        throw new Error('Missing projectId. Provide integration.projectId or ?projectId= in query when using OAuth token.')
      }

      // If no path, list buckets for the project
      if (!path) {
        const url = `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}`
        let resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        // Retry once with refreshed token on 401/403
        if (resp.status === 401 || resp.status === 403) {
          accessToken = await refreshGoogleAccessToken(integration)
          resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        }
        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(text || `GCS list buckets failed with ${resp.status}`)
        }
        const data = await resp.json()
        const items = Array.isArray(data.items) ? data.items : []
        return items.map((b: any) => ({
          name: b.name,
          path: b.name,
          fullPath: `gs://${b.name}/`,
          type: 'folder' as const
        }))
      }

      // Parse bucket and prefix
      const parts = path.split('/').filter(Boolean)
      const bucketName = parts[0]
      const prefix = parts.slice(1).join('/')

      const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o`)
      if (prefix) url.searchParams.set('prefix', `${prefix}/`)
      url.searchParams.set('delimiter', '/')
      let resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      if (resp.status === 401 || resp.status === 403) {
        accessToken = await refreshGoogleAccessToken(integration)
        resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      }
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `GCS list objects failed with ${resp.status}`)
      }
      const data = await resp.json()
      const assets: Asset[] = []

      // Folders come in prefixes
      const prefixes: string[] = data.prefixes || []
      for (const p of prefixes) {
        const folderPath = p.replace(/\/$/, '')
        const folderName = folderPath.split('/').pop()!
        assets.push({
          name: folderName,
          path: `${bucketName}/${folderPath}`,
          fullPath: `gs://${bucketName}/${folderPath}/`,
          type: 'folder'
        })
      }

      // Files come in items
      const items: any[] = data.items || []
      for (const obj of items) {
        const fileName = (obj.name as string).split('/').pop()!
        if (!fileName) continue
        assets.push({
          name: fileName,
          path: `${bucketName}/${obj.name}`,
          fullPath: `gs://${bucketName}/${obj.name}`,
          type: 'file',
          size: obj.size ? parseInt(obj.size) : undefined,
          lastModified: obj.updated
        })
      }

      return assets
    }

    // Service Account path: use official SDK
    const serviceAccountKey = parsed!
    if (!projectId) {
      projectId = serviceAccountKey.project_id
    }
    if (!projectId) {
      throw new Error('Unable to detect projectId from service account JSON. Ensure project_id is present or pass ?projectId= in query.')
    }
    const storage = new Storage({ projectId, credentials: serviceAccountKey })

    if (!path) {
      const [buckets] = await storage.getBuckets()
      return buckets.map(bucket => ({
        name: bucket.name,
        path: bucket.name,
        fullPath: `gs://${bucket.name}/`,
        type: 'folder' as const
      }))
    }

    // Parse bucket and prefix
    const parts = path.split('/').filter(Boolean)
    const bucketName = parts[0]
    const prefix = parts.slice(1).join('/')

    const bucket = storage.bucket(bucketName)
    const [files] = await bucket.getFiles({
      prefix: prefix ? `${prefix}/` : '',
      delimiter: '/'
    })

    const assets: Asset[] = []
    const folders = new Set<string>()

    for (const file of files) {
      const relativePath = file.name.substring(prefix ? prefix.length + 1 : 0)
      const parts = relativePath.split('/')
      if (parts.length > 1) {
        folders.add(parts[0])
      } else if (parts[0]) {
        const metadata = file.metadata
        assets.push({
          name: parts[0],
          path: `${bucketName}/${file.name}`,
          fullPath: `gs://${bucketName}/${file.name}`,
          type: 'file',
          size: typeof metadata.size === 'string' ? parseInt(metadata.size) : metadata.size,
          lastModified: metadata.updated
        })
      }
    }

    for (const folder of folders) {
      const folderPath = prefix ? `${prefix}/${folder}` : folder
      assets.unshift({
        name: folder,
        path: `${bucketName}/${folderPath}`,
        fullPath: `gs://${bucketName}/${folderPath}/`,
        type: 'folder'
      })
    }

    return assets
  } catch (error: any) {
    console.error('GCS browse error:', error)
    throw new Error(`Failed to browse GCS: ${error.message}`)
  }
}

async function browseAzure(integration: any, path: string): Promise<Asset[]> {
  try {
    const accountName = integration.accountName
    const accountKey = getCredentials(integration)
    
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

    // If no path, list containers
    if (!path) {
      const containers: Asset[] = []
      
      for await (const container of blobServiceClient.listContainers()) {
        containers.push({
          name: container.name,
          path: container.name,
          fullPath: `https://${accountName}.blob.core.windows.net/${container.name}/`,
          type: 'folder'
        })
      }
      
      return containers
    }

    // Parse container and prefix
    const parts = path.split('/').filter(Boolean)
    const containerName = parts[0]
    const prefix = parts.slice(1).join('/')

    const containerClient = blobServiceClient.getContainerClient(containerName)
    const assets: Asset[] = []
    const folders = new Set<string>()

    // List blobs with hierarchy
    const delimiter = '/'
    const listOptions = {
      prefix: prefix ? `${prefix}/` : '',
      includeMetadata: true
    }

    for await (const item of containerClient.listBlobsByHierarchy(delimiter, listOptions)) {
      if (item.kind === 'prefix') {
        // This is a folder
        const folderName = item.name.replace(prefix ? `${prefix}/` : '', '').replace(/\/$/, '')
        if (folderName) {
          assets.push({
            name: folderName,
            path: `${containerName}/${item.name.replace(/\/$/, '')}`,
            fullPath: `https://${accountName}.blob.core.windows.net/${containerName}/${item.name}`,
            type: 'folder'
          })
        }
      } else {
        // This is a blob (file)
        const fileName = item.name.split('/').pop()!
        assets.push({
          name: fileName,
          path: `${containerName}/${item.name}`,
          fullPath: `https://${accountName}.blob.core.windows.net/${containerName}/${item.name}`,
          type: 'file',
          size: item.properties.contentLength,
          lastModified: item.properties.lastModified?.toISOString()
        })
      }
    }

    return assets
  } catch (error: any) {
    console.error('Azure browse error:', error)
    throw new Error(`Failed to browse Azure: ${error.message}`)
  }
}

// Snowflake support temporarily disabled

async function browseBigQuery(integration: any, path: string, projectIdOverride?: string): Promise<Asset[]> {
  try {
    const raw = getCredentials(integration)
    let bigquery: BigQuery
    let projectId = projectIdOverride || integration.projectId
    if (raw.startsWith('ya29.')) {
      const client = new OAuth2Client()
      client.setCredentials({ access_token: raw })
      if (!projectId) {
        throw new Error('Missing projectId. Provide integration.projectId or ?projectId= in query when using OAuth token.')
      }
      bigquery = new BigQuery({ projectId, authClient: client as any })
    } else {
      const serviceAccountKey = JSON.parse(raw)
      if (!projectId) {
        projectId = serviceAccountKey.project_id
      }
      if (!projectId) {
        throw new Error('Unable to detect projectId from service account JSON. Ensure project_id is present or pass ?projectId= in query.')
      }
      bigquery = new BigQuery({
        projectId,
        credentials: serviceAccountKey
      })
    }

    const parts = path.split('/').filter(Boolean)

    // If no path, return the project itself (BigQuery always starts with a project)
    if (!path) {
      return [{
        name: integration.projectId,
        path: integration.projectId,
        fullPath: `bigquery://${integration.projectId}`,
        type: 'folder'
      }]
    }

    // If only project, list datasets
    if (parts.length === 1) {
      const [datasets] = await bigquery.getDatasets()
      
      return datasets.map(dataset => ({
        name: dataset.id!,
        path: `${parts[0]}/${dataset.id}`,
        fullPath: `bigquery://${parts[0]}/${dataset.id}`,
        type: 'folder'
      }))
    }

    // If project and dataset, list tables
    if (parts.length === 2) {
      const datasetId = parts[1]
      const dataset = bigquery.dataset(datasetId)
      const [tables] = await dataset.getTables()
      
      return tables.map(table => ({
        name: table.id!,
        path: `${parts[0]}/${parts[1]}/${table.id}`,
        fullPath: `bigquery://${parts[0]}.${parts[1]}.${table.id}`,
        type: 'file'
      }))
    }

    return []
  } catch (error: any) {
    console.error('BigQuery browse error:', error)
    throw new Error(`Failed to browse BigQuery: ${error.message}`)
  }
}
