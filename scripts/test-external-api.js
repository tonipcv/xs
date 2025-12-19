/**
 * Script de teste para validar a API Externa do ZAP Membership
 * 
 * Execute: node scripts/test-external-api.js
 */

// Carregar variáveis de ambiente
require('dotenv').config({ path: '.env.local' });

// Configurações
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const API_KEY = process.env.EXTERNAL_API_KEY;
const TEST_PHONE = '5511976638147'; // Número real para teste
const TEST_MESSAGE = 'Teste da API Externa - ' + new Date().toLocaleString();

// Validar configurações obrigatórias
if (!API_KEY) {
  console.error('❌ EXTERNAL_API_KEY não encontrada no arquivo .env.local');
  console.error('💡 Adicione a linha: EXTERNAL_API_KEY=sua-chave-aqui');
  process.exit(1);
}

console.log('🧪 Iniciando testes da API Externa do ZAP Membership\n');
console.log('📋 Configurações:');
console.log(`   Base URL: ${BASE_URL}`);
console.log(`   API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`   Telefone de teste: ${TEST_PHONE}`);
console.log('');

/**
 * Fazer requisição HTTP
 */
async function makeRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    }
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  console.log(`📡 ${method} ${endpoint}`);
  
  try {
    const response = await fetch(url, options);
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    // Verificar se a resposta é JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log('   💥 Resposta não é JSON:', text.substring(0, 100) + '...');
      return { success: false, error: 'Resposta não é JSON', status: response.status };
    }
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('   ✅ Sucesso');
      return { success: true, data, status: response.status };
    } else {
      console.log('   ❌ Erro');
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    console.log(`   💥 Erro de conexão: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Teste 1: Verificar status da API
 */
async function testApiStatus() {
  console.log('🔍 Teste 1: Verificando status da API');
  
  const result = await makeRequest('GET', '/api/external/send-message');
  
  if (result.success) {
    console.log(`   Serviço: ${result.data.service}`);
    console.log(`   Status: ${result.data.status}`);
    console.log(`   Versão: ${result.data.version}`);
  } else {
    console.log(`   Erro: ${result.data?.error || result.error}`);
  }
  
  console.log('');
  return result.success;
}

/**
 * Teste 2: Listar instâncias
 */
async function testListInstances() {
  console.log('📋 Teste 2: Listando instâncias disponíveis');
  
  const result = await makeRequest('GET', '/api/external/instances');
  
  if (result.success) {
    console.log(`   Total de instâncias: ${result.data.count}`);
    
    if (result.data.instances.length > 0) {
      console.log('   Instâncias encontradas:');
      result.data.instances.forEach((instance, index) => {
        console.log(`     ${index + 1}. ${instance.instanceName} (${instance.id})`);
        console.log(`        Status: ${instance.status}`);
        console.log(`        Número: ${instance.connectedNumber || 'N/A'}`);
        console.log(`        Disponível: ${instance.isAvailable ? 'Sim' : 'Não'}`);
      });
      
      // Retornar primeira instância disponível para próximos testes
      const availableInstance = result.data.instances.find(i => i.isAvailable);
      if (availableInstance) {
        console.log(`   ✅ Instância selecionada para testes: ${availableInstance.instanceName}`);
        return availableInstance;
      } else {
        console.log('   ⚠️ Nenhuma instância disponível para testes');
        return null;
      }
    } else {
      console.log('   ⚠️ Nenhuma instância encontrada');
      return null;
    }
  } else {
    console.log(`   Erro: ${result.data?.error || result.error}`);
    return null;
  }
}

/**
 * Teste 3: Enviar mensagem (apenas se houver instância disponível)
 */
async function testSendMessage(instance) {
  console.log('📤 Teste 3: Enviando mensagem de teste');
  
  if (!instance) {
    console.log('   ⏭️ Pulando teste - nenhuma instância disponível');
    console.log('');
    return false;
  }

  console.log(`   Instância: ${instance.instanceName}`);
  console.log(`   Número: ${TEST_PHONE}`);
  console.log(`   Mensagem: "${TEST_MESSAGE}"`);
  
  const sendResponse = await fetch(`${BASE_URL}/api/external/send-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({
      instanceId: instance.id,
      number: TEST_PHONE,
      message: TEST_MESSAGE
    })
  });

  console.log(`📡 POST /api/external/send-message`);
  console.log(`   Status: ${sendResponse.status} ${sendResponse.statusText}`);
  
  const sendData = await sendResponse.json();
  
  if (sendResponse.ok && sendData.success) {
    console.log('   ✅ Sucesso');
    console.log(`   📨 ID da mensagem: ${sendData.messageId}`);
    console.log(`   📱 Enviado para: ${sendData.data.remoteJid}`);
    return true;
  } else {
    console.log('   ❌ Erro');
    if (sendData.error && sendData.error.includes('exists": false')) {
      console.log('   ⚠️ Número não existe no WhatsApp (isso é esperado para números de teste)');
      console.log('   💡 Para testar com número real, use um número válido do WhatsApp');
      return 'partial'; // Consideramos como sucesso parcial
    } else {
      console.log(`   ❌ Erro ao enviar mensagem: ${sendData.error || 'Erro desconhecido'}`);
      return false;
    }
  }
}

/**
 * Teste 4: Autenticação
 */
async function testAuthentication() {
  console.log('🔐 Teste 4: Testando autenticação (API Key inválida)');
  
  // Fazer requisição com API Key inválida
  const response = await fetch(`${BASE_URL}/api/external/send-message`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'chave-invalida-123'
    }
  });
  
  console.log(`📡 GET /api/external/send-message`);
  console.log(`   Status: ${response.status} ${response.statusText}`);
  
  const data = await response.json();
  
  if (response.status === 401 && !data.success) {
    console.log('   ❌ Erro');
    console.log('   ✅ Autenticação funcionando corretamente (rejeitou chave inválida)');
    return true;
  } else {
    console.log('   ❌ Falha na autenticação - deveria ter rejeitado a chave inválida');
    return false;
  }
}

/**
 * Teste 5: Validação de dados (campos obrigatórios)
 */
async function testValidation() {
  console.log('✅ Teste 5: Testando validação de dados');
  
  // Teste com dados incompletos
  const invalidData = {
    instanceId: '', // Vazio
    number: '', // Vazio
    message: '' // Vazio
  };
  
  const result = await makeRequest('POST', '/api/external/send-message', invalidData);
  
  if (!result.success && result.status === 400) {
    console.log('   ✅ Validação funcionando corretamente (rejeitou dados inválidos)');
    console.log(`   Erro esperado: ${result.data?.error}`);
  } else {
    console.log('   ❌ Problema na validação - deveria rejeitar dados inválidos');
  }
  
  console.log('');
  return !result.success && result.status === 400;
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('🚀 Executando bateria completa de testes...\n');
  
  const results = {
    apiStatus: false,
    listInstances: null,
    sendMessage: false,
    invalidAuth: false,
    validation: false
  };

  try {
    // Teste 1: Status da API
    results.apiStatus = await testApiStatus();
    
    // Teste 2: Listar instâncias
    results.listInstances = await testListInstances();
    
    // Teste 3: Enviar mensagem (apenas se houver instância)
    if (results.listInstances) {
      results.sendMessage = await testSendMessage(results.listInstances);
    } else {
      console.log('📤 Teste 3: Pulado - nenhuma instância disponível\n');
    }
    
    // Teste 4: Autenticação inválida
    results.invalidAuth = await testAuthentication();
    
    // Teste 5: Validação de dados
    results.validation = await testValidation();
    
  } catch (error) {
    console.error('💥 Erro durante os testes:', error);
  }

  // Resumo dos resultados
  console.log('📊 RESUMO DOS TESTES');
  console.log('='.repeat(50));
  console.log(`✅ Status da API: ${results.apiStatus ? 'PASSOU' : 'FALHOU'}`);
  console.log(`✅ Listar instâncias: ${results.listInstances ? 'PASSOU' : 'FALHOU'}`);
  console.log(`✅ Enviar mensagem: ${results.sendMessage ? 'PASSOU' : results.listInstances ? 'FALHOU' : 'PULADO'}`);
  console.log(`✅ Autenticação: ${results.invalidAuth ? 'PASSOU' : 'FALHOU'}`);
  console.log(`✅ Validação: ${results.validation ? 'PASSOU' : 'FALHOU'}`);
  
  // Contar sucessos - considerar diferentes tipos de retorno
  const successCount = Object.entries(results).filter(([key, result]) => {
    if (key === 'listInstances') {
      return result !== null; // Sucesso se encontrou instâncias
    }
    return result === true; // Sucesso se retornou true
  }).length;
  
  const totalTests = Object.keys(results).length;
  
  console.log('');
  console.log(`📈 Resultado: ${successCount}/${totalTests} testes passaram`);
  
  if (successCount === totalTests) {
    console.log('🎉 Todos os testes passaram com sucesso!');
  } else {
    console.log('⚠️ Alguns testes falharam. Verifique a configuração e logs acima.');
  }
  
  console.log('');
  console.log('💡 Dicas:');
  console.log('   - Certifique-se de que o servidor está rodando');
  console.log('   - Verifique se a EXTERNAL_API_KEY está configurada');
  console.log('   - Para testar envio real, conecte uma instância WhatsApp');
  console.log('   - Verifique os logs do servidor para mais detalhes');
}

// Executar testes se chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testApiStatus,
  testListInstances,
  testSendMessage,
  testAuthentication,
  testValidation
}; 