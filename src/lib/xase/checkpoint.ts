/**
 * XASE CORE - Checkpoint Management
 * 
 * Cria checkpoints periódicos com assinatura KMS
 * Âncora externa de integridade para o ledger
 */

import { prisma } from '../prisma';
import { hashString, generateTransactionId } from './crypto';
import { getKMSProvider } from './kms';
import { logAudit } from './audit';

export interface CheckpointData {
  tenantId: string;
  lastRecordHash: string;
  recordCount: number;
  checkpointType?: 'PERIODIC' | 'MANUAL' | 'EMERGENCY';
}

export interface CheckpointResult {
  checkpointId: string;
  checkpointHash: string;
  signature: string;
  keyId: string;
  timestamp: Date;
}

/**
 * Cria um checkpoint para um tenant
 */
export async function createCheckpoint(
  data: CheckpointData
): Promise<CheckpointResult> {
  const { tenantId, lastRecordHash, recordCount, checkpointType = 'PERIODIC' } = data;

  // 1. Buscar último checkpoint (para encadeamento e número)
  const previousCheckpoint = await prisma.checkpointRecord.findFirst({
    where: { tenantId },
    orderBy: { checkpointNumber: 'desc' },
    select: { 
      checkpointId: true, 
      checkpointHash: true,
      checkpointNumber: true,
    },
  });
  
  // Calcular próximo checkpointNumber (monotônico)
  const checkpointNumber = previousCheckpoint 
    ? previousCheckpoint.checkpointNumber + 1 
    : 1;

  // 2. Gerar checkpoint ID
  const checkpointId = `chk_${generateTransactionId().replace('txn_', '')}`;

  // 3. Calcular checkpoint hash
  // checkpointHash = SHA256(previousCheckpointHash + lastRecordHash + recordCount + timestamp)
  const timestamp = new Date();
  const checkpointData = [
    previousCheckpoint?.checkpointHash || 'genesis',
    lastRecordHash,
    recordCount.toString(),
    timestamp.toISOString(),
  ].join('|');

  const checkpointHash = hashString(checkpointData);

  // 4. Assinar com KMS
  const kms = getKMSProvider();
  const kmsSignature = await kms.sign(checkpointHash);

  // 5. Persistir checkpoint
  const checkpoint = await prisma.checkpointRecord.create({
    data: {
      tenantId,
      checkpointId,
      checkpointType,
      checkpointNumber,
      lastRecordHash,
      recordCount,
      checkpointHash,
      signature: kmsSignature.signature,
      signatureAlgo: kmsSignature.algorithm,
      keyId: kmsSignature.keyId,
      previousCheckpointId: previousCheckpoint?.checkpointId || null,
      timestamp,
    },
  });

  // 6. Log de auditoria
  await logAudit({
    tenantId,
    action: 'CHECKPOINT_CREATED',
    resourceType: 'CHECKPOINT',
    resourceId: checkpointId,
    metadata: JSON.stringify({
      checkpointType,
      recordCount,
      previousCheckpointId: previousCheckpoint?.checkpointId,
    }),
    status: 'SUCCESS',
  });

  console.log(`[Checkpoint] Created for tenant ${tenantId}: ${checkpointId}`);

  return {
    checkpointId: checkpoint.checkpointId,
    checkpointHash: checkpoint.checkpointHash,
    signature: checkpoint.signature!,
    keyId: checkpoint.keyId!,
    timestamp: checkpoint.timestamp,
  };
}

/**
 * Cria checkpoints para todos os tenants ativos
 * (usado pelo cron job)
 */
export async function createCheckpointsForAllTenants(): Promise<{
  success: number;
  failed: number;
  errors: Array<{ tenantId: string; error: string }>;
}> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ tenantId: string; error: string }>,
  };

  for (const tenant of tenants) {
    try {
      // Buscar último record do tenant
      const lastRecord = await prisma.decisionRecord.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { timestamp: 'desc' },
        select: { recordHash: true },
      });

      if (!lastRecord) {
        console.log(`[Checkpoint] Tenant ${tenant.id} has no records, skipping`);
        continue;
      }

      // Contar records desde último checkpoint
      const lastCheckpoint = await prisma.checkpointRecord.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });

      const recordCount = await prisma.decisionRecord.count({
        where: {
          tenantId: tenant.id,
          timestamp: lastCheckpoint
            ? { gt: lastCheckpoint.timestamp }
            : undefined,
        },
      });

      if (recordCount === 0) {
        console.log(`[Checkpoint] Tenant ${tenant.id} has no new records, skipping`);
        continue;
      }

      // Criar checkpoint
      await createCheckpoint({
        tenantId: tenant.id,
        lastRecordHash: lastRecord.recordHash,
        recordCount,
        checkpointType: 'PERIODIC',
      });

      results.success++;
    } catch (error) {
      console.error(`[Checkpoint] Failed for tenant ${tenant.id}:`, error);
      results.failed++;
      results.errors.push({
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log(
    `[Checkpoint] Batch complete: ${results.success} success, ${results.failed} failed`
  );

  return results;
}

/**
 * Verifica integridade de um checkpoint
 */
export async function verifyCheckpoint(checkpointId: string): Promise<{
  isValid: boolean;
  checks: {
    signatureValid: boolean;
    hashValid: boolean;
    chainValid: boolean;
  };
  error?: string;
}> {
  try {
    const checkpoint = await prisma.checkpointRecord.findUnique({
      where: { checkpointId },
    });

    if (!checkpoint) {
      return {
        isValid: false,
        checks: {
          signatureValid: false,
          hashValid: false,
          chainValid: false,
        },
        error: 'Checkpoint not found',
      };
    }

    const checks = {
      signatureValid: false,
      hashValid: false,
      chainValid: false,
    };

    // 1. Verificar assinatura KMS
    if (checkpoint.signature) {
      const kms = getKMSProvider();
      checks.signatureValid = await kms.verify(
        checkpoint.checkpointHash,
        checkpoint.signature
      );
    }

    // 2. Recalcular hash
    const previousCheckpoint = checkpoint.previousCheckpointId
      ? await prisma.checkpointRecord.findUnique({
          where: { checkpointId: checkpoint.previousCheckpointId },
          select: { checkpointHash: true },
        })
      : null;

    const checkpointData = [
      previousCheckpoint?.checkpointHash || 'genesis',
      checkpoint.lastRecordHash,
      checkpoint.recordCount.toString(),
      checkpoint.timestamp.toISOString(),
    ].join('|');

    const recalculatedHash = hashString(checkpointData);
    checks.hashValid = recalculatedHash === checkpoint.checkpointHash;

    // 3. Verificar encadeamento
    if (checkpoint.previousCheckpointId) {
      checks.chainValid = !!previousCheckpoint;
    } else {
      checks.chainValid = true; // Genesis checkpoint
    }

    const isValid =
      checks.signatureValid && checks.hashValid && checks.chainValid;

    return { isValid, checks };
  } catch (error) {
    console.error('[Checkpoint] Verification error:', error);
    return {
      isValid: false,
      checks: {
        signatureValid: false,
        hashValid: false,
        chainValid: false,
      },
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}
