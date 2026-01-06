/**
 * XASE CORE - Cryptographic Utilities
 * 
 * Funções para hash criptográfico e encadeamento de decisões
 */

import crypto from 'crypto';

/**
 * Canonicaliza JSON para hash consistente
 * Ordena as chaves alfabeticamente para garantir mesmo hash
 */
export function canonicalizeJSON(obj: any): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(item => 
      typeof item === 'object' ? JSON.parse(canonicalizeJSON(item)) : item
    ));
  }
  
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, any> = {};
  
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  
  return JSON.stringify(sortedObj);
}

/**
 * Gera hash SHA-256 de um objeto (retorna formato sha256:hex)
 */
export function hashObject(obj: any): string {
  const canonical = canonicalizeJSON(obj);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hash}`;
}

// Adicionar propriedade canonicalJSON ao hashObject para uso no snapshot service
hashObject.canonicalJSON = canonicalizeJSON;

/**
 * Gera hash SHA-256 de uma string
 */
export function hashString(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Gera hash encadeado (previousHash + currentData)
 * Este é o core do ledger imutável
 */
export function chainHash(previousHash: string | null, currentData: string): string {
  const data = previousHash ? `${previousHash}${currentData}` : currentData;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Gera transaction ID único
 */
export function generateTransactionId(): string {
  return `txn_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Gera API Key única
 */
export function generateApiKey(): string {
  return `xase_pk_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Extrai prefixo da API Key (primeiros 16 chars)
 */
export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 16);
}

/**
 * Valida formato de transaction ID
 */
export function isValidTransactionId(id: string): boolean {
  return /^txn_[a-f0-9]{32}$/.test(id);
}

/**
 * Valida formato de API Key
 */
export function isValidApiKey(key: string): boolean {
  return /^xase_pk_[a-f0-9]{48}$/.test(key);
}

/**
 * Gera HMAC-SHA256 para assinatura de pacotes de prova
 */
export function generateHMAC(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verifica HMAC
 */
export function verifyHMAC(data: string, signature: string, secret: string): boolean {
  const expected = generateHMAC(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
