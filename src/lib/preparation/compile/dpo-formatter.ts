/**
 * DPO (Direct Preference Optimization) Formatter
 * Formats preference pairs for RLHF/DPO training
 */

export interface DPOExample {
  chosen: string;
  rejected: string;
  context?: string;
  prompt?: string;
}

export interface DPOValidationResult {
  valid: boolean;
  errors: string[];
}

export class DPOFormatter {
  /**
   * Format example for DPO training
   */
  format(example: DPOExample): {
    prompt: string;
    chosen: string;
    rejected: string;
  } {
    const prompt = example.prompt || example.context || '';

    return {
      prompt,
      chosen: example.chosen,
      rejected: example.rejected,
    };
  }

  /**
   * Validate DPO example
   */
  validate(example: DPOExample): DPOValidationResult {
    const errors: string[] = [];

    if (!example.chosen || example.chosen.trim().length === 0) {
      errors.push('Chosen response is required and cannot be empty');
    }

    if (!example.rejected || example.rejected.trim().length === 0) {
      errors.push('Rejected response is required and cannot be empty');
    }

    if (example.chosen && example.rejected && example.chosen === example.rejected) {
      errors.push('Chosen and rejected responses must be different');
    }

    if (example.chosen && example.chosen.length > 10000) {
      errors.push('Chosen response exceeds maximum length (10000 characters)');
    }

    if (example.rejected && example.rejected.length > 10000) {
      errors.push('Rejected response exceeds maximum length (10000 characters)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimate token count for DPO example
   */
  estimateTokens(example: DPOExample): {
    prompt: number;
    chosen: number;
    rejected: number;
    total: number;
  } {
    const countTokens = (text: string): number => {
      if (!text || text.trim().length === 0) return 0;
      return text.split(/\s+/).length;
    };

    const promptTokens = countTokens(example.prompt || example.context || '');
    const chosenTokens = countTokens(example.chosen);
    const rejectedTokens = countTokens(example.rejected);

    return {
      prompt: promptTokens,
      chosen: chosenTokens,
      rejected: rejectedTokens,
      total: promptTokens + chosenTokens + rejectedTokens,
    };
  }

  /**
   * Format batch of examples
   */
  formatBatch(examples: DPOExample[]): Array<{
    prompt: string;
    chosen: string;
    rejected: string;
  }> {
    return examples.map(example => this.format(example));
  }

  /**
   * Validate batch and return valid examples
   */
  validateBatch(examples: DPOExample[]): {
    valid: Array<DPOExample>;
    invalid: Array<{ example: DPOExample; errors: string[] }>;
  } {
    const valid: DPOExample[] = [];
    const invalid: Array<{ example: DPOExample; errors: string[] }> = [];

    for (const example of examples) {
      const validation = this.validate(example);
      if (validation.valid) {
        valid.push(example);
      } else {
        invalid.push({ example, errors: validation.errors });
      }
    }

    return { valid, invalid };
  }
}
