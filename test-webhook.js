require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function testWebhook() {
  try {
    const webhookUrl = 'https://1636-2804-14c-1b7-82c3-1c17-b5eb-46e6-6c1f.ngrok-free.app/api/ai-agent/webhook/messages-upsert';
    
    // Payload similar ao que a Evolution API envia
    const payload = {
      event: 'MESSAGES_UPSERT',
      instance: 'toni',
      data: {
        key: {
          remoteJid: '971552655809@s.whatsapp.net',
          fromMe: false,
          id: 'BAE594145F4C59B4'
        },
        message: {
          conversation: 'Teste de webhook'
        },
        messageTimestamp: '1717689097',
        status: 'PENDING'
      }
    };

    console.log('🔔 Enviando teste de webhook...');
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('📥 Resposta:', result);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testWebhook(); 