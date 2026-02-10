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
    const result = PIIDetector.detect(data, sampleSize)

    // Get anonymization suggestions
    const suggestions = PIIDetector.suggestAnonymization(result)

    return NextResponse.json({
      detection: result,
      suggestions,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[PIIDetection] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
