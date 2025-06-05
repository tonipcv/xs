/**
 * Cliente TypeScript para integração com ZAP Membership External API
 * 
 * Este cliente facilita o envio de mensagens WhatsApp através do sistema
 * ZAP Membership a partir de outros sistemas Next.js ou Node.js.
 */

export interface WhatsAppInstance {
  id: string;
  instanceName: string;
  status: string;
  connectedNumber?: string;
  lastConnectedAt?: string;
  createdAt: string;
  isAvailable: boolean;
}

export interface SendMessageRequest {
  instanceId: string;
  number: string;
  message: string;
  userId?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  timestamp: string;
  instanceId?: string;
  status?: string;
  error?: string;
  data?: {
    remoteJid?: string;
    fromMe?: boolean;
  };
}

export interface ListInstancesResponse {
  success: boolean;
  count: number;
  instances: WhatsAppInstance[];
  timestamp: string;
  error?: string;
}

export interface ApiStatusResponse {
  service: string;
  status: string;
  version: string;
  timestamp: string;
  endpoints: {
    sendMessage: string;
  };
  authentication: string;
}

export class ZapMembershipClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000; // 30 segundos padrão
  }

  /**
   * Verificar status da API
   */
  async getApiStatus(): Promise<ApiStatusResponse> {
    try {
      const response = await this.makeRequest('GET', '/api/external/send-message');
      return response as ApiStatusResponse;
    } catch (error) {
      throw new Error(`Erro ao verificar status da API: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Listar instâncias WhatsApp disponíveis
   */
  async listInstances(): Promise<ListInstancesResponse> {
    try {
      const response = await this.makeRequest('GET', '/api/external/instances');
      return response as ListInstancesResponse;
    } catch (error) {
      throw new Error(`Erro ao listar instâncias: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Enviar mensagem WhatsApp
   */
  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      // Validações básicas
      this.validateSendMessageRequest(data);

      // Formatar número
      const formattedData = {
        ...data,
        number: this.formatPhoneNumber(data.number)
      };

      const response = await this.makeRequest('POST', '/api/external/send-message', formattedData);
      return response as SendMessageResponse;
    } catch (error) {
      throw new Error(`Erro ao enviar mensagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Método helper para envio simples de mensagem
   */
  async sendSimpleMessage(instanceId: string, number: string, message: string): Promise<SendMessageResponse> {
    return this.sendMessage({
      instanceId,
      number,
      message,
      userId: 'external-client'
    });
  }

  /**
   * Buscar primeira instância disponível
   */
  async getFirstAvailableInstance(): Promise<WhatsAppInstance | null> {
    try {
      const response = await this.listInstances();
      
      if (!response.success || response.instances.length === 0) {
        return null;
      }

      return response.instances.find(instance => instance.isAvailable) || null;
    } catch (error) {
      console.error('Erro ao buscar instância disponível:', error);
      return null;
    }
  }

  /**
   * Enviar mensagem usando primeira instância disponível
   */
  async sendMessageAuto(number: string, message: string): Promise<SendMessageResponse> {
    const instance = await this.getFirstAvailableInstance();
    
    if (!instance) {
      throw new Error('Nenhuma instância WhatsApp disponível');
    }

    return this.sendMessage({
      instanceId: instance.id,
      number,
      message,
      userId: 'auto-instance'
    });
  }

  /**
   * Formatar número de telefone
   */
  formatPhoneNumber(phone: string): string {
    // Remove tudo que não é número
    let cleaned = phone.replace(/\D/g, '');
    
    // Se não tem código do país, adiciona 55 (Brasil)
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
      cleaned = '55' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Validar dados da requisição de envio
   */
  private validateSendMessageRequest(data: SendMessageRequest): void {
    if (!data.instanceId || typeof data.instanceId !== 'string') {
      throw new Error('instanceId é obrigatório e deve ser uma string');
    }

    if (!data.number || typeof data.number !== 'string') {
      throw new Error('number é obrigatório e deve ser uma string');
    }

    if (!data.message || typeof data.message !== 'string') {
      throw new Error('message é obrigatório e deve ser uma string');
    }

    if (data.message.length > 4096) {
      throw new Error('Mensagem muito longa (máximo 4096 caracteres)');
    }

    if (data.userId && typeof data.userId !== 'string') {
      throw new Error('userId deve ser uma string');
    }
  }

  /**
   * Fazer requisição HTTP
   */
  private async makeRequest(method: 'GET' | 'POST', endpoint: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body && method === 'POST') {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Timeout na requisição (${this.timeout}ms)`);
        }
        throw error;
      }
      throw new Error('Erro desconhecido na requisição');
    }
  }
}

/**
 * Factory function para criar cliente
 */
export function createZapMembershipClient(config: {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}): ZapMembershipClient {
  return new ZapMembershipClient(config);
}

/**
 * Exemplo de uso:
 * 
 * ```typescript
 * import { createZapMembershipClient } from './lib/whatsapp-external-client';
 * 
 * const zapClient = createZapMembershipClient({
 *   baseUrl: 'https://seu-zap-membership.com',
 *   apiKey: 'sua-api-key-aqui'
 * });
 * 
 * // Enviar mensagem
 * const result = await zapClient.sendMessage({
 *   instanceId: 'minha-instancia',
 *   number: '11999887766',
 *   message: 'Olá mundo!'
 * });
 * 
 * // Ou usar instância automática
 * const result = await zapClient.sendMessageAuto('11999887766', 'Olá mundo!');
 * ```
 */ 