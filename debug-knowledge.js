const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugKnowledge() {
  try {
    console.log('🔍 Debugando base de conhecimento...\n');

    // 1. Buscar instância "toni"
    console.log('1️⃣ Buscando instância "toni"...');
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { instanceName: 'toni' },
      include: { aiAgentConfig: true }
    });

    if (!instance) {
      console.log('❌ Instância "toni" não encontrada');
      return;
    }

    console.log(`✅ Instância encontrada: ${instance.instanceName}`);
    console.log(`📱 ID da instância: ${instance.id}`);

    if (!instance.aiAgentConfig) {
      console.log('❌ Agente AI não configurado para esta instância');
      return;
    }

    console.log(`🤖 Agente AI encontrado: ${instance.aiAgentConfig.id}`);
    console.log(`🎯 Objetivo: ${instance.aiAgentConfig.goal}`);
    console.log(`🔄 Ativo: ${instance.aiAgentConfig.isActive}\n`);

    // 2. Buscar chunks de conhecimento
    console.log('2️⃣ Buscando chunks de conhecimento...');
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        agentId: instance.aiAgentConfig.id,
        isActive: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    console.log(`📚 Total de chunks encontrados: ${chunks.length}\n`);

    if (chunks.length === 0) {
      console.log('❌ Nenhum chunk de conhecimento encontrado!');
      console.log('💡 Você precisa adicionar conhecimento na interface web:');
      console.log('   http://localhost:3000/ai-agent/knowledge');
      return;
    }

    // 3. Listar chunks
    console.log('3️⃣ Chunks encontrados:');
    chunks.forEach((chunk, index) => {
      console.log(`\n📄 Chunk ${index + 1}:`);
      console.log(`   ID: ${chunk.id}`);
      console.log(`   Título: ${chunk.title}`);
      console.log(`   Tipo: ${chunk.type}`);
      console.log(`   Prioridade: ${chunk.priority}`);
      console.log(`   Tags: ${chunk.tags || 'Nenhuma'}`);
      console.log(`   Conteúdo: ${chunk.content.substring(0, 100)}...`);
    });

    // 4. Testar busca
    console.log('\n4️⃣ Testando busca por "olá"...');
    const testMessage = 'olá';
    
    // Simular a lógica de busca
    const results = [];
    const messageLower = testMessage.toLowerCase();

    for (const chunk of chunks) {
      let score = 0;
      const titleLower = chunk.title.toLowerCase();
      const contentLower = chunk.content.toLowerCase();
      const tagsLower = chunk.tags?.toLowerCase() || '';

      // Match no título
      if (titleLower.includes(messageLower) || messageLower.includes(titleLower)) {
        score += 100;
      }

      // Match no conteúdo
      const messageWords = messageLower.split(' ');
      const contentMatches = messageWords.filter(word => 
        word.length > 2 && contentLower.includes(word)
      ).length;
      score += contentMatches * 10;

      // Match nas tags
      if (tagsLower) {
        const tagMatches = messageWords.filter(word => 
          word.length > 2 && tagsLower.includes(word)
        ).length;
        score += tagMatches * 15;
      }

      // Bonus por prioridade
      score += chunk.priority * 5;

      if (score > 0) {
        results.push({
          chunk,
          score,
          matchType: score >= 100 ? 'title' : score >= 15 ? 'tag' : 'content'
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    console.log(`🔍 Resultados da busca: ${results.length}`);
    results.slice(0, 3).forEach((result, index) => {
      console.log(`\n🎯 Resultado ${index + 1} (Score: ${result.score}):`);
      console.log(`   Título: ${result.chunk.title}`);
      console.log(`   Tipo de match: ${result.matchType}`);
      console.log(`   Conteúdo: ${result.chunk.content.substring(0, 150)}...`);
    });

    // 5. Buscar por "futuros tech"
    console.log('\n5️⃣ Testando busca por "futuros tech"...');
    const testMessage2 = 'futuros tech';
    const results2 = [];
    const messageLower2 = testMessage2.toLowerCase();

    for (const chunk of chunks) {
      let score = 0;
      const titleLower = chunk.title.toLowerCase();
      const contentLower = chunk.content.toLowerCase();
      const tagsLower = chunk.tags?.toLowerCase() || '';

      // Match no título
      if (titleLower.includes(messageLower2) || messageLower2.includes(titleLower)) {
        score += 100;
      }

      // Match parcial no título
      const titleWords = titleLower.split(' ');
      const messageWords = messageLower2.split(' ');
      const titleMatches = titleWords.filter(word => 
        word.length > 2 && messageWords.some(msgWord => msgWord.includes(word) || word.includes(msgWord))
      ).length;
      score += titleMatches * 20;

      // Match no conteúdo
      const contentMatches = messageWords.filter(word => 
        word.length > 2 && contentLower.includes(word)
      ).length;
      score += contentMatches * 10;

      // Match nas tags
      if (tagsLower) {
        const tagMatches = messageWords.filter(word => 
          word.length > 2 && tagsLower.includes(word)
        ).length;
        score += tagMatches * 15;
      }

      // Bonus por prioridade
      score += chunk.priority * 5;

      if (score > 0) {
        results2.push({
          chunk,
          score,
          matchType: score >= 100 ? 'title' : score >= 20 ? 'partial_title' : score >= 15 ? 'tag' : 'content'
        });
      }
    }

    results2.sort((a, b) => b.score - a.score);

    console.log(`🔍 Resultados da busca por "futuros tech": ${results2.length}`);
    results2.slice(0, 3).forEach((result, index) => {
      console.log(`\n🎯 Resultado ${index + 1} (Score: ${result.score}):`);
      console.log(`   Título: ${result.chunk.title}`);
      console.log(`   Tipo de match: ${result.matchType}`);
      console.log(`   Conteúdo: ${result.chunk.content.substring(0, 150)}...`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugKnowledge(); 