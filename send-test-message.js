const fetch = require('node-fetch');

async function sendTestMessage() {
  console.log('📱 Enviando mensagem de teste...\n');

  const evolutionApiUrl = 'https://boop-evolution-api.dpbdp1.easypanel.host';
  const evolutionApiKey = '429683C4C977415CAAFCCE10F7D57E11';
  const instanceName = 'toni';
  
  // Número para teste (substitua pelo seu número)
  const testNumber = '5511999999999'; // Substitua pelo número real para teste

  try {
    console.log('📤 Enviando mensagem de teste...');
    
    const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        number: testNumber,
        text: 'Teste do agente AI - esta é uma mensagem de teste para verificar se o webhook está funcionando'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Mensagem enviada:', result);
      
      console.log('\n⏳ Aguardando 5 segundos para verificar se o webhook processou...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verificar logs recentes
      console.log('\n📋 Verificando logs recentes...');
      // Aqui você pode verificar os logs do Vercel ou do banco de dados
      
    } else {
      const errorText = await response.text();
      console.log('❌ Erro ao enviar mensagem:', response.status, errorText);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Instruções para o usuário
console.log('⚠️  IMPORTANTE: Edite este arquivo e substitua o número de teste pelo seu número real');
console.log('📱 Número atual configurado: 5511999999999');
console.log('🔄 Para continuar, pressione Ctrl+C e edite o arquivo, ou continue para testar\n');

sendTestMessage(); 