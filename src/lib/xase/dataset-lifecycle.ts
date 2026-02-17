/**
 * DATASET LIFECYCLE ENFORCEMENT
 * Garante transições de estado obrigatórias e não puláveis
 * 
 * FLUXO OBRIGATÓRIO: DRAFT → PROCESSING → COMPLETED → ACTIVE
 * NENHUMA transição pode ser pulada
 */

import { prisma } from '@/lib/prisma'

export type DatasetStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface DatasetStateValidation {
  allowed: boolean
  reason: string
  currentState: {
    status: DatasetStatus
    processingStatus: ProcessingStatus
  }
}

/**
 * VALIDAÇÃO DE TRANSIÇÃO DE ESTADO
 * Função pura que valida se uma transição é permitida
 */
export function validateStateTransition(
  currentStatus: DatasetStatus,
  currentProcessingStatus: ProcessingStatus,
  targetStatus: DatasetStatus,
  targetProcessingStatus?: ProcessingStatus
): DatasetStateValidation {
  const currentState = {
    status: currentStatus,
    processingStatus: currentProcessingStatus
  }

  // 1. DRAFT → ACTIVE (publish): Só se processamento COMPLETED
  if (currentStatus === 'DRAFT' && targetStatus === 'ACTIVE') {
    if (currentProcessingStatus !== 'COMPLETED') {
      return {
        allowed: false,
        reason: `Cannot publish dataset: processing status is ${currentProcessingStatus}, must be COMPLETED`,
        currentState
      }
    }
    return { allowed: true, reason: 'Valid transition: DRAFT → ACTIVE', currentState }
  }

  // 2. ACTIVE → ARCHIVED: Sempre permitido
  if (currentStatus === 'ACTIVE' && targetStatus === 'ARCHIVED') {
    return { allowed: true, reason: 'Valid transition: ACTIVE → ARCHIVED', currentState }
  }

  // 3. ARCHIVED → ACTIVE: Só se processamento ainda COMPLETED
  if (currentStatus === 'ARCHIVED' && targetStatus === 'ACTIVE') {
    if (currentProcessingStatus !== 'COMPLETED') {
      return {
        allowed: false,
        reason: `Cannot reactivate dataset: processing status is ${currentProcessingStatus}, must be COMPLETED`,
        currentState
      }
    }
    return { allowed: true, reason: 'Valid transition: ARCHIVED → ACTIVE', currentState }
  }

  // 4. Transições de ProcessingStatus (independente do status principal)
  if (targetProcessingStatus && targetProcessingStatus !== currentProcessingStatus) {
    // PENDING → PROCESSING: Sempre permitido
    if (currentProcessingStatus === 'PENDING' && targetProcessingStatus === 'PROCESSING') {
      return { allowed: true, reason: 'Valid processing transition: PENDING → PROCESSING', currentState }
    }

    // PROCESSING → COMPLETED: Sempre permitido
    if (currentProcessingStatus === 'PROCESSING' && targetProcessingStatus === 'COMPLETED') {
      return { allowed: true, reason: 'Valid processing transition: PROCESSING → COMPLETED', currentState }
    }

    // PROCESSING → FAILED: Sempre permitido
    if (currentProcessingStatus === 'PROCESSING' && targetProcessingStatus === 'FAILED') {
      return { allowed: true, reason: 'Valid processing transition: PROCESSING → FAILED', currentState }
    }

    // FAILED → PENDING: Permitido (retry)
    if (currentProcessingStatus === 'FAILED' && targetProcessingStatus === 'PENDING') {
      return { allowed: true, reason: 'Valid processing transition: FAILED → PENDING (retry)', currentState }
    }

    // Outras transições de processamento são inválidas
    return {
      allowed: false,
      reason: `Invalid processing transition: ${currentProcessingStatus} → ${targetProcessingStatus}`,
      currentState
    }
  }

  // 5. Transições inválidas de status principal
  return {
    allowed: false,
    reason: `Invalid status transition: ${currentStatus} → ${targetStatus}`,
    currentState
  }
}

/**
 * ENFORCEMENT: Valida acesso baseado no estado atual
 * Dataset só pode ser acessado se ACTIVE + COMPLETED
 */
export function validateDatasetAccess(
  status: DatasetStatus,
  processingStatus: ProcessingStatus
): DatasetStateValidation {
  const currentState = { status, processingStatus }

  // 1. Deve estar ACTIVE
  if (status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `Dataset access denied: status is ${status}, must be ACTIVE`,
      currentState
    }
  }

  // 2. Processamento deve estar COMPLETED
  if (processingStatus !== 'COMPLETED') {
    return {
      allowed: false,
      reason: `Dataset access denied: processing status is ${processingStatus}, must be COMPLETED`,
      currentState
    }
  }

  return {
    allowed: true,
    reason: 'Dataset access allowed: ACTIVE + COMPLETED',
    currentState
  }
}

/**
 * ORQUESTRAÇÃO: Atualiza estado do dataset com validação
 */
export async function updateDatasetState(
  datasetId: string,
  newStatus?: DatasetStatus,
  newProcessingStatus?: ProcessingStatus,
  tenantId?: string
): Promise<DatasetStateValidation> {
  try {
    // Buscar estado atual
    const dataset = await prisma.dataset.findFirst({
      where: { 
        datasetId,
        ...(tenantId && { tenantId })
      },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        totalDurationHours: true,
        consentStatus: true,
      },
    })

    if (!dataset) {
      return {
        allowed: false,
        reason: 'Dataset not found',
        currentState: { status: 'DRAFT', processingStatus: 'PENDING' }
      }
    }

    const currentStatus = dataset.status as DatasetStatus
    const currentProcessingStatus = dataset.processingStatus as ProcessingStatus

    // Se nenhuma mudança solicitada, apenas validar acesso
    if (!newStatus && !newProcessingStatus) {
      return validateDatasetAccess(currentStatus, currentProcessingStatus)
    }

    // Validar transição solicitada
    const targetStatus = newStatus || currentStatus
    const targetProcessingStatus = newProcessingStatus || currentProcessingStatus

    const validation = validateStateTransition(
      currentStatus,
      currentProcessingStatus,
      targetStatus,
      targetProcessingStatus
    )

    if (!validation.allowed) {
      return validation
    }

    // Validações adicionais para publish (DRAFT → ACTIVE)
    if (currentStatus === 'DRAFT' && targetStatus === 'ACTIVE') {
      // Deve ter duração > 0
      if (!dataset.totalDurationHours || dataset.totalDurationHours <= 0) {
        return {
          allowed: false,
          reason: 'Cannot publish dataset: totalDurationHours must be > 0',
          currentState: validation.currentState
        }
      }

      // Consent não pode estar MISSING
      if (dataset.consentStatus === 'MISSING') {
        return {
          allowed: false,
          reason: 'Cannot publish dataset: consent status is MISSING',
          currentState: validation.currentState
        }
      }
    }

    // Executar atualização
    const updateData: any = {}
    if (newStatus) updateData.status = newStatus
    if (newProcessingStatus) updateData.processingStatus = newProcessingStatus
    if (newStatus === 'ACTIVE' && currentStatus === 'DRAFT') {
      updateData.publishedAt = new Date()
    }
    if (newStatus === 'ARCHIVED' && currentStatus === 'ACTIVE') {
      updateData.archivedAt = new Date()
    }

    await prisma.dataset.update({
      where: { id: dataset.id },
      data: updateData,
    })

    return {
      allowed: true,
      reason: `Dataset state updated successfully: ${currentStatus}/${currentProcessingStatus} → ${targetStatus}/${targetProcessingStatus}`,
      currentState: {
        status: targetStatus,
        processingStatus: targetProcessingStatus
      }
    }
  } catch (error: any) {
    console.error('[DatasetLifecycle] Update error:', error)
    return {
      allowed: false,
      reason: 'Internal error during state update',
      currentState: { status: 'DRAFT', processingStatus: 'PENDING' }
    }
  }
}

/**
 * HELPER: Verifica se dataset pode ser acessado
 */
export async function canAccessDataset(datasetId: string): Promise<DatasetStateValidation> {
  return updateDatasetState(datasetId) // Sem mudanças = apenas validação
}

/**
 * HELPER: Publica dataset (DRAFT → ACTIVE)
 */
export async function publishDataset(datasetId: string, tenantId: string): Promise<DatasetStateValidation> {
  return updateDatasetState(datasetId, 'ACTIVE', undefined, tenantId)
}

/**
 * HELPER: Arquiva dataset (ACTIVE → ARCHIVED)
 */
export async function archiveDataset(datasetId: string, tenantId: string): Promise<DatasetStateValidation> {
  return updateDatasetState(datasetId, 'ARCHIVED', undefined, tenantId)
}
