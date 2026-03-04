/**
 * Trending Datasets API
 */

import { NextRequest, NextResponse } from 'next/server'
import { DatasetCatalog } from '@/lib/catalog/dataset-catalog'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: false,
    endpoint: 'catalog-trending',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '10'),
      50
    )

    const trending = await DatasetCatalog.getTrending(limit)

    const response = NextResponse.json({
      datasets: trending,
      count: trending.length,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Trending datasets error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
