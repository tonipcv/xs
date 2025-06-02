import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution-api';

const CORRECT_WEBHOOK_URL = 'https://zp-bay.vercel.app/api/ai-agent/webhook';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    console.log('🔍 Verificando status de todos os webhooks...');

    // Buscar todas as instâncias do banco
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const instances = await prisma.whatsAppInstance.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          instanceName: true,
          status: true,
        },
      });

      const webhookStatus: { [key: string]: any } = {};

      // Verificar webhook de cada instância
      for (const instance of instances) {
        try {
          console.log(`🔧 Verificando webhook da instância: ${instance.instanceName}`);
          
          const webhookConfig = await evolutionApi.getWebhook(instance.instanceName);
          
          const isCorrect = webhookConfig?.url === CORRECT_WEBHOOK_URL;
          
          webhookStatus[instance.instanceName] = {
            url: webhookConfig?.url || null,
            enabled: webhookConfig?.enabled || false,
            events: webhookConfig?.events || [],
            isCorrect,
            status: instance.status,
          };

          console.log(`   ${isCorrect ? '✅' : '❌'} ${instance.instanceName}: ${webhookConfig?.url || 'Não configurado'}`);
          
        } catch (error: any) {
          console.log(`⚠️ Erro ao verificar webhook de ${instance.instanceName}:`, error.message);
          
          webhookStatus[instance.instanceName] = {
            url: null,
            enabled: false,
            events: [],
            isCorrect: false,
            status: instance.status,
            error: error.message,
          };
        }
      }

      const totalInstances = instances.length;
      const correctWebhooks = Object.values(webhookStatus).filter((status: any) => status.isCorrect).length;
      const incorrectWebhooks = totalInstances - correctWebhooks;

      console.log(`📊 Resultado: ${correctWebhooks}/${totalInstances} webhooks corretos`);

      return NextResponse.json({
        success: true,
        summary: {
          total: totalInstances,
          correct: correctWebhooks,
          incorrect: incorrectWebhooks,
          correctUrl: CORRECT_WEBHOOK_URL,
        },
        webhooks: webhookStatus,
      });

    } finally {
      await prisma.$disconnect();
    }

  } catch (error: any) {
    console.error('💥 Erro ao verificar webhooks:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 