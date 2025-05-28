import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const prayers = await prisma.prayerRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ prayers });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Erro ao carregar pedidos' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { request } = await req.json();

    const prayer = await prisma.prayerRequest.create({
      data: {
        userId: user.id,
        request,
        status: 'pending',
      },
    });

    return NextResponse.json(prayer);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar pedido' },
      { status: 500 }
    );
  }
} 