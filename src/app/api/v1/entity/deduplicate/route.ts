/**
 * Entity Deduplication API
 */

import { NextRequest, NextResponse } from 'next/server'
import { EntityResolution } from '@/lib/entity/entity-resolution'
import { protectApiEndpoint } from '@/lib/security/api-protection'
import { z } from 'zod'

const DeduplicateSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string(),
      identifiers: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        dateOfBirth: z.string().optional(),
        ssn: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        medicalRecordNumber: z.string().optional(),
      }),
    })
  ),
})

export async function POST(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'entity-deduplicate',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const body = await request.json()

    const validation = DeduplicateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.errors },
        { status: 400 }
      )
    }

    const duplicates = EntityResolution.deduplicateEntities(validation.data.entities)

    // Audit operation
    await EntityResolution.auditResolution(
      protection.tenantId!,
      'DEDUPLICATE',
      validation.data.entities.length,
      duplicates.length
    )

    const response = NextResponse.json({
      duplicates,
      totalEntities: validation.data.entities.length,
      duplicateGroups: duplicates.length,
      uniqueEntities: validation.data.entities.length - duplicates.reduce((sum, d) => sum + d.duplicateIds.length, 0),
    })

    if (protection.headers) {
      Object.entries(protection.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  } catch (error) {
    console.error('[API] Entity deduplication error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
