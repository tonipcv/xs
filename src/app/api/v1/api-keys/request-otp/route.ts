// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any)
    const email = (session as any)?.user?.email as string | undefined
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } })
    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant linked' }, { status: 400 })
    }

    const code = genCode()
    const redis = await getRedisClient()
    const key = `otp:api-key:${user.tenantId}:${email}`
    await redis.setex(key, 600, code) // 10 minutes

    // Dev-mode: log code to console; production would send email via provider
    console.log(`[OTP] API Key code for ${email}: ${code}`)

    return NextResponse.json({ ok: true, sent: process.env.NODE_ENV !== 'production' ? 'logged' : 'queued' })
  } catch (err: any) {
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
