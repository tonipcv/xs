/**
 * FEDERATED QUERY API
 * 
 * Proxy para federated query agent (Go)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/xase/auth'
import jwt from 'jsonwebtoken'

const FEDERATED_AGENT_URL = process.env.FEDERATED_AGENT_URL || 'http://localhost:8080'

export async function POST(req: NextRequest) {
  try {
    // Validate API key
    const auth = await validateApiKey(req)
    if (!auth || !auth.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { dataSourceUrl, query, parameters, policyId, datasetId } = body

    if (!dataSourceUrl || !query) {
      return NextResponse.json(
        { error: 'dataSourceUrl and query are required' },
        { status: 400 }
      )
    }

    // Generate JWT token for federated agent
    const token = generateFederatedToken(auth)

    // Forward request to Go agent
    const response = await fetch(`${FEDERATED_AGENT_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        dataSourceUrl,
        query,
        parameters,
        metadata: {
          tenantId: auth.tenantId,
          userId: auth.apiKeyId, // API-key based identity for federated agent
          ...(policyId ? { policyId } : {}),
          ...(datasetId ? { datasetId } : {}),
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'Federated query failed', details: error },
        { status: response.status }
      )
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[FederatedQuery] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

function generateFederatedToken(auth: any): string {
  const secret = process.env.FEDERATED_JWT_SECRET
  if (!secret) {
    throw new Error('FEDERATED_JWT_SECRET is not configured')
  }

  const payload = {
    tenantId: auth.tenantId,
    userId: auth.apiKeyId,
    role: auth.role || 'user',
  }

  // Short-lived token (5m) to minimize blast radius
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: 'xase-federated-agent',
    issuer: 'xase-api',
  })
}
