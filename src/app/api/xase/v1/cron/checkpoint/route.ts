/**
 * XASE CORE - Checkpoint Cron Endpoint
 * 
 * POST /api/xase/v1/cron/checkpoint
 * 
 * Protegido por XASE_CRON_SECRET
 * Pode ser chamado por:
 * - Vercel Cron
 * - GitHub Actions
 * - Qualquer scheduler externo
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCheckpointCron, validateCronSecret } from '@/lib/xase/cron-checkpoint';

export async function POST(request: NextRequest) {
  try {
    // 1. Validar secret
    const authHeader = request.headers.get('Authorization');
    const secret = authHeader?.replace('Bearer ', '') || null;

    if (!validateCronSecret(secret)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'INVALID_CRON_SECRET',
        },
        { status: 401 }
      );
    }

    // 2. Executar checkpoint
    const result = await runCheckpointCron();

    // 3. Retornar resultado
    return NextResponse.json({
      success: result.success,
      timestamp: new Date().toISOString(),
      duration_ms: result.duration,
      results: {
        tenants_processed: result.results.success + result.results.failed,
        checkpoints_created: result.results.success,
        failures: result.results.failed,
        errors: result.results.errors,
      },
    });
  } catch (error) {
    console.error('[CheckpointCron] Endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'CRON_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Health check
 */
export async function GET() {
  return NextResponse.json({
    service: 'Xase Checkpoint Cron',
    status: 'operational',
    endpoint: 'POST /api/xase/v1/cron/checkpoint',
    auth: 'Bearer token (XASE_CRON_SECRET)',
  });
}
