/**
 * XASE SDK - Context Capture
 * 
 * Captures runtime context for evidence records
 */

import { createHash } from 'crypto'
import { hostname } from 'os'

/**
 * Captures current runtime context
 */
export function captureContext(): Record<string, any> {
  return {
    runtime: `node@${process.version}`,
    platform: process.platform,
    arch: process.arch,
    hostname: hostname(),
    pid: process.pid,
    libVersion: '0.1.0', // TODO: Read from package.json
    env: process.env.NODE_ENV || 'development',
    timestamp: Date.now(),
  }
}

/**
 * Generates a stable idempotency key from payload
 */
export function generateIdempotencyKey(data: string): string {
  const hash = createHash('sha256')
  hash.update(data)
  return hash.digest('hex').substring(0, 32)
}

/**
 * Validates idempotency key format
 */
export function isValidIdempotencyKey(key: string): boolean {
  // UUID v4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRegex.test(key)) {
    return true
  }

  // Alphanumeric 16-64 chars
  const alphanumericRegex = /^[a-zA-Z0-9_-]{16,64}$/
  return alphanumericRegex.test(key)
}
