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
  // Novo formato (URLs públicas)
  webhook?: {
    url: string;
    events?: string[];
    byEvents?: boolean;
    base64?: boolean;
  };
  // Formato antigo (localhost/compatibilidade)
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
  syncFullHistory?: boolean;
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
  base64?: string; // Para compatibilidade com versões antigas
  code: string;    // Novo formato da API
  pairingCode?: string; // Código de pareamento alternativo
  count?: number;  // Contador de tentativas
}

export interface SendTextMessageRequest {
  number: string;
  text: string;
  options?: {
    delay?: number;
    presence?: 'composing' | 'recording' | 'paused';
    linkPreview?: boolean;
    quoted?: {
      key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
        participant?: string;
      };
      message: {
        conversation?: string;
      };
    };
    mentions?: {
      everyOne?: boolean;
      mentioned?: string[];
    };
  };
}

export interface WebhookConfig {
  url: string;
  events?: string[];
  byEvents?: boolean;
  base64?: boolean;
}

// Novos interfaces para sync de dados
export interface FindContactsRequest {
  where: {
    [key: string]: any;
  };
  limit?: number;
  offset?: number;
}

export interface WhatsAppContactData {
  id: string;
  remoteJid: string;
  pushName?: string;
  profileName?: string;
  profilePicUrl?: string;
  isMyContact?: boolean;
  isWABusiness?: boolean;
  businessName?: string;
  verifiedName?: string;
  labels?: Array<{
    id: string;
    name: string;
    color?: string;
    predefined?: boolean;
  }>;
}

export interface FindChatsRequest {
  where?: {
    [key: string]: any;
  };
  limit?: number;
  offset?: number;
}

export interface WhatsAppChatData {
  id: string;
  remoteJid: string;
  name?: string;
  isGroup: boolean;
  unreadCount?: number;
  lastMessage?: {
    messageTimestamp: number;
    message: string;
  };
  archived?: boolean;
  muted?: boolean;
  pinned?: boolean;
  metadata?: any;
}

export interface FindMessagesRequest {
  where: {
    key?: {
      remoteJid: string;
      fromMe?: boolean;
    };
    remoteJid?: string; // Manter compatibilidade
    fromMe?: boolean;
    messageType?: string;
    dateTimeGt?: string;
    dateTimeLt?: string;
  };
  limit?: number;
  offset?: number;
}

export interface WhatsAppMessageData {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  messageType: string;
  message: any;
  messageTimestamp: number;
  status?: string;
  quoted?: {
    key: {
      id: string;
    };
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
   * Verificar se um nome de instância está disponível
   */
  async isInstanceNameAvailable(instanceName: string): Promise<boolean> {
    try {
      const instances = await this.listInstances();
      return !instances.some(instance => 
        instance.instance?.instanceName === instanceName
      );
    } catch (error) {
      console.error('Erro ao verificar disponibilidade do nome:', error);
      // Em caso de erro, assumir que o nome pode estar disponível
      return true;
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
   * Gerar um nome único para instância
   */
  async generateUniqueInstanceName(baseName: string = 'WhatsApp'): Promise<string> {
    try {
      const instances = await this.listInstances();
      const existingNames = instances.map(instance => 
        instance.instance?.instanceName
      ).filter(Boolean);

      let counter = 1;
      let candidateName = baseName;

      while (existingNames.includes(candidateName)) {
        candidateName = `${baseName}${counter}`;
        counter++;
      }

      return candidateName;
    } catch (error) {
      console.error('Erro ao gerar nome único:', error);
      // Fallback: usar timestamp
      return `${baseName}_${Date.now()}`;
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
   * Enviar mensagem de texto (formato simplificado)
   */
  async sendSimpleTextMessage(instanceName: string, number: string, text: string): Promise<any> {
    const messageData: SendTextMessageRequest = {
      number,
      text,
      options: {
        delay: 1000,
        presence: 'composing',
        linkPreview: true
      }
    };
    
    return this.sendTextMessage(instanceName, messageData);
  }

  /**
   * Enviar mensagem de texto
   */
  async sendTextMessage(instanceName: string, data: SendTextMessageRequest): Promise<any> {
    try {
      console.log(`Evolution API Request: POST /message/sendText/${instanceName}`);
      console.log('Request Data:', JSON.stringify(data, null, 2));
      
      const response = await this.client.post(`/message/sendText/${instanceName}`, data);
      
      console.log('Evolution API Response:', response.status, JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error: any) {
      console.error('Evolution API Response Error:', error.response?.status, error.message);
      if (error.response?.data) {
        console.error('Evolution API Error Details:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Falha ao enviar mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Configurar webhook
   */
  async setWebhook(instanceName: string, webhookConfig: WebhookConfig): Promise<any> {
    try {
      // Formato correto descoberto nos testes - deve ser aninhado em "webhook"
      const payload = {
        webhook: {
          enabled: true,
          url: webhookConfig.url,
          byEvents: webhookConfig.byEvents !== false, // Default true
          events: webhookConfig.events || [
            'APPLICATION_STARTUP',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'CONTACTS_UPSERT',
            'CHATS_UPSERT',
            'CHATS_UPDATE'
          ],
          base64: webhookConfig.base64 || false
        }
      };
      
      console.log(`Evolution API Request: POST /webhook/set/${instanceName}`);
      console.log('Webhook Payload:', JSON.stringify(payload, null, 2));
      
      const response = await this.client.post(`/webhook/set/${instanceName}`, payload);
      
      console.log(`Evolution API Response: ${response.status}`);
      console.log('Webhook Response:', JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao configurar webhook para ${instanceName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Buscar configuração do webhook
   */
  async getWebhook(instanceName: string): Promise<any> {
    try {
      console.log(`Evolution API Request: GET /webhook/find/${instanceName}`);
      
      const response = await this.client.get(`/webhook/find/${instanceName}`);
      
      console.log(`Evolution API Response: ${response.status}`);
      console.log('Webhook Config:', JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`Nenhum webhook configurado para ${instanceName}`);
        return null;
      }
      console.error(`Erro ao buscar webhook para ${instanceName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // ========== NOVOS MÉTODOS PARA SYNC ==========

  /**
   * Buscar contatos da instância
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
   * Buscar chats da instância
   */
  async findChats(instanceName: string, request?: FindChatsRequest): Promise<WhatsAppChatData[]> {
    try {
      const response = await this.client.post(`/chat/findChats/${instanceName}`, request || {});
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar chats:', error);
      throw new Error(`Falha ao buscar chats: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Buscar mensagens de um chat específico
   */
  async findMessages(instanceName: string, request: FindMessagesRequest): Promise<WhatsAppMessageData[]> {
    try {
      const response = await this.client.post(`/chat/findMessages/${instanceName}`, request);
      
      // CORREÇÃO: A Evolution API retorna { messages: { total, pages, currentPage, records: [] } }
      const data = response.data;
      
      if (data && data.messages && data.messages.records && Array.isArray(data.messages.records)) {
        console.log(`Evolution API: ${data.messages.total} mensagens encontradas (página ${data.messages.currentPage}/${data.messages.pages})`);
        return data.messages.records;
      } else if (Array.isArray(data)) {
        // Fallback para formato antigo (se houver)
        return data;
      } else {
        console.warn('Estrutura inesperada na resposta de mensagens:', data);
        return [];
      }
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

// Instância padrão para uso em toda a aplicação
export const evolutionApi = new EvolutionApiClient({
  baseUrl: process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  apiKey: process.env.EVOLUTION_API_KEY
});