export type TemplateType = 'chatml' | 'alpaca' | 'sharegpt';

export interface SFTExample {
  input: string;
  output: string;
  system?: string;
  instruction?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class SFTTemplates {
  /**
   * Format example using ChatML template
   * Used by: OpenAI, Mistral, many open models
   */
  formatChatML(example: SFTExample): { messages: ChatMessage[] } {
    const messages: ChatMessage[] = [];

    if (example.system) {
      messages.push({
        role: 'system',
        content: example.system,
      });
    }

    messages.push({
      role: 'user',
      content: example.input,
    });

    messages.push({
      role: 'assistant',
      content: example.output,
    });

    return { messages };
  }

  /**
   * Format example using Alpaca template
   * Used by: Alpaca, Vicuna, many instruction-tuned models
   */
  formatAlpaca(example: SFTExample): { text: string } {
    const instruction = example.instruction || 'Respond to the following:';
    
    let text = `### Instruction:\n${instruction}\n\n`;
    
    if (example.input) {
      text += `### Input:\n${example.input}\n\n`;
    }
    
    text += `### Response:\n${example.output}`;

    return { text };
  }

  /**
   * Format example using ShareGPT template
   * Used by: ShareGPT datasets, various chat models
   */
  formatShareGPT(example: SFTExample): { conversations: Array<{ from: string; value: string }> } {
    const conversations: Array<{ from: string; value: string }> = [];

    if (example.system) {
      conversations.push({
        from: 'system',
        value: example.system,
      });
    }

    conversations.push({
      from: 'human',
      value: example.input,
    });

    conversations.push({
      from: 'gpt',
      value: example.output,
    });

    return { conversations };
  }

  /**
   * Format example using the specified template
   */
  format(example: SFTExample, template: TemplateType): Record<string, any> {
    switch (template) {
      case 'chatml':
        return this.formatChatML(example);
      case 'alpaca':
        return this.formatAlpaca(example);
      case 'sharegpt':
        return this.formatShareGPT(example);
      default:
        throw new Error(`Unknown template type: ${template}`);
    }
  }

  /**
   * Validate that an example has required fields
   */
  validate(example: SFTExample): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!example.input || example.input.trim().length === 0) {
      errors.push('Input is required and cannot be empty');
    }

    if (!example.output || example.output.trim().length === 0) {
      errors.push('Output is required and cannot be empty');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimate token count for formatted example
   * Simple whitespace-based estimation (can be enhanced with tiktoken)
   */
  estimateTokens(example: SFTExample, template: TemplateType): number {
    const formatted = this.format(example, template);
    const text = JSON.stringify(formatted);
    return text.split(/\s+/).length;
  }
}
