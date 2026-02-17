import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getRedisClient } from '@/lib/redis'

export type CliTokenPayload = {
  tenantId: string
  scopes: string[]
  issuedAt: number
  expiresAt: number
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generateRandomId(len: number = 32): string {
  return base64url(crypto.randomBytes(len))
}

// In-memory fallback store (dev/local when Redis is unavailable)
const memAccess = new Map<string, { payload: CliTokenPayload; expAt: number }>()
const memRefresh = new Map<string, { tenantId: string; scopes: string[]; expAt: number }>()

function getSecret(): Buffer {
  const s = process.env.XASE_CLI_TOKEN_SECRET || 'dev-cli-secret-change-me'
  return Buffer.from(s, 'utf8')
}

function signPayload(payload: CliTokenPayload): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(Buffer.from(JSON.stringify(payload)))
  const data = `${header}.${body}`
  const sig = base64url(crypto.createHmac('sha256', getSecret()).update(data).digest())
  return `xase_cli_${data}.${sig}`
}

function verifySignedToken(token: string): { ok: boolean; payload?: CliTokenPayload } {
  if (!token.startsWith('xase_cli_')) return { ok: false }
  const t = token.substring('xase_cli_'.length)
  const parts = t.split('.')
  if (parts.length !== 3) return { ok: false }
  const [headerB64, bodyB64, sig] = parts
  const data = `${headerB64}.${bodyB64}`
  const expected = base64url(crypto.createHmac('sha256', getSecret()).update(data).digest())
  if (sig !== expected) return { ok: false }
  try {
    const json = Buffer.from(bodyB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const payload: CliTokenPayload = JSON.parse(json)
    const now = Math.floor(Date.now() / 1000)
    if (payload.expiresAt <= now) return { ok: false }
    return { ok: true, payload }
  } catch {
    return { ok: false }
  }
}

export async function issueCliToken(tenantId: string, scopes: string[], ttlSeconds: number = 900) {
  const access = `xase_cli_${generateRandomId(24)}`
  const refresh = `xase_cli_r_${generateRandomId(24)}`
  const now = Math.floor(Date.now() / 1000)
  const payload: CliTokenPayload = { tenantId, scopes, issuedAt: now, expiresAt: now + ttlSeconds }
  try {
    const redis = await getRedisClient()
    await redis.setex(`cli:token:${access}`, ttlSeconds, JSON.stringify(payload))
    await redis.setex(`cli:refresh:${refresh}`, 7 * 24 * 3600, JSON.stringify({ tenantId, scopes }))
  } catch (e) {
    // Fallback to in-memory (dev)
    memAccess.set(access, { payload, expAt: Date.now() + ttlSeconds * 1000 })
    memRefresh.set(refresh, { tenantId, scopes, expAt: Date.now() + 7 * 24 * 3600 * 1000 })
  }
  // Always also return a stateless signed token that can be validated without Redis
  const stateless = signPayload(payload)
  return { access_token: stateless, refresh_token: refresh, expires_in: ttlSeconds, token_type: 'Bearer', scope: scopes.join(' ') }
}

export async function refreshCliToken(refreshToken: string, ttlSeconds: number = 900) {
  try {
    const redis = await getRedisClient()
    const raw = await redis.get(`cli:refresh:${refreshToken}`)
    if (!raw) return null
    const data = JSON.parse(raw)
    return issueCliToken(data.tenantId, data.scopes, ttlSeconds)
  } catch (e) {
    const entry = memRefresh.get(refreshToken)
    if (!entry || entry.expAt <= Date.now()) return null
    return issueCliToken(entry.tenantId, entry.scopes, ttlSeconds)
  }
}

export async function validateBearer(request: Request | NextRequest): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  const header = request.headers.get('Authorization') || request.headers.get('authorization')
  if (!header || !header.startsWith('Bearer ')) return { valid: false }
  const token = header.substring(7)
  // Fast path: verify stateless token
  const jws = verifySignedToken(token)
  if (jws.ok && jws.payload) {
    return { valid: true, tenantId: jws.payload.tenantId, scopes: jws.payload.scopes }
  }
  try {
    const redis = await getRedisClient()
    const raw = await redis.get(`cli:token:${token}`)
    if (raw) {
      const payload: CliTokenPayload = JSON.parse(raw)
      const now = Math.floor(Date.now() / 1000)
      if (payload.expiresAt <= now) return { valid: false }
      return { valid: true, tenantId: payload.tenantId, scopes: payload.scopes }
    }
    // Not found in Redis, try in-memory fallback
    const entry = memAccess.get(token)
    if (!entry || entry.expAt <= Date.now()) return { valid: false }
    const payload = entry.payload
    const now = Math.floor(Date.now() / 1000)
    if (payload.expiresAt <= now) return { valid: false }
    return { valid: true, tenantId: payload.tenantId, scopes: payload.scopes }
  } catch (e) {
    const entry = memAccess.get(token)
    if (!entry || entry.expAt <= Date.now()) return { valid: false }
    const payload = entry.payload
    const now = Math.floor(Date.now() / 1000)
    if (payload.expiresAt <= now) return { valid: false }
    return { valid: true, tenantId: payload.tenantId, scopes: payload.scopes }
  }
}
