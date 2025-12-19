import { NextResponse } from 'next/server'
import { getPublicKeyPem } from '@/lib/xase/signing-service'
import { hashString } from '@/lib/xase/crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/xase/v1/public-keys
 * 
 * Retorna chaves públicas de assinatura (trust anchor)
 * Usado para verificação offline de provas
 */
export async function GET() {
  try {
    const publicKeyPem = await getPublicKeyPem()
    const fingerprint = hashString(publicKeyPem)
    const keyId = process.env.XASE_KMS_KEY_ID || 'mock-key'

    return NextResponse.json({
      keys: [
        {
          key_id: keyId,
          fingerprint,
          fingerprint_short: fingerprint.substring(0, 16) + '...',
          algorithm: 'RSA-SHA256',
          key_size: 2048,
          valid_from: '2025-01-01T00:00:00Z',
          valid_until: '2026-01-01T00:00:00Z',
          status: 'active',
          public_key_pem: publicKeyPem,
          usage: 'sign_verify',
          issuer: 'xase.ai',
        },
      ],
      metadata: {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        notes: 'Verify fingerprint against official channels before trusting signatures.',
      },
    })
  } catch (error) {
    console.error('[PublicKeys] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve public keys' },
      { status: 500 }
    )
  }
}
