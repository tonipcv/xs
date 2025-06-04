const fetch = require('node-fetch');

// Configurações
const EVOLUTION_API_URL = 'https://boop-evolution-api.dpbdp1.easypanel.host';
const EVOLUTION_API_KEY = '429683C4C977415CAAFCCE10F7D57E11';
const NGROK_URL = 'https://a62f-2804-7f0-bf81-9814-487b-3897-7420-6183.ngrok-free.app';

async function listInstances() {
  try {
    console.log('📋 Listando instâncias disponíveis...');
    
    const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status}: ${errorText}`);
    }

    const instances = await response.json();
    console.log('📱 Instâncias encontradas:');
    console.log('📋 Dados completos:', JSON.stringify(instances, null, 2));
    
    instances.forEach((instance, index) => {
      console.log(`${index + 1}. Nome: ${instance.instanceName || instance.name || instance.instance || 'N/A'} - Status: ${instance.connectionStatus || instance.status || 'N/A'}`);
    });
    
    return instances;
  } catch (error) {
    console.error('❌ Erro ao listar instâncias:', error.message);
    return [];
  }
}

async function updateWebhook(instanceName) {
  try {
    console.log(`🔄 Atualizando webhook para instância: ${instanceName}`);
    
    const webhookUrl = `${NGROK_URL}/api/ai-agent/webhook/messages-upsert`;
    
    const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: true,
          events: ['MESSAGES_UPSERT'],
          base64: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Webhook atualizado com sucesso!');
    console.log('📍 Nova URL:', webhookUrl);
    console.log('📋 Resposta:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Erro ao atualizar webhook:', error.message);
  }
}

async function main() {
  // Primeiro listar as instâncias
  const instances = await listInstances();
  
  if (instances.length === 0) {
    console.log('❌ Nenhuma instância encontrada');
    return;
  }
  
  // Se foi passado um argumento, usar ele
  const instanceName = process.argv[2];
  if (instanceName) {
    await updateWebhook(instanceName);
  } else {
    console.log('\n💡 Para atualizar o webhook, execute:');
    console.log('node update-webhook.js NOME_DA_INSTANCIA');
  }
}

main(); 