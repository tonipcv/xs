import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/whatsapp-service';

const whatsappService = new WhatsAppService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

// Chave de API para sistemas externos - OBRIGATÓRIA no .env
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY;

if (!EXTERNAL_API_KEY) {
  throw new Error('❌ EXTERNAL_API_KEY não configurada no arquivo .env - Esta variável é obrigatória para a API Externa funcionar');
}

export async function POST(request: NextRequest) {
  try {
    // Autenticação via API Key - usando request.headers diretamente
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey || apiKey !== EXTERNAL_API_KEY) {
      return NextResponse.json(
        { 
          success: false,
          error: 'API Key inválida ou ausente. Use o header x-api-key.' 
        }, 
        { status: 401 }
      );
    }

    const body = await request.json();
    const { instanceId, number, message, userId } = body;

    // Validações básicas
    if (!instanceId || !number || !message) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Campos obrigatórios: instanceId, number, message' 
        },
        { status: 400 }
      );
    }

    if (typeof instanceId !== 'string' || typeof number !== 'string' || typeof message !== 'string') {
      return NextResponse.json(
        { 
          success: false,
          error: 'instanceId, number e message devem ser strings' 
        },
        { status: 400 }
      );
    }

    // Log da requisição externa
    console.log(`[EXTERNAL_API] Requisição recebida:`, {
      instanceId,
      number: number.replace(/\d(?=\d{4})/g, '*'), // Mascarar número para log
      messageLength: message.length,
      userId: userId || 'não informado',
      timestamp: new Date().toISOString()
    });

    try {
      // Enviar mensagem usando o serviço existente
      const result = await whatsappService.sendTextMessage(
        instanceId,
        number,
        message,
        userId || 'external-system'
      );

      console.log(`[EXTERNAL_API] Mensagem enviada com sucesso:`, {
        messageId: result.key?.id,
        instanceId,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        messageId: result.key?.id,
        timestamp: new Date().toISOString(),
        instanceId,
        status: 'sent',
        data: {
          remoteJid: result.key?.remoteJid,
          fromMe: result.key?.fromMe
        }
      });
    } catch (sendError) {
      console.error(`[EXTERNAL_API] Erro ao enviar mensagem:`, sendError);
      
      // Tratar diferentes tipos de erro
      let errorMessage = 'Erro interno do servidor';
      if (sendError instanceof Error) {
        if (sendError.message.includes('Instance not found') || sendError.message.includes('Instância não encontrada')) {
          errorMessage = `Instância '${instanceId}' não encontrada ou não está conectada`;
        } else if (sendError.message.includes('not connected') || sendError.message.includes('desconectada')) {
          errorMessage = `Instância '${instanceId}' não está conectada ao WhatsApp`;
        } else {
          errorMessage = sendError.message;
        }
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: errorMessage,
          instanceId,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[EXTERNAL_API] Erro ao processar requisição:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Endpoint GET para verificar status da API
export async function GET(request: NextRequest) {
  // Autenticação também no GET
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey || apiKey !== EXTERNAL_API_KEY) {
    return NextResponse.json(
      { 
        success: false,
        error: 'API Key inválida ou ausente. Use o header x-api-key.' 
      }, 
      { status: 401 }
    );
  }

  return NextResponse.json({
    service: 'ZAP Membership External API',
    status: 'active',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      sendMessage: 'POST /api/external/send-message',
      listInstances: 'GET /api/external/instances'
    },
    authentication: 'Required: x-api-key header'
  });
} 