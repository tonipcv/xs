import { createClient } from 'redis';

// URL do Redis (em produção, use variável de ambiente)
const REDIS_URL = process.env.REDIS_URL || 'redis://default:0413c8a2777157b441f7@dpbdp1.easypanel.host:45';

let client: any = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    client.on('error', (err: any) => {
      console.error('❌ Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('✅ Redis Connected');
    });

    client.on('ready', () => {
      console.log('🚀 Redis Ready');
    });

    client.on('end', () => {
      console.log('🔚 Redis Connection Ended');
    });

    await client.connect();
  }
  
  return client;
}

export class ConversationContext {
  private static readonly PREFIX = 'conversation:';
  private static readonly MAX_MESSAGES = 20; // Manter últimas 20 mensagens
  private static readonly TTL = 60 * 60 * 24 * 7; // 7 dias em segundos

  static getKey(agentConfigId: string, remoteJid: string): string {
    return `${this.PREFIX}${agentConfigId}:${remoteJid}`;
  }

  static async addMessage(
    agentConfigId: string, 
    remoteJid: string, 
    role: 'user' | 'assistant', 
    content: string,
    tokens?: number
  ) {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(agentConfigId, remoteJid);
      
      const message = {
        role,
        content,
        timestamp: new Date().toISOString(),
        tokens: tokens || 0
      };

      // Adicionar mensagem à lista
      await redis.lPush(key, JSON.stringify(message));

      // Manter apenas as últimas MAX_MESSAGES mensagens
      await redis.lTrim(key, 0, this.MAX_MESSAGES - 1);

      // Definir TTL para expirar automaticamente
      await redis.expire(key, this.TTL);

      console.log(`💾 Mensagem salva no Redis: ${role} - ${content.length} chars`);
    } catch (error) {
      console.error('❌ Erro ao salvar mensagem no Redis:', error);
    }
  }

  static async getMessages(agentConfigId: string, remoteJid: string, limit: number = 10): Promise<any[]> {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(agentConfigId, remoteJid);
      
      // Buscar mensagens mais recentes (limit ou todas se menos que limit)
      const messages = await redis.lRange(key, 0, limit - 1);
      
      // Parse e retorna em ordem cronológica (mais antiga primeiro)
      const parsedMessages = messages
        .map((msg: string) => JSON.parse(msg))
        .reverse(); // Redis lRange retorna mais recente primeiro, reversemos para cronológica

      console.log(`📚 ${parsedMessages.length} mensagens recuperadas do Redis para ${remoteJid}`);
      return parsedMessages;
    } catch (error) {
      console.error('❌ Erro ao buscar mensagens no Redis:', error);
      return [];
    }
  }

  static async getStats(agentConfigId: string, remoteJid: string): Promise<{
    totalMessages: number;
    lastMessageAt?: string;
  }> {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(agentConfigId, remoteJid);
      
      const totalMessages = await redis.lLen(key);
      
      let lastMessageAt: string | undefined;
      if (totalMessages > 0) {
        const latestMessage = await redis.lRange(key, 0, 0);
        if (latestMessage.length > 0) {
          const parsed = JSON.parse(latestMessage[0]);
          lastMessageAt = parsed.timestamp;
        }
      }

      return {
        totalMessages,
        lastMessageAt
      };
    } catch (error) {
      console.error('❌ Erro ao buscar stats no Redis:', error);
      return { totalMessages: 0 };
    }
  }

  static async clearConversation(agentConfigId: string, remoteJid: string) {
    try {
      const redis = await getRedisClient();
      const key = this.getKey(agentConfigId, remoteJid);
      
      await redis.del(key);
      console.log(`🗑️ Conversa limpa do Redis: ${remoteJid}`);
    } catch (error) {
      console.error('❌ Erro ao limpar conversa no Redis:', error);
    }
  }

  static async getAllConversations(agentConfigId: string): Promise<string[]> {
    try {
      const redis = await getRedisClient();
      const pattern = `${this.PREFIX}${agentConfigId}:*`;
      
      const keys = await redis.keys(pattern);
      
      // Extrair apenas os remoteJids
      const remoteJids = keys.map((key: string) => {
        const parts = key.split(':');
        return parts[parts.length - 1];
      });

      return remoteJids;
    } catch (error) {
      console.error('❌ Erro ao buscar conversas no Redis:', error);
      return [];
    }
  }
}

// Rate limiting usando Redis
export class RateLimiter {
  private static readonly PREFIX = 'rate_limit:';

  static async checkLimit(
    agentConfigId: string, 
    remoteJid: string, 
    maxMessages: number = 5, 
    windowSeconds: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const redis = await getRedisClient();
      const key = `${this.PREFIX}${agentConfigId}:${remoteJid}`;
      
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Remove mensagens antigas da janela de tempo
      await redis.zRemRangeByScore(key, 0, windowStart);

      // Conta mensagens na janela atual
      const currentCount = await redis.zCard(key);

      if (currentCount >= maxMessages) {
        // Buscar quando a próxima mensagem expira
        const oldestMessage = await redis.zRange(key, 0, 0, { withScores: true });
        const resetTime = oldestMessage.length > 0 
          ? Number(oldestMessage[0].score) + (windowSeconds * 1000)
          : now + (windowSeconds * 1000);

        return {
          allowed: false,
          remaining: 0,
          resetTime
        };
      }

      // Adicionar nova mensagem
      await redis.zAdd(key, { score: now, value: `${now}` });
      await redis.expire(key, windowSeconds);

      return {
        allowed: true,
        remaining: maxMessages - currentCount - 1,
        resetTime: now + (windowSeconds * 1000)
      };
    } catch (error) {
      console.error('❌ Erro no rate limiter Redis:', error);
      // Em caso de erro, permitir (fail-open)
      return { allowed: true, remaining: maxMessages, resetTime: Date.now() + 60000 };
    }
  }
} 