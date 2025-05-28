import { EvolutionApiClient } from './evolution-api';

export interface WebhookConfig {
  url: string;
  webhook_by_events: boolean;
  events: string[];
}

export interface InstanceSettings {
  alwaysOnline: boolean;
  readMessages: boolean;
  rejectCall: boolean;
  groupsIgnore?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export class EvolutionWebhookManager {
  private evolutionApi: EvolutionApiClient;
  private baseUrl: string;
  private apiKey: string;

  constructor(evolutionApiBaseUrl: string, evolutionApiKey?: string) {
    this.baseUrl = evolutionApiBaseUrl;
    this.apiKey = evolutionApiKey || '';
    
    this.evolutionApi = new EvolutionApiClient({
      baseUrl: evolutionApiBaseUrl,
      apiKey: evolutionApiKey,
    });
  }

  /**
   * Verificar se a instância existe e está conectada
   */
  async checkInstanceExists(instanceName: string): Promise<boolean> {
    try {
      console.log(`🔍 Verificando instância: ${instanceName}`);
      
      // Usar o EvolutionApiClient que já funciona na página /whatsapp
      const instances = await this.evolutionApi.listInstances();
      
      console.log(`📋 Instâncias encontradas:`, instances.map((inst: any) => ({
        name: inst.name,                    // ✅ Campo correto
        connectionStatus: inst.connectionStatus,  // ✅ Campo correto
        id: inst.id
      })));

      // Buscar pela instância usando o campo correto
      const instance = instances.find((inst: any) => inst.name === instanceName);
      
      if (!instance) {
        console.log(`❌ Instância '${instanceName}' não encontrada na lista`);
        return false;
      }

      // Verificar se está conectada
      const isConnected = instance.connectionStatus === 'open';
      
      console.log(`📊 Status da instância '${instanceName}':`, {
        name: instance.name,
        connectionStatus: instance.connectionStatus,
        isConnected
      });

      return isConnected;
    } catch (error) {
      console.error(`❌ Erro ao verificar instância ${instanceName}:`, error);
      return false;
    }
  }

  /**
   * Verificar uma instância específica diretamente
   */
  async checkSingleInstance(instanceName: string): Promise<boolean> {
    try {
      console.log(`🔍 Verificando instância diretamente: ${instanceName}`);
      
      const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey
        }
      });

      if (!response.ok) {
        console.log(`❌ Erro ao verificar estado da conexão: ${response.status}`);
        return false;
      }

      const result = await response.json();
      console.log(`📊 Estado da conexão para '${instanceName}':`, result);
      
      // Verificar diferentes possíveis campos de status
      const isConnected = result.state === 'open' || 
                         result.status === 'open' ||
                         result.connectionState === 'open' ||
                         result.instance?.state === 'open';

      console.log(`✅ Instância '${instanceName}' conectada: ${isConnected}`);
      return isConnected;
    } catch (error) {
      console.error(`❌ Erro ao verificar estado da instância ${instanceName}:`, error);
      return false;
    }
  }

  /**
   * Configurar modo bot completo
   */
  async setupBotMode(instanceName: string, webhookUrl?: string): Promise<{
    settings: any;
    webhook: any;
  }> {
    try {
      console.log(`🚀 Configurando modo bot para: ${instanceName}`);
      
      // Verificar se a instância existe e está conectada
      const instanceExists = await this.checkInstanceExists(instanceName);
      if (!instanceExists) {
        console.log(`⚠️ Verificação automática falhou, tentando configurar mesmo assim...`);
        // Não falhar imediatamente, tentar configurar mesmo assim
        // throw new Error(`Instância '${instanceName}' não encontrada ou não está conectada. Verifique se a instância está criada e conectada no WhatsApp.`);
      }

      let settings, webhook;

      try {
        // Configurar settings para modo bot
        console.log(`⚙️ Configurando settings para ${instanceName}...`);
        settings = await this.setInstanceSettings(instanceName, {
          alwaysOnline: true,
          readMessages: true,
          rejectCall: true,
          groupsIgnore: true,      // ✅ Campo adicional obrigatório
          readStatus: true,        // ✅ Campo adicional obrigatório  
          syncFullHistory: false   // ✅ Campo adicional obrigatório
        });
        console.log(`✅ Settings configurados com sucesso`);
      } catch (settingsError) {
        console.error(`❌ Erro ao configurar settings:`, settingsError);
        // Continuar mesmo se settings falharem
        settings = { error: settingsError instanceof Error ? settingsError.message : String(settingsError) };
      }

      try {
        // Configurar webhook usando o novo método que suporta NGROK_URL
        console.log(`🔗 Configurando webhook para ${instanceName}...`);
        webhook = await this.setupAIAgentWebhook(instanceName, webhookUrl);
        console.log(`✅ Webhook configurado com sucesso`);
      } catch (webhookError) {
        console.error(`❌ Erro ao configurar webhook:`, webhookError);
        throw webhookError; // Webhook é crítico, então falhar se não conseguir
      }

      return { settings, webhook };
    } catch (error) {
      console.error(`❌ Erro ao configurar modo bot para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Configurar settings da instância
   */
  async setInstanceSettings(instanceName: string, settings: InstanceSettings): Promise<any> {
    try {
      console.log(`⚙️ Configurando settings para ${instanceName}:`, settings);
      
      // Corrigir URL para evitar barra dupla
      const url = `${this.baseUrl.replace(/\/$/, '')}/settings/set/${instanceName}`;
      console.log(`🔗 URL dos settings: ${url}`);
      
      // Usar fetch direto pois o EvolutionApiClient não tem método para settings ainda
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Erro ao configurar settings: ${response.status} - ${response.statusText}`, errorText);
        throw new Error(`Erro ao configurar settings: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Settings configurados para ${instanceName}:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Erro ao configurar settings para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Configurar webhook da instância
   */
  async setWebhook(instanceName: string, config: WebhookConfig): Promise<any> {
    try {
      console.log(`🔗 Configurando webhook para ${instanceName}:`, config);
      
      // Usar o EvolutionApiClient que já funciona
      const result = await this.evolutionApi.setWebhook(instanceName, {
        url: config.url,
        events: config.events,
        byEvents: config.webhook_by_events,
        base64: false
      });
      
      console.log(`✅ Webhook configurado para ${instanceName}:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Erro ao configurar webhook para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Verificar status atual do webhook
   */
  async getWebhookStatus(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/webhook/find/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar webhook: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Erro ao buscar webhook para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Verificar settings atuais da instância
   */
  async getInstanceSettings(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/settings/find/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar settings: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Erro ao buscar settings para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Remover webhook
   */
  async removeWebhook(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        },
        body: JSON.stringify({
          url: '',
          webhook_by_events: false,
          events: []
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao remover webhook: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Webhook removido para ${instanceName}:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Erro ao remover webhook para ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Configurar apenas os eventos específicos para AI Agent
   */
  async setupAIAgentWebhook(instanceName: string, webhookUrl?: string): Promise<any> {
    try {
      // URL do webhook - sempre usar produção como padrão se não fornecida
      const productionUrl = 'https://zp-bay.vercel.app';
      
      // Permitir override apenas para desenvolvimento local
      const isLocalDev = process.env.NODE_ENV === 'development';
      const ngrokUrl = isLocalDev ? process.env.NGROK_URL : null;
      
      const finalWebhookUrl = webhookUrl || `${ngrokUrl || productionUrl}/api/ai-agent/webhook/messages-upsert`;

      if (!finalWebhookUrl || finalWebhookUrl.includes('undefined')) {
        throw new Error('URL do webhook não configurada corretamente');
      }

      return await this.setWebhook(instanceName, {
        url: finalWebhookUrl,
        webhook_by_events: true,
        events: ['MESSAGES_UPSERT'] // Apenas mensagens novas para o AI Agent
      });
    } catch (error) {
      console.error(`❌ Erro ao configurar webhook:`, error);
      throw error;
    }
  }

  /**
   * Verificar se a instância está pronta para o modo bot
   */
  async checkBotReadiness(instanceName: string): Promise<{
    isReady: boolean;
    issues: string[];
    webhook?: any;
    settings?: any;
  }> {
    const issues: string[] = [];

    try {
      // Verificar se a instância existe primeiro
      const instanceExists = await this.checkInstanceExists(instanceName);
      if (!instanceExists) {
        issues.push('Instância não encontrada ou não está conectada');
        return {
          isReady: false,
          issues
        };
      }

      // Verificar settings
      const settings = await this.getInstanceSettings(instanceName);
      if (!settings?.settings?.alwaysOnline) {
        issues.push('alwaysOnline não está ativado');
      }
      if (!settings?.settings?.readMessages) {
        issues.push('readMessages não está ativado');
      }
      if (!settings?.settings?.rejectCall) {
        issues.push('rejectCall não está ativado');
      }

      // Verificar webhook
      const webhook = await this.getWebhookStatus(instanceName);
      if (!webhook?.webhook?.url) {
        issues.push('Webhook não está configurado');
      }
      if (!webhook?.webhook?.enabled) {
        issues.push('Webhook não está habilitado');
      }

      return {
        isReady: issues.length === 0,
        issues,
        webhook,
        settings
      };
    } catch (error) {
      issues.push(`Erro ao verificar configuração: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      return {
        isReady: false,
        issues
      };
    }
  }
}