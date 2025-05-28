import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EvolutionWebhookManager } from '@/lib/evolution-webhook-manager';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const agents = await prisma.aIAgentConfig.findMany({
      where: {
        instance: {
          userId: session.user.id
        }
      },
      include: {
        instance: {
          select: {
            id: true,
            instanceName: true,
            status: true,
            connectedNumber: true
          }
        }
      }
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Erro ao buscar configurações de agentes:', error instanceof Error ? error.message : String(error));
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
    const {
      instanceId,
      isActive,
      model,
      systemPrompt,
      maxTokens,
      temperature,
      maxMessagesPerMinute,
      maxConsecutiveResponses,
      cooldownMinutes,
      fallbackMessage,
      autoConfigureWebhook = true,
      // 🧱 CAMADA 1: Contexto Principal
      companyName,
      product,
      mainPain,
      successCase,
      priceObjection,
      goal = 'SALES'
    } = body;

    // Verificar se a instância pertence ao usuário
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        userId: session.user.id
      }
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // Verificar se já existe configuração para esta instância
    const existingConfig = await prisma.aIAgentConfig.findUnique({
      where: { instanceId }
    });

    if (existingConfig) {
      return NextResponse.json({ error: 'Já existe configuração para esta instância' }, { status: 400 });
    }

    const agent = await prisma.aIAgentConfig.create({
      data: {
        instanceId,
        isActive,
        model,
        systemPrompt,
        maxTokens,
        temperature,
        maxMessagesPerMinute,
        maxConsecutiveResponses,
        cooldownMinutes,
        fallbackMessage,
        // 🧱 CAMADA 1: Contexto Principal
        companyName,
        product,
        mainPain,
        successCase,
        priceObjection,
        goal
      }
    });

    // Configurar webhook automaticamente se solicitado e agente estiver ativo
    let webhookResult = null;
    if (autoConfigureWebhook && isActive) {
      try {
        const evolutionApiUrl = process.env.EVOLUTION_API_URL;
        const evolutionApiKey = process.env.EVOLUTION_API_KEY;

        if (evolutionApiUrl && evolutionApiKey) {
          const webhookManager = new EvolutionWebhookManager(evolutionApiUrl, evolutionApiKey);
          
          // URL do webhook - sempre usar produção como padrão
          const productionUrl = 'https://zp-bay.vercel.app';
          
          // Permitir override apenas para desenvolvimento local
          const isLocalDev = process.env.NODE_ENV === 'development';
          const ngrokUrl = isLocalDev ? process.env.NGROK_URL : null;
          
          const baseUrl = ngrokUrl || productionUrl;
          const webhookUrl = `${baseUrl}/api/ai-agent/webhook/messages-upsert`;

          console.log(`🔗 Configurando webhook na criação do agente: ${webhookUrl}${ngrokUrl ? ' (desenvolvimento com NGROK)' : ' (produção padrão)'}`);

          webhookResult = await webhookManager.setupBotMode(instance.instanceName, webhookUrl);

          // Log da configuração automática
          await prisma.aIAgentLog.create({
            data: {
              agentConfigId: agent.id,
              type: 'info',
              message: 'Webhook configurado automaticamente na criação do agente',
              details: JSON.stringify({
                webhookUrl,
                usingNgrok: !!ngrokUrl,
                settings: webhookResult.settings,
                webhook: webhookResult.webhook
              })
            }
          });
        }
      } catch (webhookError) {
        console.error('Erro ao configurar webhook automaticamente:', webhookError instanceof Error ? webhookError.message : String(webhookError));
        
        // Log do erro, mas não falhar a criação do agente
        await prisma.aIAgentLog.create({
          data: {
            agentConfigId: agent.id,
            type: 'warning',
            message: 'Falha na configuração automática do webhook',
            details: JSON.stringify({
              error: webhookError instanceof Error ? webhookError.message : String(webhookError)
            })
          }
        });
      }
    }

    return NextResponse.json({ 
      agent, 
      webhookConfigured: !!webhookResult,
      webhookResult 
    });
  } catch (error) {
    console.error('Erro ao criar configuração de agente:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 