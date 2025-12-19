const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPrompt() {
  try {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { instanceName: 'toni' },
      include: { aiAgentConfig: true }
    });
    
    if (!instance || !instance.aiAgentConfig) {
      console.log('❌ Instância ou agente não encontrado');
      return;
    }
    
    console.log('🎯 Configuração do Agente:');
    console.log(`ID: ${instance.aiAgentConfig.id}`);
    console.log(`Nome: ${instance.aiAgentConfig.agentName}`);
    console.log(`Objetivo: ${instance.aiAgentConfig.goal}`);
    console.log(`Ativo: ${instance.aiAgentConfig.isActive}`);
    console.log('\n📝 Prompt customizado:');
    console.log(instance.aiAgentConfig.customPrompt || 'Nenhum prompt customizado');
    
    console.log('\n🏢 Informações da empresa:');
    console.log(`Nome: ${instance.aiAgentConfig.companyName || 'Não definido'}`);
    console.log(`Produto: ${instance.aiAgentConfig.productName || 'Não definido'}`);
    console.log(`Descrição: ${instance.aiAgentConfig.productDescription || 'Não definido'}`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPrompt(); 