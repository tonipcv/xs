import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EvolutionWebhookManager } from '@/lib/evolution-webhook-manager';
import { WEBHOOK_CONFIG } from '@/config/webhook';
import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { instanceId, force = false } = body;

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

    // Verificar se já existe um agente para esta instância
    const existingAgent = await prisma.aIAgentConfig.findUnique({
      where: { instanceId }
    });

    if (!existingAgent) {
      return NextResponse.json({ error: 'Agente não encontrado para esta instância' }, { status: 404 });
    }

    // Configurar Evolution API
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionApiUrl || !evolutionApiKey) {
      return NextResponse.json({ 
        error: 'Variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórias' 
      }, { status: 500 });
    }

    const webhookManager = new EvolutionWebhookManager(evolutionApiUrl, evolutionApiKey);

    // URL do webhook usando configuração centralizada
    const webhookUrl = WEBHOOK_CONFIG.getWebhookUrl();
    const debugInfo = WEBHOOK_CONFIG.getDebugInfo();

    console.log(`🔗 URL do webhook: ${webhookUrl} (${debugInfo.usingNgrok ? 'desenvolvimento com NGROK' : 'produção padrão'})`);

    try {
      // Verificar se já está configurado (se não forçar)
      if (!force) {
        const readiness = await webhookManager.checkBotReadiness(instance.instanceName);
        if (readiness.isReady) {
          return NextResponse.json({
            success: true,
            message: 'Webhook já está configurado corretamente',
            status: readiness
          });
        }
      }

      // Configurar modo bot usando o método atualizado
      const result = await webhookManager.setupBotMode(instance.instanceName, webhookUrl);

      // Verificar se a configuração foi bem-sucedida
      const finalCheck = await webhookManager.checkBotReadiness(instance.instanceName);

      // Atualizar status do agente
      await prisma.aIAgentConfig.update({
        where: { id: existingAgent.id },
        data: {
          lastUsedAt: new Date(),
          isActive: true // Ativar automaticamente após configurar
        }
      });

      // Log da configuração
      await prisma.aIAgentLog.create({
        data: {
          agentConfigId: existingAgent.id,
          type: 'info',
          message: 'Webhook configurado automaticamente',
          details: JSON.stringify({
            webhookUrl,
            settings: result.settings,
            webhook: result.webhook,
            finalCheck
          })
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Webhook configurado com sucesso',
        webhookUrl,
        settings: result.settings,
        webhook: result.webhook,
        readiness: finalCheck
      });

    } catch (webhookError) {
      console.error('Erro ao configurar webhook:', webhookError instanceof Error ? webhookError.message : String(webhookError));
      
      // Log do erro
      await prisma.aIAgentLog.create({
        data: {
          agentConfigId: existingAgent.id,
          type: 'error',
          message: 'Falha ao configurar webhook automaticamente',
          details: JSON.stringify({
            error: webhookError instanceof Error ? webhookError.message : String(webhookError),
            instanceName: instance.instanceName,
            webhookUrl
          })
        }
      });

      return NextResponse.json({
        error: 'Erro ao configurar webhook na Evolution API',
        details: webhookError instanceof Error ? webhookError.message : String(webhookError),
        manualInstructions: {
          message: 'Configure manualmente usando os seguintes comandos:',
          settings: {
            url: `${evolutionApiUrl}/settings/set/${instance.instanceName}`,
            method: 'POST',
            headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
            body: {
              always_online: true,
              read_messages: true,
              reject_call: true
            }
          },
          webhook: {
            url: `${evolutionApiUrl}/webhook/set/${instance.instanceName}`,
            method: 'POST',
            headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
            body: {
              url: webhookUrl,
              webhook_by_events: true,
              events: ['MESSAGES_UPSERT']
            }
          }
        }
      }, { status: 422 });
    }

  } catch (error) {
    console.error('Erro ao configurar webhook:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId é obrigatório' }, { status: 400 });
    }

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

    // Configurar Evolution API
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionApiUrl || !evolutionApiKey) {
      return NextResponse.json({ 
        error: 'Variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórias' 
      }, { status: 500 });
    }

    const webhookManager = new EvolutionWebhookManager(evolutionApiUrl, evolutionApiKey);

    // Verificar status atual
    const readiness = await webhookManager.checkBotReadiness(instance.instanceName);

    return NextResponse.json({
      instanceName: instance.instanceName,
      readiness
    });

  } catch (error) {
    console.error('Erro ao verificar status do webhook:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 