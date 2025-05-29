import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 [DEBUG] Webhook MESSAGES_UPDATE recebido');
    const body = await request.json();
    console.log('🔔 Webhook MESSAGES_UPDATE recebido:', JSON.stringify(body, null, 2));
    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('❌ [DEBUG] Erro no webhook MESSAGES_UPDATE:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'AI Agent webhook endpoint funcionando',
    timestamp: new Date().toISOString(),
    endpoint: '/api/ai-agent/webhook/messages-update'
  });
} 