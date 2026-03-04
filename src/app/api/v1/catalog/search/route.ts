/**
 * Dataset Catalog Search API
 */

import { NextRequest, NextResponse } from 'next/server'
import { DatasetCatalog } from '@/lib/catalog/dataset-catalog'
import { protectApiEndpoint } from '@/lib/security/api-protection'
import { safeValidate, PaginationSchema } from '@/lib/validation/input-validator'

export async function GET(request: NextRequest) {
  // Protect endpoint with rate limiting and authentication
  const protection = await protectApiEndpoint(request, {
    requireApiKey: false,
    endpoint: 'catalog-search',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const { searchParams } = new URL(request.url)

    // Parse filters
    const filters = {
      language: searchParams.getAll('language'),
      dataType: searchParams.getAll('dataType'),
      consentStatus: searchParams.getAll('consentStatus'),
      jurisdiction: searchParams.getAll('jurisdiction'),
      allowedPurposes: searchParams.getAll('allowedPurposes'),
      status: searchParams.getAll('status'),
      searchQuery: searchParams.get('q') || undefined,
      minDurationHours: searchParams.get('minDurationHours') 
        ? parseFloat(searchParams.get('minDurationHours')!)
        : undefined,
      maxDurationHours: searchParams.get('maxDurationHours')
        ? parseFloat(searchParams.get('maxDurationHours')!)
        : undefined,
      minRecordings: searchParams.get('minRecordings')
        ? parseInt(searchParams.get('minRecordings')!)
        : undefined,
      maxRecordings: searchParams.get('maxRecordings')
        ? parseInt(searchParams.get('maxRecordings')!)
        : undefined,
      tenantId: protection.tenantId,
    }

    // Parse pagination
    const paginationResult = safeValidate(PaginationSchema, {
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    })

    if (!paginationResult.success) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', details: paginationResult.errors },
        { status: 400 }
      )
    }

    // Parse sortBy separately with type validation
    const sortBy = searchParams.get('sortBy')
    const validSortFields = ['createdAt', 'updatedAt', 'totalDurationHours', 'numRecordings', 'name']
    const sortByValue = sortBy && validSortFields.includes(sortBy) 
      ? sortBy as 'createdAt' | 'updatedAt' | 'totalDurationHours' | 'numRecordings' | 'name'
      : undefined

    // Execute search
    const result = await DatasetCatalog.search(filters, {
      ...paginationResult.data,
      sortBy: sortByValue,
    })

    const response = NextResponse.json(result)
    
    // Add rate limit headers
    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Catalog search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
