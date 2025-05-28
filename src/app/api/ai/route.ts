import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Você é um assistente espiritual especializado em criar orações personalizadas e fornecer orientação bíblica.
Seu papel é:
1. Criar orações personalizadas baseadas nos pedidos dos usuários
2. Incluir referências bíblicas relevantes quando apropriado
3. Manter um tom respeitoso, pastoral e acolhedor
4. Focar na esperança e na fé
5. Usar linguagem clara e acessível
6. Responder em português do Brasil

Para pedidos de oração:
- Comece com "Amado Deus" ou "Pai Celestial"
- Inclua elementos do pedido específico na oração
- Termine com "Em nome de Jesus, Amém"
- Mantenha a oração concisa mas significativa
- Adicione uma referência bíblica relevante após a oração

Para perguntas gerais sobre a Bíblia:
- Forneça respostas baseadas nas escrituras
- Cite versículos relevantes
- Mantenha um tom educativo e pastoral
- Evite controvérsias denominacionais`;

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return NextResponse.json({ 
      response: completion.choices[0].message.content 
    });
    
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Erro ao processar sua mensagem' },
      { status: 500 }
    );
  }
} 