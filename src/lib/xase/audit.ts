/**
 * XASE CORE - Audit Log
 * 
 * Trilha imutável de ações administrativas
 * WORM (Write Once, Read Many) via triggers SQL
 */

import { prisma } from '../prisma';

export interface AuditLogEntry {
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: 'SUCCESS' | 'FAILED' | 'DENIED';
  errorMessage?: string;
}

/**
 * Registra ação no audit log
 * IMUTÁVEL: triggers SQL impedem UPDATE/DELETE
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId || null,
        userId: entry.userId || null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId || null,
        metadata: entry.metadata || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        status: entry.status || 'SUCCESS',
        errorMessage: entry.errorMessage || null,
      },
    });
  } catch (error) {
    // Não falhar operação principal se audit log falhar
    console.error('[AuditLog] Failed to log:', error);
  }
}

/**
 * Busca logs de auditoria com filtros
 */
export async function queryAuditLogs(filters: {
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};

  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.resourceType) where.resourceType = filters.resourceType;

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) where.timestamp.gte = filters.startDate;
    if (filters.endDate) where.timestamp.lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Ações comuns de auditoria
 */
export const AuditActions = {
  // API Keys
  KEY_CREATED: 'KEY_CREATED',
  KEY_ROTATED: 'KEY_ROTATED',
  KEY_REVOKED: 'KEY_REVOKED',
  KEY_ACCESSED: 'KEY_ACCESSED',

  // Checkpoints
  CHECKPOINT_CREATED: 'CHECKPOINT_CREATED',
  CHECKPOINT_VERIFIED: 'CHECKPOINT_VERIFIED',

  // Exports
  EXPORT_CREATED: 'EXPORT_CREATED',
  EXPORT_DOWNLOADED: 'EXPORT_DOWNLOADED',
  BUNDLE_STORED: 'BUNDLE_STORED',
  BUNDLE_DOWNLOADED: 'BUNDLE_DOWNLOADED',

  // Payloads
  PAYLOAD_ACCESSED: 'PAYLOAD_ACCESSED',
  PAYLOAD_DELETED: 'PAYLOAD_DELETED',

  // Admin
  TENANT_CREATED: 'TENANT_CREATED',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  USER_ADDED: 'USER_ADDED',
  USER_REMOVED: 'USER_REMOVED',
  ROLE_CHANGED: 'ROLE_CHANGED',

  // DSR (LGPD/GDPR)
  DSR_REQUEST: 'DSR_REQUEST',
  DSR_FULFILLED: 'DSR_FULFILLED',
  
  // Human-in-the-Loop (HITL)
  HUMAN_REVIEW_REQUESTED: 'HUMAN_REVIEW_REQUESTED',
  HUMAN_APPROVED: 'HUMAN_APPROVED',
  HUMAN_REJECTED: 'HUMAN_REJECTED',
  HUMAN_OVERRIDE: 'HUMAN_OVERRIDE',
  HUMAN_ESCALATED: 'HUMAN_ESCALATED',
  INTERVENTION_FAILED: 'INTERVENTION_FAILED',
} as const;

/**
 * Tipos de recursos
 */
export const ResourceTypes = {
  API_KEY: 'API_KEY',
  DECISION_RECORD: 'DECISION_RECORD',
  CHECKPOINT: 'CHECKPOINT',
  TENANT: 'TENANT',
  USER: 'USER',
  EXPORT: 'EXPORT',
  EVIDENCE_BUNDLE: 'EVIDENCE_BUNDLE',
} as const;
