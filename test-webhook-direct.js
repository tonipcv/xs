const axios = require('axios');

const WEBHOOK_URL = 'https://zp-bay.vercel.app/api/ai-agent/webhook/messages-upsert';

async function testWebhookDirect() {
  console.log('🧪 Testando webhook diretamente...\n');
  
  // Simular dados da Evolution API
  const webhookData = {
    event: 'MESSAGES_UPSERT',
    instance: 'toni',
    data: {
      key: {
        id: 'test-message-' + Date.now(),
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: 'Olá, preciso de ajuda!'
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      messageType: 'conversation'
    }
  };
  
  try {
    console.log('📤 Enviando dados para webhook:');
    console.log(JSON.stringify(webhookData, null, 2));
    
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n✅ Resposta do webhook:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('📊 Status:', error.response.status);
    }
  }
}

testWebhookDirect(); 