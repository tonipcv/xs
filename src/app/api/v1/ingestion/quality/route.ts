/**
 * API endpoint for data quality validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DataQualityValidator } from '@/lib/ingestion/quality-validator'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { data, rules, thresholds } = body

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Data array is required' },
        { status: 400 }
      )
    }

    const validator = new DataQualityValidator(rules, thresholds)
    const report = await validator.validate(data)

    return NextResponse.json(report)
  } catch (error: any) {
    console.error('[API] POST /api/v1/ingestion/quality error:', error)
    return NextResponse.json(
      { error: error.message || 'Validation failed' },
      { status: 500 }
    )
  }
}
