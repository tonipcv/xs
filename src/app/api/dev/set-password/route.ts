import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'

export async function POST(req: Request) {
  try {
    // Only allow in non-production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    }

    const authHeader = req.headers.get('x-dev-admin-token') || ''
    const expected = process.env.DEV_ADMIN_TOKEN || ''
    if (!expected || authHeader !== expected) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const body = await req.json().catch(() => null as any)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const { email, newPassword } = body as { email?: string; newPassword?: string }
    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Missing email or newPassword' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const hashed = await hash(newPassword, 10)
    await prisma.user.update({ where: { email }, data: { password: hashed } })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Dev Set Password] Error:', msg)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
