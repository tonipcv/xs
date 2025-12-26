/**
 * XASE CORE - Export API
 * 
 * POST /api/xase/v1/export/:id - Gera proof bundle
 * 
 * Retorna JSON com manifest + payloads + verification script
 * Cliente pode salvar como ZIP localmente
 */

import { NextResponse } from 'next/server';
import { validateApiKey, hasPermission } from '@/lib/xase/auth';
import { generateProofBundle } from '@/lib/xase/export';
import { isValidTransactionId } from '@/lib/xase/crypto';
import { prisma } from '@/lib/prisma';
import { checkAndIncrementUsage } from '@/lib/usage';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * POST /api/xase/v1/export/:id
 * Gera proof bundle para um transaction ID
 */
export async function POST(
  request: Request,
  { params }: any
) {
  try {
    const transactionId = params.id;

    // 1. Validar formato do ID
    if (!isValidTransactionId(transactionId)) {
      return NextResponse.json(
        {
          error: 'Invalid transaction ID format',
          code: 'INVALID_ID',
        },
        { status: 400 }
      );
    }

    // 2. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        {
          error: auth.error,
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }
    
    // 3. Validar permissão de export
    if (!hasPermission(auth, 'export')) {
      return NextResponse.json(
        {
          error: 'API key does not have export permission',
          code: 'FORBIDDEN',
          required_permission: 'export',
        },
        { status: 403 }
      );
    }

    // 3. Fair-use gating por plano (associa consumo a um usuário do tenant)
    try {
      const auth2 = await validateApiKey(request);
      if (auth2.valid && auth2.tenantId) {
        const tenantUser = await prisma.user.findFirst({
          where: { tenantId: auth2.tenantId },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (tenantUser?.id) {
          // custo mais alto para export
          await checkAndIncrementUsage(tenantUser.id, 500);
        }
      }
    } catch (e: any) {
      if (e.code === 'LIMIT_EXCEEDED') {
        return NextResponse.json({ error: 'Limit exceeded', usage: e.usage, code: 'LIMIT_EXCEEDED' }, { status: 402 });
      }
      throw e;
    }

    // 4. Parse options
    const body = await request.json().catch(() => ({} as any));
    const includePayloads = body.include_payloads === true;

    // 5. Gerar proof bundle
    const bundle = await generateProofBundle(transactionId, {
      includePayloads,
      userId: undefined, // TODO: extrair de auth se for user-based
    });

    // 6. Retornar bundle
    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      exported_at: new Date().toISOString(),
      bundle: {
        manifest: bundle.manifest,
        payloads: bundle.payloads,
        verification_script: bundle.verification_script,
      },
      download_instructions: {
        manifest: 'Save as manifest.json',
        payloads: 'Save payloads/* as JSON files',
        script: 'Save as verify-proof.js and run: node verify-proof.js',
      },
    });
  } catch (error) {
    console.error('[Export] Error:', error);

    if (error instanceof Error && error.message === 'Record not found') {
      return NextResponse.json(
        {
          error: 'Record not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Export failed',
        code: 'EXPORT_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Info sobre export
 */
export async function GET(
  request: Request,
  { params }: any
) {
  return NextResponse.json({
    endpoint: `POST /api/xase/v1/export/${params.id}`,
    description: 'Generate proof bundle for a decision record',
    body: {
      include_payloads: 'boolean (default: false)',
    },
    response: {
      manifest: 'Proof manifest with hashes and metadata',
      payloads: 'Optional: input/output/context data',
      verification_script: 'Node.js script for offline verification',
    },
  });
}
