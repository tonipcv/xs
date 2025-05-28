import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WhatsAppSyncService } from '@/lib/whatsapp-sync-service';

const syncService = new WhatsAppSyncService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { instanceId } = await params;
    const body = await request.json();

    const {
      type = 'full', // full, contacts, chats, messages
      mode = 'batch', // batch, individual
      batchSize = 50, // Menor batch size padrão
      includeGroups = true,
      dateFrom,
      dateTo
    } = body;

    console.log(`🚀 Iniciando sync ${type} (modo: ${mode}) para instância ${instanceId}`);

    const options = {
      batchSize: parseInt(batchSize),
      includeGroups: Boolean(includeGroups),
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      onProgress: mode === 'individual' ? (stats: any) => {
        // Em modo individual, poderíamos usar WebSockets para enviar progresso em tempo real
        // Por enquanto, apenas loggar
        console.log('📊 Progresso:', stats);
      } : undefined,
    };

    let result;

    switch (type) {
      case 'full':
        result = await syncService.fullSync(instanceId, options);
        break;
      
      case 'contacts':
        const instance = await syncService['getInstanceById'](instanceId);
        if (!instance) {
          return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
        }
        const contactStats = await syncService.syncContacts(instance, options);
        result = { 
          contacts: contactStats, 
          chats: { total: 0, created: 0, updated: 0 }, 
          messages: { total: 0, created: 0, updated: 0 }, 
          errors: [] 
        };
        break;
      
      case 'chats':
        const instanceForChats = await syncService['getInstanceById'](instanceId);
        if (!instanceForChats) {
          return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
        }
        const chatStats = await syncService.syncChats(instanceForChats, options);
        result = { 
          contacts: { total: 0, created: 0, updated: 0 }, 
          chats: chatStats, 
          messages: { total: 0, created: 0, updated: 0 }, 
          errors: [] 
        };
        break;
      
      case 'messages':
        const instanceForMessages = await syncService['getInstanceById'](instanceId);
        if (!instanceForMessages) {
          return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
        }
        const messageStats = await syncService.syncMessages(instanceForMessages, options);
        result = { 
          contacts: { total: 0, created: 0, updated: 0 }, 
          chats: { total: 0, created: 0, updated: 0 }, 
          messages: messageStats, 
          errors: [] 
        };
        break;
      
      default:
        return NextResponse.json({ error: 'Tipo de sync inválido' }, { status: 400 });
    }

    console.log(`✅ Sync ${type} finalizado:`, result);

    return NextResponse.json({
      success: true,
      type,
      mode,
      stats: result,
      message: `Sync ${type} executado com sucesso no modo ${mode}`
    });

  } catch (error: any) {
    console.error('❌ Erro durante sync:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    }, { 
      status: 500 
    });
  }
} 