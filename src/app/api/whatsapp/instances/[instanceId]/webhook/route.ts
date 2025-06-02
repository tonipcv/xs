import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WhatsAppService } from '@/lib/whatsapp-service';

const whatsappService = new WhatsAppService(
  process.env.EVOLUTION_API_BASE_URL!,
  process.env.EVOLUTION_API_KEY
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const { instanceId } = await params;

    // Buscar a instância
    const instance = await whatsappService.getInstanceDetails(instanceId, session.user.id);
    
    if (!instance) {
      return NextResponse.json(
        { error: 'Instância não encontrada' },
        { status: 404 }
      );
    }

    // Tentar configurar o webhook
    try {
      // Usar a URL correta especificada pelo usuário
      const body = await request.json();
      const webhookUrl = body.url || 'https://zp-bay.vercel.app/api/ai-agent/webhook';
      
      console.log(`[WEBHOOK_API] Configurando webhook para instância ${instance.instanceName} com URL: ${webhookUrl}`);
      
      await whatsappService.setupWebhook(instance.instanceName, webhookUrl);
      
      return NextResponse.json({
        success: true,
        message: 'Webhook configurado com sucesso',
        webhookUrl
      });
    } catch (webhookError) {
      console.error('Erro ao configurar webhook:', webhookError);
      
      // Tentar extrair mais detalhes do erro
      let errorMessage = 'Erro desconhecido ao configurar webhook';
      let errorDetails = null;
      
      if (webhookError instanceof Error) {
        errorMessage = webhookError.message;
        
        // Se for um erro do Axios, tentar extrair detalhes da resposta
        if ('response' in webhookError && webhookError.response) {
          const axiosError = webhookError as any;
          errorDetails = {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data
          };
          console.error('Detalhes do erro da Evolution API:', errorDetails);
        }
      }
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: errorDetails
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro na API de webhook:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 