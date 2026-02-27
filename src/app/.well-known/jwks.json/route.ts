import { NextResponse } from 'next/server';
import { getPublicJWK } from '@/lib/jwt/keys';

// GET /.well-known/jwks.json
// Public endpoint exposing JWT signing keys for Sidecar validation
export async function GET() {
  try {
    const jwk = await getPublicJWK();
    
    const jwks = {
      keys: [jwk],
    };
    
    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('[JWKS] Failed to generate JWKS:', error);
    return NextResponse.json(
      { error: 'Failed to generate JWKS' },
      { status: 500 }
    );
  }
}
