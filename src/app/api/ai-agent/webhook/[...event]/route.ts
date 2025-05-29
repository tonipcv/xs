import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

// Inicializar OpenAI com a chave do ambiente
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest, { params }: { params: { event: string[] } }) {
  try {
    const eventPath = params.event.join('/');
    console.log(`🔔 [DEBUG] Webhook genérico iniciado para evento: ${eventPath}`);
    
    const body = await request.json();
    
    // Log do webhook recebido
    console.log(`🔔 Webhook ${eventPath} recebido:`, JSON.stringify(body, null, 2));

    // Verificar se é um evento de mensagem que devemos processar
    const messageEvents = ['messages-upsert', 'MESSAGES_UPSERT', 'messages.upsert'];
    const isMessageEvent = messageEvents.some(event => 
      eventPath.includes(event) || body.event === event
    );

    if (!isMessageEvent) {
      console.log(`🔔 [DEBUG] Evento ${eventPath} não é de mensagem, ignorando`);
      return NextResponse.json({ 
        status: 'ignored', 
        reason: 'not_message_event',
        event: eventPath 
      });
    }

    console.log('🔔 [DEBUG] Evento de mensagem detectado, processando...');

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
    return NextResponse.json({ status: 'processed', event: eventPath });
  } catch (error) {
    console.error(`❌ [DEBUG] Erro no webhook ${params.event.join('/')}:`, error instanceof Error ? error.message : String(error));
    console.error('❌ [DEBUG] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Método GET para testar o endpoint
export async function GET(request: NextRequest, { params }: { params: { event: string[] } }) {
  const eventPath = params.event.join('/');
  return NextResponse.json({ 
    status: 'ok',
    message: `AI Agent webhook endpoint genérico funcionando para evento: ${eventPath}`,
    timestamp: new Date().toISOString(),
    endpoint: `/api/ai-agent/webhook/${eventPath}`,
    supportedEvents: [
      'messages-upsert',
      'messages-update', 
      'chats-upsert',
      'presence-update'
    ]
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

    console.log('🔔 [DEBUG] Definindo prompt do sistema...');
    // Usar systemPrompt simples para teste
    const systemPrompt = agentConfig.systemPrompt || 'Você é um assistente virtual útil e amigável.';

    console.log('🔔 [DEBUG] Preparando mensagens para OpenAI...');
    // Preparar mensagens para OpenAI de forma simples
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageContent }
    ];

    console.log(`🤖 Sistema prompt: ${systemPrompt.length} caracteres`);

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
          model: agentConfig.model
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
  // Dividir por pontos finais, exclamações, interrogações
  const sentences = text.split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 0);
  
  // Se não houver pontuação, dividir por vírgulas ou por tamanho
  if (sentences.length === 1 && text.length > 100) {
    const parts = text.split(/,\s+/);
    if (parts.length > 1) {
      return parts;
    }
    
    // Dividir por palavras se muito longo
    const words = text.split(' ');
    const chunks = [];
    let currentChunk = '';
    
    for (const word of words) {
      if ((currentChunk + ' ' + word).length > 100 && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  return sentences;
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
      
      // Delay baseado no tamanho da frase (simular tempo de digitação)
      const typingDelay = Math.min(sentence.length * 50, 3000); // Min 50ms por char, máx 3s
      const baseDelay = 800; // Delay base
      const totalDelay = baseDelay + typingDelay + Math.random() * 1000; // Adicionar variação
      
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
        await new Promise(resolve => setTimeout(resolve, 1000)); // Aumentar pausa entre frases
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