/**
 * XASE CORE - Signing Service (Enterprise)
 * 
 * Camada de segurança entre API e KMS
 * - Valida contexto antes de assinar
 * - Rate limiting por tenant
 * - Auditoria completa
 * - Nunca assina JSON direto, apenas hashes canônicos
 */

import { getKMSProvider, KMSSignature } from './kms'
import { logAudit } from './audit'
import { hashString } from './crypto'

interface SignRequest {
  tenantId: string
  resourceType: 'decision' | 'checkpoint' | 'export'
  resourceId: string
  hash: string // SHA-256 hex (64 chars)
  metadata?: Record<string, any>
}

interface SignResponse {
  signature: string
  algorithm: string
  keyId: string
  keyFingerprint: string
  timestamp: Date
}

// Rate limiting in-memory (produção: usar Redis)
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hora
const RATE_LIMIT_MAX_SIGNS = 1000 // 1000 assinaturas/hora por tenant

/**
 * Valida request de assinatura
 */
function validateSignRequest(req: SignRequest): { valid: boolean; error?: string } {
  // 1. Hash deve ser SHA-256 válido (64 hex chars)
  if (!/^[a-f0-9]{64}$/i.test(req.hash)) {
    return { valid: false, error: 'Invalid hash format (expected SHA-256 hex)' }
  }

  // 2. Tenant ID obrigatório
  if (!req.tenantId || req.tenantId.length < 3) {
    return { valid: false, error: 'Invalid tenant ID' }
  }

  // 3. Resource type válido
  if (!['decision', 'checkpoint', 'export'].includes(req.resourceType)) {
    return { valid: false, error: 'Invalid resource type' }
  }

  // 4. Resource ID obrigatório
  if (!req.resourceId || req.resourceId.length < 3) {
    return { valid: false, error: 'Invalid resource ID' }
  }

  return { valid: true }
}

/**
 * Rate limiting por tenant
 */
function checkRateLimit(tenantId: string): { allowed: boolean; error?: string } {
  const now = Date.now()
  const key = `sign:${tenantId}`
  
  let limit = rateLimits.get(key)
  
  // Reset se janela expirou
  if (!limit || now > limit.resetAt) {
    limit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateLimits.set(key, limit)
  }

  // Incrementa contador
  limit.count++

  if (limit.count > RATE_LIMIT_MAX_SIGNS) {
    return {
      allowed: false,
      error: `Rate limit exceeded: ${RATE_LIMIT_MAX_SIGNS} signatures per hour`
    }
  }

  return { allowed: true }
}

/**
 * Assina hash com validação completa
 * 
 * NUNCA assina JSON direto - apenas hashes SHA-256
 */
export async function signHash(req: SignRequest): Promise<SignResponse> {
  // 1. Validar request
  const validation = validateSignRequest(req)
  if (!validation.valid) {
    await logAudit({
      tenantId: req.tenantId,
      action: 'SIGN_REJECTED',
      resourceType: 'SIGNING_SERVICE',
      resourceId: req.resourceId,
      metadata: JSON.stringify({ reason: validation.error, ...req.metadata }),
      status: 'FAILED',
      errorMessage: validation.error,
    })
    throw new Error(`Sign validation failed: ${validation.error}`)
  }

  // 2. Rate limiting
  const rateCheck = checkRateLimit(req.tenantId)
  if (!rateCheck.allowed) {
    await logAudit({
      tenantId: req.tenantId,
      action: 'SIGN_RATE_LIMITED',
      resourceType: 'SIGNING_SERVICE',
      resourceId: req.resourceId,
      metadata: JSON.stringify(req.metadata),
      status: 'FAILED',
      errorMessage: rateCheck.error,
    })
    throw new Error(rateCheck.error)
  }

  // 3. Assinar com KMS
  const kms = getKMSProvider()
  let kmsSig: KMSSignature

  try {
    // Assina o HASH (não o JSON)
    kmsSig = await kms.sign(req.hash)
  } catch (error) {
    await logAudit({
      tenantId: req.tenantId,
      action: 'SIGN_KMS_ERROR',
      resourceType: 'SIGNING_SERVICE',
      resourceId: req.resourceId,
      metadata: JSON.stringify(req.metadata),
      status: 'FAILED',
      errorMessage: error instanceof Error ? error.message : 'KMS error',
    })
    throw error
  }

  // 4. Calcular fingerprint da chave pública
  const publicKeyPem = await getPublicKeyPem()
  const keyFingerprint = hashString(publicKeyPem)

  // 5. Audit log de sucesso
  await logAudit({
    tenantId: req.tenantId,
    action: 'HASH_SIGNED',
    resourceType: req.resourceType.toUpperCase(),
    resourceId: req.resourceId,
    metadata: JSON.stringify({
      keyId: kmsSig.keyId,
      keyFingerprint: keyFingerprint.substring(0, 16),
      algorithm: kmsSig.algorithm,
      ...req.metadata,
    }),
    status: 'SUCCESS',
  })

  return {
    signature: kmsSig.signature,
    algorithm: kmsSig.algorithm,
    keyId: kmsSig.keyId,
    keyFingerprint,
    timestamp: kmsSig.timestamp,
  }
}

/**
 * Obtém chave pública do KMS (com cache)
 */
let cachedPublicKeyPem: string | null = null

export async function getPublicKeyPem(): Promise<string> {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem
  }

  const kms = getKMSProvider()

  // Se for AWS KMS, buscar via GetPublicKeyCommand
  if (process.env.XASE_KMS_TYPE === 'aws') {
    try {
      const { GetPublicKeyCommand } = require('@aws-sdk/client-kms')
      const command = new GetPublicKeyCommand({
        KeyId: process.env.XASE_KMS_KEY_ID!,
      })

      const response = await (kms as any).kmsClient.send(command)
      
      // Converter DER para PEM
      const publicKeyDer = Buffer.from(response.PublicKey)
      const publicKeyPem = derToPem(publicKeyDer, 'PUBLIC KEY')
      
      cachedPublicKeyPem = publicKeyPem
      return publicKeyPem
    } catch (error) {
      console.error('[SigningService] Failed to get public key from KMS:', error)
      throw new Error('Failed to retrieve public key from KMS')
    }
  }

  // Fallback: usar env var ou mock
  const envPem = process.env.XASE_PUBLIC_KEY_PEM
  if (envPem) {
    cachedPublicKeyPem = envPem
    return envPem
  }

  // Mock KMS: gerar par e exportar
  if ((kms as any).publicKey) {
    const crypto = require('crypto')
    const publicKeyPem = (kms as any).publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string
    cachedPublicKeyPem = publicKeyPem
    return publicKeyPem
  }

  throw new Error('No public key available')
}

/**
 * Converte DER para PEM
 */
function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString('base64')
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

/**
 * Verifica assinatura offline
 */
export async function verifySignature(
  hash: string,
  signature: string,
  publicKeyPem?: string
): Promise<boolean> {
  const kms = getKMSProvider()
  
  // Se tiver chave pública, usar verificação local
  if (publicKeyPem) {
    const crypto = require('crypto')
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(hash)
    verify.end()
    
    try {
      return verify.verify(publicKeyPem, Buffer.from(signature, 'base64'))
    } catch {
      return false
    }
  }

  // Fallback: usar KMS verify
  return kms.verify(hash, signature)
}

/**
 * Estatísticas de uso (para monitoring)
 */
export function getSigningStats() {
  const stats: Record<string, any> = {}
  
  for (const [key, limit] of rateLimits.entries()) {
    const tenantId = key.replace('sign:', '')
    stats[tenantId] = {
      count: limit.count,
      limit: RATE_LIMIT_MAX_SIGNS,
      resetAt: new Date(limit.resetAt).toISOString(),
    }
  }

  return stats
}
