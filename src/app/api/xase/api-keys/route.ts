import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const keys = await prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyHash: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    })

    return NextResponse.json({ keys })
  } catch (error: any) {
    console.error('[API] GET /api/xase/api-keys error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }

    // Generate API key: xase_<random_32_chars>
    const randomBytes = crypto.randomBytes(24)
    const key = `xase_${randomBytes.toString('base64url')}`
    const keyPrefix = key.substring(0, 12) // First 12 chars for identification
    
    // Hash the key for storage
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        keyPrefix,
        isActive: true,
      },
    })

    return NextResponse.json({ 
      id: apiKey.id,
      name: apiKey.name,
      key, // Return the plain key only once
      createdAt: apiKey.createdAt,
    })
  } catch (error: any) {
    console.error('[API] POST /api/xase/api-keys error:', error)
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: 'Internal Server Error', ...(isDev ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
