import { PrismaClient } from '@prisma/client';
import { EvolutionApiClient, CreateInstanceRequest, WebhookConfig } from './evolution-api';

const prisma = new PrismaClient();

export interface CreateWhatsAppInstanceData {
  userId: string;
  instanceName?: string;
  sessionToken?: string;
  webhookUrl?: string;
  autoReconnect?: boolean;
}

export interface UpdateInstanceStatusData {
  instanceId: string;
  status: string;
  connectedNumber?: string;
  qrCode?: string;
  sessionToken?: string;
}

export class WhatsAppService {
  private evolutionApi: EvolutionApiClient;

  constructor(evolutionApiBaseUrl: string, evolutionApiKey?: string) {
    this.evolutionApi = new EvolutionApiClient({
      baseUrl: evolutionApiBaseUrl,
      apiKey: evolutionApiKey,
    });
  }

  /**
   * Criar uma nova instância do WhatsApp
   */
  async createInstance(data: CreateWhatsAppInstanceData) {
    try {
      const instanceName = data.instanceName || `instance_${Date.now()}`;
      const webhookUrl = data.webhookUrl || `${process.env.NEXTAUTH_URL}/api/ai-agent/webhook`;

      console.log(`[CREATE] Iniciando criação da instância: ${instanceName}`);

      // Criar no banco primeiro
      const dbInstance = await prisma.whatsAppInstance.create({
        data: {
          userId: data.userId,
          instanceName,
          status: 'CREATING',
          webhookUrl,
          autoReconnect: data.autoReconnect ?? true,
        },
      });

      // Preparar dados para Evolution API
      const evolutionRequest: CreateInstanceRequest = {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        token: data.sessionToken,
        qrcode: true,
        webhook: {
          url: webhookUrl,
          events: [
            'APPLICATION_STARTUP',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'CONTACTS_UPSERT',
            'CHATS_UPSERT',
            'CHATS_UPDATE'
          ],
          byEvents: true,
          base64: false,
        },
        reject_call: false,
        groups_ignore: false,
        always_online: false,
        read_messages: false,
        read_status: false,
        websocket_enabled: false,
      };

      console.log(`[CREATE] Criando instância ${instanceName} com webhook: ${webhookUrl}`);

      const evolutionResponse = await this.evolutionApi.createInstance(evolutionRequest);

      // Atualizar com dados da Evolution API
      const updateData: any = {
        instanceId: evolutionResponse.instance.instanceName,
        status: 'CONNECTING',
        qrCode: evolutionResponse.qrcode?.base64 || evolutionResponse.qrcode?.code,
      };

      // Tentar configurar webhook explicitamente
      let webhookConfigured = false;
      let webhookError = null;
      
      try {
        await this.setupWebhook(instanceName, webhookUrl);
        console.log(`[CREATE] Webhook configurado com sucesso para ${instanceName}`);
        webhookConfigured = true;
        updateData.webhookEnabled = true;
      } catch (webhookErr) {
        console.warn(`[CREATE] Erro ao configurar webhook para ${instanceName}:`, webhookErr);
        webhookConfigured = false;
        webhookError = webhookErr instanceof Error ? webhookErr.message : 'Erro desconhecido';
        updateData.webhookEnabled = false;
      }

      await prisma.whatsAppInstance.update({
        where: { id: dbInstance.id },
        data: updateData,
      });

      return {
        ...dbInstance,
        instanceId: evolutionResponse.instance.instanceName,
        qrCode: evolutionResponse.qrcode?.base64 || evolutionResponse.qrcode?.code,
        pairingCode: (evolutionResponse as any).pairingCode,
        status: 'CONNECTING',
        webhookUrl,
        webhookConfigured,
        webhookError,
      };
    } catch (error) {
      console.error('Erro ao criar instância:', error);
      throw error;
    }
  }

  /**
   * Obter QR Code para uma instância
   */
  async getQRCode(instanceId: string, userId?: string) {
    try {
      console.log(`[QR_CODE] Iniciando obtenção de QR Code para instanceId: ${instanceId}, userId: ${userId}`);
      
      const instance = await this.getInstanceByIdOrName(instanceId, userId);
      
      if (!instance) {
        console.error(`[QR_CODE] Instância não encontrada: ${instanceId}`);
        throw new Error('Instância não encontrada');
      }

      console.log(`[QR_CODE] Instância encontrada: ${instance.instanceName}, status no banco: ${instance.status}`);

      // PRIMEIRO: Verificar o status real na Evolution API
      try {
        console.log(`[QR_CODE] Verificando status real na Evolution API...`);
        const connectionState = await this.evolutionApi.getConnectionState(instance.instanceName);
        const realStatus = this.mapEvolutionStatusToDb(connectionState.instance.state);
        
        console.log(`[QR_CODE] Status real na Evolution API: ${connectionState.instance.state} -> ${realStatus}`);
        
        // Se já está conectado, não precisa de QR Code
        if (realStatus === 'CONNECTED') {
          console.log(`[QR_CODE] Instância já está conectada! Atualizando status no banco...`);
          
          // Atualizar status no banco
          await prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: {
              status: 'CONNECTED',
              lastConnectedAt: new Date(),
              reconnectAttempts: 0,
            },
          });
          
          throw new Error('Instância já está conectada! Não é necessário QR Code.');
        }
        
        // Se não está conectado, atualizar status no banco
        if (realStatus !== instance.status) {
          console.log(`[QR_CODE] Atualizando status no banco: ${instance.status} -> ${realStatus}`);
          await prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: { status: realStatus },
          });
        }
      } catch (statusError) {
        console.warn(`[QR_CODE] Erro ao verificar status (continuando):`, statusError);
      }

      // SEGUNDO: Tentar obter QR Code
      console.log(`[QR_CODE] Solicitando QR Code da Evolution API...`);
      const qrResponse = await this.evolutionApi.getQRCode(instance.instanceName);
      
      console.log(`[QR_CODE] Resposta da Evolution API:`, JSON.stringify(qrResponse, null, 2));
      
      // A nova API retorna 'code' em vez de 'base64'
      // Vamos usar o 'code' diretamente ou converter se necessário
      let qrCodeBase64 = qrResponse.base64 || qrResponse.code;
      
      console.log(`[QR_CODE] QR Code extraído: ${qrCodeBase64 ? 'Presente' : 'Ausente'}`);
      
      // Se não tem QR Code, pode ser que a instância precise ser reiniciada
      if (!qrCodeBase64) {
        console.log(`[QR_CODE] QR Code não disponível. Tentando reiniciar instância...`);
        
        try {
          // Tentar fazer logout primeiro
          await this.evolutionApi.logoutInstance(instance.instanceName);
          console.log(`[QR_CODE] Logout realizado com sucesso`);
          
          // Aguardar um pouco
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Tentar obter QR Code novamente
          const newQrResponse = await this.evolutionApi.getQRCode(instance.instanceName);
          qrCodeBase64 = newQrResponse.base64 || newQrResponse.code;
          
          console.log(`[QR_CODE] Novo QR Code após logout: ${qrCodeBase64 ? 'Presente' : 'Ausente'}`);
        } catch (logoutError) {
          console.warn(`[QR_CODE] Erro ao fazer logout:`, logoutError);
        }
      }
      
      // Se ainda não tem QR Code, retornar erro específico
      if (!qrCodeBase64) {
        throw new Error('QR Code não disponível. A instância pode já estar conectada ou ter um problema. Tente verificar o status primeiro.');
      }
      
      // Se o code não é base64, pode ser que seja o QR code em texto
      // Neste caso, vamos usar como está
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:image')) {
        // Se não é uma URL de dados, assumir que é base64 puro
        if (!qrCodeBase64.includes('data:image')) {
          qrCodeBase64 = qrResponse.code;
        }
      }
      
      console.log(`[QR_CODE] QR Code processado: ${qrCodeBase64 ? 'Presente' : 'Ausente'}`);
      
      // Atualizar QR Code no banco
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          qrCode: qrCodeBase64,
          status: 'CONNECTING',
        },
      });

      console.log(`[QR_CODE] QR Code salvo no banco de dados`);

      return {
        qrCode: qrCodeBase64,
        pairingCode: qrResponse.pairingCode,
        instanceName: instance.instanceName,
      };
    } catch (error) {
      console.error('[QR_CODE] Erro ao obter QR Code:', error);
      throw error;
    }
  }

  /**
   * Verificar e atualizar status da conexão
   */
  async checkConnectionStatus(instanceId: string, userId?: string) {
    try {
      const instance = await this.getInstanceByIdOrName(instanceId, userId);
      
      if (!instance) {
        throw new Error('Instância não encontrada');
      }

      console.log(`[CHECK_STATUS] Verificando status para instância: ${instance.instanceName}`);

      // Verificar se a instância existe na Evolution API
      let instanceExists = false;
      let connectionState: any = null;
      
      try {
        connectionState = await this.evolutionApi.getConnectionState(instance.instanceName);
        instanceExists = true;
        console.log(`[CHECK_STATUS] Instância existe na Evolution API: ${connectionState.instance.state}`);
      } catch (error: any) {
        if (error.message.includes('404') || error.message.includes('Request failed with status code 404')) {
          console.log(`[CHECK_STATUS] Instância não existe na Evolution API, será recriada`);
          instanceExists = false;
        } else {
          throw error; // Re-throw se for outro tipo de erro
        }
      }

      if (!instanceExists) {
        // Recriar a instância na Evolution API
        console.log(`[CHECK_STATUS] Recriando instância na Evolution API...`);
        
        const createData = {
          instanceName: instance.instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook_by_events: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          reject_call: false,
          groups_ignore: false,
          always_online: false,
          read_messages: false,
          read_status: false,
          websocket_enabled: false,
        };

        const createResponse = await this.evolutionApi.createInstance(createData);
        console.log(`[CHECK_STATUS] Instância recriada:`, createResponse);

        // Aguardar um pouco para processar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verificar novo status
        connectionState = await this.evolutionApi.getConnectionState(instance.instanceName);
      }

      // Garantir que connectionState não é null
      if (!connectionState) {
        throw new Error('Não foi possível obter o status da conexão');
      }
      
      console.log(`[CHECK_STATUS] Resposta completa da Evolution API:`, JSON.stringify(connectionState, null, 2));
      console.log(`[CHECK_STATUS] Estado bruto da Evolution API: "${connectionState.instance.state}"`);
      
      const newStatus = this.mapEvolutionStatusToDb(connectionState.instance.state);
      
      console.log(`[CHECK_STATUS] Mapeamento: "${connectionState.instance.state}" -> "${newStatus}"`);
      console.log(`[CHECK_STATUS] Status atual no banco: "${instance.status}"`);
      
      // Verificar se está "connecting" por muito tempo (mais de 5 minutos) - apenas se a instância já existia
      if (instanceExists && newStatus === 'CONNECTING' && instance.updatedAt) {
        const timeDiff = Date.now() - new Date(instance.updatedAt).getTime();
        const minutesStuck = Math.floor(timeDiff / (1000 * 60));
        
        console.log(`[CHECK_STATUS] Instância em CONNECTING há ${minutesStuck} minutos`);
        
        if (minutesStuck > 5) {
          console.log(`[CHECK_STATUS] Instância travada em CONNECTING. Tentando restart...`);
          
          try {
            // Tentar fazer restart da instância
            console.log(`[CHECK_STATUS] Fazendo restart da instância...`);
            const restartResponse = await this.evolutionApi.restartInstance(instance.instanceName);
            console.log(`[CHECK_STATUS] Restart realizado:`, restartResponse);
            
            // Aguardar um pouco para o restart processar
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verificar status novamente após restart
            const newConnectionState = await this.evolutionApi.getConnectionState(instance.instanceName);
            const finalStatus = this.mapEvolutionStatusToDb(newConnectionState.instance.state);
            
            console.log(`[CHECK_STATUS] Status após restart: "${newConnectionState.instance.state}" -> "${finalStatus}"`);
            
            // Atualizar com o novo status
            const updateData: any = { 
              status: finalStatus,
              updatedAt: new Date() // Reset do timer
            };
            
            if (finalStatus === 'CONNECTED') {
              updateData.lastConnectedAt = new Date();
              updateData.reconnectAttempts = 0;
              console.log(`[CHECK_STATUS] Instância conectada após restart!`);
            } else if (finalStatus === 'DISCONNECTED') {
              updateData.lastDisconnectedAt = new Date();
              console.log(`[CHECK_STATUS] Instância desconectada após restart. Pode gerar novo QR Code.`);
            }

            await prisma.whatsAppInstance.update({
              where: { id: instance.id },
              data: updateData,
            });

            return {
              instanceId: instance.id,
              instanceName: instance.instanceName,
              status: finalStatus,
              evolutionStatus: newConnectionState.instance.state,
              restarted: true,
            };
          } catch (restartError) {
            console.warn(`[CHECK_STATUS] Erro ao fazer restart:`, restartError);
            // Continuar com o status original se o restart falhar
          }
        }
      }
      
      // Atualizar status no banco (fluxo normal)
      const updateData: any = { 
        status: newStatus,
        updatedAt: new Date() // Sempre atualizar timestamp
      };
      
      if (newStatus === 'CONNECTED') {
        updateData.lastConnectedAt = new Date();
        updateData.reconnectAttempts = 0;
        console.log(`[CHECK_STATUS] Instância conectada! Atualizando lastConnectedAt`);
      } else if (newStatus === 'DISCONNECTED') {
        updateData.lastDisconnectedAt = new Date();
        console.log(`[CHECK_STATUS] Instância desconectada! Atualizando lastDisconnectedAt`);
      }

      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: updateData,
      });

      console.log(`[CHECK_STATUS] Status atualizado no banco: ${instance.status} -> ${newStatus}`);

      return {
        instanceId: instance.id,
        instanceName: instance.instanceName,
        status: newStatus,
        evolutionStatus: connectionState.instance.state,
        wasRecreated: !instanceExists
      };
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      throw error;
    }
  }

  /**
   * Enviar mensagem de texto
   */
  async sendTextMessage(instanceId: string, number: string, text: string, userId?: string) {
    try {
      const instance = await this.getInstanceByIdOrName(instanceId, userId);
      
      if (!instance) {
        throw new Error('Instância não encontrada');
      }

      if (instance.status !== 'CONNECTED') {
        throw new Error('Instância não está conectada');
      }

      // Formatar número corretamente
      let formattedNumber = number;
      
      // Se já tem @s.whatsapp.net, remover para usar apenas números
      if (number.includes('@')) {
        formattedNumber = number.replace('@s.whatsapp.net', '');
      }
      
      // Remover caracteres especiais e garantir que é apenas números
      formattedNumber = formattedNumber.replace(/\D/g, '');
      
      // Se não começar com código do país, adicionar 55 (Brasil)
      if (!formattedNumber.startsWith('55') && formattedNumber.length <= 11) {
        formattedNumber = '55' + formattedNumber;
      }

      console.log(`[SEND] Enviando mensagem para: ${formattedNumber.replace(/\d(?=\d{4})/g, '*')} via instância ${instance.instanceName}`);

      // Verificar se a instância realmente existe na Evolution API
      try {
        const connectionState = await this.evolutionApi.getConnectionState(instance.instanceName);
        
        if (connectionState.instance.state !== 'open') {
          throw new Error(`Instância '${instance.instanceName}' não está conectada na Evolution API (status: ${connectionState.instance.state})`);
        }
      } catch (connectionError) {
        console.error(`[SEND] Erro ao verificar status da instância:`, connectionError);
        throw new Error(`Instância '${instanceId}' não encontrada ou não está conectada`);
      }

      // Enviar através da Evolution API
      const response = await this.evolutionApi.sendTextMessage(instance.instanceName, {
        number: formattedNumber, // Apenas números, sem @s.whatsapp.net
        text: text,
        options: {
          delay: 1000,
          presence: 'composing',
          linkPreview: true
        }
      });
      
      console.log(`[SEND] Mensagem enviada com sucesso. ID: ${response.key?.id}`);

      return response;
    } catch (error) {
      console.error('[SEND] Erro ao enviar mensagem:', error);
      
      // Melhorar mensagens de erro
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          throw new Error(`Instância '${instanceId}' não encontrada ou não está conectada`);
        } else if (error.message.includes('not connected') || error.message.includes('desconectada')) {
          throw new Error(`Instância '${instanceId}' não está conectada ao WhatsApp`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Configurar webhook
   */
  async setupWebhook(instanceName: string, webhookUrl: string) {
    try {
      const webhookConfig = {
        url: webhookUrl,
        events: [
          'APPLICATION_STARTUP',   // Status da aplicação
          'CONNECTION_UPDATE',     // Status da conexão
          'MESSAGES_UPSERT',      // Mensagens novas (chegando ou enviadas)
          'MESSAGES_UPDATE',      // Status (entregue, lido, etc.)
          'MESSAGES_DELETE',      // Mensagens revogadas
          'CONTACTS_UPSERT',      // Contatos criados/atualizados
          'CHATS_UPSERT',         // Chats criados/atualizados
          'CHATS_UPDATE',         // Chats atualizados
        ],
        byEvents: true,
        base64: false,
      };

      console.log(`[WEBHOOK] Configurando webhook para ${instanceName}:`, webhookConfig);

      await this.evolutionApi.setWebhook(instanceName, webhookConfig);

      // Atualizar no banco
      await prisma.whatsAppInstance.updateMany({
        where: { instanceName },
        data: {
          webhookUrl,
          webhookEnabled: true,
        },
      });

      console.log(`[WEBHOOK] Webhook configurado com sucesso para ${instanceName}`);
      return { success: true };
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      throw error;
    }
  }

  /**
   * Listar instâncias do usuário
   */
  async getUserInstances(userId: string) {
    return await prisma.whatsAppInstance.findMany({
      where: { userId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obter detalhes de uma instância
   */
  async getInstanceDetails(instanceId: string, userId?: string) {
    const where = userId
      ? { id: instanceId, userId }
      : { id: instanceId };

    return await prisma.whatsAppInstance.findUnique({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * Reconectar instância usando token salvo
   */
  async reconnectInstance(instanceId: string, userId?: string) {
    try {
      const instance = await this.getInstanceByIdOrName(instanceId, userId);
      
      if (!instance) {
        throw new Error('Instância não encontrada');
      }

      if (!instance.sessionToken) {
        throw new Error('Token de sessão não disponível');
      }

      // Incrementar tentativas de reconexão
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          reconnectAttempts: instance.reconnectAttempts + 1,
          status: 'CONNECTING',
        },
      });

      // Tentar reconectar com token
      const evolutionRequest: CreateInstanceRequest = {
        instanceName: instance.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        token: instance.sessionToken,
        qrcode: false,
        webhook: instance.webhookUrl ? {
          url: instance.webhookUrl,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE', 
            'CONNECTION_UPDATE'
          ],
          byEvents: true,
          base64: false,
        } : undefined,
        reject_call: false,
        groups_ignore: false,
        always_online: false,
        read_messages: false,
        read_status: false,
        websocket_enabled: false,
      };

      await this.evolutionApi.createInstance(evolutionRequest);

      return { success: true, message: 'Reconexão iniciada' };
    } catch (error) {
      console.error('Erro ao reconectar:', error);
      throw error;
    }
  }

  /**
   * Deletar instância
   */
  async deleteInstance(instanceId: string, userId?: string) {
    try {
      const instance = await this.getInstanceByIdOrName(instanceId, userId);
      
      if (!instance) {
        throw new Error('Instância não encontrada');
      }

      // Deletar da Evolution API
      try {
        await this.evolutionApi.deleteInstance(instance.instanceName);
      } catch (error) {
        console.warn('Erro ao deletar da Evolution API (continuando):', error);
      }

      // Deletar do banco (cascade irá deletar mensagens)
      await prisma.whatsAppInstance.delete({
        where: { id: instance.id },
      });

      return { success: true };
    } catch (error) {
      console.error('Erro ao deletar instância:', error);
      throw error;
    }
  }

  /**
   * Processar webhook recebido
   */
  async processWebhook(instanceName: string, webhookData: any) {
    try {
      console.log(`[WEBHOOK] Evento recebido: ${webhookData.event} para instância ${instanceName}`);
      
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { instanceName },
      });

      if (!instance) {
        console.warn(`[WEBHOOK] Instância não encontrada: ${instanceName}`);
        return;
      }

      // Processar diferentes tipos de eventos
      switch (webhookData.event) {
        case 'MESSAGES_UPSERT':
          console.log(`[WEBHOOK] Processando MESSAGES_UPSERT`);
          await this.processMessageUpsert(instance.id, webhookData.data);
          break;
        
        case 'MESSAGES_UPDATE':
          console.log(`[WEBHOOK] Processando MESSAGES_UPDATE`);
          await this.processMessageUpdate(instance.id, webhookData.data);
          break;
        
        case 'MESSAGES_DELETE':
          console.log(`[WEBHOOK] Processando MESSAGES_DELETE`);
          await this.processMessageDelete(instance.id, webhookData.data);
          break;
        
        case 'CONTACTS_UPSERT':
          console.log(`[WEBHOOK] Processando CONTACTS_UPSERT`);
          await this.processContactUpsert(instance.id, webhookData.data);
          break;
        
        case 'CHATS_UPSERT':
          console.log(`[WEBHOOK] Processando CHATS_UPSERT`);
          await this.processChatUpsert(instance.id, webhookData.data);
          break;
        
        case 'CHATS_UPDATE':
          console.log(`[WEBHOOK] Processando CHATS_UPDATE`);
          await this.processChatUpdate(instance.id, webhookData.data);
          break;
        
        case 'CONNECTION_UPDATE':
          console.log(`[WEBHOOK] Processando CONNECTION_UPDATE`);
          await this.processConnectionUpdate(instance.id, webhookData.data);
          break;
        
        default:
          console.log(`[WEBHOOK] Evento não processado: ${webhookData.event}`);
      }
    } catch (error) {
      console.error(`[WEBHOOK] Erro ao processar webhook:`, error);
    }
  }

  // Métodos auxiliares
  private async getInstanceByIdOrName(identifier: string, userId?: string) {
    // Se for chamada da API Externa, buscar sem filtro de userId
    if (userId === 'external-system') {
      return await prisma.whatsAppInstance.findFirst({ 
        where: {
          OR: [
            { id: identifier },
            { instanceName: identifier }
          ]
        }
      });
    }

    // Lógica original para chamadas internas
    const where = userId
      ? { 
          OR: [
            { id: identifier, userId },
            { instanceName: identifier, userId }
          ]
        }
      : { 
          OR: [
            { id: identifier },
            { instanceName: identifier }
          ]
        };

    return await prisma.whatsAppInstance.findFirst({ where });
  }

  private mapEvolutionStatusToDb(evolutionStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'open': 'CONNECTED',
      'connecting': 'CONNECTING',
      'close': 'DISCONNECTED',
      'closed': 'DISCONNECTED',
    };

    return statusMap[evolutionStatus.toLowerCase()] || 'DISCONNECTED';
  }

  private async processMessageUpsert(instanceId: string, messageData: any) {
    console.log(`[WEBHOOK] Processando ${messageData.messages?.length || 0} mensagens para instância ${instanceId}`);
    
    // Implementar processamento de mensagens recebidas
    for (const message of messageData.messages || []) {
      try {
        console.log(`[WEBHOOK] Processando mensagem:`, {
          id: message.key.id,
          remoteJid: message.key.remoteJid,
          fromMe: message.key.fromMe,
          messageType: message.messageType
        });

        // Verificar se é um grupo (pular se for)
        if (message.key.remoteJid?.endsWith('@g.us')) {
          console.log(`[WEBHOOK] Pulando mensagem de grupo: ${message.key.remoteJid}`);
          continue;
        }

        // Extrair conteúdo da mensagem
        const content = this.extractMessageContent(message.message);
        
        // UPSERT idempotente - chave única: (messageId, instanceId)
        const upsertedMessage = await prisma.whatsAppMessage.upsert({
          where: {
            messageId_instanceId: {
              messageId: message.key.id,
              instanceId: instanceId,
            },
          },
          update: {
            // Atualizar apenas campos que podem mudar
            status: message.key.fromMe ? 'SENT' : 'RECEIVED',
            content: content, // Pode ser atualizado se a mensagem foi editada
          },
          create: {
            instanceId,
            messageId: message.key.id,
            remoteJid: message.key.remoteJid,
            messageType: message.messageType || 'text',
            content: content,
            fromMe: message.key.fromMe,
            status: message.key.fromMe ? 'SENT' : 'RECEIVED',
            timestamp: new Date(message.messageTimestamp * 1000),
          },
        });

        // Garantir que o chat existe e atualizar (também idempotente)
        await this.ensureChatExists(instanceId, message.key.remoteJid, message);
        
        console.log(`[WEBHOOK] Mensagem processada (upsert): ${message.key.id} - ${upsertedMessage.id}`);
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao processar mensagem ${message.key.id}:`, error);
      }
    }
  }

  /**
   * Extrair conteúdo da mensagem baseado no tipo
   */
  private extractMessageContent(messageContent: any): string {
    if (!messageContent) return '';

    // Mensagem de texto simples
    if (messageContent.conversation) {
      return messageContent.conversation;
    }

    // Mensagem de texto estendida
    if (messageContent.extendedTextMessage?.text) {
      return messageContent.extendedTextMessage.text;
    }

    // Mensagem efêmera
    if (messageContent.ephemeralMessage?.message) {
      return this.extractMessageContent(messageContent.ephemeralMessage.message);
    }

    // Mensagem de imagem
    if (messageContent.imageMessage) {
      return messageContent.imageMessage.caption || '[Imagem]';
    }

    // Mensagem de vídeo
    if (messageContent.videoMessage) {
      return messageContent.videoMessage.caption || '[Vídeo]';
    }

    // Mensagem de áudio
    if (messageContent.audioMessage) {
      return '[Áudio]';
    }

    // Mensagem de documento
    if (messageContent.documentMessage) {
      return `[Documento: ${messageContent.documentMessage.title || 'Arquivo'}]`;
    }

    // Outras mensagens
    return JSON.stringify(messageContent);
  }

  /**
   * Garantir que o chat existe no banco
   */
  private async ensureChatExists(instanceId: string, remoteJid: string, message: any) {
    try {
      let existingChat = await prisma.whatsAppChat.findFirst({
        where: {
          instanceId,
          remoteJid,
        },
      });

      if (!existingChat) {
        console.log(`[WEBHOOK] Criando novo chat: ${remoteJid}`);
        
        const isGroup = remoteJid.endsWith('@g.us');
        
        // Primeiro, garantir que o contato existe
        let contact = await prisma.whatsAppContact.findUnique({
          where: {
            jid_instanceId: {
              jid: remoteJid,
              instanceId
            }
          }
        });

        // Se o contato não existir, criar automaticamente
        if (!contact) {
          console.log(`[WEBHOOK] Criando contato automaticamente: ${remoteJid}`);
          
          const phone = this.extractPhoneFromJid(remoteJid);
          
          const contactData = {
            instanceId,
            jid: remoteJid,
            phone,
            pushName: message.pushName || (isGroup ? 'Grupo' : null),
            profileName: message.pushName || null,
            profilePicUrl: null,
            isMyContact: false,
            isWABusiness: false,
            businessName: null,
            verifiedName: null,
            isGroup,
            groupMetadata: isGroup ? JSON.stringify({ remoteJid }) : null,
            updatedAt: new Date()
          };

          contact = await prisma.whatsAppContact.create({
            data: contactData
          });
          
          console.log(`[WEBHOOK] ✅ Contato criado: ${contact.jid} (${contact.pushName || 'Sem nome'})`);
        }
        
        // Agora criar o chat
        existingChat = await prisma.whatsAppChat.create({
          data: {
            instanceId,
            contactId: contact.id,
            remoteJid,
            name: isGroup ? 'Grupo' : message.pushName || 'Chat',
            isGroup,
            unreadCount: message.key.fromMe ? 0 : 1,
            lastMessageTime: new Date(message.messageTimestamp * 1000),
            lastMessagePreview: this.extractMessageContent(message.message),
          },
        });
        
        console.log(`[WEBHOOK] ✅ Chat criado: ${existingChat.remoteJid}`);
      } else {
        console.log(`[WEBHOOK] Atualizando chat existente: ${remoteJid}`);
        
        // Atualizar última mensagem do chat
        await prisma.whatsAppChat.update({
          where: { id: existingChat.id },
          data: {
            lastMessageTime: new Date(message.messageTimestamp * 1000),
            lastMessagePreview: this.extractMessageContent(message.message),
            ...(message.key.fromMe ? {} : { 
              unreadCount: { increment: 1 } 
            }),
          },
        });
      }
    } catch (error) {
      console.error(`[WEBHOOK] Erro ao criar/atualizar chat ${remoteJid}:`, error);
    }
  }

  /**
   * Extrair telefone do JID
   */
  private extractPhoneFromJid(jid: string): string | null {
    const match = jid.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  private async processConnectionUpdate(instanceId: string, connectionData: any) {
    const status = this.mapEvolutionStatusToDb(connectionData.state);
    
    const updateData: any = { status };
    
    if (status === 'CONNECTED') {
      updateData.lastConnectedAt = new Date();
      updateData.reconnectAttempts = 0;
    } else if (status === 'DISCONNECTED') {
      updateData.lastDisconnectedAt = new Date();
    }

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: updateData,
    });
  }

  /**
   * Processar atualização de mensagens (status, lido, etc.)
   */
  private async processMessageUpdate(instanceId: string, updateData: any) {
    console.log(`[WEBHOOK] Processando ${updateData.length || 0} atualizações de mensagem`);
    
    for (const update of updateData || []) {
      try {
        const messageId = update.key?.id;
        if (!messageId) continue;

        // Buscar mensagem existente
        const existingMessage = await prisma.whatsAppMessage.findFirst({
          where: {
            messageId,
            instanceId,
          },
        });

        if (existingMessage) {
          const updateFields: any = {};
          
          // Atualizar status se fornecido
          if (update.status) {
            updateFields.status = update.status;
          }
          
          // Marcar como lida se fornecido
          if (update.readStatus) {
            updateFields.isRead = true;
          }

          await prisma.whatsAppMessage.update({
            where: { id: existingMessage.id },
            data: updateFields,
          });

          console.log(`[WEBHOOK] Mensagem atualizada: ${messageId}`);
        }
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao atualizar mensagem:`, error);
      }
    }
  }

  /**
   * Processar exclusão de mensagens (revogadas)
   */
  private async processMessageDelete(instanceId: string, deleteData: any) {
    console.log(`[WEBHOOK] Processando ${deleteData.length || 0} exclusões de mensagem`);
    
    for (const deletion of deleteData || []) {
      try {
        const messageId = deletion.key?.id;
        if (!messageId) continue;

        // Marcar mensagem como deletada
        await prisma.whatsAppMessage.updateMany({
          where: {
            messageId,
            instanceId,
          },
          data: {
            isDeleted: true,
            content: '[Mensagem apagada]',
          },
        });

        console.log(`[WEBHOOK] Mensagem marcada como deletada: ${messageId}`);
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao deletar mensagem:`, error);
      }
    }
  }

  /**
   * Processar contatos criados/atualizados
   */
  private async processContactUpsert(instanceId: string, contactData: any) {
    console.log(`[WEBHOOK] Processando ${contactData.length || 0} contatos`);
    
    for (const contact of contactData || []) {
      try {
        // Pular grupos
        if (contact.id?.endsWith('@g.us')) {
          continue;
        }

        // Upsert do contato
        await prisma.whatsAppContact.upsert({
          where: {
            jid_instanceId: {
              jid: contact.id,
              instanceId,
            },
          },
          update: {
            pushName: contact.pushName,
            profileName: contact.name,
            profilePicUrl: contact.profilePicUrl,
            isMyContact: contact.isMyContact || false,
            isWABusiness: contact.isBusiness || false,
            businessName: contact.businessName,
            verifiedName: contact.verifiedName,
            isOnline: contact.isOnline || false,
            lastSeen: contact.lastSeen ? new Date(contact.lastSeen * 1000) : null,
          },
          create: {
            instanceId,
            jid: contact.id,
            phone: contact.id.split('@')[0],
            pushName: contact.pushName,
            profileName: contact.name,
            profilePicUrl: contact.profilePicUrl,
            isMyContact: contact.isMyContact || false,
            isWABusiness: contact.isBusiness || false,
            businessName: contact.businessName,
            verifiedName: contact.verifiedName,
            isGroup: false,
            isOnline: contact.isOnline || false,
            lastSeen: contact.lastSeen ? new Date(contact.lastSeen * 1000) : null,
          },
        });

        console.log(`[WEBHOOK] Contato processado: ${contact.id}`);
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao processar contato:`, error);
      }
    }
  }

  /**
   * Processar chats criados
   */
  private async processChatUpsert(instanceId: string, chatData: any) {
    console.log(`[WEBHOOK] Processando ${chatData.length || 0} chats criados`);
    
    for (const chat of chatData || []) {
      try {
        // Pular grupos se necessário
        const isGroup = chat.id?.endsWith('@g.us');
        if (isGroup) {
          console.log(`[WEBHOOK] Pulando chat de grupo: ${chat.id}`);
          continue;
        }

        // Upsert do chat
        await prisma.whatsAppChat.upsert({
          where: {
            remoteJid_instanceId: {
              remoteJid: chat.id,
              instanceId,
            },
          },
          update: {
            name: chat.name || chat.pushName,
            unreadCount: chat.unreadCount || 0,
            lastMessageTime: chat.lastMessageTime ? new Date(chat.lastMessageTime * 1000) : null,
            isArchived: chat.archived || false,
            isMuted: chat.muted || false,
            isPinned: chat.pinned || false,
          },
          create: {
            instanceId,
            remoteJid: chat.id,
            name: chat.name || chat.pushName || 'Chat',
            isGroup,
            unreadCount: chat.unreadCount || 0,
            lastMessageTime: chat.lastMessageTime ? new Date(chat.lastMessageTime * 1000) : null,
            isArchived: chat.archived || false,
            isMuted: chat.muted || false,
            isPinned: chat.pinned || false,
          },
        });

        console.log(`[WEBHOOK] Chat processado: ${chat.id}`);
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao processar chat:`, error);
      }
    }
  }

  /**
   * Processar atualizações de chats
   */
  private async processChatUpdate(instanceId: string, updateData: any) {
    console.log(`[WEBHOOK] Processando ${updateData.length || 0} atualizações de chat`);
    
    for (const update of updateData || []) {
      try {
        const chatId = update.id;
        if (!chatId) continue;

        const updateFields: any = {};
        
        if (update.name !== undefined) updateFields.name = update.name;
        if (update.unreadCount !== undefined) updateFields.unreadCount = update.unreadCount;
        if (update.archived !== undefined) updateFields.isArchived = update.archived;
        if (update.muted !== undefined) updateFields.isMuted = update.muted;
        if (update.pinned !== undefined) updateFields.isPinned = update.pinned;
        if (update.lastMessageTime) updateFields.lastMessageTime = new Date(update.lastMessageTime * 1000);

        await prisma.whatsAppChat.updateMany({
          where: {
            remoteJid: chatId,
            instanceId,
          },
          data: updateFields,
        });

        console.log(`[WEBHOOK] Chat atualizado: ${chatId}`);
      } catch (error) {
        console.error(`[WEBHOOK] Erro ao atualizar chat:`, error);
      }
    }
  }
} 