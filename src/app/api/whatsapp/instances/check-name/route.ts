import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EvolutionApiClient } from '@/lib/evolution-api';

const evolutionApi = new EvolutionApiClient({
  baseUrl: process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  apiKey: process.env.EVOLUTION_API_KEY
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { instanceName } = body;

    if (!instanceName || typeof instanceName !== 'string') {
      return NextResponse.json({ error: 'Nome da instância é obrigatório' }, { status: 400 });
    }

    const trimmedName = instanceName.trim();
    
    if (trimmedName.length < 2) {
      return NextResponse.json({ 
        available: false,
        error: 'Nome deve ter pelo menos 2 caracteres'
      }, { status: 400 });
    }

    // Verificar se o nome está disponível
    const isAvailable = await evolutionApi.isInstanceNameAvailable(trimmedName);

    if (isAvailable) {
      return NextResponse.json({
        available: true,
        instanceName: trimmedName
      });
    }

    // Se não estiver disponível, gerar sugestões
    const suggestions = [];
    const baseName = trimmedName;
    
    // Gerar algumas variações
    for (let i = 1; i <= 5; i++) {
      const suggestion = `${baseName}${i}`;
      const isAvailableSuggestion = await evolutionApi.isInstanceNameAvailable(suggestion);
      if (isAvailableSuggestion) {
        suggestions.push(suggestion);
      }
    }

    // Gerar com timestamp se necessário
    if (suggestions.length < 3) {
      const timestamp = Date.now().toString().slice(-4);
      const timestampSuggestion = `${baseName}_${timestamp}`;
      suggestions.push(timestampSuggestion);
    }

    return NextResponse.json({
      available: false,
      instanceName: trimmedName,
      suggestions: suggestions.slice(0, 5) // Limitar a 5 sugestões
    });

  } catch (error: any) {
    console.error('Erro ao verificar nome da instância:', error);

    return NextResponse.json({
      error: 'Erro interno do servidor',
      available: null
    }, { 
      status: 500 
    });
  }
} 