/**
 * PII DETECTION API
 * 
 * Endpoint para detectar PII em datasets
 */

import { NextRequest, NextResponse } from 'next/server'
import { PIIDetector } from '@/lib/xase/privacy-toolkit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    // Validate session (replacing missing validateApiKey)
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { data, sampleSize = 100 } = body

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'data array is required' },
        { status: 400 }
      )
    }

    // Run PII detection
    const detector = new PIIDetector()
    const result = await detector.detect(JSON.stringify(data))

    return NextResponse.json({
      detection: result,
      suggestions: [],
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[PIIDetection] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', ...(process.env.NODE_ENV !== 'production' ? { debug: String(error?.message ?? error) } : {}) },
      { status: 500 }
    )
  }
}
