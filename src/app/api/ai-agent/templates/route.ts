import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AIContextGenerator } from '@/lib/ai-context-generator';
import { AgentGoal } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const goal = searchParams.get('goal') as AgentGoal;
    const templateId = searchParams.get('id');

    // Se foi solicitado um template específico
    if (templateId) {
      const template = AIContextGenerator.getTemplateById(templateId);
      if (!template) {
        return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ template });
    }

    // Se foi solicitado templates por objetivo
    if (goal) {
      const templates = AIContextGenerator.getTemplatesByGoal(goal);
      return NextResponse.json({ templates });
    }

    // Retornar todos os templates
    const templates = AIContextGenerator.getPromptTemplates();
    return NextResponse.json({ templates });

  } catch (error) {
    console.error('Erro ao buscar templates:', error);
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
    const { templateId, variables } = body;

    if (!templateId || !variables) {
      return NextResponse.json({ error: 'templateId e variables são obrigatórios' }, { status: 400 });
    }

    try {
      const prompt = AIContextGenerator.applyTemplate(templateId, variables);
      return NextResponse.json({ prompt });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao aplicar template' }, { status: 400 });
    }

  } catch (error) {
    console.error('Erro ao aplicar template:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 