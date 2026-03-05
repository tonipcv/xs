import crypto from 'crypto'

export function hashObject(input: unknown): string {
  const data = typeof input === 'string' ? input : JSON.stringify(input)
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function chainHash(previousHash: string, payload: unknown): string {
  const data = `${previousHash}:${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function generateTransactionId(prefix = 'txn'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
