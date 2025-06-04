import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { AIContextGenerator } from '@/lib/ai-context-generator';
import { KnowledgeSearch } from '@/lib/knowledge-search';
import { ConversationContext, RateLimiter } from '@/lib/redis';

// Inicializar OpenAI com a chave do ambiente
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 [DEBUG] Webhook MESSAGES_UPSERT iniciado');
    const body = await request.json();
    
    // Log do webhook recebido
    console.log('🔔 Webhook MESSAGES_UPSERT recebido:', JSON.stringify(body, null, 2));

    // TEMPORARIAMENTE COMENTADO PARA DEBUG - aceitar todos os eventos
    // // Verificar se é um evento de mensagem (aceitar ambos os formatos)
    // if (body.event !== 'MESSAGES_UPSERT' && body.event !== 'messages.upsert') {
    //   console.log('🔔 [DEBUG] Não é evento de mensagem, ignorando. Evento recebido:', body.event);
    //   return NextResponse.json({ status: 'ignored', reason: 'not_message_event' });
    // }

    console.log('🔔 [DEBUG] Evento recebido:', body.event, '- Processando...');

    // A Evolution API pode enviar dados em estruturas diferentes
    let messages = [];
    let instanceName = body.instance;

    if (body.data?.messages) {
      // Estrutura: { data: { messages: [...] }, instance: "name" }
      messages = body.data.messages;
    } else if (body.data?.key) {
      // Estrutura: { data: { key: {...}, message: {...} }, instance: "name" }
      messages = [body.data];
    } else {
      console.log('🔔 [DEBUG] Nenhuma mensagem encontrada nos dados');
      return NextResponse.json({ status: 'ignored', reason: 'no_messages' });
    }

    if (!messages || messages.length === 0) {
      console.log('🔔 [DEBUG] Array de mensagens vazio');
      return NextResponse.json({ status: 'ignored', reason: 'no_messages' });
    }

    console.log(`🔔 [DEBUG] Processando ${messages.length} mensagens para instância ${instanceName}`);

    // Processar cada mensagem
    for (const messageData of messages) {
      try {
        console.log('🔔 [DEBUG] Iniciando processamento de mensagem:', messageData.key?.id);
      await processMessage(messageData, instanceName);
        console.log('🔔 [DEBUG] Mensagem processada com sucesso:', messageData.key?.id);
      } catch (msgError) {
        console.error('🔔 [DEBUG] Erro ao processar mensagem individual:', msgError);
      }
    }

    console.log('🔔 [DEBUG] Webhook processado com sucesso');
    return NextResponse.json({ status: 'processed' });
  } catch (error) {
    console.error('❌ [DEBUG] Erro no webhook MESSAGES_UPSERT:', error instanceof Error ? error.message : String(error));
    console.error('❌ [DEBUG] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Método GET para testar o endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'AI Agent webhook endpoint funcionando',
    timestamp: new Date().toISOString(),
    endpoint: '/api/ai-agent/webhook/messages-upsert'
  });
}

async function processMessage(messageData: any, instanceName: string) {
  try {
    console.log('🔔 [DEBUG] processMessage iniciado para:', instanceName);
    
    // Ignorar mensagens próprias
    if (messageData.key.fromMe) {
      console.log('📤 Ignorando mensagem própria');
      return;
    }

    console.log('🔔 [DEBUG] Buscando instância no banco...');
    // Buscar instância no banco
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { instanceName },
      include: { aiAgentConfig: true }
    });

    if (!instance) {
      console.log(`❌ Instância não encontrada: ${instanceName}`);
      return;
    }

    console.log('🔔 [DEBUG] Instância encontrada, verificando agente AI...');
    if (!instance.aiAgentConfig || !instance.aiAgentConfig.isActive) {
      console.log(`🤖 Agente IA não ativo para instância: ${instanceName}`);
      return;
    }

    const agentConfig = instance.aiAgentConfig;
    const remoteJid = messageData.key.remoteJid;
    const messageContent = extractMessageContent(messageData.message);

    if (!messageContent) {
      console.log('📝 Mensagem sem conteúdo de texto, ignorando');
      return;
    }

    console.log(`🤖 Processando mensagem de ${remoteJid}: "${messageContent}"`);

    // 🚦 SISTEMA DE RATE LIMITING ATIVADO
    console.log('🚦 Verificando rate limiting...');
    const rateLimitResult = await RateLimiter.checkLimit(
      agentConfig.id,
      remoteJid, 
      agentConfig.maxMessagesPerMinute || 5
    );
    
    if (!rateLimitResult.allowed) {
      console.log('🚫 Rate limit atingido para:', remoteJid);
      await sendFallbackMessage(instance, remoteJid, 'Por favor, aguarde um momento antes de enviar outra mensagem.');
      return;
    }

    // Marcar mensagem como lida
    await markMessageAsRead(instance, messageData);

    console.log('🔔 [DEBUG] Verificando tokens do usuário...');
    // Verificar tokens do usuário
    const user = await prisma.user.findUnique({
      where: { id: instance.userId },
      select: { tokensUsedThisMonth: true, freeTokensLimit: true }
    });

    if (!user || user.tokensUsedThisMonth >= user.freeTokensLimit) {
      console.log('🚫 Limite de tokens atingido');
      await sendFallbackMessage(instance, remoteJid, agentConfig.fallbackMessage);
      return;
    }

    // 🧠 SISTEMA DE MEMÓRIA/CONVERSA ATIVADO
    console.log('🧠 Carregando contexto da conversa...');
    const conversationHistory = await ConversationContext.getMessages(agentConfig.id, remoteJid, 10);
    
    // Adicionar mensagem atual ao contexto
    await ConversationContext.addMessage(
      agentConfig.id,
      remoteJid,
      'user',
      messageContent
    );

    console.log(`💭 Histórico carregado: ${conversationHistory.length} mensagens`);

    console.log('🔔 [DEBUG] Definindo prompt do sistema...');
    
    // 🧠 SISTEMA DE CONTEXTO INTELIGENTE ATIVADO
    let systemPrompt: string;
    
    if (agentConfig.systemPrompt && agentConfig.systemPrompt.trim() !== '' && 
        agentConfig.systemPrompt !== 'Você é um assistente virtual útil e amigável.') {
      // Usar prompt customizado se fornecido
      systemPrompt = agentConfig.systemPrompt;
      console.log('🎯 Usando prompt customizado fornecido pelo usuário');
    } else {
      // Gerar contexto inteligente baseado nos campos configurados
      console.log('🧠 Gerando contexto inteligente automaticamente...');
      
      const contextFields = {
        companyName: agentConfig.companyName,
        product: agentConfig.product,
        mainPain: agentConfig.mainPain,
        successCase: agentConfig.successCase,
        priceObjection: agentConfig.priceObjection,
        goal: agentConfig.goal
      };
      
      // Verificar se tem informações suficientes para contexto completo
      const hasBasicInfo = contextFields.companyName || contextFields.product;
      
      if (hasBasicInfo) {
        systemPrompt = AIContextGenerator.generateMainContext(contextFields);
        console.log('✅ Contexto principal gerado com base nas informações da empresa');
      } else {
        systemPrompt = AIContextGenerator.generateMinimalContext(agentConfig.goal);
        console.log('⚠️ Contexto mínimo gerado - configure informações da empresa para melhor performance');
      }
    }

    // 📚 SISTEMA DE BASE DE CONHECIMENTO ATIVADO
    console.log('📚 Buscando conhecimento relevante...');
    let knowledgeContext = '';
    
    try {
      console.log(`🔍 Buscando chunks para agentId: ${agentConfig.id} com mensagem: "${messageContent}"`);
      
      const relevantChunks = await KnowledgeSearch.searchRelevantChunks(
        agentConfig.id,
        messageContent,
        3 // Buscar top 3 chunks mais relevantes
      );
      
      console.log(`📊 Chunks encontrados: ${relevantChunks.length}`);
      relevantChunks.forEach((result, index) => {
        console.log(`   ${index + 1}. "${result.chunk.title}" (Score: ${result.relevanceScore}, Type: ${result.matchType})`);
      });
      
      if (relevantChunks.length > 0) {
        knowledgeContext = '\n\n📚 CONHECIMENTO RELEVANTE:\n' + 
          relevantChunks.map((result: any) => `• ${result.chunk.content}`).join('\n');
        console.log(`✅ ${relevantChunks.length} chunks de conhecimento encontrados`);
        console.log(`📝 Contexto de conhecimento: ${knowledgeContext.substring(0, 200)}...`);
      } else {
        console.log('⚠️ Nenhum conhecimento relevante encontrado');
      }
    } catch (knowledgeError) {
      console.error('❌ Erro ao buscar conhecimento:', knowledgeError);
    }

    // Combinar prompt do sistema com conhecimento
    const finalSystemPrompt = systemPrompt + knowledgeContext;
    
    console.log(`📋 Prompt final (${finalSystemPrompt.length} chars):`);
    console.log(`"${finalSystemPrompt}"`);

    console.log('🔔 [DEBUG] Preparando mensagens para OpenAI...');
    // Preparar mensagens para OpenAI com contexto completo
    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...conversationHistory, // Incluir histórico da conversa
      { role: 'user', content: messageContent }
    ];

    console.log(`🤖 Sistema prompt: ${finalSystemPrompt.length} caracteres`);
    console.log(`🎯 Objetivo do agente: ${agentConfig.goal}`);
    console.log(`💭 Mensagens no contexto: ${messages.length}`);

    console.log('🔔 [DEBUG] Verificando variáveis de ambiente...');
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasEvolutionUrl = !!process.env.EVOLUTION_API_URL;
    const hasEvolutionKey = !!process.env.EVOLUTION_API_KEY;
    
    console.log(`🔑 OpenAI Key: ${hasOpenAIKey ? 'OK' : 'MISSING'}`);
    console.log(`🔗 Evolution URL: ${hasEvolutionUrl ? 'OK' : 'MISSING'}`);
    console.log(`🔑 Evolution Key: ${hasEvolutionKey ? 'OK' : 'MISSING'}`);

    if (!hasOpenAIKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    console.log('🔔 [DEBUG] Chamando OpenAI...');
    // Chamar OpenAI
    const startTime = Date.now();
    
    console.log('🔔 [DEBUG] Criando completion OpenAI...');
    // Gerar resposta com OpenAI
    const completion = await openai.chat.completions.create({
      model: agentConfig.model,
      messages: messages as any,
      max_tokens: agentConfig.maxTokens,
      temperature: agentConfig.temperature,
    });

    console.log('🔔 [DEBUG] OpenAI respondeu, processando resposta...');
    const responseTime = (Date.now() - startTime) / 1000;
    const aiResponse = completion.choices[0]?.message?.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    if (!aiResponse) {
      console.log('❌ OpenAI não retornou resposta');
      return;
    }

    console.log(`🔔 [DEBUG] Resposta da OpenAI: "${aiResponse.substring(0, 100)}..."`);

    // 🧠 ADICIONAR RESPOSTA AO CONTEXTO DA CONVERSA
    await ConversationContext.addMessage(
      agentConfig.id,
      remoteJid,
      'assistant',
      aiResponse,
      tokensUsed
    );

    console.log('🔔 [DEBUG] Atualizando tokens do usuário...');
    // Atualizar tokens do usuário
    await prisma.user.update({
      where: { id: instance.userId },
      data: {
        tokensUsedThisMonth: { increment: tokensUsed },
        totalTokensUsed: { increment: tokensUsed }
      }
    });

    console.log('🔔 [DEBUG] Enviando resposta via Evolution API...');
    // Enviar resposta via Evolution API
    await sendMessage(instance, remoteJid, aiResponse);

    console.log('🔔 [DEBUG] Criando log da resposta...');
    // Log da resposta
    await prisma.aIAgentLog.create({
      data: {
        agentConfigId: agentConfig.id,
        type: 'response',
        message: 'Resposta enviada com sucesso',
        details: JSON.stringify({
          remoteJid,
          tokensUsed,
          responseTime,
          model: agentConfig.model,
          hasKnowledge: knowledgeContext.length > 0,
          conversationLength: conversationHistory.length
        }),
        remoteJid,
        responseTime,
        tokens: tokensUsed
      }
    });

    console.log(`✅ Resposta enviada para ${remoteJid} (${tokensUsed} tokens, ${responseTime}s)`);

  } catch (error) {
    console.error('❌ [DEBUG] Erro ao processar mensagem:', error instanceof Error ? error.message : String(error));
    console.error('❌ [DEBUG] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    
    // Log do erro
    if (error instanceof Error) {
      try {
        await prisma.aIAgentLog.create({
          data: {
            agentConfigId: 'unknown',
            type: 'error',
            message: 'Erro ao processar mensagem',
            details: JSON.stringify({
              error: error.message,
              stack: error.stack,
              instanceName
            })
          }
        });
      } catch (logError) {
        console.error('❌ Erro ao salvar log:', logError);
      }
    }
  }
}

function splitIntoSentences(text: string): string[] {
  // Para mensagens curtas (até 200 chars), enviar tudo de uma vez
  if (text.length <= 200) {
    return [text];
  }
  
  // Para mensagens médias (até 400 chars), dividir no máximo em 2 partes
  if (text.length <= 400) {
    // Procurar um ponto natural para dividir (ponto final, exclamação, interrogação)
    const midPoint = text.length / 2;
    const punctuationRegex = /[.!?]/g;
    let bestSplit = -1;
    let match;
    
    while ((match = punctuationRegex.exec(text)) !== null) {
      const position = match.index;
      // Verificar se não está no meio de um email ou URL
      const beforeChar = text[position - 1];
      const afterChar = text[position + 1];
      
      // Pular se for ponto em email (@gmail.com) ou URL (www.site.com)
      if (beforeChar && afterChar && 
          (text.substring(Math.max(0, position - 10), position + 10).includes('@') ||
           text.substring(Math.max(0, position - 5), position + 5).match(/\w\.\w/))) {
        continue;
      }
      
      if (position > midPoint * 0.6 && position < midPoint * 1.4) {
        bestSplit = position + 1;
        break;
      }
    }
    
    if (bestSplit > 0) {
      const part1 = text.substring(0, bestSplit).trim();
      const part2 = text.substring(bestSplit).trim();
      
      // Verificar se a divisão não cortou uma palavra
      if (part1.length > 0 && part2.length > 0 && 
          !part1.endsWith(' ') && !part2.startsWith(' ') &&
          part1[part1.length - 1].match(/\w/) && part2[0].match(/\w/)) {
        // Se cortou uma palavra, não dividir
        return [text];
      }
      
      return [part1, part2].filter(part => part.length > 0);
    }
    
    return [text]; // Se não encontrar bom ponto, enviar tudo
  }
  
  // Para mensagens longas, dividir por parágrafos primeiro
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 1) {
    return paragraphs.map(p => p.trim());
  }
  
  // Dividir por pontos finais, mas com cuidado para não cortar emails/URLs
  const sentences = [];
  let currentSentence = '';
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    currentSentence += char;
    
    // Se encontrar ponto, exclamação ou interrogação
    if (['.', '!', '?'].includes(char)) {
      // Verificar se não é parte de email ou URL
      const context = text.substring(Math.max(0, i - 10), Math.min(text.length, i + 10));
      const isEmailOrUrl = context.includes('@') || context.match(/\w\.\w/);
      
      // Se não for email/URL e tiver espaço depois (ou fim do texto)
      if (!isEmailOrUrl && (i === text.length - 1 || text[i + 1] === ' ')) {
        // Adicionar próximo caractere se for espaço
        if (i < text.length - 1 && text[i + 1] === ' ') {
          i++;
          currentSentence += text[i];
        }
        
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }
    
    i++;
  }
  
  // Adicionar última frase se sobrou algo
  if (currentSentence.trim()) {
    sentences.push(currentSentence.trim());
  }
  
  // Agrupar frases muito curtas
  const grouped = [];
  let currentGroup = '';
  
  for (const sentence of sentences) {
    if ((currentGroup + ' ' + sentence).length <= 300 && currentGroup) {
      currentGroup += ' ' + sentence;
    } else {
      if (currentGroup) {
        grouped.push(currentGroup.trim());
      }
      currentGroup = sentence;
    }
  }
  
  if (currentGroup) {
    grouped.push(currentGroup.trim());
  }
  
  return grouped.length > 0 ? grouped : [text];
}

async function sendMessage(instance: any, remoteJid: string, message: string) {
  try {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error('Evolution API não configurada');
    }

    // Limpar o número (remover @s.whatsapp.net se presente)
    const cleanNumber = remoteJid.replace('@s.whatsapp.net', '');

    // Dividir mensagem em frases se for muito longa
    const sentences = splitIntoSentences(message);
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      
      // Simular "digitando..." antes de cada frase usando o endpoint correto para chat
      await sendChatPresence(instance, remoteJid, 'composing');
      
      // Delay baseado no tamanho da frase (simular tempo de digitação mais realista)
      const typingDelay = Math.min(sentence.length * 15, 1500); // 15ms por char, máx 1.5s
      const baseDelay = 300; // Delay base menor
      const totalDelay = baseDelay + typingDelay + Math.random() * 500; // Menos variação
      
      console.log(`⏱️ Simulando digitação por ${Math.round(totalDelay)}ms para ${sentence.length} caracteres`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      
      // Enviar a frase com retry logic
      let success = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`📤 Tentativa ${attempt}/3 de enviar mensagem para ${cleanNumber}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
          
          // CORRIGIDO: Payload conforme documentação v2 - sem options aninhado
          const response = await fetch(`${evolutionApiUrl}/message/sendText/${instance.instanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey
            },
            body: JSON.stringify({
              number: cleanNumber,
              text: sentence,
              delay: Math.min(sentence.length * 20, 2000), // Delay baseado no tamanho
              linkPreview: true // Habilitar preview de links
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro da Evolution API (${response.status}):`, errorText);
            
            // Se for erro 400 com número inexistente, não tentar novamente
            if (response.status === 400) {
              try {
                const errorData = JSON.parse(errorText);
                if (errorData.response?.message?.[0]?.exists === false) {
                  console.log('⚠️ Número não existe no WhatsApp, ignorando erro...');
                  return; // Retornar sem erro para não interromper o processamento
                }
              } catch (e) {
                // Se não conseguir parsear o JSON, continuar com o tratamento normal
              }
            }
            
            // Se for erro 500 (timeout), tentar novamente
            if (response.status === 500 && attempt < 3) {
              console.log(`⏳ Erro 500 detectado, aguardando ${attempt * 2}s antes da próxima tentativa...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
            
            throw new Error(`Erro ao enviar mensagem: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          console.log(`📤 Resposta da Evolution API (tentativa ${attempt}):`, result);
          success = true;
          break;
          
        } catch (error) {
          lastError = error;
          console.error(`❌ Tentativa ${attempt}/3 falhou:`, error instanceof Error ? error.message : String(error));
          
          if (attempt < 3) {
            console.log(`⏳ Aguardando ${attempt * 3}s antes da próxima tentativa...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 3000));
          }
        }
      }
      
      if (!success) {
        console.error(`❌ Falha ao enviar mensagem após 3 tentativas`);
        throw lastError || new Error('Falha ao enviar mensagem após múltiplas tentativas');
      }
      
      // Pequena pausa entre frases (exceto na última)
      if (i < sentences.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Pausa menor entre frases
      }
    }

    // Parar presença de digitando após todas as mensagens
    await sendChatPresence(instance, remoteJid, 'paused');

    console.log(`✅ Mensagem enviada com sucesso para ${remoteJid}`);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    // Mesmo com erro, tentar parar o digitando
    try {
      await sendChatPresence(instance, remoteJid, 'paused');
    } catch (presenceError) {
      console.error('❌ Erro ao parar presença após falha:', presenceError);
    }
    throw error;
  }
}

async function sendChatPresence(instance: any, remoteJid: string, presence: string) {
  try {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionApiUrl || !evolutionApiKey) return;

    // Limpar o número (remover @s.whatsapp.net se presente)
    const cleanNumber = remoteJid.replace('@s.whatsapp.net', '');

    // Retry logic para presença
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout para presença

        // CORRIGIDO: Usar endpoint correto para presença no chat específico
        const response = await fetch(`${evolutionApiUrl}/chat/sendPresence/${instance.instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: cleanNumber,
            presence: presence,
            delay: 1000 // Campo obrigatório conforme documentação v2
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`👁️ Presença do chat enviada: ${presence} para ${cleanNumber}`);
          return; // Sucesso, sair da função
        } else {
          const errorText = await response.text();
          console.log(`⚠️ Erro ao enviar presença do chat (${response.status}):`, errorText);
          
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
      } catch (error) {
        console.error(`❌ Tentativa ${attempt}/2 de enviar presença falhou:`, error instanceof Error ? error.message : String(error));
        
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro ao enviar presença do chat:', error);
  }
}

async function sendFallbackMessage(instance: any, remoteJid: string, fallbackMessage: string) {
  try {
    await sendMessage(instance, remoteJid, fallbackMessage);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de fallback:', error);
  }
}

function extractMessageContent(message: any): string | null {
  if (message?.conversation) {
    return message.conversation;
  }
  
  if (message?.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  
  if (message?.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  
  if (message?.videoMessage?.caption) {
    return message.videoMessage.caption;
  }
  
  return null;
}

async function markMessageAsRead(instance: any, messageData: any) {
  try {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionApiUrl || !evolutionApiKey) return;

    // CORRIGIDO: Método POST e payload com readMessages (camelCase) conforme documentação v2
    const response = await fetch(`${evolutionApiUrl}/chat/markMessageAsRead/${instance.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        readMessages: [{
          remoteJid: messageData.key.remoteJid,
          fromMe: messageData.key.fromMe,
          id: messageData.key.id
        }]
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Mensagem marcada como lida:', result);
    } else {
      const errorText = await response.text();
      console.log('⚠️ Erro ao marcar mensagem como lida:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como lida:', error);
  }
}