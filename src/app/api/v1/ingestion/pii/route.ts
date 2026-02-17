/**
 * API endpoint for PII detection and masking
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PIIDetector, PIIMaskingPipeline } from '@/lib/ingestion/pii-detector'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, data, options } = body

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Data array is required' },
        { status: 400 }
      )
    }

    const pipeline = new PIIMaskingPipeline()

    if (action === 'scan') {
      const result = await pipeline.process(data, {
        scanOnly: true,
        generateReport: options?.generateReport !== false,
      })
      return NextResponse.json(result)
    }

    if (action === 'mask') {
      const result = await pipeline.process(data, {
        scanOnly: false,
        maskingOptions: options?.maskingOptions,
        generateReport: options?.generateReport !== false,
      })
      return NextResponse.json(result)
    }

    if (action === 'validate') {
      const { original, masked } = body
      if (!original || !masked) {
        return NextResponse.json(
          { error: 'Both original and masked data required' },
          { status: 400 }
        )
      }
      const detector = pipeline.getDetector()
      const validation = await detector.validateMasking(original, masked)
      return NextResponse.json(validation)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[API] POST /api/v1/ingestion/pii error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const detector = new PIIDetector()
    const supportedTypes = detector.getSupportedTypes()

    return NextResponse.json({
      supportedTypes,
      count: supportedTypes.length,
    })
  } catch (error: any) {
    console.error('[API] GET /api/v1/ingestion/pii error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
