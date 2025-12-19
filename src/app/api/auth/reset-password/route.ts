import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return new NextResponse(
        JSON.stringify({ error: 'Token e senha são obrigatórios' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date()
        }
      },
      select: { id: true, email: true }
    })

    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Token inválido ou expirado' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    })

    // Enviar email de confirmação
    await sendEmail({
      to: user.email,
      subject: 'Senha alterada com sucesso',
      html: `
        <h1>Senha Alterada</h1>
        <p>Sua senha foi alterada com sucesso.</p>
        <p>Se você não realizou esta alteração, entre em contato conosco imediatamente.</p>
      `
    })

    return new NextResponse(
      JSON.stringify({ success: true }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Erro ao alterar senha' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
} 