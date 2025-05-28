import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const { isActive } = body;

    // Verificar se o agente pertence ao usuário
    const existingAgent = await prisma.aIAgentConfig.findFirst({
      where: {
        id: resolvedParams.id,
        instance: {
          userId: session.user.id
        }
      }
    });

    if (!existingAgent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    const agent = await prisma.aIAgentConfig.update({
      where: { id: resolvedParams.id },
      data: {
        isActive,
        lastUsedAt: isActive ? new Date() : existingAgent.lastUsedAt
      }
    });

    // Log da ação
    await prisma.aIAgentLog.create({
      data: {
        agentConfigId: resolvedParams.id,
        type: 'info',
        message: `Agente ${isActive ? 'ativado' : 'desativado'}`,
        details: JSON.stringify({ previousState: existingAgent.isActive, newState: isActive })
      }
    });

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Erro ao alternar status do agente:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 