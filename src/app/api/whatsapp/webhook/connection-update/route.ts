import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[CONNECTION_UPDATE] Evento recebido e ignorado para evitar loops:', {
      instance: body.instance || body.instanceName,
      timestamp: new Date().toISOString()
    });
    
    // Responder OK mas não processar para evitar loops
    return NextResponse.json({ 
      success: true,
      received: true,
      ignored: 'CONNECTION_UPDATE filtered to prevent loops',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CONNECTION_UPDATE] Erro ao processar:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Connection update endpoint funcionando',
    timestamp: new Date().toISOString()
  });
} 