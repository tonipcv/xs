/**
 * XASE CORE - Verification API
 * 
 * GET /api/xase/v1/verify/:id - Verificar integridade de um registro
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { chainHash, hashObject, isValidTransactionId } from '@/lib/xase/crypto';

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
    
    // Validar formato do ID
    if (!isValidTransactionId(transactionId)) {
      return NextResponse.json(
        { 
          error: 'Invalid transaction ID format',
          code: 'INVALID_ID'
        },
        { status: 400 }
      );
    }
    
    // Buscar registro
    const record = await prisma.decisionRecord.findUnique({
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
    
    // Buscar checkpoint mais próximo
    const checkpoint = await prisma.checkpointRecord.findFirst({
      where: {
        tenantId: record.tenantId,
        timestamp: {
          lte: record.timestamp,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        checkpointId: true,
        checkpointHash: true,
        signature: true,
        keyId: true,
        timestamp: true,
      },
    });
    
    // Determinar status geral
    const isValid = 
      verification.input_hash &&
      verification.output_hash &&
      verification.context_hash &&
      verification.chain_integrity;
    
    return NextResponse.json({
      transaction_id: record.transactionId,
      is_valid: isValid,
      status: isValid ? 'VERIFIED' : 'TAMPERED',
      verification,
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
      checkpoint: checkpoint
        ? {
            checkpoint_id: checkpoint.checkpointId,
            checkpoint_hash: checkpoint.checkpointHash,
            signature: checkpoint.signature,
            key_id: checkpoint.keyId,
            timestamp: checkpoint.timestamp.toISOString(),
          }
        : null,
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
