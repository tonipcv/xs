const axios = require('axios');

const WEBHOOK_URL = 'https://zp-bay.vercel.app/api/ai-agent/webhook/messages-upsert';

async function testSimpleWebhook() {
  console.log('🧪 Teste simples do webhook...\n');
  
  // Dados mínimos para teste
  const webhookData = {
    event: 'MESSAGES_UPSERT',
    instance: 'toni',
    data: {
      key: {
        id: 'simple-test-' + Date.now(),
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: 'teste simples'
      }
    }
  };
  
  try {
    console.log('📤 Enviando webhook simples...');
    
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ Resposta:', response.status, response.data);
    
    // Aguardar um pouco para ver se aparece nos logs do Vercel
    console.log('\n⏳ Aguardando 10 segundos...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('✅ Teste concluído. Verifique os logs do Vercel para mais detalhes.');
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('📊 Status:', error.response.status);
    }
  }
}

testSimpleWebhook(); 