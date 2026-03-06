import { describe, it, expect, beforeEach } from 'vitest';
import { SFTTemplates, SFTExample } from '@/lib/preparation/compile/sft-templates';

describe('SFTTemplates', () => {
  let templates: SFTTemplates;

  beforeEach(() => {
    templates = new SFTTemplates();
  });

  describe('ChatML template', () => {
    it('should format basic example with user and assistant', () => {
      const example: SFTExample = {
        input: 'What is the capital of France?',
        output: 'The capital of France is Paris.',
      };

      const result = templates.formatChatML(example);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'What is the capital of France?',
      });
      expect(result.messages[1]).toEqual({
        role: 'assistant',
        content: 'The capital of France is Paris.',
      });
    });

    it('should include system message when provided', () => {
      const example: SFTExample = {
        input: 'What is 2+2?',
        output: '4',
        system: 'You are a helpful math tutor.',
      };

      const result = templates.formatChatML(example);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful math tutor.',
      });
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[2].role).toBe('assistant');
    });
  });

  describe('Alpaca template', () => {
    it('should format basic example with instruction and response', () => {
      const example: SFTExample = {
        input: 'What is machine learning?',
        output: 'Machine learning is a subset of artificial intelligence...',
      };

      const result = templates.formatAlpaca(example);

      expect(result.text).toContain('### Instruction:');
      expect(result.text).toContain('### Input:');
      expect(result.text).toContain('What is machine learning?');
      expect(result.text).toContain('### Response:');
      expect(result.text).toContain('Machine learning is a subset');
    });

    it('should use custom instruction when provided', () => {
      const example: SFTExample = {
        input: 'Patient has fever and cough',
        output: 'Possible diagnosis: Upper respiratory infection',
        instruction: 'Provide a differential diagnosis based on symptoms.',
      };

      const result = templates.formatAlpaca(example);

      expect(result.text).toContain('Provide a differential diagnosis');
      expect(result.text).toContain('Patient has fever and cough');
      expect(result.text).toContain('Possible diagnosis');
    });

    it('should use default instruction when not provided', () => {
      const example: SFTExample = {
        input: 'Test input',
        output: 'Test output',
      };

      const result = templates.formatAlpaca(example);

      expect(result.text).toContain('Respond to the following:');
    });
  });

  describe('ShareGPT template', () => {
    it('should format basic conversation', () => {
      const example: SFTExample = {
        input: 'Hello, how are you?',
        output: 'I am doing well, thank you for asking!',
      };

      const result = templates.formatShareGPT(example);

      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0]).toEqual({
        from: 'human',
        value: 'Hello, how are you?',
      });
      expect(result.conversations[1]).toEqual({
        from: 'gpt',
        value: 'I am doing well, thank you for asking!',
      });
    });

    it('should include system message when provided', () => {
      const example: SFTExample = {
        input: 'What is your purpose?',
        output: 'My purpose is to assist you with information and tasks.',
        system: 'You are a helpful AI assistant.',
      };

      const result = templates.formatShareGPT(example);

      expect(result.conversations).toHaveLength(3);
      expect(result.conversations[0]).toEqual({
        from: 'system',
        value: 'You are a helpful AI assistant.',
      });
      expect(result.conversations[1].from).toBe('human');
      expect(result.conversations[2].from).toBe('gpt');
    });
  });

  describe('format method', () => {
    const example: SFTExample = {
      input: 'Test input',
      output: 'Test output',
    };

    it('should format using chatml template', () => {
      const result = templates.format(example, 'chatml');
      expect(result).toHaveProperty('messages');
    });

    it('should format using alpaca template', () => {
      const result = templates.format(example, 'alpaca');
      expect(result).toHaveProperty('text');
    });

    it('should format using sharegpt template', () => {
      const result = templates.format(example, 'sharegpt');
      expect(result).toHaveProperty('conversations');
    });

    it('should throw error for unknown template', () => {
      expect(() => {
        templates.format(example, 'unknown' as any);
      }).toThrow('Unknown template type: unknown');
    });
  });

  describe('validation', () => {
    it('should validate correct example', () => {
      const example: SFTExample = {
        input: 'Valid input',
        output: 'Valid output',
      };

      const result = templates.validate(example);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject example with empty input', () => {
      const example: SFTExample = {
        input: '',
        output: 'Valid output',
      };

      const result = templates.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is required and cannot be empty');
    });

    it('should reject example with empty output', () => {
      const example: SFTExample = {
        input: 'Valid input',
        output: '',
      };

      const result = templates.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Output is required and cannot be empty');
    });

    it('should reject example with whitespace-only input', () => {
      const example: SFTExample = {
        input: '   ',
        output: 'Valid output',
      };

      const result = templates.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should collect multiple errors', () => {
      const example: SFTExample = {
        input: '',
        output: '',
      };

      const result = templates.validate(example);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens for formatted example', () => {
      const example: SFTExample = {
        input: 'What is the weather today?',
        output: 'The weather is sunny and warm.',
      };

      const tokens = templates.estimateTokens(example, 'chatml');

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate different token counts for different templates', () => {
      const example: SFTExample = {
        input: 'Test',
        output: 'Response',
      };

      const chatMLTokens = templates.estimateTokens(example, 'chatml');
      const alpacaTokens = templates.estimateTokens(example, 'alpaca');
      const sharegptTokens = templates.estimateTokens(example, 'sharegpt');

      // All should be positive
      expect(chatMLTokens).toBeGreaterThan(0);
      expect(alpacaTokens).toBeGreaterThan(0);
      expect(sharegptTokens).toBeGreaterThan(0);

      // They should be different due to different formatting
      expect(chatMLTokens).not.toBe(alpacaTokens);
    });
  });

  describe('medical use case examples', () => {
    it('should format clinical note with ChatML', () => {
      const example: SFTExample = {
        input: 'Patient presents with chest pain and shortness of breath.',
        output: 'Recommend immediate cardiac evaluation including ECG and troponin levels.',
        system: 'You are a clinical decision support system.',
      };

      const result = templates.formatChatML(example);

      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('clinical decision support');
      expect(result.messages[1].content).toContain('chest pain');
      expect(result.messages[2].content).toContain('cardiac evaluation');
    });

    it('should format diagnosis task with Alpaca', () => {
      const example: SFTExample = {
        input: 'Fever 39°C, productive cough, chest X-ray shows infiltrate',
        output: 'Likely diagnosis: Community-acquired pneumonia. Recommend antibiotics and supportive care.',
        instruction: 'Based on the clinical presentation, provide a diagnosis and treatment plan.',
      };

      const result = templates.formatAlpaca(example);

      expect(result.text).toContain('diagnosis and treatment plan');
      expect(result.text).toContain('pneumonia');
    });
  });
});
