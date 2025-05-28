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
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const {
      isActive,
      model,
      systemPrompt,
      maxTokens,
      temperature,
      maxMessagesPerMinute,
      maxConsecutiveResponses,
      cooldownMinutes,
      fallbackMessage
    } = body;

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
        model,
        systemPrompt,
        maxTokens,
        temperature,
        maxMessagesPerMinute,
        maxConsecutiveResponses,
        cooldownMinutes,
        fallbackMessage,
        lastUsedAt: isActive ? new Date() : existingAgent.lastUsedAt
      }
    });

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Erro ao atualizar configuração de agente:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Alias para PATCH (mesma funcionalidade que PUT)
export const PATCH = PUT;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const resolvedParams = await params;

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

    await prisma.aIAgentConfig.delete({
      where: { id: resolvedParams.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar configuração de agente:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 