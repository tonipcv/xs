/**
 * Cohort Templates API
 */

import { NextRequest, NextResponse } from 'next/server'
import { CohortBuilder } from '@/lib/cohort/cohort-builder'
import { protectApiEndpoint } from '@/lib/security/api-protection'

export async function GET(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: false,
    endpoint: 'cohort-templates',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const templates = {
      ageRange: {
        name: 'Age Range',
        description: 'Filter by age range',
        example: CohortBuilder.templates.ageRange(18, 65),
      },
      language: {
        name: 'Language Filter',
        description: 'Filter by language(s)',
        example: CohortBuilder.templates.language(['en-US', 'pt-BR']),
      },
      qualityThreshold: {
        name: 'Quality Threshold',
        description: 'Filter by audio quality metrics',
        example: CohortBuilder.templates.qualityThreshold(20, 0.7),
      },
      consentVerified: {
        name: 'Consent Verified',
        description: 'Only verified consent records',
        example: CohortBuilder.templates.consentVerified(),
      },
      dateRange: {
        name: 'Date Range',
        description: 'Filter by date range',
        example: CohortBuilder.templates.dateRange(
          'createdAt',
          new Date('2024-01-01'),
          new Date('2024-12-31')
        ),
      },
    }

    const response = NextResponse.json({ templates })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Cohort templates error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
