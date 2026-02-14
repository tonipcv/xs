// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'
import { hashApiKey } from '@/lib/xase/auth'

function genApiKey() {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  return `xase_pk_${rand}`
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any)
    const email = (session as any)?.user?.email as string | undefined
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const code = String(body?.code || '').trim()
    if (!code || code.length !== 6) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } })
    if (!user?.tenantId) return NextResponse.json({ error: 'No tenant linked' }, { status: 400 })

    const redis = await getRedisClient()
    const key = `otp:api-key:${user.tenantId}:${email}`
    const stored = await redis.get(key)
    if (!stored) return NextResponse.json({ error: 'Code expired' }, { status: 400 })
    if (stored !== code) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })

    // Consume OTP
    await redis.del(key)

    // Generate API key
    const apiKeyPlain = genApiKey()
    const keyHash = await hashApiKey(apiKeyPlain)

    const created = await prisma.apiKey.create({
      data: {
        tenantId: user.tenantId,
        name: 'UI OTP Key',
        keyHash,
        isActive: true,
        permissions: 'verify',
      },
      select: { id: true }
    })

    return NextResponse.json({ ok: true, apiKey: apiKeyPlain })
  } catch (err: any) {
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
