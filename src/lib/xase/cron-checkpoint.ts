/**
 * XASE CORE - Checkpoint Cron Job
 * 
 * Executa checkpoints periódicos para todos os tenants
 * Pode ser chamado via:
 * - Vercel Cron (vercel.json)
 * - Node-cron
 * - Endpoint HTTP protegido
 */

import { createCheckpointsForAllTenants } from './checkpoint';

/**
 * Executa checkpoint para todos os tenants
 */
export async function runCheckpointCron(): Promise<{
  success: boolean;
  results: {
    success: number;
    failed: number;
    errors: Array<{ tenantId: string; error: string }>;
  };
  duration: number;
}> {
  const startTime = Date.now();

  console.log('[CheckpointCron] Starting periodic checkpoint...');

  try {
    const results = await createCheckpointsForAllTenants();

    const duration = Date.now() - startTime;

    console.log(
      `[CheckpointCron] Completed in ${duration}ms: ${results.success} success, ${results.failed} failed`
    );

    return {
      success: true,
      results,
      duration,
    };
  } catch (error) {
    console.error('[CheckpointCron] Fatal error:', error);

    return {
      success: false,
      results: {
        success: 0,
        failed: 0,
        errors: [
          {
            tenantId: 'system',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      },
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Validar secret do cron (para proteger endpoint HTTP)
 */
export function validateCronSecret(secret: string | null): boolean {
  const expectedSecret = process.env.XASE_CRON_SECRET;

  if (!expectedSecret) {
    console.warn('[CheckpointCron] XASE_CRON_SECRET not set, allowing all requests');
    return true;
  }

  return secret === expectedSecret;
}
