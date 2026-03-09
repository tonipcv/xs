import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { sendEmail } from '@/lib/email'
import { validateApiKey } from '@/lib/xase/auth'

export async function POST(request: Request) {
  try {
    let userEmail: string | null = null;
    
    // Try API key auth first
    const apiKey = request.headers.get('x-api-key') || '';
    const auth = await validateApiKey(apiKey);
    
    if (auth.valid && auth.tenantId) {
      const user = await prisma.user.findFirst({
        where: { tenantId: auth.tenantId },
        select: { email: true },
      });
      userEmail = user?.email || null;
    }
    
    // Fall back to session auth
    if (!userEmail) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
      userEmail = session.user.email;
    }

    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    const { currentPassword, newPassword } = body;
    
    if (!currentPassword || !newPassword) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail }
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
      where: { email: userEmail },
      data: { password: hashedPassword }
    })

    await sendEmail({
      to: userEmail,
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