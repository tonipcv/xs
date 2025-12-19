/**
 * XASE CORE - Human Intervention API
 * 
 * POST /api/xase/v1/records/[id]/intervene
 * Registra intervenção humana em uma decisão de IA
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey, hasPermission } from '@/lib/xase/auth';
import { createIntervention } from '@/lib/xase/human-intervention';

// Schema de validação
const InterventionSchema = z.object({
  action: z.enum(['REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'OVERRIDE', 'ESCALATED']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  newOutcome: z.record(z.any()).optional(),
  
  // Ator (opcional, pode vir da sessão)
  actorUserId: z.string().optional(),
  actorName: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: any
) {
  try {
    console.log('[HITL][API] STEP0: POST /intervene start')
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
    
    // 1.5. Validar permissão (pode ser uma permissão específica ou 'ingest')
    // Por enquanto, qualquer key com 'ingest' pode registrar intervenções
    if (!hasPermission(auth, 'ingest')) {
      return NextResponse.json(
        {
          error: 'API key does not have permission to register interventions',
          code: 'FORBIDDEN',
          required_permission: 'ingest',
        },
        { status: 403 }
      );
    }
    
    // 2. Extrair transaction ID
    const { id } = params;
    const transactionId = id;
    console.log('[HITL][API] STEP1: params parsed', { transactionId })
    
    // 3. Validar payload
    const body = await request.json();
    const validation = InterventionSchema.safeParse(body);
    
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
    console.log('[HITL][API] STEP2: body validated', { action: data.action })
    
    // 4. Capturar IP e User-Agent
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // 5. Criar intervenção
    console.log('[HITL][API] STEP3: calling createIntervention')
    const result = await createIntervention({
      transactionId,
      tenantId: auth.tenantId!,
      action: data.action as any,
      actorUserId: data.actorUserId,
      actorName: data.actorName,
      actorEmail: data.actorEmail,
      actorRole: data.actorRole,
      reason: data.reason,
      notes: data.notes,
      metadata: data.metadata,
      newOutcome: data.newOutcome,
      ipAddress,
      userAgent,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error,
          code: 'INTERVENTION_FAILED'
        },
        { status: 400 }
      );
    }
    
    // 6. Retornar resposta
    return NextResponse.json({
      success: true,
      intervention_id: result.interventionId,
      transaction_id: transactionId,
      action: data.action,
      timestamp: result.intervention?.timestamp,
      actor: {
        name: result.intervention?.actorName,
        email: result.intervention?.actorEmail,
      },
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('[Intervention API] Error:', error?.message || String(error));
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/xase/v1/records/[id]/intervene
 * Lista intervenções de um record específico
 */
export async function GET(
  request: Request,
  { params }: any
) {
  try {
    // 1. Validar API Key
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: auth.error, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    // 2. Extrair transaction ID
    const { id } = params;
    const transactionId = id;
    
    // 3. Buscar intervenções (importar função)
    const { getInterventions } = await import('@/lib/xase/human-intervention');
    const interventions = await getInterventions(transactionId, auth.tenantId!);
    
    // 4. Retornar lista
    return NextResponse.json({
      transaction_id: transactionId,
      interventions: interventions.map(i => ({
        id: i.id,
        action: i.action,
        actor: {
          userId: i.actorUserId,
          name: i.actorName,
          email: i.actorEmail,
          role: i.actorRole,
        },
        reason: i.reason,
        notes: i.notes,
        metadata: i.metadata ? JSON.parse(i.metadata) : null,
        hasNewOutcome: !!i.newOutcome,
        timestamp: i.timestamp,
      })),
      total: interventions.length,
    });
    
  } catch (error: any) {
    console.error('[Intervention API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
