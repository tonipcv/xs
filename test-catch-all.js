const fetch = require('node-fetch');

async function testCatchAll() {
  const baseUrl = 'https://1636-2804-14c-1b7-82c3-1c17-b5eb-46e6-6c1f.ngrok-free.app';
  
  console.log('🧪 Testando rota catch-all...\n');
  
  // Testar diferentes eventos
  const events = [
    'messages-upsert',
    'messages-update', 
    'chats-upsert',
    'presence-update'
  ];
  
  for (const event of events) {
    try {
      console.log(`📡 Testando evento: ${event}`);
      
      // Teste GET
      const getResponse = await fetch(`${baseUrl}/api/ai-agent/webhook/${event}`, {
        method: 'GET'
      });
      
      if (getResponse.ok) {
        const getResult = await getResponse.json();
        console.log(`✅ GET ${event}:`, getResult);
      } else {
        console.log(`❌ GET ${event}: ${getResponse.status}`);
      }
      
      // Teste POST com payload simulado
      const postResponse = await fetch(`${baseUrl}/api/ai-agent/webhook/${event}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instance: 'toni',
          data: {
            key: {
              remoteJid: '5511999999999@s.whatsapp.net',
              fromMe: false,
              id: 'test-message-id'
            },
            message: {
              conversation: 'Teste da rota catch-all'
            }
          }
        })
      });
      
      if (postResponse.ok) {
        const postResult = await postResponse.json();
        console.log(`✅ POST ${event}:`, postResult);
      } else {
        console.log(`❌ POST ${event}: ${postResponse.status}`);
      }
      
      console.log('---');
      
    } catch (error) {
      console.error(`❌ Erro testando ${event}:`, error.message);
    }
  }
}

testCatchAll(); 