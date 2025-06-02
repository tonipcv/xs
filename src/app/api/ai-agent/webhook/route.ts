import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('🔔 Webhook principal recebido:', JSON.stringify(body, null, 2));
    
    // Redirecionar para o handler específico baseado no evento
    const event = body.event || 'messages-upsert';
    
    // Processar o webhook usando o handler genérico
    const response = await fetch(`${request.nextUrl.origin}/api/ai-agent/webhook/${event}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error('❌ Erro no webhook principal:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'AI Agent webhook endpoint principal funcionando',
    timestamp: new Date().toISOString(),
    endpoint: '/api/ai-agent/webhook',
    supportedEvents: [
      'messages-upsert',
      'messages-update', 
      'chats-upsert',
      'presence-update'
    ]
  });
} 