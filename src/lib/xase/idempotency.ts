/**
 * XASE CORE - Idempotency
 * 
 * Implementa Idempotency-Key para evitar duplicação de requests
 * Cache em memória (pode ser migrado para Redis em produção)
 */

interface IdempotencyRecord {
  key: string;
  response: any;
  timestamp: number;
  tenantId: string;
}

// Cache em memória (TTL 24h)
const cache = new Map<string, IdempotencyRecord>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Limpa registros expirados (executar periodicamente)
 */
function cleanExpired() {
  const now = Date.now();
  for (const [key, record] of cache.entries()) {
    if (now - record.timestamp > TTL_MS) {
      cache.delete(key);
    }
  }
}

// Limpar cache a cada 1 hora
setInterval(cleanExpired, 60 * 60 * 1000);

/**
 * Gera chave única para tenant + idempotency key
 */
function getCacheKey(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}:${idempotencyKey}`;
}

/**
 * Verifica se request já foi processado
 */
export function checkIdempotency(
  tenantId: string,
  idempotencyKey: string
): { exists: boolean; response?: any } {
  const cacheKey = getCacheKey(tenantId, idempotencyKey);
  const record = cache.get(cacheKey);

  if (!record) {
    return { exists: false };
  }

  // Verificar se expirou
  if (Date.now() - record.timestamp > TTL_MS) {
    cache.delete(cacheKey);
    return { exists: false };
  }

  return {
    exists: true,
    response: record.response,
  };
}

/**
 * Armazena resposta para idempotency key
 */
export function storeIdempotency(
  tenantId: string,
  idempotencyKey: string,
  response: any
): void {
  const cacheKey = getCacheKey(tenantId, idempotencyKey);
  
  cache.set(cacheKey, {
    key: idempotencyKey,
    response,
    timestamp: Date.now(),
    tenantId,
  });
}

/**
 * Valida formato de Idempotency-Key
 * Deve ser UUID v4 ou string alfanumérica de 16-64 chars
 */
export function isValidIdempotencyKey(key: string): boolean {
  // UUID v4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(key)) {
    return true;
  }

  // Alfanumérico 16-64 chars
  const alphanumericRegex = /^[a-zA-Z0-9_-]{16,64}$/;
  return alphanumericRegex.test(key);
}

/**
 * Estatísticas do cache (para monitoramento)
 */
export function getIdempotencyStats(): {
  size: number;
  oldestTimestamp: number | null;
} {
  let oldestTimestamp: number | null = null;

  for (const record of cache.values()) {
    if (oldestTimestamp === null || record.timestamp < oldestTimestamp) {
      oldestTimestamp = record.timestamp;
    }
  }

  return {
    size: cache.size,
    oldestTimestamp,
  };
}

/**
 * Limpa cache manualmente (útil para testes)
 */
export function clearIdempotencyCache(): void {
  cache.clear();
}
