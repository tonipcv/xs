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
      fallbackMessage,
      companyName,
      product,
      mainPain,
      successCase,
      priceObjection,
      goal
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

    // Preparar dados para atualização (apenas campos que foram enviados)
    const updateData: any = {
      lastUsedAt: isActive ? new Date() : existingAgent.lastUsedAt
    };

    // Campos técnicos básicos
    if (isActive !== undefined) updateData.isActive = isActive;
    if (model !== undefined) updateData.model = model;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (maxTokens !== undefined) updateData.maxTokens = maxTokens;
    if (temperature !== undefined) updateData.temperature = temperature;
    if (maxMessagesPerMinute !== undefined) updateData.maxMessagesPerMinute = maxMessagesPerMinute;
    if (maxConsecutiveResponses !== undefined) updateData.maxConsecutiveResponses = maxConsecutiveResponses;
    if (cooldownMinutes !== undefined) updateData.cooldownMinutes = cooldownMinutes;
    if (fallbackMessage !== undefined) updateData.fallbackMessage = fallbackMessage;

    // 🧱 CAMPOS DO FORMULÁRIO GUIADO (CAMADA 1)
    if (companyName !== undefined) updateData.companyName = companyName;
    if (product !== undefined) updateData.product = product;
    if (mainPain !== undefined) updateData.mainPain = mainPain;
    if (successCase !== undefined) updateData.successCase = successCase;
    if (priceObjection !== undefined) updateData.priceObjection = priceObjection;
    if (goal !== undefined) updateData.goal = goal;

    console.log('🔄 Atualizando agente com dados:', JSON.stringify(updateData, null, 2));

    const agent = await prisma.aIAgentConfig.update({
      where: { id: resolvedParams.id },
      data: updateData
    });

    console.log('✅ Agente atualizado com sucesso:', agent.id);

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('❌ Erro ao atualizar configuração de agente:', error instanceof Error ? error.message : String(error));
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