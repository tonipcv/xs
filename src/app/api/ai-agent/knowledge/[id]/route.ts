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
    const { title, content, type, tags, priority, isActive } = body;

    // Verificar se o chunk pertence ao usuário
    const existingChunk = await prisma.knowledgeChunk.findFirst({
      where: {
        id: resolvedParams.id,
        agent: {
          instance: {
            userId: session.user.id
          }
        }
      }
    });

    if (!existingChunk) {
      return NextResponse.json({ error: 'Chunk não encontrado' }, { status: 404 });
    }

    // Atualizar chunk
    const chunk = await prisma.knowledgeChunk.update({
      where: { id: resolvedParams.id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(type && { type }),
        ...(tags !== undefined && { 
          tags: tags ? (Array.isArray(tags) ? tags.join(',') : tags) : null 
        }),
        ...(priority !== undefined && { 
          priority: Math.max(1, Math.min(5, priority)) 
        }),
        ...(isActive !== undefined && { isActive })
      }
    });

    return NextResponse.json({ chunk });
  } catch (error) {
    console.error('Erro ao atualizar chunk:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

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

    // Verificar se o chunk pertence ao usuário
    const existingChunk = await prisma.knowledgeChunk.findFirst({
      where: {
        id: resolvedParams.id,
        agent: {
          instance: {
            userId: session.user.id
          }
        }
      }
    });

    if (!existingChunk) {
      return NextResponse.json({ error: 'Chunk não encontrado' }, { status: 404 });
    }

    // Deletar chunk
    await prisma.knowledgeChunk.delete({
      where: { id: resolvedParams.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar chunk:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 