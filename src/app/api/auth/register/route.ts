import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail, sendEmailVerification } from '@/lib/email';
import crypto from 'crypto';
import { type Region } from '@/lib/prices';
import jwt from 'jsonwebtoken';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { name, email, password, region = 'us-east-1' } = body as {
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

    // Validar força da senha
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters with letters and numbers' },
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
      // Criar tenant primeiro
      const tenant = await prisma.tenant.create({
        data: {
          name: `${name}'s Organization`,
          email: email,
          plan: 'free',
        },
      });

      // Criar usuário associado ao tenant
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          region: region as Region,
          verificationToken,
          emailVerified: null,
          tenantId: tenant.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          region: true,
          tenantId: true,
        }
      });

      // Send welcome and verification emails
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                     process.env.NEXTAUTH_URL || 
                     'https://xase.ai';
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

      try {
        await Promise.all([
          sendWelcomeEmail(email, {
            name,
            email,
            verificationUrl,
          }),
          sendEmailVerification(email, {
            name,
            verificationUrl,
          }),
        ]);
      } catch (emailError) {
        console.error('Error sending registration emails:', emailError);
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, tenantId: user.tenantId, email: user.email },
        process.env.NEXTAUTH_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      return NextResponse.json({
        userId: user.id,
        tenantId: user.tenantId,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          region: user.region,
        },
      }, { status: 201 });
    } catch (dbError) {
      const dbErrMsg = dbError instanceof Error ? dbError.message : 'Unknown database error';
      console.error('Database error:', dbErrMsg);
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: 'Error creating user', ...(isDev ? { debug: dbErrMsg } : {}) },
        { status: 500 }
      );
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown registration error';
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