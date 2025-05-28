import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { EvolutionApiClient } from '@/lib/evolution-api';
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const evolutionApi = new EvolutionApiClient({
  baseUrl: process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  apiKey: process.env.EVOLUTION_API_KEY
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Await params para Next.js 15
    const { instanceId } = await params;

    console.log(`[RESTART] Reiniciando instância: ${instanceId}`);

    // Buscar instância no banco
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        OR: [
          { id: instanceId, userId: session.user.id },
          { instanceName: instanceId, userId: session.user.id }
        ]
      }
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // Verificar se a instância existe na Evolution API
    let instanceExists = false;
    try {
      const connectionState = await evolutionApi.getConnectionState(instance.instanceName);
      instanceExists = true;
      console.log(`[RESTART] Instância existe na Evolution API: ${connectionState.instance.state}`);
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('Request failed with status code 404')) {
        console.log(`[RESTART] Instância não existe na Evolution API, será recriada`);
        instanceExists = false;
      } else {
        throw error; // Re-throw se for outro tipo de erro
      }
    }

    let restartResponse;
    
    if (!instanceExists) {
      // Recriar a instância na Evolution API
      console.log(`[RESTART] Recriando instância na Evolution API...`);
      
      const createData = {
        instanceName: instance.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook_by_events: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        reject_call: false,
        groups_ignore: false,
        always_online: false,
        read_messages: false,
        read_status: false,
        websocket_enabled: false,
      };

      restartResponse = await evolutionApi.createInstance(createData);
      console.log(`[RESTART] Instância recriada:`, restartResponse);
    } else {
      // Fazer restart na Evolution API
      restartResponse = await evolutionApi.restartInstance(instance.instanceName);
      console.log(`[RESTART] Resposta da Evolution API:`, restartResponse);
    }

    // Aguardar um pouco para processar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verificar novo status
    const connectionState = await evolutionApi.getConnectionState(instance.instanceName);
    const newStatus = mapEvolutionStatusToDb(connectionState.instance.state);

    console.log(`[RESTART] Novo status: ${connectionState.instance.state} -> ${newStatus}`);

    // Atualizar no banco
    const updateData: any = { 
      status: newStatus,
      updatedAt: new Date()
    };

    if (newStatus === 'CONNECTED') {
      updateData.lastConnectedAt = new Date();
      updateData.reconnectAttempts = 0;
    } else if (newStatus === 'DISCONNECTED') {
      updateData.lastDisconnectedAt = new Date();
    }

    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: instanceExists ? 'Instância reiniciada com sucesso' : 'Instância recriada com sucesso',
      data: {
        instanceId: instance.id,
        instanceName: instance.instanceName,
        status: newStatus,
        evolutionStatus: connectionState.instance.state,
        wasRecreated: !instanceExists
      }
    });

  } catch (error: any) {
    console.error('[RESTART] Erro ao reiniciar instância:', error);
    
    return NextResponse.json(
      { 
        error: 'Erro ao reiniciar instância',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

function mapEvolutionStatusToDb(evolutionStatus: string): string {
  const statusMap: { [key: string]: string } = {
    'open': 'CONNECTED',
    'connecting': 'CONNECTING',
    'close': 'DISCONNECTED',
    'closed': 'DISCONNECTED',
  };

  return statusMap[evolutionStatus.toLowerCase()] || 'DISCONNECTED';
} 