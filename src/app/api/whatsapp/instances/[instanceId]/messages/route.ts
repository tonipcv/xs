import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { WhatsAppService } from '@/lib/whatsapp-service';
import { authOptions } from '@/lib/auth';

const whatsappService = new WhatsAppService(
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
    const { number, text } = body;

    if (!number || !text) {
      return NextResponse.json(
        { error: 'Número e texto são obrigatórios' },
        { status: 400 }
      );
    }

    if (typeof number !== 'string' || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Número e texto devem ser strings' },
        { status: 400 }
      );
    }

    const result = await whatsappService.sendTextMessage(
      instanceId,
      number,
      text,
      session.user.id
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 