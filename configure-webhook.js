require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function configureWebhook() {
  try {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = 'toni';
    const webhookUrl = 'https://zp-bay.vercel.app/api/ai-agent/webhook';

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API não configurada');
    }

    console.log('🔧 Configurando webhook...');
    console.log(`📡 URL base: ${webhookUrl}`);
    console.log(`🤖 Instância: ${instanceName}`);
    console.log('📋 Com webhook_by_events=true, a Evolution API criará URLs como:');
    console.log('   - messages-upsert → /api/ai-agent/webhook/messages-upsert');
    console.log('   - messages-update → /api/ai-agent/webhook/messages-update');
    console.log('   - chats-upsert → /api/ai-agent/webhook/chats-upsert');

    const response = await fetch(`${evolutionApiUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          webhook_by_events: true,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'CHATS_UPSERT',
            'CHATS_UPDATE',
            'CHATS_DELETE',
            'CONTACTS_UPSERT',
            'CONTACTS_UPDATE',
            'PRESENCE_UPDATE'
          ]
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao configurar webhook: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Webhook configurado com sucesso:', result);

    console.log('\n🔍 Verificando configuração...');
    const checkResponse = await fetch(`${evolutionApiUrl}/webhook/find/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey
      }
    });

    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      throw new Error(`Erro ao verificar webhook: ${checkResponse.status} - ${errorText}`);
    }

    const webhookConfig = await checkResponse.json();
    console.log('🔍 Configuração atual do webhook:', webhookConfig);

    console.log('\n📝 Checklist de configuração:');
    console.log(`✅ Webhook habilitado: ${webhookConfig.enabled === true ? 'SIM' : 'NÃO'}`);
    console.log(`✅ URL base correta: ${webhookConfig.url === webhookUrl ? 'SIM' : 'NÃO'}`);
    console.log(`✅ webhook_by_events ativo: ${webhookConfig.webhookByEvents === true ? 'SIM' : 'NÃO'}`);
    console.log(`✅ Eventos configurados: ${webhookConfig.events?.length || 0} eventos`);

    if (webhookConfig.webhookByEvents === true) {
      console.log('\n🎉 Configuração correta! A Evolution API agora enviará:');
      console.log('   📨 MESSAGES_UPSERT → /api/ai-agent/webhook/messages-upsert');
      console.log('   📝 MESSAGES_UPDATE → /api/ai-agent/webhook/messages-update');
      console.log('   💬 CHATS_UPSERT → /api/ai-agent/webhook/chats-upsert');
      console.log('   👁️ PRESENCE_UPDATE → /api/ai-agent/webhook/presence-update');
      console.log('\n⚠️ Certifique-se de que o ngrok está rodando e apontando para a porta correta!');
    } else {
      console.log('\n⚠️ webhook_by_events não foi configurado corretamente.');
      console.log('Todos os eventos irão para a URL base, o que pode causar problemas.');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

configureWebhook(); 