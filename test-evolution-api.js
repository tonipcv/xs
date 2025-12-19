const dotenv = require('dotenv');
const path = require('path');
const fetch = require('node-fetch');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testEvolutionAPI() {
  try {
    console.log('🧪 Testando Evolution API...\n');
    
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = 'toni';
    const testNumber = '5511999999999';
    
    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API não configurada');
    }
    
    // 1. Testar status da instância
    console.log('1️⃣ Verificando status da instância...');
    const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      headers: { 'apikey': evolutionApiKey }
    });
    
    if (!statusResponse.ok) {
      throw new Error(`Erro ao verificar status: ${statusResponse.status}`);
    }
    
    const statusData = await statusResponse.json();
    console.log('✅ Status da instância:', statusData);
    
    // 2. Testar envio de mensagem
    console.log('\n2️⃣ Testando envio de mensagem...');
    const messageResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        number: testNumber,
        text: 'Teste da Evolution API - ' + new Date().toISOString(),
        options: {
          delay: 1000,
          presence: 'composing',
          linkPreview: true
        }
      })
    });
    
    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      throw new Error(`Erro ao enviar mensagem: ${messageResponse.status} - ${errorText}`);
    }
    
    const messageData = await messageResponse.json();
    console.log('✅ Mensagem enviada:', messageData);
    
    console.log('\n✅ Testes concluídos com sucesso!');
    
  } catch (error) {
    console.error('\n❌ Erro nos testes:', error.message);
  }
}

testEvolutionAPI(); 