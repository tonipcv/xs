import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';
import { type Region } from '@/lib/prices';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null as any);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { name, email, password, region } = body as {
      name?: string;
      email?: string;
      password?: string;
      region?: string;
    };

    // Validar campos obrigatórios
    if (!name || !email || !password || !region) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verificar se o email já está em uso
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already in use' },
        { status: 400 }
      );
    }

    // Gerar token de verificação
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Hash da senha
    const hashedPassword = await hash(password, 10);

    try {
      // Criar usuário
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          region: region as Region,
          verificationToken,
          emailVerified: null
        },
        select: {
          id: true,
          name: true,
          email: true,
          region: true
        }
      });

      // Enviar email de confirmação
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     process.env.NEXTAUTH_URL || 
                     'https://wallet.k17.com.br';
      const confirmationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

      try {
        await sendEmail({
          to: email,
          subject: 'Confirme seu email',
          html: `
            <h1>Bem-vindo ao Katsu!</h1>
            <p>Olá ${name},</p>
            <p>Obrigado por se cadastrar. Por favor, confirme seu email clicando no botão abaixo:</p>
            <a href="${confirmationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
              Confirmar Email
            </a>
            <p>Se você não criou esta conta, por favor ignore este email.</p>
          `
        });
      } catch (emailError) {
        console.error('Erro ao enviar email:', emailError);
        // Continua com o registro mesmo se o email falhar
      }

      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          region: user.region,
        },
      });
    } catch (dbError) {
      const dbErrMsg = dbError instanceof Error ? dbError.message : String(dbError ?? 'Unknown database error');
      console.error('Database error:', dbErrMsg);
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: 'Error creating user', ...(isDev ? { debug: dbErrMsg } : {}) },
        { status: 500 }
      );
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error ?? 'Unknown registration error');
    console.error('Registration error:', errMsg);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'Error creating user', ...(isDev ? { debug: errMsg } : {}) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 