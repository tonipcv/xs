/**
 * OpenAI stub for backward compatibility
 * TODO: Implement proper OpenAI integration
 */

export const openai = {
  chat: {
    completions: {
      create: async (_params: any) => {
        console.warn('OpenAI stubbed');
        return { choices: [{ message: { content: 'Stubbed response' } }] };
      },
    },
  },
  audio: {
    transcriptions: {
      create: async (_params: any) => {
        console.warn('OpenAI audio stubbed');
        return { 
          segments: [], 
          text: 'Stubbed transcription',
          language: 'en'
        };
      },
    },
  },
};

export default openai;
