import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    const { currentPassword, newPassword } = body;
    
    if (!currentPassword || !newPassword) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user?.password) {
      return new NextResponse('User not found', { status: 404 })
    }

    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return new NextResponse('Invalid current password', { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { email: session.user.email },
      data: { password: hashedPassword }
    })

    await sendEmail({
      to: session.user.email,
      subject: 'Senha alterada com sucesso',
      html: `
        <h1>Sua senha foi alterada</h1>
        <p>A senha da sua conta foi alterada com sucesso.</p>
        <p>Se você não fez esta alteração, entre em contato conosco imediatamente.</p>
      `
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error changing password:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 