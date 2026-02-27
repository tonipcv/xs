import { NextResponse } from 'next/server';
import { issueSidecarToken, verifySidecarToken } from '@/lib/jwt/sidecar-token';
import { getPublicJWK } from '@/lib/jwt/keys';

// GET /api/test-jwt-flow
// Test JWT issuance and validation flow
export async function GET() {
  try {
    console.log('[TestJWT] Starting JWT flow test...');
    
    // 1. Generate JWKS
    const jwk = await getPublicJWK();
    console.log('[TestJWT] ✓ Generated JWKS:', { kid: jwk.kid, alg: jwk.alg });
    
    // 2. Issue token
    const token = await issueSidecarToken({
      sub: 'test_session_123',
      tenant_id: 'test_tenant',
      contract_id: 'test_contract',
      scopes: ['ingest:read', 'redact:execute', 'metrics:write'],
      features: {
        dicom_ocr: true,
        fhir_nlp: false,
        audio_redaction: true,
        prefetch: true,
      },
      quotas: {
        max_bytes_month: 1e12, // 1TB
        max_images_month: 1e6, // 1M images
        max_audio_minutes_month: 1e5, // 100k minutes
        max_fhir_resources_month: 5e5, // 500k resources
      },
    });
    console.log('[TestJWT] ✓ Issued token (length:', token.length, ')');
    
    // 3. Verify token
    const claims = await verifySidecarToken(token);
    console.log('[TestJWT] ✓ Verified token, claims:', {
      sub: claims.sub,
      tenant_id: claims.tenant_id,
      scopes: claims.scopes,
      features: claims.features,
    });
    
    // 4. Check expiration
    const now = Math.floor(Date.now() / 1000);
    const ttl = claims.exp - now;
    console.log('[TestJWT] ✓ Token TTL:', ttl, 'seconds');
    
    return NextResponse.json({
      success: true,
      test_results: {
        jwks_generated: true,
        token_issued: true,
        token_verified: true,
        token_length: token.length,
        ttl_seconds: ttl,
        claims: {
          sub: claims.sub,
          tenant_id: claims.tenant_id,
          contract_id: claims.contract_id,
          scopes: claims.scopes,
          features: claims.features,
          quotas: claims.quotas,
        },
      },
      sample_token: token.slice(0, 50) + '...',
      jwks_endpoint: '/.well-known/jwks.json',
    });
  } catch (error: any) {
    console.error('[TestJWT] Test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
