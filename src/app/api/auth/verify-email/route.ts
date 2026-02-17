import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { message: 'Token não fornecido' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { verificationToken: token }
    });

    if (!user) {
      return NextResponse.json(
        { message: 'Token inválido' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null
      }
    });

    return NextResponse.json(
      { message: 'Email verificado com sucesso' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { message: 'Erro ao verificar email' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 