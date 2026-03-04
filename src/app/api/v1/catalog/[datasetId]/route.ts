/**
 * Dataset Catalog Detail API
 */

import { NextRequest, NextResponse } from 'next/server'
import { DatasetCatalog } from '@/lib/catalog/dataset-catalog'
import { protectApiEndpoint } from '@/lib/security/api-protection'
import { validateDatasetId } from '@/lib/validation/input-validator'

export async function GET(
  request: NextRequest,
  { params }: { params: { datasetId: string } }
) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: false,
    endpoint: 'catalog-detail',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    // Validate dataset ID
    const datasetId = validateDatasetId(params.datasetId)

    // Get dataset details
    const dataset = await DatasetCatalog.getById(datasetId)

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      )
    }

    // Get similar datasets
    const similar = await DatasetCatalog.getSimilar(datasetId, 5)

    const response = NextResponse.json({
      dataset,
      similar,
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Catalog detail error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
