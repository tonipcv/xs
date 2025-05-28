import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { KnowledgeType } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const type = searchParams.get('type') as KnowledgeType;

    if (!agentId) {
      return NextResponse.json({ error: 'agentId é obrigatório' }, { status: 400 });
    }

    // Verificar se o agente pertence ao usuário
    const agent = await prisma.aIAgentConfig.findFirst({
      where: {
        id: agentId,
        instance: {
          userId: session.user.id
        }
      }
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    // Buscar chunks
    const where: any = {
      agentId,
      isActive: true
    };

    if (type) {
      where.type = type;
    }

    const chunks = await prisma.knowledgeChunk.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({ chunks });
  } catch (error) {
    console.error('Erro ao buscar chunks de conhecimento:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { agentId, title, content, type, tags, priority = 1 } = body;

    if (!agentId || !title || !content || !type) {
      return NextResponse.json({ 
        error: 'agentId, title, content e type são obrigatórios' 
      }, { status: 400 });
    }

    // Verificar se o agente pertence ao usuário
    const agent = await prisma.aIAgentConfig.findFirst({
      where: {
        id: agentId,
        instance: {
          userId: session.user.id
        }
      }
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 });
    }

    // Criar chunk
    const chunk = await prisma.knowledgeChunk.create({
      data: {
        agentId,
        title,
        content,
        type,
        tags: tags ? (Array.isArray(tags) ? tags.join(',') : tags) : null,
        priority: Math.max(1, Math.min(5, priority)) // Garantir que está entre 1-5
      }
    });

    return NextResponse.json({ chunk });
  } catch (error) {
    console.error('Erro ao criar chunk de conhecimento:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 