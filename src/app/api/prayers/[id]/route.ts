import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const { response, status } = await request.json();

    const prayer = await prisma.prayerRequest.update({
      where: {
        id: resolvedParams.id,
        userId: user.id, // Garante que o pedido pertence ao usuário
      },
      data: {
        response,
        status,
      },
    });

    return NextResponse.json(prayer);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar pedido' },
      { status: 500 }
    );
  }
} 