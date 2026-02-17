export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantId } from '@/lib/xase/server-auth'
import { encrypt } from '@/lib/services/encryption'

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

    // Fetch saved connectors from database
    const connectors = await prisma.dataConnector.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastTestedAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ connectors })
  } catch (error: any) {
    console.error(`Error fetching connectors: ${error?.message || String(error)}`)
    return NextResponse.json({ error: error?.message || 'Failed to fetch connectors' }, { status: 500 })
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
    const { name, type, connectionString, credentials } = body

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
    }

    // Map incoming type string to enum (ConnectorType) format (e.g., postgres -> POSTGRES)
    const typeEnum = String(type).toUpperCase().replace(/[^A-Z0-9_]/g, '_') as any

    // Encrypt secrets if provided
    const encConn = connectionString ? encrypt(connectionString) : null
    const encCreds = credentials ? encrypt(JSON.stringify(credentials)) : null

    // Create or update connector (unique on [tenantId, type, name])
    const connector = await prisma.dataConnector.upsert({
      where: {
        tenantId_type_name: {
          tenantId,
          type: typeEnum,
          name,
        },
      },
      update: {
        name,
        type: typeEnum,
        encryptedConnectionString: encConn,
        encryptedCredentials: encCreds,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        name,
        type: typeEnum,
        encryptedConnectionString: encConn,
        encryptedCredentials: encCreds,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({ connector, message: 'Connector saved successfully' })
  } catch (error: any) {
    console.error(`Error saving connector: ${error?.message || String(error)}`)
    return NextResponse.json({ error: error?.message || 'Failed to save connector' }, { status: 500 })
  }
}
