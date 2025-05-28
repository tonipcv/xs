import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/whatsapp-service';

const whatsappService = new WhatsAppService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

export async function POST(request: NextRequest) {
  try {
    // Verificação de segurança - API Key (TEMPORARIAMENTE DESABILITADA PARA DEBUG)
    const apiKey = request.headers.get('apikey') || request.headers.get('x-api-key');
    const expectedApiKey = process.env.EVOLUTION_API_KEY;
    
    // COMENTADO TEMPORARIAMENTE PARA DEBUG
    // if (expectedApiKey && apiKey !== expectedApiKey) {
    //   console.warn('[WEBHOOK] Tentativa de acesso não autorizada:', {
    //     receivedKey: apiKey ? `${apiKey.substring(0, 8)}...` : 'null',
    //     ip: request.headers.get('x-forwarded-for') || 'unknown'
    //   });
    //   return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    // }

    const body = await request.json();
    
    // Filtrar eventos CONNECTION_UPDATE para evitar loops
    if (body.event === 'CONNECTION_UPDATE') {
      console.log('[WEBHOOK] Ignorando evento CONNECTION_UPDATE para evitar loops');
      return NextResponse.json({ 
        success: true,
        received: true,
        ignored: 'CONNECTION_UPDATE filtered',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('[WEBHOOK] Webhook recebido:', {
      event: body.event,
      instance: body.instance || body.instanceName,
      timestamp: new Date().toISOString()
    });
    
    // Extrair o nome da instância do webhook
    const instanceName = body.instance || body.instanceName;
    
    if (!instanceName) {
      console.warn('[WEBHOOK] Webhook recebido sem nome da instância:', body);
      return NextResponse.json({ error: 'Nome da instância não fornecido' }, { status: 400 });
    }

    // Processar o webhook de forma assíncrona (não bloquear a resposta)
    setImmediate(async () => {
      try {
        await whatsappService.processWebhook(instanceName, body);
      } catch (error) {
        console.error('[WEBHOOK] Erro no processamento assíncrono:', error);
      }
    });

    // Responder imediatamente para a Evolution API
    return NextResponse.json({ 
      success: true,
      received: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[WEBHOOK] Erro ao processar webhook:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// Permitir GET para verificação de saúde do webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Webhook endpoint funcionando',
    timestamp: new Date().toISOString(),
    version: '2.0'
  });
} 