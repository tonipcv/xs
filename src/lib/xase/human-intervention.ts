/**
 * XASE CORE - Human-in-the-Loop (HITL)
 * 
 * Funções para registrar e consultar intervenções humanas em decisões de IA
 * Garante trilha de auditoria completa e imutabilidade
 */

import { prisma } from '../prisma';
import { logAudit, AuditActions, ResourceTypes } from './audit';
import { InterventionAction } from '@prisma/client';

export interface CreateInterventionInput {
  // Identificação
  transactionId: string;  // ID público do DecisionRecord
  tenantId: string;
  
  // Ação
  action: InterventionAction;
  
  // Ator (quem está intervindo)
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  
  // Contexto
  reason?: string;        // Justificativa obrigatória para algumas ações
  notes?: string;         // Notas adicionais
  metadata?: Record<string, any>;  // Contexto adicional (JSON)
  
  // Resultado (apenas para OVERRIDE)
  newOutcome?: Record<string, any>;
  
  // Rastreabilidade
  ipAddress?: string;
  userAgent?: string;
}

export interface InterventionResult {
  success: boolean;
  interventionId?: string;
  error?: string;
  intervention?: any;
}

/**
 * Registra uma intervenção humana em uma decisão de IA
 * 
 * @param input - Dados da intervenção
 * @returns Resultado da operação
 */
export async function createIntervention(
  input: CreateInterventionInput
): Promise<InterventionResult> {
  try {
    console.log('[HITL] STEP1: Fetching decision record', {
      transactionId: input.transactionId,
      tenantId: input.tenantId,
      hasNewOutcome: !!input.newOutcome,
      hasMetadata: !!input.metadata,
      action: input.action,
    });
    // 1. Validar que o record existe e pertence ao tenant
    const record = await prisma.decisionRecord.findFirst({
      where: {
        transactionId: input.transactionId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        outputPayload: true,
        finalDecisionSource: true,
      },
    });

    if (!record) {
      console.warn('[HITL] STEP1B: Record not found for transaction/tenant');
      return {
        success: false,
        error: 'Decision record not found or does not belong to this tenant',
      };
    }

    // 2. Validações específicas por tipo de ação
    if (input.action === 'OVERRIDE' && !input.newOutcome) {
      console.warn('[HITL] STEP2: Missing newOutcome for OVERRIDE');
      return {
        success: false,
        error: 'newOutcome is required for OVERRIDE action',
      };
    }

    if ((['REJECTED', 'OVERRIDE'] as any).includes(input.action) && !input.reason) {
      console.warn('[HITL] STEP2B: Missing reason for REJECTED/OVERRIDE');
      return {
        success: false,
        error: 'reason is required for REJECTED and OVERRIDE actions',
      };
    }

    // 3. Capturar resultado anterior (para OVERRIDE)
    let previousOutcome: string | null = null;
    if (input.action === 'OVERRIDE' && record.outputPayload) {
      previousOutcome = record.outputPayload;
    }

    // 4. Criar registro de intervenção
    console.log('[HITL] STEP3: Creating humanIntervention');
    let intervention;
    try {
      intervention = await prisma.humanIntervention.create({
        data: {
          tenantId: input.tenantId,
          recordId: record.id,
          action: input.action,
          actorUserId: input.actorUserId || null,
          actorName: input.actorName || null,
          actorEmail: input.actorEmail || null,
          actorRole: input.actorRole || null,
          reason: input.reason || null,
          notes: input.notes || null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          newOutcome: input.newOutcome ? JSON.stringify(input.newOutcome) : null,
          previousOutcome,
          ipAddress: input.ipAddress || null,
          userAgent: input.userAgent || null,
        },
      });
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error('[HITL] STEP3 ERROR: prisma.humanIntervention.create failed:', msg)
      throw e
    }

    // 5. Atualizar campos derivados no DecisionRecord (best-effort)
    // Em ambientes com ledger imutável, updates podem ser bloqueados por trigger.
    // Não falhar a intervenção por causa disso.
    const finalDecisionSource = getFinalDecisionSource(input.action);
    console.log('[HITL] STEP4: Attempting to update DecisionRecord flags', { finalDecisionSource });
    try {
      await prisma.decisionRecord.update({
        where: { id: record.id },
        data: {
          hasHumanIntervention: true,
          finalDecisionSource,
        },
      });
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.warn('[HITL] STEP4 WARN: decisionRecord is immutable, skipping flag update. Reason:', msg)
      // swallow error to allow intervention to succeed
    }

    // 6. Registrar em AuditLog
    const auditAction = getAuditAction(input.action);
    try {
      console.log('[HITL] STEP5: Writing AuditLog SUCCESS');
      await logAudit({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: auditAction,
        resourceType: ResourceTypes.DECISION_RECORD,
        resourceId: input.transactionId,
        metadata: JSON.stringify({
          interventionId: intervention.id,
          action: input.action,
          reason: input.reason,
          hasNewOutcome: !!input.newOutcome,
        }),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        status: 'SUCCESS',
      });
    } catch (auditErr) {
      console.error('[HITL] STEP5 ERROR: Failed to write AuditLog (ignored)', auditErr);
    }

    return {
      success: true,
      interventionId: intervention.id,
      intervention: {
        id: intervention.id,
        action: intervention.action,
        timestamp: intervention.timestamp,
        actorName: intervention.actorName,
        actorEmail: intervention.actorEmail,
      },
    };
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[HumanIntervention] Error creating intervention:', msg);
    
    // Log de auditoria de falha
    try {
      await logAudit({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: 'INTERVENTION_FAILED',
        resourceType: ResourceTypes.DECISION_RECORD,
        resourceId: input.transactionId,
        metadata: JSON.stringify({
          action: input.action,
          error: error?.message || String(error),
        }),
        status: 'FAILED',
        errorMessage: error?.message || String(error),
      });
    } catch (auditErr) {
      console.error('[HITL] STEP CATCH: Failed to write AuditLog on error (ignored)', (auditErr as any)?.message || String(auditErr));
    }

    return {
      success: false,
      error: error.message || 'Failed to create intervention',
    };
  }
}

/**
 * Busca intervenções de um record específico
 */
export async function getInterventions(
  transactionId: string,
  tenantId: string
) {
  const record = await prisma.decisionRecord.findFirst({
    where: {
      transactionId,
      tenantId,
    },
    select: {
      id: true,
    },
  });

  if (!record) {
    return [];
  }

  return await prisma.humanIntervention.findMany({
    where: {
      recordId: record.id,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });
}

/**
 * Busca última intervenção de um record
 */
export async function getLatestIntervention(
  transactionId: string,
  tenantId: string
) {
  const record = await prisma.decisionRecord.findFirst({
    where: {
      transactionId,
      tenantId,
    },
    select: {
      id: true,
    },
  });

  if (!record) {
    return null;
  }

  return await prisma.humanIntervention.findFirst({
    where: {
      recordId: record.id,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
}

/**
 * Estatísticas de intervenções por tenant
 */
export async function getInterventionStats(tenantId: string) {
  const [total, byAction, recentInterventions] = await Promise.all([
    // Total de intervenções
    prisma.humanIntervention.count({
      where: { tenantId },
    }),
    
    // Por tipo de ação
    prisma.humanIntervention.groupBy({
      by: ['action'],
      where: { tenantId },
      _count: true,
    }),
    
    // Últimas 10 intervenções
    prisma.humanIntervention.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        actorName: true,
        actorEmail: true,
        reason: true,
        timestamp: true,
        record: {
          select: {
            transactionId: true,
            decisionType: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    byAction: byAction.reduce((acc, item) => {
      acc[item.action] = item._count;
      return acc;
    }, {} as Record<string, number>),
    recent: recentInterventions,
  };
}

/**
 * Helpers internos
 */

function getFinalDecisionSource(action: InterventionAction): string {
  switch (action) {
    case 'APPROVED':
      return 'HUMAN_APPROVED';
    case 'REJECTED':
      return 'HUMAN_REJECTED';
    case 'OVERRIDE':
      return 'HUMAN_OVERRIDE';
    case 'REVIEW_REQUESTED':
    case 'ESCALATED':
      return 'AI'; // Ainda não foi decidido pelo humano
    default:
      return 'AI';
  }
}

function getAuditAction(action: InterventionAction): string {
  switch (action) {
    case 'REVIEW_REQUESTED':
      return AuditActions.HUMAN_REVIEW_REQUESTED;
    case 'APPROVED':
      return AuditActions.HUMAN_APPROVED;
    case 'REJECTED':
      return AuditActions.HUMAN_REJECTED;
    case 'OVERRIDE':
      return AuditActions.HUMAN_OVERRIDE;
    case 'ESCALATED':
      return AuditActions.HUMAN_ESCALATED;
    default:
      return 'HUMAN_INTERVENTION';
  }
}

/**
 * Exporta tipos para uso externo
 */
export { InterventionAction };
