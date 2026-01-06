/**
 * XASE CORE - Verification API
 * 
 * GET /api/xase/v1/verify/:id - Verificar integridade de um registro
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { chainHash, hashObject, isValidTransactionId } from '@/lib/xase/crypto';
import { verifySnapshot } from '@/lib/xase/snapshots';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/xase/v1/verify/:id
 * Verifica a integridade criptográfica de um registro
 */
export async function GET(
  request: Request,
  { params }: any
) {
  try {
    const transactionId = params.id;
    
    // Aceitar qualquer transactionId (inclui Idempotency-Key usados como transactionId)
    
    // Buscar registro (transactionId não é mais único globalmente, precisa buscar por findFirst)
    const record = await prisma.decisionRecord.findFirst({
      where: { transactionId },
      include: {
        tenant: {
          select: {
            name: true,
            companyName: true,
          },
        },
      },
    });
    
    if (!record) {
      return NextResponse.json(
        { 
          error: 'Record not found',
          code: 'NOT_FOUND'
        },
        { status: 404 }
      );
    }
    
    // Inicializar resultados de verificação
    const verification: {
      input_hash: boolean;
      output_hash: boolean;
      context_hash: boolean;
      chain_integrity: boolean;
      payload_available: boolean;
    } = {
      input_hash: true,
      output_hash: true,
      context_hash: true,
      chain_integrity: true,
      payload_available: false,
    };
    
    // Verificar hashes se payload estiver disponível
    if (record.inputPayload) {
      verification.payload_available = true;
      
      try {
        const inputData = JSON.parse(record.inputPayload);
        const recalculatedInputHash = hashObject(inputData);
        verification.input_hash = recalculatedInputHash === record.inputHash;
      } catch (error) {
        verification.input_hash = false;
      }
    }
    
    if (record.outputPayload) {
      try {
        const outputData = JSON.parse(record.outputPayload);
        const recalculatedOutputHash = hashObject(outputData);
        verification.output_hash = recalculatedOutputHash === record.outputHash;
      } catch (error) {
        verification.output_hash = false;
      }
    }
    
    if (record.contextPayload) {
      try {
        const contextData = JSON.parse(record.contextPayload);
        const recalculatedContextHash = hashObject(contextData);
        verification.context_hash = recalculatedContextHash === record.contextHash;
      } catch (error) {
        verification.context_hash = false;
      }
    }
    
    // Verificar encadeamento
    const combinedData = `${record.inputHash}${record.outputHash}${record.contextHash || ''}`;
    const recalculatedRecordHash = chainHash(record.previousHash, combinedData);
    verification.chain_integrity = recalculatedRecordHash === record.recordHash;
    
    // Verificar snapshots (se existirem)
    const snapshotVerification: Record<string, any> = {};
    
    if (record.externalDataSnapshotId) {
      const result = await verifySnapshot(record.externalDataSnapshotId);
      snapshotVerification.externalData = result;
    }
    
    if (record.businessRulesSnapshotId) {
      const result = await verifySnapshot(record.businessRulesSnapshotId);
      snapshotVerification.businessRules = result;
    }
    
    if (record.environmentSnapshotId) {
      const result = await verifySnapshot(record.environmentSnapshotId);
      snapshotVerification.environment = result;
    }
    
    if (record.featureVectorSnapshotId) {
      const result = await verifySnapshot(record.featureVectorSnapshotId);
      snapshotVerification.featureVector = result;
    }
    
    // Verificar se há próximo record que referencia este
    const nextRecord = await prisma.decisionRecord.findFirst({
      where: {
        tenantId: record.tenantId,
        previousHash: record.recordHash,
      },
      select: {
        transactionId: true,
      },
    });
    
    // Checkpoints feature removed; skip checkpoint lookup
    
    // Determinar status geral (incluindo snapshots)
    const allSnapshotsValid = Object.values(snapshotVerification).every(
      (result: any) => result.valid === true
    );
    
    const isValid = 
      verification.input_hash &&
      verification.output_hash &&
      verification.context_hash &&
      verification.chain_integrity &&
      (Object.keys(snapshotVerification).length === 0 || allSnapshotsValid);
    
    return NextResponse.json({
      transaction_id: record.transactionId,
      is_valid: isValid,
      status: isValid ? 'VERIFIED' : 'TAMPERED',
      verification,
      snapshots: Object.keys(snapshotVerification).length > 0 ? snapshotVerification : undefined,
      metadata: {
        timestamp: record.timestamp.toISOString(),
        policy_id: record.policyId,
        policy_version: record.policyVersion,
        decision_type: record.decisionType,
        confidence: record.confidence,
        processing_time: record.processingTime,
      },
      chain: {
        previous_hash: record.previousHash,
        record_hash: record.recordHash,
        is_genesis: !record.previousHash,
        has_next: !!nextRecord,
        next_transaction_id: nextRecord?.transactionId,
      },
      tenant: {
        name: record.tenant.companyName || record.tenant.name,
      },
      checkpoint: null,
      verified_at: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { 
        error: 'Verification failed',
        code: 'VERIFICATION_ERROR'
      },
      { status: 500 }
    );
  }
}
