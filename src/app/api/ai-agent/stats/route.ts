import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar dados do usuário para tokens
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        tokensUsedThisMonth: true,
        freeTokensLimit: true,
        totalTokensUsed: true,
        lastTokenReset: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verificar se precisa resetar tokens mensais
    const now = new Date();
    const lastReset = new Date(user.lastTokenReset);
    const shouldReset = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

    let tokensUsedThisMonth = user.tokensUsedThisMonth;
    if (shouldReset) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          tokensUsedThisMonth: 0,
          lastTokenReset: now
        }
      });
      tokensUsedThisMonth = 0;
    }

    // Calcular tokens usados hoje
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const tokensUsedToday = await prisma.aIConversationMessage.aggregate({
      where: {
        conversation: {
          agentConfig: {
            instance: {
              userId: session.user.id
            }
          }
        },
        timestamp: {
          gte: startOfDay
        },
        role: 'assistant'
      },
      _sum: {
        tokens: true
      }
    });

    // Estatísticas de mensagens hoje
    const messagesStats = await prisma.whatsAppMessage.aggregate({
      where: {
        instance: {
          userId: session.user.id
        },
        timestamp: {
          gte: startOfDay
        }
      },
      _count: {
        id: true
      }
    });

    // Respostas IA hoje
    const aiResponsesStats = await prisma.aIConversationMessage.aggregate({
      where: {
        conversation: {
          agentConfig: {
            instance: {
              userId: session.user.id
            }
          }
        },
        timestamp: {
          gte: startOfDay
        },
        role: 'assistant'
      },
      _count: {
        id: true
      }
    });

    // Tempo médio de resposta
    const avgResponseTime = await prisma.aIConversationMessage.aggregate({
      where: {
        conversation: {
          agentConfig: {
            instance: {
              userId: session.user.id
            }
          }
        },
        role: 'assistant',
        responseTime: {
          not: null
        }
      },
      _avg: {
        responseTime: true
      }
    });

    // Conversas ativas (com mensagem nas últimas 24h)
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const activeConversations = await prisma.aIConversation.count({
      where: {
        agentConfig: {
          instance: {
            userId: session.user.id
          }
        },
        lastMessageAt: {
          gte: last24Hours
        }
      }
    });

    // Erros hoje
    const errorsToday = await prisma.aIAgentLog.count({
      where: {
        agentConfig: {
          instance: {
            userId: session.user.id
          }
        },
        type: 'error',
        timestamp: {
          gte: startOfDay
        }
      }
    });

    const stats = {
      totalMessages: messagesStats._count.id || 0,
      aiResponses: aiResponsesStats._count.id || 0,
      avgResponseTime: Math.round(avgResponseTime._avg.responseTime || 0),
      activeConversations,
      errorsToday,
      uptime: 100, // Placeholder - implementar monitoramento real
      tokensUsedToday: tokensUsedToday._sum.tokens || 0,
      tokensUsedThisMonth,
      freeTokensRemaining: Math.max(0, user.freeTokensLimit - tokensUsedThisMonth)
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
} 