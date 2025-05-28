import { prisma } from './prisma';
import { KnowledgeType } from '@prisma/client';

interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  type: KnowledgeType;
  priority: number;
  tags?: string | null;
}

interface SearchResult {
  chunk: KnowledgeChunk;
  relevanceScore: number;
  matchType: 'title' | 'content' | 'tag' | 'type';
}

/**
 * 🧠 Sistema de Busca de Conhecimento
 * Busca chunks relevantes baseado na mensagem do usuário
 */
export class KnowledgeSearch {
  
  /**
   * Busca chunks de conhecimento relevantes para uma mensagem
   */
  static async searchRelevantChunks(
    agentId: string, 
    userMessage: string, 
    maxResults: number = 3
  ): Promise<SearchResult[]> {
    
    // Buscar todos os chunks ativos do agente
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        agentId,
        isActive: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    if (chunks.length === 0) return [];

    // Calcular relevância para cada chunk
    const results: SearchResult[] = [];
    const messageLower = userMessage.toLowerCase();

    for (const chunk of chunks) {
      const relevanceScore = this.calculateRelevance(chunk, messageLower);
      
      if (relevanceScore > 0) {
        results.push({
          chunk,
          relevanceScore,
          matchType: this.getMatchType(chunk, messageLower)
        });
      }
    }

    // Ordenar por relevância e retornar os melhores
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  /**
   * Calcula a relevância de um chunk para uma mensagem
   */
  private static calculateRelevance(chunk: KnowledgeChunk, messageLower: string): number {
    let score = 0;
    const titleLower = chunk.title.toLowerCase();
    const contentLower = chunk.content.toLowerCase();
    const tagsLower = chunk.tags?.toLowerCase() || '';

    // 🎯 Pontuação por tipo de match
    
    // Match exato no título (peso alto)
    if (titleLower.includes(messageLower) || messageLower.includes(titleLower)) {
      score += 100;
    }

    // Match parcial no título
    const titleWords = titleLower.split(' ');
    const messageWords = messageLower.split(' ');
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

    // 🔍 Palavras-chave específicas por tipo
    score += this.getTypeSpecificScore(chunk.type, messageLower);

    // 📈 Bonus por prioridade
    score += chunk.priority * 5;

    return score;
  }

  /**
   * Pontuação específica por tipo de conhecimento
   */
  private static getTypeSpecificScore(type: KnowledgeType, messageLower: string): number {
    const typeKeywords = {
      OBJECTION: ['caro', 'preço', 'valor', 'não tenho', 'não posso', 'muito', 'barato', 'desconto'],
      FAQ: ['como', 'quando', 'onde', 'por que', 'o que', 'qual', 'funciona', 'dúvida'],
      CASE: ['exemplo', 'case', 'resultado', 'sucesso', 'cliente', 'funcionou'],
      FEATURE: ['funcionalidade', 'recurso', 'faz', 'pode', 'consegue', 'tem'],
      PROCESS: ['processo', 'como fazer', 'passo', 'etapa', 'procedimento'],
      SCRIPT: ['falar', 'dizer', 'responder', 'abordar', 'script'],
      POLICY: ['política', 'regra', 'permitido', 'pode', 'não pode'],
      MANUAL: ['manual', 'documentação', 'guia', 'instrução']
    };

    const keywords = typeKeywords[type] || [];
    const matches = keywords.filter(keyword => messageLower.includes(keyword)).length;
    
    return matches * 25; // Bonus alto para match de tipo específico
  }

  /**
   * Determina o tipo de match principal
   */
  private static getMatchType(chunk: KnowledgeChunk, messageLower: string): 'title' | 'content' | 'tag' | 'type' {
    const titleLower = chunk.title.toLowerCase();
    const contentLower = chunk.content.toLowerCase();
    const tagsLower = chunk.tags?.toLowerCase() || '';

    if (titleLower.includes(messageLower) || messageLower.includes(titleLower)) {
      return 'title';
    }

    if (tagsLower && messageLower.split(' ').some(word => 
      word.length > 2 && tagsLower.includes(word)
    )) {
      return 'tag';
    }

    if (this.getTypeSpecificScore(chunk.type, messageLower) > 0) {
      return 'type';
    }

    return 'content';
  }

  /**
   * Formata chunks encontrados para inclusão no prompt
   */
  static formatChunksForPrompt(results: SearchResult[]): string {
    if (results.length === 0) return '';

    const sections = results.map((result, index) => {
      const { chunk } = result;
      const typeEmoji = this.getTypeEmoji(chunk.type);
      
      return `${typeEmoji} ${chunk.title.toUpperCase()}:\n${chunk.content}`;
    });

    return `\n\n📚 CONHECIMENTO RELEVANTE:\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * Emojis para cada tipo de conhecimento
   */
  private static getTypeEmoji(type: KnowledgeType): string {
    const emojis = {
      OBJECTION: '💰',
      FAQ: '❓',
      CASE: '📈',
      FEATURE: '⚡',
      PROCESS: '🔄',
      SCRIPT: '📝',
      POLICY: '📋',
      MANUAL: '📖'
    };
    
    return emojis[type] || '📄';
  }

  /**
   * Busca chunks por tipo específico
   */
  static async getChunksByType(agentId: string, type: KnowledgeType): Promise<KnowledgeChunk[]> {
    return await prisma.knowledgeChunk.findMany({
      where: {
        agentId,
        type,
        isActive: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });
  }

  /**
   * Estatísticas de conhecimento do agente
   */
  static async getKnowledgeStats(agentId: string) {
    const totalChunks = await prisma.knowledgeChunk.count({
      where: { agentId, isActive: true }
    });

    const byType = await prisma.knowledgeChunk.groupBy({
      by: ['type'],
      where: { agentId, isActive: true },
      _count: { type: true }
    });

    return {
      totalChunks,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<KnowledgeType, number>)
    };
  }
} 