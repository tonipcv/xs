import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution-api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const { instanceId } = await params;

    // Buscar instância no banco
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId }
    });

    if (!instance) {
      return NextResponse.json(
        { error: 'Instância não encontrada' },
        { status: 404 }
      );
    }

    console.log(`🔄 Sincronizando status da instância: ${instance.instanceName}`);

    // 1. Primeiro verificar se a instância existe na Evolution API
    let evolutionInstances;
    try {
      evolutionInstances = await evolutionApi.listInstances();
      console.log(`📡 Evolution API retornou ${evolutionInstances.length} instâncias`);
    } catch (error) {
      console.error('❌ Erro ao buscar instâncias da Evolution API:', error);
      return NextResponse.json(
        { error: 'Erro ao conectar com Evolution API' },
        { status: 500 }
      );
    }

    // 2. Procurar a instância específica
    const evolutionInstance = evolutionInstances.find(
      (evInst: any) => evInst.name === instance.instanceName
    );

    if (!evolutionInstance) {
      console.log(`❌ Instância ${instance.instanceName} não encontrada na Evolution API`);
      
      // Tentar recriar a instância
      try {
        console.log(`🔄 Tentando recriar instância ${instance.instanceName}...`);
        const createResult = await evolutionApi.createInstance({
          instanceName: instance.instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true
        });
        console.log('✅ Instância recriada:', createResult);
        
        // Atualizar status no banco
        const updatedInstance = await prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: { 
            status: 'CREATED',
            connectedNumber: null,
            lastConnectedAt: null
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Instância recriada com sucesso',
          data: {
            status: 'CREATED',
            evolutionStatus: 'created',
            action: 'recreated'
          }
        });
      } catch (createError) {
        console.error('❌ Erro ao recriar instância:', createError);
        return NextResponse.json(
          { error: 'Instância não existe na Evolution API e não foi possível recriar' },
          { status: 404 }
        );
      }
    }

    // 3. Mapear status da Evolution API para nosso sistema
    const mapEvolutionStatus = (evolutionStatus: string) => {
      switch (evolutionStatus.toLowerCase()) {
        case 'open':
        case 'connected':
          return 'CONNECTED';
        case 'connecting':
        case 'qr':
          return 'CONNECTING';
        case 'close':
        case 'closed':
        case 'disconnected':
          return 'DISCONNECTED';
        default:
          return 'DISCONNECTED';
      }
    };

    const newStatus = mapEvolutionStatus(evolutionInstance.connectionStatus);
    const connectedNumber = evolutionInstance.ownerJid ? 
      evolutionInstance.ownerJid.replace('@s.whatsapp.net', '') : null;

    console.log(`📊 Status Evolution: ${evolutionInstance.connectionStatus} → Nosso: ${newStatus}`);
    console.log(`📱 Número conectado: ${connectedNumber || 'Nenhum'}`);

    // 4. Atualizar no banco de dados
    const updatedInstance = await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status: newStatus,
        connectedNumber: connectedNumber,
        lastConnectedAt: newStatus === 'CONNECTED' ? new Date() : instance.lastConnectedAt
      }
    });

    console.log(`✅ Status atualizado no banco: ${instance.status} → ${newStatus}`);

    return NextResponse.json({
      success: true,
      message: 'Status sincronizado com sucesso',
      data: {
        instanceName: instance.instanceName,
        oldStatus: instance.status,
        newStatus: newStatus,
        evolutionStatus: evolutionInstance.connectionStatus,
        connectedNumber: connectedNumber,
        action: 'synced'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao sincronizar status:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 