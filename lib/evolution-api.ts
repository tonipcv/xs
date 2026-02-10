import axios, { AxiosInstance } from 'axios';

export interface EvolutionApiConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface CreateInstanceRequest {
  instanceName: string;
  token?: string; // Para reutilizar sessão
  qrcode?: boolean;
  number?: string;
  integration?: string; // WHATSAPP-BAILEYS é obrigatório
  webhook?: string;
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
  events?: string[];
  reject_call?: boolean;
  msg_call?: string;
  groups_ignore?: boolean;
  always_online?: boolean;
  read_messages?: boolean;
  read_status?: boolean;
  websocket_enabled?: boolean;
  websocket_events?: string[];
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
  webhook?: string;
  qrcode?: {
    code: string;
    base64?: string;
  };
  pairingCode?: string;
}

export interface ConnectionState {
  instance: {
    instanceName: string;
    state: string; // CONNECTED, CONNECTING, CLOSE, etc.
  };
}

export interface QRCodeResponse {
  code?: string;
  base64?: string;
  pairingCode?: string;
}

export interface SendTextMessageRequest {
  number: string;
  text: string;
  delay?: number;
}

export interface WebhookConfig {
  webhook: string;
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
  events?: string[];
}

export interface FindContactsRequest {
  where?: any;
  limit?: number;
  offset?: number;
}

export interface FindChatsRequest {
  where?: any;
  limit?: number;
  offset?: number;
}

export interface FindMessagesRequest {
  where?: any;
  limit?: number;
  offset?: number;
}

export interface WhatsAppContactData {
  id: string;
  pushName?: string;
  profilePicUrl?: string;
  isGroup?: boolean;
  isUser?: boolean;
  isWAContact?: boolean;
  verifiedName?: string;
  notify?: string;
  labels?: any[];
}

export interface WhatsAppChatData {
  id: string;
  remoteJid: string;
  name?: string;
  isGroup?: boolean;
  unreadCount?: number;
  archived?: boolean;
  pinned?: boolean;
  muteEndTime?: number;
  lastMessage?: any;
  _count?: {
    messages: number;
  };
}

export interface WhatsAppMessageData {
  id: string;
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    participant?: string;
  };
  messageType: string;
  message: any;
  messageTimestamp: number;
  pushName?: string;
  source?: string;
  contextInfo?: any;
}

export interface WhatsAppInstanceData {
  id?: string;
  name: string;
  connectionStatus: string;
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
  integration?: string;
  number?: string;
  businessId?: string;
  token?: string;
  clientName?: string;
  disconnectionReasonCode?: number;
  disconnectionObject?: any;
  disconnectionAt?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    Message: number;
    Contact: number;
    Chat: number;
  };
}

export class EvolutionApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: { baseUrl: string; apiKey?: string }) {
    // Use as configurações que funcionaram no teste
    this.baseUrl = config.baseUrl || process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host';
    this.apiKey = config.apiKey || process.env.EVOLUTION_API_KEY;

    if (!this.apiKey) {
      throw new Error('Evolution API Key é obrigatória. Configure EVOLUTION_API_KEY no .env');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
      },
    });

    // Interceptadores para logs
    this.client.interceptors.request.use(
      (config) => {
        console.log(`Evolution API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Evolution API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log(`Evolution API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('Evolution API Response Error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Criar uma nova instância do WhatsApp
   */
  async createInstance(data: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    try {
      const response = await this.client.post('/instance/create', data);
      return response.data;
    } catch (error: any) {
      console.error('Erro ao criar instância:', error);
      
      // Extrair detalhes do erro da API
      let errorMessage = 'Erro desconhecido';
      
      if (error.response?.data) {
        const errorData = error.response.data;
        
        // Tratar erro de nome duplicado
        if (error.response.status === 403 && errorData.response?.message) {
          const messages = Array.isArray(errorData.response.message) 
            ? errorData.response.message 
            : [errorData.response.message];
          
          const duplicateNameError = messages.find((msg: string) => 
            msg.includes('already in use') || msg.includes('já está em uso')
          );
          
          if (duplicateNameError) {
            errorMessage = `Nome da instância já está em uso. Escolha um nome diferente.`;
          } else {
            errorMessage = messages.join(', ');
          }
        }
        // Outros tipos de erro
        else if (errorData.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Log adicional para debug
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Listar todas as instâncias
   */
  async listInstances(): Promise<any[]> {
    try {
      const response = await this.client.get('/instance/fetchInstances');
      return response.data || [];
    } catch (error) {
      console.error('Erro ao listar instâncias:', error);
      throw new Error(`Falha ao listar instâncias: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Buscar contatos
   */
  async findContacts(instanceName: string, request: FindContactsRequest): Promise<WhatsAppContactData[]> {
    try {
      const response = await this.client.post(`/chat/findContacts/${instanceName}`, request);
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar contatos:', error);
      throw new Error(`Falha ao buscar contatos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Buscar chats
   */
  async findChats(instanceName: string, request: FindChatsRequest): Promise<WhatsAppChatData[]> {
    try {
      const response = await this.client.post(`/chat/findChats/${instanceName}`, request);
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar chats:', error);
      throw new Error(`Falha ao buscar chats: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Obter QR Code para conexão
   */
  async getQRCode(instanceName: string): Promise<QRCodeResponse> {
    try {
      const response = await this.client.get(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao obter QR Code:', error);
      throw new Error(`Falha ao obter QR Code: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Verificar estado da conexão
   */
  async getConnectionState(instanceName: string): Promise<ConnectionState> {
    try {
      const response = await this.client.get(`/instance/connectionState/${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao verificar estado da conexão:', error);
      throw new Error(`Falha ao verificar conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Enviar mensagem de texto
   */
  async sendTextMessage(instanceName: string, data: SendTextMessageRequest): Promise<any> {
    try {
      const response = await this.client.post(`/message/sendText/${instanceName}`, data);
      return response.data;
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      throw new Error(`Falha ao enviar mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Configurar webhook
   */
  async setWebhook(instanceName: string, webhookConfig: WebhookConfig): Promise<any> {
    try {
      const response = await this.client.post(`/webhook/set/${instanceName}`, webhookConfig);
      return response.data;
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      throw new Error(`Falha ao configurar webhook: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Buscar mensagens de um chat específico
   * ATUALIZADO: Usa where vazio e filtra no lado do cliente
   */
  async findMessages(instanceName: string, request: FindMessagesRequest): Promise<WhatsAppMessageData[]> {
    try {
      // CORREÇÃO: API funciona com where vazio, não com filtro por remoteJid
      const modifiedRequest = {
        ...request,
        where: {}, // Where vazio funciona!
        limit: Math.max(request.limit || 50, 1000), // Buscar mais para filtrar
      };

      const response = await this.client.post(`/chat/findMessages/${instanceName}`, modifiedRequest);
      
      // API retorna {data: [mensagens]} ou diretamente array
      let messages = response.data?.data || response.data || [];

      if (!Array.isArray(messages)) {
        console.error('Formato inesperado da resposta:', response.data);
        return [];
      }

      console.log(`Total de mensagens recebidas: ${messages.length}`);

      // Se havia filtro original por remoteJid, aplicar aqui
      if (request.where?.key?.remoteJid) {
        const targetRemoteJid = request.where.key.remoteJid;
        messages = messages.filter((msg: any) => 
          msg.key?.remoteJid === targetRemoteJid
        );
        console.log(`Mensagens filtradas para ${targetRemoteJid}: ${messages.length}`);
      }

      // Ordenar por timestamp e limitar
      return messages
        .sort((a: any, b: any) => b.messageTimestamp - a.messageTimestamp)
        .slice(0, request.limit || 50);

    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      throw new Error(`Falha ao buscar mensagens: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  // ========== MÉTODOS EXISTENTES ==========

  /**
   * Obter informações da instância
   */
  async getInstance(instanceName: string): Promise<any> {
    try {
      const response = await this.client.get(`/instance/fetchInstances?instanceName=${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao obter informações da instância:', error);
      throw new Error(`Falha ao obter instância: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Deletar instância
   */
  async deleteInstance(instanceName: string): Promise<any> {
    try {
      const response = await this.client.delete(`/instance/delete/${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao deletar instância:', error);
      throw new Error(`Falha ao deletar instância: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Logout da instância
   */
  async logoutInstance(instanceName: string): Promise<any> {
    try {
      const response = await this.client.delete(`/instance/logout/${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      throw new Error(`Falha ao fazer logout: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Reiniciar instância
   */
  async restartInstance(instanceName: string): Promise<any> {
    try {
      const response = await this.client.put(`/instance/restart/${instanceName}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error);
      throw new Error(`Falha ao reiniciar instância: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
} 