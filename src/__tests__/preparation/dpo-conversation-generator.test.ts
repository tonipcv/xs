import { describe, it, expect } from 'vitest';
import { DPOConversationGenerator, Conversation } from '@/lib/preparation/compile/dpo-conversation-generator';

describe('DPOConversationGenerator', () => {
  const generator = new DPOConversationGenerator();

  describe('generate with response_comparison method', () => {
    it('should generate pairs from conversations with multiple assistant responses', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'What is diabetes?' },
            { role: 'assistant', content: 'Diabetes is a chronic condition affecting blood sugar. It requires careful management of diet and exercise.' },
            { role: 'assistant', content: 'Diabetes condition.' }, // Shorter/worse response (17 chars)
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'response_comparison' });

      expect(result).toHaveLength(1);
      expect(result[0].chosen).toBe('Diabetes is a chronic condition affecting blood sugar. It requires careful management of diet and exercise.');
      expect(result[0].rejected).toBe('Diabetes condition.');
      expect(result[0].generation_method).toBe('response_comparison');
      expect(result[0].source_conversation_id).toBe('conv-1');
      expect(result[0].confidence).toBeGreaterThan(0.5);
    });

    it('should not generate pairs when responses are identical', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'assistant', content: 'Hi there!' }, // Same as previous
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'response_comparison' });

      expect(result).toHaveLength(0);
    });

    it('should build context from conversation history', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'Question 1' },
            { role: 'assistant', content: 'Answer 1 with detailed explanation here' },
            { role: 'assistant', content: 'Short answer here' }, // Second assistant response (19 chars)
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'response_comparison' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].context).toContain('user: Question 1');
    });
  });

  describe('generate with turn_completion method', () => {
    it('should generate pairs comparing full vs truncated responses', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'Explain diabetes' },
            { role: 'assistant', content: 'Diabetes is a chronic medical condition that affects how your body processes blood sugar. It occurs when the body cannot produce enough insulin or cannot use it effectively.' },
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'turn_completion' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].chosen.length).toBeGreaterThan(result[0].rejected.length);
      expect(result[0].generation_method).toBe('turn_completion');
    });
  });

  describe('generate with alternative_path method', () => {
    it('should generate pairs from alternative conversation paths', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'Response A' },
            { role: 'user', content: 'Q2' },
            { role: 'assistant', content: 'Response B' },
            { role: 'user', content: 'Q3' },
            { role: 'assistant', content: 'Response C' },
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'alternative_path' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].generation_method).toBe('alternative_path');
    });
  });

  describe('min_turns filtering', () => {
    it('should skip conversations with fewer turns than min_turns', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
          ],
        },
      ];

      const result = generator.generate(conversations, { 
        method: 'response_comparison',
        min_turns: 2 
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('system messages handling', () => {
    it('should exclude system messages by default', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'system', content: 'You are a medical assistant.' },
            { role: 'user', content: 'What is flu?' },
            { role: 'assistant', content: 'Flu is a viral infection with symptoms including fever and cough.' },
            { role: 'assistant', content: 'Viral disease.' },
          ],
        },
      ];

      const result = generator.generate(conversations, { 
        method: 'response_comparison',
        include_system_messages: false 
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].context).not.toContain('system:');
    });

    it('should include system messages when configured', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          messages: [
            { role: 'system', content: 'You are a medical assistant.' },
            { role: 'user', content: 'What is flu?' },
            { role: 'assistant', content: 'Flu is a viral infection with symptoms including fever and cough.' },
            { role: 'assistant', content: 'Viral disease.' },
          ],
        },
      ];

      const result = generator.generate(conversations, { 
        method: 'response_comparison',
        include_system_messages: true 
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].context).toContain('system:');
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics correctly', () => {
      const pairs = [
        {
          chosen: 'Detailed response',
          rejected: 'Short',
          context: '',
          source_conversation_id: 'c1',
          generation_method: 'response_comparison' as const,
          confidence: 0.8,
        },
        {
          chosen: 'Another detailed response',
          rejected: 'Another short',
          context: '',
          source_conversation_id: 'c2',
          generation_method: 'turn_completion' as const,
          confidence: 0.7,
        },
      ];

      const stats = generator.getStatistics(pairs);

      expect(stats.total).toBe(2);
      expect(stats.byMethod['response_comparison']).toBe(1);
      expect(stats.byMethod['turn_completion']).toBe(1);
      expect(stats.avgConfidence).toBe(0.75);
      expect(stats.avgChosenLength).toBeGreaterThan(stats.avgRejectedLength);
    });

    it('should handle empty pairs array', () => {
      const stats = generator.getStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.avgConfidence).toBe(0);
    });
  });

  describe('medical use cases', () => {
    it('should handle medical consultation conversations', () => {
      const conversations: Conversation[] = [
        {
          id: 'medical-conv-1',
          messages: [
            { role: 'user', content: 'What are the symptoms of diabetes?' },
            { role: 'assistant', content: 'Common symptoms of diabetes include increased thirst, frequent urination, extreme hunger, unexplained weight loss, fatigue, irritability, blurred vision, slow-healing sores, and frequent infections.' },
            { role: 'assistant', content: 'Thirst, hunger, tiredness.' },
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'response_comparison' });

      expect(result).toHaveLength(1);
      expect(result[0].chosen).toContain('increased thirst');
      expect(result[0].chosen).toContain('frequent urination');
      expect(result[0].rejected).toBe('Thirst, hunger, tiredness.');
      expect(result[0].confidence).toBeGreaterThan(0.8); // High confidence due to significant length difference
    });

    it('should handle multi-turn medical consultations', () => {
      const conversations: Conversation[] = [
        {
          id: 'medical-conv-2',
          messages: [
            { role: 'user', content: 'I have a headache' },
            { role: 'assistant', content: 'How long have you had this headache?' },
            { role: 'user', content: 'About 3 days' },
            { role: 'assistant', content: 'Headaches lasting more than 3 days should be evaluated by a doctor. Please schedule an appointment.' },
            { role: 'assistant', content: 'See a doctor.' },
          ],
        },
      ];

      const result = generator.generate(conversations, { method: 'response_comparison' });

      expect(result).toHaveLength(1);
      expect(result[0].chosen).toContain('more than 3 days');
      expect(result[0].context).toContain('I have a headache');
      expect(result[0].context).toContain('About 3 days');
    });
  });
});
