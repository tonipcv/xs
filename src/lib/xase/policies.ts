/**
 * XASE CORE - Policy Management
 * 
 * Versionamento e snapshot de políticas de decisão
 * Garante que cada record tenha referência imutável à política usada
 */

import { prisma } from '../prisma'
import { hashString } from './crypto'
import { logAudit } from './audit'

export interface PolicyDocument {
  policyId: string
  version: string
  document: any // JSON da política (regras, thresholds, etc)
  name?: string
  description?: string
}

export interface PolicySnapshot {
  policyId: string
  version: string
  documentHash: string
  document: any
  name?: string
  description?: string
  isActive: boolean
  activatedAt: Date
}

/**
 * Cria ou atualiza uma política
 */
export async function createPolicy(
  tenantId: string,
  policy: PolicyDocument
): Promise<PolicySnapshot> {
  // Hash do documento
  const documentStr = JSON.stringify(policy.document)
  const documentHash = hashString(documentStr)

  // Desativar versões anteriores se houver
  await prisma.policy.updateMany({
    where: {
      tenantId,
      policyId: policy.policyId,
      isActive: true,
    },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    },
  })

  // Criar nova versão
  const created = await prisma.policy.create({
    data: {
      tenantId,
      policyId: policy.policyId,
      version: policy.version,
      document: documentStr,
      documentHash,
      name: policy.name,
      description: policy.description,
      isActive: true,
    },
  })

  // Audit log
  await logAudit({
    tenantId,
    action: 'POLICY_CREATED',
    resourceType: 'POLICY',
    resourceId: created.id,
    metadata: JSON.stringify({
      policyId: policy.policyId,
      version: policy.version,
      documentHash,
    }),
    status: 'SUCCESS',
  })

  return {
    policyId: created.policyId,
    version: created.version,
    documentHash: created.documentHash,
    document: JSON.parse(created.document),
    name: created.name || undefined,
    description: created.description || undefined,
    isActive: created.isActive,
    activatedAt: created.activatedAt,
  }
}

/**
 * Busca política ativa por ID
 */
export async function getActivePolicy(
  tenantId: string,
  policyId: string
): Promise<PolicySnapshot | null> {
  const policy = await prisma.policy.findFirst({
    where: {
      tenantId,
      policyId,
      isActive: true,
    },
    orderBy: {
      activatedAt: 'desc',
    },
  })

  if (!policy) return null

  return {
    policyId: policy.policyId,
    version: policy.version,
    documentHash: policy.documentHash,
    document: JSON.parse(policy.document),
    name: policy.name || undefined,
    description: policy.description || undefined,
    isActive: policy.isActive,
    activatedAt: policy.activatedAt,
  }
}

/**
 * Busca versão específica de uma política
 */
export async function getPolicyVersion(
  tenantId: string,
  policyId: string,
  version: string
): Promise<PolicySnapshot | null> {
  const policy = await prisma.policy.findUnique({
    where: {
      tenantId_policyId_version: {
        tenantId,
        policyId,
        version,
      },
    },
  })

  if (!policy) return null

  return {
    policyId: policy.policyId,
    version: policy.version,
    documentHash: policy.documentHash,
    document: JSON.parse(policy.document),
    name: policy.name || undefined,
    description: policy.description || undefined,
    isActive: policy.isActive,
    activatedAt: policy.activatedAt,
  }
}

/**
 * Lista todas as versões de uma política
 */
export async function listPolicyVersions(
  tenantId: string,
  policyId: string
): Promise<PolicySnapshot[]> {
  const policies = await prisma.policy.findMany({
    where: {
      tenantId,
      policyId,
    },
    orderBy: {
      activatedAt: 'desc',
    },
  })

  return policies.map((p) => ({
    policyId: p.policyId,
    version: p.version,
    documentHash: p.documentHash,
    document: JSON.parse(p.document),
    name: p.name || undefined,
    description: p.description || undefined,
    isActive: p.isActive,
    activatedAt: p.activatedAt,
  }))
}

/**
 * Lista todas as políticas ativas de um tenant
 */
export async function listActivePolicies(
  tenantId: string
): Promise<PolicySnapshot[]> {
  const policies = await prisma.policy.findMany({
    where: {
      tenantId,
      isActive: true,
    },
    orderBy: {
      policyId: 'asc',
    },
  })

  return policies.map((p) => ({
    policyId: p.policyId,
    version: p.version,
    documentHash: p.documentHash,
    document: JSON.parse(p.document),
    name: p.name || undefined,
    description: p.description || undefined,
    isActive: p.isActive,
    activatedAt: p.activatedAt,
  }))
}

/**
 * Desativa uma política
 */
export async function deactivatePolicy(
  tenantId: string,
  policyId: string,
  version: string
): Promise<void> {
  await prisma.policy.updateMany({
    where: {
      tenantId,
      policyId,
      version,
    },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    },
  })

  await logAudit({
    tenantId,
    action: 'POLICY_DEACTIVATED',
    resourceType: 'POLICY',
    resourceId: `${policyId}@${version}`,
    metadata: JSON.stringify({ policyId, version }),
    status: 'SUCCESS',
  })
}
