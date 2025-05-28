import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';
import { WhatsAppSyncService } from '@/lib/whatsapp-sync-service';
import { WhatsAppService } from '@/lib/whatsapp-service';

const prisma = new PrismaClient();

const whatsappService = new WhatsAppService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

const syncService = new WhatsAppSyncService(
  process.env.EVOLUTION_API_URL || 'https://boop-evolution-api.dpbdp1.easypanel.host',
  process.env.EVOLUTION_API_KEY
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { instanceId } = await params;
    const { searchParams } = new URL(request.url);
    
    const type = searchParams.get('type') || 'contacts'; // contacts, chats, messages
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const search = searchParams.get('search') || '';
    const includeGroups = searchParams.get('includeGroups') !== 'false';

    const skip = (page - 1) * limit;

    // Verificar se a instância pertence ao usuário
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        userId: session.user.id
      }
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    let data, total;

    switch (type) {
      case 'contacts':
        // Buscar apenas contatos que têm mensagens (conversas reais)
        // Excluir grupos automaticamente
        const contactsWhere = {
          instanceId,
          jid: { not: { endsWith: '@g.us' } }, // Sempre excluir grupos
          ...(search && {
            OR: [
              { pushName: { contains: search } },
              { profileName: { contains: search } },
              { phone: { contains: search } }
            ]
          })
        };

        // Buscar contatos que têm mensagens usando uma query mais eficiente
        [data, total] = await Promise.all([
          prisma.whatsAppContact.findMany({
            where: {
              ...contactsWhere,
              // Apenas contatos que têm pelo menos uma mensagem
              jid: {
                in: await prisma.whatsAppMessage.findMany({
                  where: { 
                    instanceId,
                    remoteJid: { not: { endsWith: '@g.us' } }
                  },
                  select: { remoteJid: true },
                  distinct: ['remoteJid']
                }).then(msgs => msgs.map(m => m.remoteJid))
              }
            },
            select: {
              id: true,
              jid: true,
              phone: true,
              pushName: true,
              profileName: true,
              profilePicUrl: true,
              isMyContact: true,
              isWABusiness: true,
              businessName: true,
              verifiedName: true,
              isGroup: true,
              lastSeen: true,
              isOnline: true,
              createdAt: true,
              updatedAt: true,
              labels: {
                include: {
                  label: true
                }
              }
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit
          }),
          // Contar total de contatos com mensagens
          prisma.whatsAppContact.count({
            where: {
              ...contactsWhere,
              jid: {
                in: await prisma.whatsAppMessage.findMany({
                  where: { 
                    instanceId,
                    remoteJid: { not: { endsWith: '@g.us' } }
                  },
                  select: { remoteJid: true },
                  distinct: ['remoteJid']
                }).then(msgs => msgs.map(m => m.remoteJid))
              }
            }
          })
        ]);
        break;

      case 'chats':
        const chatsWhere = {
          instanceId,
          ...(search && {
            OR: [
              { name: { contains: search } },
              { remoteJid: { contains: search } }
            ]
          }),
          ...(includeGroups === false && { 
            remoteJid: { not: { endsWith: '@g.us' } } 
          })
        };

        [data, total] = await Promise.all([
          prisma.whatsAppChat.findMany({
            where: chatsWhere,
            select: {
              id: true,
              remoteJid: true,
              name: true,
              isGroup: true,
              unreadCount: true,
              lastMessageTime: true,
              lastMessagePreview: true,
              isArchived: true,
              isMuted: true,
              isPinned: true,
              createdAt: true,
              updatedAt: true,
              contact: {
                select: {
                  pushName: true,
                  profileName: true,
                  profilePicUrl: true
                }
              },
              _count: {
                select: {
                  messages: true
                }
              }
            },
            orderBy: { lastMessageTime: 'desc' },
            skip,
            take: limit
          }),
          prisma.whatsAppChat.count({ where: chatsWhere })
        ]);
        break;

      case 'messages':
        const chatId = searchParams.get('chatId');
        if (!chatId) {
          return NextResponse.json({ error: 'chatId é obrigatório para listar mensagens' }, { status: 400 });
        }

        const messagesWhere = {
          instanceId,
          chatId,
          ...(search && {
            content: { contains: search }
          })
        };

        [data, total] = await Promise.all([
          prisma.whatsAppMessage.findMany({
            where: messagesWhere,
            select: {
              id: true,
              messageId: true,
              remoteJid: true,
              fromJid: true,
              toJid: true,
              messageType: true,
              content: true,
              caption: true,
              mediaUrl: true,
              fileName: true,
              fromMe: true,
              status: true,
              timestamp: true,
              quotedMessageId: true,
              isForwarded: true,
              isDeleted: true,
              reaction: true,
              createdAt: true
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limit
          }),
          prisma.whatsAppMessage.count({ where: messagesWhere })
        ]);
        break;

      default:
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      meta: {
        type,
        instanceId,
        search,
        includeGroups
      }
    });

  } catch (error: any) {
    console.error('Erro ao buscar dados:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    }, { 
      status: 500 
    });
  }
} 