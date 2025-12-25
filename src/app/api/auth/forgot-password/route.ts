import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    // Verifica se o corpo da requisição é válido
    if (!request.body) {
      return new NextResponse(
        JSON.stringify({ error: 'Corpo da requisição inválido' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const body = await request.json()
    
    if (!body.email) {
      return new NextResponse(
        JSON.stringify({ error: 'Email é obrigatório' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const { email } = body

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    })

    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hora

    await prisma.user.update({
      where: { email },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetTokenExpiry
      }
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.NEXTAUTH_URL || 
                   'https://xase.ai'
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

    await sendEmail({
      to: email,
      subject: 'Xase - Recuperação de Senha',
      html: `
        <h1>Xase - Recuperação de Senha</h1>
        <p>Você solicitou a recuperação de senha. Clique no link abaixo para definir uma nova senha:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
          Redefinir Senha
        </a>
        <p>Se você não solicitou a recuperação de senha, ignore este email.</p>
        <p>Este link é válido por 1 hora.</p>
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
      JSON.stringify({ 
        error: 'Erro ao processar a solicitação',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } finally {
    await prisma.$disconnect()
  }
} 