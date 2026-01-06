/**
 * XASE CORE - Decision Records API
 * 
 * POST /api/xase/v1/records - Criar novo registro de decisão
 * GET  /api/xase/v1/records - Listar registros com paginação
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DecisionType } from '@prisma/client';
import { checkAndIncrementUsage } from '@/lib/usage';
import { validateApiKey, checkRateLimit, hasPermission } from '@/lib/xase/auth';
import {
  hashObject,
  chainHash,
  generateTransactionId,
} from '@/lib/xase/crypto';
import {
  checkIdempotency,
  storeIdempotency,
  isValidIdempotencyKey,
} from '@/lib/xase/idempotency';
import { getActivePolicy } from '@/lib/xase/policies'

// Schema de validação para decisão
const DecisionSchema = z.object({
  input: z.record(z.any()).describe('Input data for the AI decision'),
  output: z.record(z.any()).describe('Output/result of the AI decision'),
  context: z.record(z.any()).optional().describe('Additional context'),
  policyId: z.string().optional().describe('Policy or model ID'),
  policyVersion: z.string().optional().describe('Policy version'),
  decisionType: z.nativeEnum(DecisionType).optional().describe('Type of decision'),
  confidence: z.number().min(0).max(1).optional().describe('AI confidence score'),
  processingTime: z.number().optional().describe('Processing time in ms'),
  storePayload: z.boolean().optional().default(false).describe('Store full payload'),
  // Model metadata (legal-grade context)
  modelId: z.string().optional().describe('Model identifier'),
  modelVersion: z.string().optional().describe('Model version'),
  modelHash: z.string().optional().describe('Hash of model artifacts'),
  featureSchemaHash: z.string().optional().describe('Hash of the feature schema used'),
  explanation: z.record(z.any()).optional().describe('Model explanation payload (e.g., SHAP)'),
});

/**
 * POST /api/xase/v1/records
 * Cria um novo registro de decisão no ledger
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { 
          error: auth.error,
          code: 'UNAUTHORIZED' 
        },
        { status: 401 }
      );
    }
    
    // 1.5. Validar permissão de ingest
    if (!hasPermission(auth, 'ingest')) {
      return NextResponse.json(
        {
          error: 'API key does not have ingest permission',
          code: 'FORBIDDEN',
          required_permission: 'ingest',
        },
        { status: 403 }
      );
    }
    
    // 1.6. Verificar Idempotency-Key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      // Validar formato
      if (!isValidIdempotencyKey(idempotencyKey)) {
        return NextResponse.json(
          {
            error: 'Invalid Idempotency-Key format',
            code: 'INVALID_IDEMPOTENCY_KEY',
            hint: 'Use UUID v4 or alphanumeric string (16-64 chars)',
          },
          { status: 400 }
        );
      }
      
      // Verificar se já foi processado
      const existing = checkIdempotency(auth.tenantId!, idempotencyKey);
      if (existing.exists) {
        return NextResponse.json(existing.response, {
          status: 201,
          headers: {
            'X-Idempotency-Replay': 'true',
          },
        });
      }
    }
    
    // 2. Verificar rate limit
    const rateLimit = await checkRateLimit(auth.apiKeyId!);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after: 3600
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '1000',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + 3600000),
          }
        }
      );
    }
    
    // 2.5. Fair-use gating por plano (associa consumo a um usuário do tenant)
    try {
      const tenantUser = await prisma.user.findFirst({
        where: { tenantId: auth.tenantId! },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (tenantUser?.id) {
        // custo básico por registro; pode ser ajustado conforme payload
        await checkAndIncrementUsage(tenantUser.id, 100);
      }
    } catch (e: any) {
      if (e.code === 'LIMIT_EXCEEDED') {
        return NextResponse.json({ error: 'Limit exceeded', usage: e.usage, code: 'LIMIT_EXCEEDED' }, { status: 402 });
      }
      throw e;
    }

    // 3. Validar payload
    const body = await request.json();
    const validation = DecisionSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid payload',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }
    
    const data = validation.data;
    
    // 4. Calcular hashes
    const inputHash = hashObject(data.input);
    const outputHash = hashObject(data.output);
    const contextHash = data.context ? hashObject(data.context) : null;
    
    // 5. Buscar último record do tenant (para encadeamento)
    const lastRecord = await prisma.decisionRecord.findFirst({
      where: { tenantId: auth.tenantId! },
      orderBy: { timestamp: 'desc' },
      select: { recordHash: true },
    });
    
    // 6. Calcular hash encadeado
    const combinedData = `${inputHash}${outputHash}${contextHash || ''}`;
    const recordHash = chainHash(lastRecord?.recordHash || null, combinedData);
    
    // 7. Gerar transaction ID
    const transactionId = generateTransactionId();
    
    // 7.1. Resolver snapshot de política (se fornecida)
    let resolvedPolicyVersion: string | null = data.policyVersion || null
    let resolvedPolicyHash: string | null = null
    if (data.policyId) {
      try {
        const snapshot = await getActivePolicy(auth.tenantId!, data.policyId)
        if (snapshot) {
          resolvedPolicyVersion = snapshot.version
          resolvedPolicyHash = `sha256:${snapshot.documentHash}`.replace(/^sha256:sha256:/, 'sha256:')
        }
      } catch (e) {
        // Não falha ingestão se não houver política; apenas segue sem snapshot
        console.warn('[Ingest] Policy snapshot not resolved:', e)
      }
    }

    // 8. Persistir no banco
    const record = await prisma.decisionRecord.create({
      data: {
        tenantId: auth.tenantId!,
        transactionId,
        policyId: data.policyId,
        policyVersion: resolvedPolicyVersion || data.policyVersion,
        inputHash,
        outputHash,
        contextHash,
        recordHash,
        previousHash: lastRecord?.recordHash || null,
        decisionType: data.decisionType ?? null,
        confidence: data.confidence,
        processingTime: data.processingTime,
        // Armazenar payload se solicitado
        inputPayload: data.storePayload ? JSON.stringify(data.input) : null,
        outputPayload: data.storePayload ? JSON.stringify(data.output) : null,
        contextPayload: data.storePayload && data.context ? JSON.stringify(data.context) : null,
      },
    });
    
    // 9. Retornar resposta
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const receiptUrl = `${baseUrl}/xase/receipt/${transactionId}`;
    
    const response = {
      success: true,
      transaction_id: transactionId,
      receipt_url: receiptUrl,
      timestamp: record.timestamp.toISOString(),
      record_hash: recordHash,
      chain_position: lastRecord ? 'chained' : 'genesis',
    };
    
    // 10. Armazenar em cache de idempotency (se fornecido)
    if (idempotencyKey) {
      storeIdempotency(auth.tenantId!, idempotencyKey, response);
    }
    
    return NextResponse.json(response, { 
      status: 201,
      headers: {
        'X-RateLimit-Limit': '1000',
        'X-RateLimit-Remaining': String(rateLimit.remaining - 1),
      }
    });
    
  } catch (error) {
    console.error('Error creating decision record:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/xase/v1/records
 * Lista registros com paginação e filtros
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const tenantId = auth.tenantId!;
    const { searchParams } = new URL(request.url);

    // 2. Parse query params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const search = searchParams.get('search') || '';
    const policyId = searchParams.get('policyId') || '';

    // 3. Build where clause
    const where: any = { tenantId };
    
    if (search) {
      where.transactionId = { contains: search };
    }
    
    if (policyId) {
      where.policyId = policyId;
    }

    // 4. Fetch records with pagination
    const [records, total] = await Promise.all([
      prisma.decisionRecord.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          transactionId: true,
          policyId: true,
          policyVersion: true,
          decisionType: true,
          confidence: true,
          processingTime: true,
          isVerified: true,
          verifiedAt: true,
          timestamp: true,
          recordHash: true,
        },
      }),
      prisma.decisionRecord.count({ where }),
    ]);

    // 5. Return paginated response
    return NextResponse.json({
      records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing records:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
