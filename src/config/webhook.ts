/**
 * Configuração centralizada de webhooks
 * Define URLs padrão para produção e desenvolvimento
 */

export const WEBHOOK_CONFIG = {
  // URL de produção padrão
  PRODUCTION_URL: 'https://zp-bay.vercel.app',
  
  // Endpoint do webhook
  WEBHOOK_ENDPOINT: '/api/ai-agent/webhook/messages-upsert',
  
  // Eventos que o webhook deve escutar
  WEBHOOK_EVENTS: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
  
  // Função para obter a URL completa do webhook
  getWebhookUrl: (customUrl?: string): string => {
    // Se uma URL customizada foi fornecida, usar ela
    if (customUrl) {
      return customUrl;
    }
    
    // Em desenvolvimento, permitir NGROK_URL
    const isLocalDev = process.env.NODE_ENV === 'development';
    const ngrokUrl = isLocalDev ? process.env.NGROK_URL : null;
    
    // Usar NGROK em desenvolvimento ou produção como padrão
    const baseUrl = ngrokUrl || WEBHOOK_CONFIG.PRODUCTION_URL;
    
    return `${baseUrl}${WEBHOOK_CONFIG.WEBHOOK_ENDPOINT}`;
  },
  
  // Função para verificar se está usando NGROK
  isUsingNgrok: (): boolean => {
    const isLocalDev = process.env.NODE_ENV === 'development';
    return isLocalDev && !!process.env.NGROK_URL;
  },
  
  // Função para obter informações de debug
  getDebugInfo: () => {
    const isLocalDev = process.env.NODE_ENV === 'development';
    const ngrokUrl = isLocalDev ? process.env.NGROK_URL : null;
    const webhookUrl = WEBHOOK_CONFIG.getWebhookUrl();
    
    return {
      environment: process.env.NODE_ENV || 'development',
      isLocalDev,
      ngrokUrl,
      webhookUrl,
      usingNgrok: !!ngrokUrl,
      productionUrl: WEBHOOK_CONFIG.PRODUCTION_URL
    };
  }
};

export default WEBHOOK_CONFIG; 