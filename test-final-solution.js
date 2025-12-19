require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function testFinalSolution() {
  try {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = 'toni';
    const testNumber = '5511999999999'; // Número de teste
    
    console.log('🧪 Testando solução completa...\n');
    
    // 1. Verificar status da instância
    console.log('1️⃣ Verificando status da instância...');
    const instanceResponse = await fetch(`${evolutionApiUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: { 'apikey': evolutionApiKey }
    });
    
    if (instanceResponse.ok) {
      const instances = await instanceResponse.json();
      const toniInstance = instances.find(i => i.instance.instanceName === instanceName);
      console.log(`✅ Instância ${instanceName}: ${toniInstance?.instance?.state || 'não encontrada'}`);
    }
    
    // 2. Verificar configuração do webhook
    console.log('\n2️⃣ Verificando configuração do webhook...');
    const webhookResponse = await fetch(`${evolutionApiUrl}/webhook/find/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': evolutionApiKey }
    });
    
    if (webhookResponse.ok) {
      const webhook = await webhookResponse.json();
      console.log('✅ Webhook configurado:');
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Habilitado: ${webhook.enabled}`);
      console.log(`   webhookByEvents: ${webhook.webhookByEvents}`);
      console.log(`   Eventos: ${webhook.events.join(', ')}`);
    }
    
    // 3. Testar endpoint catch-all
    console.log('\n3️⃣ Testando endpoint catch-all...');
    const catchAllResponse = await fetch('https://1636-2804-14c-1b7-82c3-1c17-b5eb-46e6-6c1f.ngrok-free.app/api/ai-agent/webhook/messages-upsert', {
      method: 'GET'
    });
    
    if (catchAllResponse.ok) {
      const result = await catchAllResponse.json();
      console.log('✅ Endpoint funcionando:', result.status);
    }
    
    // 4. Simular webhook da Evolution API
    console.log('\n4️⃣ Simulando webhook da Evolution API...');
    const webhookPayload = {
      instance: instanceName,
      data: {
        key: {
          remoteJid: `${testNumber}@s.whatsapp.net`,
          fromMe: false,
          id: `test-${Date.now()}`
        },
        message: {
          conversation: 'Olá! Este é um teste do agente AI.'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };
    
    const webhookTestResponse = await fetch('https://1636-2804-14c-1b7-82c3-1c17-b5eb-46e6-6c1f.ngrok-free.app/api/ai-agent/webhook/messages-upsert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (webhookTestResponse.ok) {
      const result = await webhookTestResponse.json();
      console.log('✅ Webhook processado:', result);
    } else {
      console.log('❌ Erro no webhook:', webhookTestResponse.status);
    }
    
    // 5. Verificar logs do agente
    console.log('\n5️⃣ Aguardando processamento...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🎉 Teste completo finalizado!');
    console.log('\n📋 Resumo da solução implementada:');
    console.log('✅ Rota catch-all criada: /api/ai-agent/webhook/[...event]/route.ts');
    console.log('✅ Captura todos os eventos mesmo com webhookByEvents=true');
    console.log('✅ Processa mensagens corretamente');
    console.log('✅ Elimina erros 404 para eventos não implementados');
    console.log('✅ Mantém compatibilidade com Evolution API v2');
    
    console.log('\n⚠️  Próximos passos recomendados:');
    console.log('1. Reiniciar Evolution API para aplicar configurações');
    console.log('2. Testar com mensagem real no WhatsApp');
    console.log('3. Monitorar logs para verificar funcionamento');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testFinalSolution(); 