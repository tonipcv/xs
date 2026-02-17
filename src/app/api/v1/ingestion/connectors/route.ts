/**
 * API endpoint for data connector management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ConnectorFactory } from '@/lib/ingestion/connectors/factory'
import { ConnectorConfig } from '@/lib/ingestion/connectors/base'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supportedTypes = ConnectorFactory.getSupportedTypes()

    return NextResponse.json({
      supportedTypes,
      count: supportedTypes.length,
    })
  } catch (error: any) {
    console.error('[API] GET /api/v1/ingestion/connectors error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const config: ConnectorConfig = body

    const validation = ConnectorFactory.validateConfig(config)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid configuration', details: validation.errors },
        { status: 400 }
      )
    }

    const connector = ConnectorFactory.create(config)
    
    await connector.connect()
    const testResult = await connector.testConnection()
    
    if (!testResult) {
      await connector.disconnect()
      return NextResponse.json(
        { error: 'Connection test failed' },
        { status: 400 }
      )
    }

    const sources = await connector.listSources()
    await connector.disconnect()

    return NextResponse.json({
      success: true,
      type: config.type,
      sourcesFound: sources.length,
      sources: sources.slice(0, 10),
    })
  } catch (error: any) {
    console.error('[API] POST /api/v1/ingestion/connectors error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
