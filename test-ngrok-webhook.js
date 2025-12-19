const axios = require('axios');

// URL do ngrok
const WEBHOOK_URL = 'https://1636-2804-14c-1b7-82c3-1c17-b5eb-46e6-6c1f.ngrok-free.app/api/ai-agent/webhook/messages-upsert';

async function testNgrokWebhook() {
  console.log('🧪 Testando webhook via ngrok...\n');
  
  // Dados de teste
  const webhookData = {
    event: 'MESSAGES_UPSERT',
    instance: 'toni',
    data: {
      key: {
        id: 'ngrok-test-' + Date.now(),
        remoteJid: '971552655809@s.whatsapp.net',
        fromMe: false
      },
      message: {
        conversation: 'Teste via ngrok - ' + new Date().toISOString()
      }
    }
  };
  
  try {
    console.log('📤 Enviando dados para webhook:');
    console.log(JSON.stringify(webhookData, null, 2));
    
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ Resposta do webhook:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    
  } catch (error) {
    console.error('\n❌ Erro ao testar webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testNgrokWebhook(); 