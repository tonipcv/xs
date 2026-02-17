import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  organizationName: z.string().min(2),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: parsed.error.flatten() 
      }, { status: 400 })
    }

    const { name, email, password, organizationName } = parsed.data

    // Verificar se email já existe
    const existing = await prisma.user.findUnique({
      where: { email },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10)

    // Criar tenant (SUPPLIER para Call Center)
    const tenant = await prisma.tenant.create({
      data: {
        name: organizationName,
        email,
        organizationType: 'SUPPLIER',
        status: 'ACTIVE',
      },
    })

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        tenantId: tenant.id,
        emailVerified: new Date(), // Auto-verify para MVP
      },
    })

    return NextResponse.json({ 
      success: true,
      userId: user.id,
      tenantId: tenant.id,
    }, { status: 201 })
  } catch (err: any) {
    console.error('[API] register/call-center error:', err?.message || err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
