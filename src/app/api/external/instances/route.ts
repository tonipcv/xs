import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/whatsapp-service';
import { PrismaClient } from '@prisma/client';

const whatsappService = new WhatsAppService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

const prisma = new PrismaClient();

// Chave de API para sistemas externos - OBRIGATÓRIA no .env
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY;

if (!EXTERNAL_API_KEY) {
  throw new Error('❌ EXTERNAL_API_KEY não configurada no arquivo .env - Esta variável é obrigatória para a API Externa funcionar');
}

export async function GET(request: NextRequest) {
  try {
    // Autenticação via API Key
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

    // Buscar apenas instâncias conectadas
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        status: 'CONNECTED'
      },
      select: {
        id: true,
        instanceName: true,
        status: true,
        connectedNumber: true,
        lastConnectedAt: true,
        createdAt: true,
        userId: true
      },
      orderBy: {
        lastConnectedAt: 'desc'
      }
    });

    console.log(`[EXTERNAL_API] Listagem de instâncias solicitada. ${instances.length} instâncias conectadas encontradas.`);

    return NextResponse.json({
      success: true,
      count: instances.length,
      instances: instances.map(instance => ({
        id: instance.id,
        instanceName: instance.instanceName,
        status: instance.status,
        connectedNumber: instance.connectedNumber ? 
          instance.connectedNumber.replace(/\d(?=\d{4})/g, '*') : null, // Mascarar número
        lastConnectedAt: instance.lastConnectedAt,
        createdAt: instance.createdAt,
        isAvailable: instance.status === 'CONNECTED'
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[EXTERNAL_API] Erro ao listar instâncias:', error);
    
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