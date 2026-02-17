import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/redis'
import { generateRandomId } from '@/lib/xase/bearer'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body?.email || '').toString().trim().toLowerCase()
    const scopes: string[] = Array.isArray(body?.scopes) ? body.scopes : ['read:offers']
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const redis = await getRedisClient()
    const device_code = generateRandomId(24)
    const user_code = generateRandomId(4).slice(0, 8).toUpperCase()
    const record = {
      email,
      user_code,
      scopes,
      status: 'pending',
      createdAt: Date.now(),
    }
    // TTL 10 min
    await redis.setex(`cli:device:${device_code}`, 600, JSON.stringify(record))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (new URL(req.url)).origin
    const verification_url = `${baseUrl}/app/cli/verify?device=${encodeURIComponent(device_code)}`

    return NextResponse.json({
      device_code,
      user_code,
      verification_url,
      expires_in: 600,
      interval: 5,
      scope: scopes.join(' '),
    })
  } catch (err: any) {
    console.error('[CLI][auth/start] error', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
