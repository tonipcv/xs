/**
 * API PROTECTION MIDDLEWARE
 * Combines rate limiting, tenant isolation, and API key validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkCombinedRateLimit } from './rate-limiter'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export interface ApiProtectionResult {
  allowed: boolean
  error?: string
  statusCode?: number
  headers?: Record<string, string>
  tenantId?: string
  userId?: string
}

/**
 * Extract IP address from request
 */
function getIpAddress(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

/**
 * Validate API key and return tenant info
 */
async function validateApiKey(apiKey: string): Promise<{
  valid: boolean
  tenantId?: string
  keyHash?: string
  error?: string
}> {
  if (!apiKey || !apiKey.startsWith('xase_')) {
    return { valid: false, error: 'Invalid API key format' }
  }

  try {
    // Hash the API key
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

    // Look up in database
    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        tenant: {
          select: {
            status: true,
          },
        },
      },
    })

    if (!key) {
      return { valid: false, error: 'API key not found' }
    }

    if (!key.isActive) {
      return { valid: false, error: 'API key is inactive' }
    }

    if (key.tenant.status !== 'ACTIVE') {
      return { valid: false, error: 'Tenant is not active' }
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { keyHash },
      data: { lastUsedAt: new Date() },
    })

    return {
      valid: true,
      tenantId: key.tenantId,
      keyHash,
    }
  } catch (error) {
    console.error('[ApiProtection] Error validating API key:', error)
    return { valid: false, error: 'API key validation failed' }
  }
}

/**
 * Protect API endpoint with rate limiting and authentication
 */
export async function protectApiEndpoint(
  req: NextRequest,
  options: {
    requireApiKey?: boolean
    requireTenant?: boolean
    endpoint?: string
  } = {}
): Promise<ApiProtectionResult> {
  const ip = getIpAddress(req)
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')

  let tenantId: string | undefined
  let apiKeyHash: string | undefined

  // Validate API key if required or provided
  if (options.requireApiKey || apiKey) {
    if (!apiKey) {
      return {
        allowed: false,
        error: 'API key required',
        statusCode: 401,
      }
    }

    const validation = await validateApiKey(apiKey)
    if (!validation.valid) {
      return {
        allowed: false,
        error: validation.error || 'Invalid API key',
        statusCode: 401,
      }
    }

    tenantId = validation.tenantId
    apiKeyHash = validation.keyHash
  }

  // Check tenant requirement
  if (options.requireTenant && !tenantId) {
    return {
      allowed: false,
      error: 'Tenant identification required',
      statusCode: 401,
    }
  }

  // Check rate limits
  const rateLimitResult = await checkCombinedRateLimit({
    ip,
    tenantId,
    apiKeyHash,
    endpoint: options.endpoint,
  })

  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      error: 'Rate limit exceeded',
      statusCode: 429,
      headers: {
        'X-RateLimit-Limit': '1000',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
        'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
      },
    }
  }

  // All checks passed
  return {
    allowed: true,
    tenantId,
    headers: {
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
    },
  }
}

/**
 * Create protected API response
 */
export function createProtectedResponse(
  result: ApiProtectionResult,
  data?: any
): NextResponse {
  if (!result.allowed) {
    const response = NextResponse.json(
      {
        error: result.error || 'Access denied',
        code: result.statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' : 'UNAUTHORIZED',
      },
      { status: result.statusCode || 403 }
    )

    // Add headers
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  }

  // Success response
  const response = NextResponse.json(data || { success: true })

  // Add rate limit headers
  if (result.headers) {
    Object.entries(result.headers).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
  }

  return response
}

/**
 * Tenant isolation check - ensure user can only access their tenant's data
 */
export async function checkTenantIsolation(
  requestedTenantId: string,
  authenticatedTenantId: string
): Promise<boolean> {
  return requestedTenantId === authenticatedTenantId
}

/**
 * Validate tenant access to dataset
 */
export async function validateDatasetAccess(
  tenantId: string,
  datasetId: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { tenantId: true, status: true },
    })

    if (!dataset) {
      return { allowed: false, error: 'Dataset not found' }
    }

    if (dataset.tenantId !== tenantId) {
      return { allowed: false, error: 'Access denied to dataset' }
    }

    if (dataset.status === 'DELETED') {
      return { allowed: false, error: 'Dataset has been deleted' }
    }

    return { allowed: true }
  } catch (error) {
    console.error('[ApiProtection] Error validating dataset access:', error)
    return { allowed: false, error: 'Dataset access validation failed' }
  }
}
