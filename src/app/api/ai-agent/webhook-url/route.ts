import { NextRequest, NextResponse } from 'next/server';
import { WEBHOOK_CONFIG } from '@/config/webhook';

export async function GET(request: NextRequest) {
  try {
    const debugInfo = WEBHOOK_CONFIG.getDebugInfo();
    
    return NextResponse.json({
      webhookUrl: debugInfo.webhookUrl,
      usingNgrok: debugInfo.usingNgrok,
      isProduction: !debugInfo.isLocalDev,
      baseUrl: debugInfo.usingNgrok ? debugInfo.ngrokUrl : debugInfo.productionUrl,
      environment: debugInfo.environment
    });
  } catch (error) {
    console.error('Erro ao obter URL do webhook:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 