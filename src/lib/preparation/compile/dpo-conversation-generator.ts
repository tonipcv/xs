/**
 * DPO Conversation Generator
 * Generates DPO preference pairs from conversation logs
 */

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  metadata?: Record<string, unknown>;
}

export interface DPOGeneratedPair {
  chosen: string;
  rejected: string;
  context: string;
  source_conversation_id: string;
  generation_method: 'response_comparison' | 'turn_completion' | 'alternative_path';
  confidence: number;
}

export interface DPOGenerationConfig {
  method: 'response_comparison' | 'turn_completion' | 'alternative_path';
  min_turns?: number;
  include_system_messages?: boolean;
  quality_threshold?: number;
}

export class DPOConversationGenerator {
  generate(
    conversations: Conversation[],
    config: DPOGenerationConfig
  ): DPOGeneratedPair[] {
    const pairs: DPOGeneratedPair[] = [];

    for (const conversation of conversations) {
      const conversationPairs = this.generateFromConversation(conversation, config);
      pairs.push(...conversationPairs);
    }

    return pairs;
  }

  private generateFromConversation(
    conversation: Conversation,
    config: DPOGenerationConfig
  ): DPOGeneratedPair[] {
    const pairs: DPOGeneratedPair[] = [];
    const { method, min_turns = 2 } = config;

    // Filter out system messages if not included
    let messages = conversation.messages;
    if (!config.include_system_messages) {
      messages = messages.filter(m => m.role !== 'system');
    }

    if (messages.length < min_turns) {
      return []; // Not enough turns
    }

    if (method === 'response_comparison') {
      // Find consecutive assistant responses and compare
      for (let i = 1; i < messages.length - 1; i++) {
        if (messages[i].role === 'assistant' && messages[i + 1]?.role === 'assistant') {
          const context = this.buildContext(messages.slice(0, i));
          const chosen = messages[i].content;
          const rejected = messages[i + 1].content;

          if (this.isValidPair(chosen, rejected)) {
            pairs.push({
              chosen,
              rejected,
              context,
              source_conversation_id: conversation.id,
              generation_method: 'response_comparison',
              confidence: this.calculateConfidence(chosen, rejected),
            });
          }
        }
      }
    }

    if (method === 'turn_completion') {
      // Generate pairs from incomplete turns vs complete turns
      // Look for user messages followed by assistant responses
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant') {
          const fullContext = this.buildContext(messages.slice(0, i + 1));
          const fullResponse = messages[i + 1].content;
          
          // Truncated version as "rejected" (at least 10 chars for validation)
          const truncateLength = Math.max(10, Math.floor(fullResponse.length / 2));
          const truncatedResponse = fullResponse.slice(0, truncateLength);
          
          if (this.isValidPair(fullResponse, truncatedResponse)) {
            pairs.push({
              chosen: fullResponse,
              rejected: truncatedResponse,
              context: fullContext,
              source_conversation_id: conversation.id,
              generation_method: 'turn_completion',
              confidence: 0.7, // Lower confidence for synthetic truncation
            });
          }
        }
      }
    }

    if (method === 'alternative_path') {
      // Simulate alternative conversation paths
      for (let i = 2; i < messages.length - 2; i += 2) {
        const context = this.buildContext(messages.slice(0, i));
        const actualResponse = messages[i + 1]?.content;
        const alternativeResponse = messages[i + 3]?.content; // Skip one turn

        if (actualResponse && alternativeResponse && this.isValidPair(actualResponse, alternativeResponse)) {
          pairs.push({
            chosen: actualResponse,
            rejected: alternativeResponse,
            context,
            source_conversation_id: conversation.id,
            generation_method: 'alternative_path',
            confidence: 0.6, // Lower confidence for alternative paths
          });
        }
      }
    }

    return pairs;
  }

  private buildContext(messages: ConversationMessage[]): string {
    return messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
  }

  private isValidPair(chosen: string, rejected: string): boolean {
    // Basic validation
    if (!chosen || !rejected) return false;
    if (chosen.trim() === rejected.trim()) return false;
    if (chosen.length < 10 || rejected.length < 10) return false;
    return true;
  }

  private calculateConfidence(chosen: string, rejected: string): number {
    // Higher confidence if chosen is significantly longer/more detailed
    const lengthRatio = chosen.length / (rejected.length || 1);
    
    if (lengthRatio > 2) return 0.9;
    if (lengthRatio > 1.5) return 0.8;
    if (lengthRatio > 1.2) return 0.7;
    return 0.6;
  }

  getStatistics(pairs: DPOGeneratedPair[]): {
    total: number;
    byMethod: Record<string, number>;
    avgConfidence: number;
    avgChosenLength: number;
    avgRejectedLength: number;
  } {
    if (pairs.length === 0) {
      return {
        total: 0,
        byMethod: {},
        avgConfidence: 0,
        avgChosenLength: 0,
        avgRejectedLength: 0,
      };
    }

    const byMethod: Record<string, number> = {};
    let totalConfidence = 0;
    let totalChosenLength = 0;
    let totalRejectedLength = 0;

    for (const pair of pairs) {
      byMethod[pair.generation_method] = (byMethod[pair.generation_method] || 0) + 1;
      totalConfidence += pair.confidence;
      totalChosenLength += pair.chosen.length;
      totalRejectedLength += pair.rejected.length;
    }

    return {
      total: pairs.length,
      byMethod,
      avgConfidence: totalConfidence / pairs.length,
      avgChosenLength: totalChosenLength / pairs.length,
      avgRejectedLength: totalRejectedLength / pairs.length,
    };
  }
}
