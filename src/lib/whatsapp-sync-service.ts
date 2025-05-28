import { PrismaClient } from '@prisma/client';
import { 
  EvolutionApiClient, 
  WhatsAppContactData, 
  WhatsAppChatData, 
  WhatsAppMessageData,
  FindContactsRequest,
  FindChatsRequest,
  FindMessagesRequest
} from './evolution-api';

const prisma = new PrismaClient();

export interface SyncStats {
  contacts: {
    total: number;
    created: number;
    updated: number;
    progress?: number; // Porcentagem de progresso (0-100)
  };
  chats: {
    total: number;
    created: number;
    updated: number;
    progress?: number;
  };
  messages: {
    total: number;
    created: number;
    updated: number;
    progress?: number;
  };
  errors: string[];
}

export interface SyncOptions {
  batchSize?: number;
  includeGroups?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  onProgress?: (stats: Partial<SyncStats>) => void;
}

export class WhatsAppSyncService {
  private evolutionApi: EvolutionApiClient;

  constructor(evolutionApiBaseUrl: string, evolutionApiKey?: string) {
    this.evolutionApi = new EvolutionApiClient({
      baseUrl: evolutionApiBaseUrl,
      apiKey: evolutionApiKey,
    });
  }

  /**
   * SYNC COMPLETO - Executar todas as fases de sincronização
   */
  async fullSync(instanceId: string, options: SyncOptions = {}): Promise<SyncStats> {
    const instance = await this.getInstanceById(instanceId);
    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    if (instance.status !== 'CONNECTED') {
      throw new Error('Instância deve estar conectada para fazer sync');
    }

    console.log(`🚀 Iniciando sync completo para instância: ${instance.instanceName}`);
    
    const stats: SyncStats = {
      contacts: { total: 0, created: 0, updated: 0 },
      chats: { total: 0, created: 0, updated: 0 },
      messages: { total: 0, created: 0, updated: 0 },
      errors: []
    };

    try {
      // Fase 1: Sync de Contatos
      console.log('📞 Fase 1: Sincronizando contatos...');
      const contactStats = await this.syncContacts(instance, options);
      stats.contacts = contactStats;
      options.onProgress?.({ contacts: contactStats });

      // Fase 2: Sync de Chats
      console.log('💬 Fase 2: Sincronizando chats...');
      const chatStats = await this.syncChats(instance, options);
      stats.chats = chatStats;
      options.onProgress?.({ chats: chatStats });

      // Fase 3: Sync de Mensagens
      console.log('📨 Fase 3: Sincronizando mensagens...');
      const messageStats = await this.syncMessages(instance, options);
      stats.messages = messageStats;
      options.onProgress?.({ messages: messageStats });

      console.log('✅ Sync completo finalizado!', stats);
      return stats;

    } catch (error) {
      console.error('❌ Erro durante sync completo:', error);
      stats.errors.push(error instanceof Error ? error.message : 'Erro desconhecido');
      throw error;
    }
  }

  /**
   * FASE 1: Sync de Contatos
   */
  async syncContacts(instance: any, options: SyncOptions = {}) {
    const stats = { total: 0, created: 0, updated: 0 };
    const batchSize = options.batchSize || 50; // Reduzir batch size
    let processedContacts = new Set<string>(); // Evitar duplicatas

    try {
      console.log('📞 Buscando todos os contatos de uma vez...');
      
      // Primeiro, buscar TODOS os contatos de uma vez (sem paginação)
      const request: FindContactsRequest = {
        where: {},
        limit: 5000 // Pegar um número alto para ter todos
      };

      const allContacts = await this.evolutionApi.findContacts(instance.instanceName, request);
      
      console.log(`📞 Total de contatos encontrados: ${allContacts.length}`);
      
      if (allContacts.length === 0) {
        console.log('📞 Nenhum contato encontrado para sincronizar');
        return stats;
      }

      // Processar contatos um por um ou em pequenos lotes
      for (let i = 0; i < allContacts.length; i++) {
        const contactData = allContacts[i];
        
        try {
          // Evitar duplicatas
          if (processedContacts.has(contactData.remoteJid)) {
            continue;
          }
          
          // Filtrar grupos se necessário
          const isGroup = contactData.remoteJid.endsWith('@g.us');
          if (!options.includeGroups && isGroup) {
            continue;
          }

          await this.upsertContact(instance.id, contactData);
          processedContacts.add(contactData.remoteJid);
          
          stats.total++;
          stats.updated++; // Simplificado por enquanto
          
          // Callback de progresso
          if (options.onProgress) {
            options.onProgress({
              contacts: {
                total: stats.total,
                created: stats.created,
                updated: stats.updated,
                progress: Math.round((i + 1) / allContacts.length * 100)
              }
            });
          }

          // Log a cada 50 contatos processados
          if (stats.total % 50 === 0) {
            console.log(`📞 Processados ${stats.total}/${allContacts.length} contatos (${Math.round((i + 1) / allContacts.length * 100)}%)`);
          }

          // Pausa pequena para não sobrecarregar
          if (stats.total % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.error(`Erro ao processar contato ${contactData.remoteJid}:`, error);
        }
      }

    } catch (error) {
      console.error('Erro ao buscar contatos:', error);
      throw error;
    }

    console.log(`📞 Contatos sincronizados: ${stats.total} únicos de ${processedContacts.size} processados`);
    return stats;
  }

  /**
   * FASE 2: Sync de Chats
   */
  async syncChats(instance: any, options: SyncOptions = {}) {
    const stats = { total: 0, created: 0, updated: 0 };

    try {
      console.log('💬 Buscando todos os chats...');
      
      const request: FindChatsRequest = {
        where: {},
        limit: 1000 // Geralmente não há muitos chats
      };

      const chats = await this.evolutionApi.findChats(instance.instanceName, request);
      
      console.log(`💬 Processando ${chats.length} chats...`);
      
      for (const chatData of chats) {
        try {
          // Filtrar grupos se necessário
          if (!options.includeGroups && chatData.isGroup) {
            continue;
          }

          await this.upsertChat(instance.id, chatData);
          stats.total++;
          stats.updated++; // Simplificado
        } catch (error) {
          console.error(`Erro ao processar chat ${chatData.remoteJid}:`, error);
        }
      }

    } catch (error) {
      console.error('Erro ao buscar chats:', error);
    }

    console.log(`💬 Chats sincronizados: ${stats.total}`);
    return stats;
  }

  /**
   * FASE 3: Sync de Mensagens - MELHORADO para buscar por chat específico
   */
  async syncMessages(instance: any, options: SyncOptions = {}) {
    const stats = { total: 0, created: 0, updated: 0 };

    try {
      console.log(`📨 Sincronizando mensagens por chat específico...`);

      // CORREÇÃO: Buscar mensagens por chat específico para contornar limitação de 50 mensagens globais
      const chats = await prisma.whatsAppChat.findMany({
        where: { 
          instanceId: instance.id,
          ...(options.includeGroups ? {} : { remoteJid: { not: { endsWith: '@g.us' } } })
        },
        select: { id: true, remoteJid: true, name: true },
        orderBy: { updatedAt: 'desc' }
      });

      console.log(`📊 Processando ${chats.length} chats para buscar mensagens...`);

      let totalMessages = 0;

      for (const chat of chats) {
        try {
          console.log(`  💬 Processando: ${chat.name || chat.remoteJid.split('@')[0]}`);

          // Buscar mensagens deste chat específico
          const messagesResponse = await this.evolutionApi.findMessages(instance.instanceName, {
            where: {
              key: {
                remoteJid: chat.remoteJid
              }
            },
            limit: 1000 // Mesmo limitado a 50, pedimos mais
          });

          // A resposta já vem filtrada pela implementação do EvolutionApiClient
          const messages = messagesResponse || [];
          
          console.log(`    📨 ${messages.length} mensagens encontradas`);
          totalMessages += messages.length;

          // Aplicar filtros de data se especificados
          let filteredMessages = messages;
          if (options.dateFrom || options.dateTo) {
            filteredMessages = messages.filter((msg: any) => {
              const msgDate = new Date(msg.messageTimestamp * 1000);
              if (options.dateFrom && msgDate < options.dateFrom) return false;
              if (options.dateTo && msgDate > options.dateTo) return false;
              return true;
            });
          }

          // Processar mensagens deste chat
          for (const messageData of filteredMessages) {
            try {
              await this.upsertMessage(instance.id, messageData);
              stats.total++;
              stats.updated++; // Simplificado
              
              // Callback de progresso a cada 20 mensagens
              if (options.onProgress && stats.total % 20 === 0) {
                options.onProgress({
                  messages: {
                    total: stats.total,
                    created: stats.created,
                    updated: stats.updated,
                    progress: Math.round((stats.total / totalMessages) * 100)
                  }
                });
              }
            } catch (error) {
              console.error(`Erro ao processar mensagem ${messageData?.key?.id || 'ID desconhecido'}:`, error instanceof Error ? error.message : error);
            }
          }

        } catch (error) {
          console.error(`  ❌ Erro ao processar chat ${chat.remoteJid}:`, error);
        }

        // Pausa pequena entre chats
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`📨 Total de mensagens encontradas: ${totalMessages}`);

    } catch (error) {
      console.error('Erro ao sincronizar mensagens:', error);
    }

    console.log(`📨 Mensagens sincronizadas: ${stats.total}`);
    return stats;
  }

  /**
   * Sync de mensagens para um chat específico
   */
  async syncMessagesForChat(instance: any, remoteJid: string, options: SyncOptions = {}) {
    const batchSize = options.batchSize || 50;
    const stats = { total: 0, created: 0, updated: 0 };

    try {
      // CORREÇÃO: Usar where vazio pois filtro por remoteJid não funciona na Evolution API
      const request: FindMessagesRequest = {
        where: {}, // Where vazio funciona!
        limit: Math.max(batchSize, 1000) // Buscar mais para filtrar depois
      };

      console.log(`📨 Buscando mensagens para chat: ${remoteJid}`);
      const messagesResponse = await this.evolutionApi.findMessages(instance.instanceName, request);
      
      // A Evolution API retorna um objeto com propriedade 'data' contendo as mensagens
      let allMessages: any[] = [];
      
      if (messagesResponse && typeof messagesResponse === 'object') {
        if (Array.isArray(messagesResponse)) {
          // Se vier diretamente como array
          allMessages = messagesResponse;
        } else if ((messagesResponse as any).data && Array.isArray((messagesResponse as any).data)) {
          // Se vier dentro de uma propriedade 'data' (caso mais comum)
          allMessages = (messagesResponse as any).data;
        } else {
          console.log(`⚠️ Estrutura inesperada da resposta para ${remoteJid}:`, messagesResponse);
          return stats;
        }
      } else {
        console.log(`❌ Resposta inválida para ${remoteJid}:`, messagesResponse);
        return stats;
      }

      // Filtrar mensagens para o chat específico
      const messages = allMessages.filter((msg: any) => 
        msg.key?.remoteJid === remoteJid
      );

      console.log(`📨 Total de mensagens recebidas: ${allMessages.length}, filtradas para ${remoteJid}: ${messages.length}`);
      
      // Aplicar filtros de data se especificados
      let filteredMessages = messages;
      if (options.dateFrom || options.dateTo) {
        filteredMessages = messages.filter((msg: any) => {
          const msgDate = new Date(msg.messageTimestamp * 1000);
          if (options.dateFrom && msgDate < options.dateFrom) return false;
          if (options.dateTo && msgDate > options.dateTo) return false;
          return true;
        });
      }

      // Limitar ao batchSize original
      const finalMessages = filteredMessages
        .sort((a: any, b: any) => b.messageTimestamp - a.messageTimestamp)
        .slice(0, batchSize);

      console.log(`📨 Processando ${finalMessages.length} mensagens para ${remoteJid}`);
      
      for (const messageData of finalMessages) {
        try {
          await this.upsertMessage(instance.id, messageData);
          stats.total++;
          stats.updated++; // Simplificado
        } catch (error) {
          console.error(`Erro ao processar mensagem ${messageData.key?.id}:`, error);
        }
      }

    } catch (error) {
      console.error(`Erro ao buscar mensagens do chat ${remoteJid}:`, error);
    }

    return stats;
  }

  /**
   * Upsert de contato no banco
   */
  private async upsertContact(instanceId: string, contactData: WhatsAppContactData) {
    const phone = this.extractPhoneFromJid(contactData.remoteJid);
    const isGroup = contactData.remoteJid.endsWith('@g.us');

    const data = {
      instanceId,
      jid: contactData.remoteJid,
      phone,
      pushName: contactData.pushName,
      profileName: contactData.profileName,
      profilePicUrl: contactData.profilePicUrl,
      isMyContact: contactData.isMyContact || false,
      isWABusiness: contactData.isWABusiness || false,
      businessName: contactData.businessName,
      verifiedName: contactData.verifiedName,
      isGroup,
      groupMetadata: isGroup ? JSON.stringify(contactData) : null,
      updatedAt: new Date()
    };

    const contact = await prisma.whatsAppContact.upsert({
      where: {
        jid_instanceId: {
          jid: contactData.remoteJid,
          instanceId
        }
      },
      update: data,
      create: data
    });

    // Processar labels se existirem
    if (contactData.labels && contactData.labels.length > 0) {
      await this.syncContactLabels(contact.id, instanceId, contactData.labels);
    }

    return contact;
  }

  /**
   * Upsert de chat no banco
   */
  private async upsertChat(instanceId: string, chatData: WhatsAppChatData) {
    // Primeiro, garantir que o contato existe (criar se necessário)
    let contact = await prisma.whatsAppContact.findUnique({
      where: {
        jid_instanceId: {
          jid: chatData.remoteJid,
          instanceId
        }
      }
    });

    // Se o contato não existir, criar automaticamente a partir dos dados do chat
    if (!contact) {
      console.log(`📞 Criando contato automaticamente para chat: ${chatData.remoteJid}`);
      
      const phone = this.extractPhoneFromJid(chatData.remoteJid);
      const isGroup = chatData.remoteJid.endsWith('@g.us');
      
      const contactData = {
        instanceId,
        jid: chatData.remoteJid,
        phone,
        pushName: chatData.name || (isGroup ? 'Grupo' : null),
        profileName: chatData.name || null,
        profilePicUrl: null, // Será atualizado depois se disponível
        isMyContact: false,
        isWABusiness: false,
        businessName: null,
        verifiedName: null,
        isGroup,
        groupMetadata: isGroup ? JSON.stringify(chatData) : null,
        updatedAt: new Date()
      };

      contact = await prisma.whatsAppContact.create({
        data: contactData
      });
      
      console.log(`✅ Contato criado automaticamente: ${contact.jid} (${contact.pushName || 'Sem nome'})`);
    }

    const data = {
      instanceId,
      contactId: contact.id,
      remoteJid: chatData.remoteJid,
      name: chatData.name,
      isGroup: chatData.isGroup,
      unreadCount: chatData.unreadCount || 0,
      lastMessageTime: chatData.lastMessage ? 
        new Date(chatData.lastMessage.messageTimestamp * 1000) : null,
      lastMessagePreview: chatData.lastMessage?.message,
      isArchived: chatData.archived || false,
      isMuted: chatData.muted || false,
      isPinned: chatData.pinned || false,
      metadata: chatData.metadata ? JSON.stringify(chatData.metadata) : null,
      updatedAt: new Date()
    };

    return await prisma.whatsAppChat.upsert({
      where: {
        remoteJid_instanceId: {
          remoteJid: chatData.remoteJid,
          instanceId
        }
      },
      update: data,
      create: data
    });
  }

  /**
   * Upsert de mensagem no banco
   */
  private async upsertMessage(instanceId: string, messageData: WhatsAppMessageData) {
    // Garantir que o chat existe (e consequentemente o contato também)
    let chat = await prisma.whatsAppChat.findUnique({
      where: {
        remoteJid_instanceId: {
          remoteJid: messageData.key.remoteJid,
          instanceId
        }
      }
    });

    // Se o chat não existir, criar automaticamente
    if (!chat) {
      console.log(`💬 Criando chat automaticamente para mensagem: ${messageData.key.remoteJid}`);
      
      const isGroup = messageData.key.remoteJid.endsWith('@g.us');
      const chatName = (messageData as any).pushName || (isGroup ? 'Grupo' : 'Chat');
      
      // Criar dados temporários do chat
      const tempChatData: Partial<WhatsAppChatData> = {
        remoteJid: messageData.key.remoteJid,
        name: chatName,
        isGroup,
        unreadCount: 0,
        archived: false,
        muted: false,
        pinned: false,
        lastMessage: {
          messageTimestamp: messageData.messageTimestamp,
          message: this.extractMessageContent(messageData.message) || ''
        }
      };
      
      // Usar o método upsertChat que já cria o contato automaticamente
      chat = await this.upsertChat(instanceId, tempChatData as WhatsAppChatData);
      console.log(`✅ Chat criado automaticamente: ${chat.remoteJid}`);
    }

    const content = this.extractMessageContent(messageData.message);
    const mediaInfo = this.extractMediaInfo(messageData.message);

    const data = {
      instanceId,
      chatId: chat.id,
      messageId: messageData.key.id,
      remoteJid: messageData.key.remoteJid,
      fromJid: messageData.key.fromMe ? null : messageData.key.remoteJid,
      toJid: messageData.key.fromMe ? messageData.key.remoteJid : null,
      messageType: messageData.messageType,
      content: content,
      caption: mediaInfo.caption,
      mediaUrl: mediaInfo.url,
      fileName: mediaInfo.fileName,
      fileSize: mediaInfo.fileSize,
      mimeType: mediaInfo.mimeType,
      fromMe: messageData.key.fromMe,
      status: messageData.status || 'DELIVERED',
      timestamp: new Date(messageData.messageTimestamp * 1000),
      quotedMessageId: messageData.quoted?.key.id,
      metadata: JSON.stringify(messageData),
      updatedAt: new Date()
    };

    return await prisma.whatsAppMessage.upsert({
      where: {
        messageId_instanceId: {
          messageId: messageData.key.id,
          instanceId
        }
      },
      update: data,
      create: data
    });
  }

  /**
   * Sync de labels dos contatos
   */
  private async syncContactLabels(contactId: string, instanceId: string, labels: any[]) {
    for (const labelData of labels) {
      try {
        // Criar/atualizar label
        const label = await prisma.whatsAppLabel.upsert({
          where: {
            labelId_instanceId: {
              labelId: labelData.id,
              instanceId
            }
          },
          update: {
            name: labelData.name,
            color: labelData.color,
            predefined: labelData.predefined || false
          },
          create: {
            instanceId,
            labelId: labelData.id,
            name: labelData.name,
            color: labelData.color,
            predefined: labelData.predefined || false
          }
        });

        // Associar label ao contato
        await prisma.whatsAppContactLabel.upsert({
          where: {
            contactId_labelId: {
              contactId,
              labelId: label.id
            }
          },
          update: {},
          create: {
            contactId,
            labelId: label.id
          }
        });

      } catch (error) {
        console.error(`Erro ao processar label ${labelData.id}:`, error);
      }
    }
  }

  // Métodos utilitários
  private extractPhoneFromJid(jid: string): string | null {
    const match = jid.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  private extractMessageContent(message: any): string | null {
    if (!message) return null;
    
    // Mensagem simples
    if (message.conversation) return message.conversation;
    
    // Mensagem de texto estendida
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    
    // Mensagens com mídia e caption
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    
    // Mensagens efêmeras
    if (message.ephemeralMessage?.message) {
      const ephemeralMsg = message.ephemeralMessage.message;
      if (ephemeralMsg.conversation) return ephemeralMsg.conversation;
      if (ephemeralMsg.extendedTextMessage?.text) return ephemeralMsg.extendedTextMessage.text;
      if (ephemeralMsg.imageMessage?.caption) return ephemeralMsg.imageMessage.caption;
      if (ephemeralMsg.videoMessage?.caption) return ephemeralMsg.videoMessage.caption;
      if (ephemeralMsg.documentMessage?.caption) return ephemeralMsg.documentMessage.caption;
    }
    
    // Mensagens de reação
    if (message.reactionMessage?.text) return `Reação: ${message.reactionMessage.text}`;
    
    // Mensagens de áudio (sem caption, mas podemos indicar o tipo)
    if (message.audioMessage) return '[Mensagem de áudio]';
    if (message.voiceMessage) return '[Mensagem de voz]';
    
    // Mensagens de sticker
    if (message.stickerMessage) return '[Sticker]';
    
    // Mensagens de localização
    if (message.locationMessage) return '[Localização compartilhada]';
    
    // Mensagens de contato
    if (message.contactMessage) return `[Contato: ${message.contactMessage.displayName || 'Sem nome'}]`;
    
    // Mensagens do tipo view once
    if (message.viewOnceMessage?.message) {
      const viewOnceMsg = message.viewOnceMessage.message;
      if (viewOnceMsg.imageMessage?.caption) return `[Visualizar uma vez] ${viewOnceMsg.imageMessage.caption}`;
      if (viewOnceMsg.videoMessage?.caption) return `[Visualizar uma vez] ${viewOnceMsg.videoMessage.caption}`;
      return '[Mensagem para visualizar uma vez]';
    }
    
    // Fallback: serializar a mensagem inteira (truncado)
    const serialized = JSON.stringify(message);
    return serialized.length > 200 ? serialized.substring(0, 200) + '...' : serialized;
  }

  private extractMediaInfo(message: any) {
    const info = {
      caption: null as string | null,
      url: null as string | null,
      fileName: null as string | null,
      fileSize: null as number | null,
      mimeType: null as string | null
    };

    if (!message) return info;

    // Diferentes tipos de mídia
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
    
    for (const type of mediaTypes) {
      if (message[type]) {
        const media = message[type];
        info.caption = media.caption || null;
        info.url = media.url || null;
        info.fileName = media.fileName || null;
        
        // Converter fileSize para número - verificar ambos fileLength e fileSize
        const sizeValue = media.fileLength || media.fileSize;
        if (sizeValue !== undefined && sizeValue !== null) {
          if (typeof sizeValue === 'string') {
            const parsed = parseInt(sizeValue, 10);
            info.fileSize = isNaN(parsed) ? null : parsed;
          } else if (typeof sizeValue === 'number') {
            info.fileSize = sizeValue;
          } else {
            info.fileSize = null;
          }
        }
        
        info.mimeType = media.mimetype || null;
        break;
      }
    }

    return info;
  }

  private async getInstanceById(instanceId: string) {
    return await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId }
    });
  }
} 