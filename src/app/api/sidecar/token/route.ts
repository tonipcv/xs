import { NextRequest, NextResponse } from 'next/server';
import { issueSidecarToken } from '@/lib/jwt/sidecar-token';
import { prisma } from '@/lib/prisma';

// POST /api/sidecar/token
// Issue JWT for Sidecar authentication
// Body: { tenant_id, contract_id, session_id, scopes?, features?, quotas? }
export async function POST(req: NextRequest) {
  try {
    // Auth check: require valid API key or internal auth
    const authHeader = req.headers.get('authorization');
    
    // For now, check if it's an internal request or has valid API key
    // In production, validate API key against tenant
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const body = await req.json();
    const { tenant_id, contract_id, session_id, scopes, features, quotas } = body;

    if (!tenant_id || !contract_id || !session_id) {
      return NextResponse.json(
        { error: 'tenant_id, contract_id, and session_id required' },
        { status: 400 }
      );
    }

    // Verify tenant exists and is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenant_id },
      select: { id: true, status: true, plan: true },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Tenant not found or inactive' }, { status: 404 });
    }

    // Default scopes and features if not provided
    const defaultScopes = ['ingest:read', 'redact:execute', 'metrics:write'];
    const defaultFeatures = {
      dicom_ocr: false,
      fhir_nlp: false,
      audio_redaction: false,
      prefetch: true,
    };

    // Issue JWT
    const token = await issueSidecarToken({
      sub: session_id,
      tenant_id,
      contract_id,
      scopes: scopes || defaultScopes,
      features: features || defaultFeatures,
      quotas: quotas || {},
    });

    return NextResponse.json({
      token,
      expires_in: 3600, // 1 hour
      token_type: 'Bearer',
      issued_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[SidecarToken] Failed to issue token:', error);
    return NextResponse.json(
      { error: 'Failed to issue token', debug: error.message },
      { status: 500 }
    );
  }
}
