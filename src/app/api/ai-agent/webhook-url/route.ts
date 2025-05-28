import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Priorizar NGROK_URL se disponível
    const ngrokUrl = process.env.NGROK_URL;
    const baseUrl = ngrokUrl || process.env.NEXTAUTH_URL || request.headers.get('origin') || 'http://localhost:3000';
    const webhookUrl = `${baseUrl}/api/ai-agent/webhook/messages-upsert`;

    return NextResponse.json({
      webhookUrl,
      usingNgrok: !!ngrokUrl,
      ngrokConfigured: !!process.env.NGROK_URL
    });
  } catch (error) {
    console.error('Erro ao obter URL do webhook:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 