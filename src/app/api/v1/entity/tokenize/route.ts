/**
 * Entity Tokenization API
 */

import { NextRequest, NextResponse } from 'next/server'
import { EntityResolution } from '@/lib/entity/entity-resolution'
import { protectApiEndpoint } from '@/lib/security/api-protection'
import { z } from 'zod'

const TokenizeSchema = z.object({
  identifiers: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    ssn: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    medicalRecordNumber: z.string().optional(),
    customId: z.string().optional(),
  }),
  returnSummaryOnly: z.boolean().optional(),
})

const BatchTokenizeSchema = z.object({
  entities: z.array(TokenizeSchema.shape.identifiers),
  returnSummaryOnly: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const protection = await protectApiEndpoint(request, {
    requireApiKey: true,
    requireTenant: true,
    endpoint: 'entity-tokenize',
  })

  if (!protection.allowed) {
    return NextResponse.json(
      { error: protection.error },
      { status: protection.statusCode }
    )
  }

  try {
    const body = await request.json()

    // Check if batch or single
    const isBatch = Array.isArray(body.entities)

    if (isBatch) {
      // Batch tokenization
      const validation = BatchTokenizeSchema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validation.error.errors },
          { status: 400 }
        )
      }

      // Validate each entity
      const validationResults = validation.data.entities.map(identifiers =>
        EntityResolution.validateIdentifiers(identifiers)
      )

      const hasErrors = validationResults.some(r => !r.valid)
      if (hasErrors) {
        return NextResponse.json(
          {
            error: 'Invalid identifiers in batch',
            validationResults,
          },
          { status: 400 }
        )
      }

      // Tokenize batch
      const results = EntityResolution.batchTokenize(validation.data.entities)

      // Audit operation
      await EntityResolution.auditResolution(
        protection.tenantId!,
        'BATCH_TOKENIZE',
        validation.data.entities.length,
        results.length
      )

      const response = NextResponse.json({
        results: validation.data.returnSummaryOnly
          ? results.map(r => ({
              entityToken: r.entityToken,
              confidence: r.confidence,
              matchingStrategy: r.matchingStrategy,
            }))
          : results,
        count: results.length,
      })

      if (protection.headers) {
        Object.entries(protection.headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      }

      return response
    } else {
      // Single tokenization
      const validation = TokenizeSchema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validation.error.errors },
          { status: 400 }
        )
      }

      // Validate identifiers
      const validationResult = EntityResolution.validateIdentifiers(validation.data.identifiers)
      if (!validationResult.valid) {
        return NextResponse.json(
          {
            error: 'Invalid identifiers',
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          },
          { status: 400 }
        )
      }

      // Tokenize
      const result = EntityResolution.tokenizeEntity(validation.data.identifiers)

      // Audit operation
      await EntityResolution.auditResolution(
        protection.tenantId!,
        'TOKENIZE',
        1,
        1
      )

      const response = NextResponse.json({
        result: validation.data.returnSummaryOnly
          ? {
              entityToken: result.entityToken,
              confidence: result.confidence,
              matchingStrategy: result.matchingStrategy,
            }
          : result,
        validation: {
          warnings: validationResult.warnings,
        },
      })

      if (protection.headers) {
        Object.entries(protection.headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      }

      return response
    }
  } catch (error) {
    console.error('[API] Entity tokenization error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
