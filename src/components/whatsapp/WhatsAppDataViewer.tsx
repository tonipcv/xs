'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Users,
  MessageCircle,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Building,
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  jid: string;
  phone?: string;
  pushName?: string;
  profileName?: string;
  profilePicUrl?: string;
  isMyContact: boolean;
  isWABusiness: boolean;
  businessName?: string;
  verifiedName?: string;
  isGroup: boolean;
  lastSeen?: string;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color?: string;
    };
  }>;
}

interface Chat {
  id: string;
  remoteJid: string;
  name?: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTime?: string;
  lastMessagePreview?: string;
  isArchived: boolean;
  isMuted: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  contact?: {
    pushName?: string;
    profileName?: string;
    profilePicUrl?: string;
  };
  _count?: {
    messages: number;
  };
}

interface Message {
  id: string;
  messageId: string;
  remoteJid: string;
  fromJid?: string;
  toJid?: string;
  messageType: string;
  content?: string;
  caption?: string;
  mediaUrl?: string;
  fileName?: string;
  fromMe: boolean;
  status: string;
  timestamp: string;
  quotedMessageId?: string;
  isForwarded: boolean;
  isDeleted: boolean;
  reaction?: string;
  createdAt: string;
}

interface WhatsAppDataViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
}

export function WhatsAppDataViewer({
  open,
  onOpenChange,
  instanceId,
  instanceName
}: WhatsAppDataViewerProps) {
  const [activeTab, setActiveTab] = useState<'contacts' | 'chats' | 'messages'>('contacts');
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [includeGroups, setIncludeGroups] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string>('');

  useEffect(() => {
    if (open) {
      setPage(1);
      if (activeTab !== 'messages' || selectedChatId) {
        fetchData();
      }
    }
  }, [open, activeTab, search, includeGroups, selectedChatId]);

  useEffect(() => {
    if (open) {
      if (activeTab !== 'messages' || selectedChatId) {
        fetchData();
      }
    }
  }, [page]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeTab,
        page: page.toString(),
        limit: limit.toString(),
        search,
        includeGroups: includeGroups.toString(),
        ...(activeTab === 'messages' && selectedChatId && { chatId: selectedChatId })
      });

      const response = await fetch(`/api/whatsapp/instances/${instanceId}/data?${params}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao buscar dados');
      }

      const result = await response.json();
      setData(result.data);
      setPagination(result.pagination);

    } catch (error: any) {
      console.error('Erro ao buscar dados:', error);
      toast.error('Erro ao carregar dados', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: 'contacts' | 'chats' | 'messages') => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
    if (tab !== 'messages') {
      setSelectedChatId('');
    }
  };

  const handleRefresh = async () => {
    console.log('🔄 Atualizando dados...');
    await fetchData();
    toast.success('Dados atualizados!', {
      description: 'As informações foram recarregadas com sucesso.'
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return '';
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const renderContacts = () => (
    <div className="space-y-4">
      {data.map((contact: Contact) => (
        <Card key={contact.id} className="bg-white/70 backdrop-blur-sm border-gray-200/50 hover:shadow-lg transition-all duration-200 rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <Avatar className="h-12 w-12 border-2 border-[#D6D2D3]">
                <AvatarImage src={contact.profilePicUrl} />
                <AvatarFallback className="bg-[#D6D2D3] text-[#35426A] font-medium">
                  {contact.isGroup ? '👥' : (contact.pushName?.[0] || contact.phone?.[0] || '?')}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold truncate text-[#35426A]">
                    {contact.pushName || contact.profileName || contact.phone || 'Sem nome'}
                  </h3>
                  <div className="flex space-x-1">
                    {contact.isGroup && (
                      <Badge variant="secondary" className="text-xs bg-[#F8FFFF] text-[#7286B2] border-[#D6D2D3]">
                        Grupo
                      </Badge>
                    )}
                    {contact.isWABusiness && (
                      <Badge variant="outline" className="text-xs border-[#35426A]/20 text-[#35426A]">
                        <Building className="h-3 w-3 mr-1" />
                        Business
                      </Badge>
                    )}
                    {contact.isMyContact && (
                      <Badge variant="outline" className="text-xs border-green-500/20 text-green-600">
                        Contato
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-4 text-xs text-[#7286B2] mt-1">
                  {contact.phone && (
                    <span className="flex items-center">
                      <Phone className="h-3 w-3 mr-1" />
                      {formatPhone(contact.phone)}
                    </span>
                  )}
                  {contact.businessName && (
                    <span>{contact.businessName}</span>
                  )}
                  {contact.isOnline && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      Online
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          
          {contact.labels && contact.labels.length > 0 && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1">
                {contact.labels.map((label, index) => (
                  <Badge 
                    key={index} 
                    variant="outline" 
                    className="text-xs border-[#35426A]/20 text-[#35426A]"
                  >
                    {label.label.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );

  const renderChats = () => (
    <div className="space-y-4">
      {data.map((chat: Chat) => (
        <Card 
          key={chat.id} 
          className={`bg-white/70 backdrop-blur-sm border-gray-200/50 hover:shadow-lg transition-all duration-200 rounded-xl cursor-pointer ${
            selectedChatId === chat.id ? 'ring-2 ring-[#35426A] shadow-lg' : ''
          }`}
          onClick={() => {
            setSelectedChatId(chat.id);
            if (activeTab !== 'messages') {
              setActiveTab('messages');
            }
          }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <Avatar className="h-12 w-12 border-2 border-[#D6D2D3]">
                <AvatarImage src={chat.contact?.profilePicUrl} />
                <AvatarFallback className="bg-[#D6D2D3] text-[#35426A] font-medium">
                  {chat.isGroup ? '👥' : (chat.name?.[0] || chat.contact?.pushName?.[0] || '?')}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold truncate text-[#35426A]">
                    {chat.name || chat.contact?.pushName || chat.contact?.profileName || 'Chat sem nome'}
                  </h3>
                  
                  <div className="flex items-center space-x-2">
                    {selectedChatId === chat.id && (
                      <Badge className="bg-[#35426A] text-white text-xs">
                        Selecionado
                      </Badge>
                    )}
                    {chat.unreadCount > 0 && (
                      <Badge className="bg-green-500 text-white text-xs">
                        {chat.unreadCount}
                      </Badge>
                    )}
                    {chat.isPinned && <span className="text-xs">📌</span>}
                    {chat.isMuted && <span className="text-xs">🔇</span>}
                    {chat.isArchived && <span className="text-xs">📦</span>}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-[#7286B2] mt-1">
                  <span className="truncate flex-1">
                    {chat.lastMessagePreview || 'Nenhuma mensagem'}
                  </span>
                  <div className="flex items-center space-x-2 ml-2">
                    <span className="bg-[#F8FFFF] px-2 py-1 rounded-full">
                      {chat._count?.messages || 0} msgs
                    </span>
                    {chat.lastMessageTime && (
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(chat.lastMessageTime).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );

  const renderMessages = () => {
    if (!selectedChatId) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#D6D2D3] rounded-full flex items-center justify-center">
            <MessageSquare className="h-8 w-8 text-[#7286B2]" />
          </div>
          <p className="text-lg font-semibold text-[#35426A] mb-2">
            Selecione um chat para ver as mensagens
          </p>
          <p className="text-sm text-[#7286B2] mb-6">
            Vá para a aba "Chats" e clique em um chat para visualizar suas mensagens
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="border-[#35426A]/20 text-[#35426A] hover:bg-[#35426A]/10"
            onClick={() => setActiveTab('chats')}
          >
            Ir para Chats
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Header do chat selecionado */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#D6D2D3]/50 to-[#F8FFFF]/50 backdrop-blur-sm rounded-xl border border-gray-200/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#35426A] rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-[#35426A]">
                Mensagens do chat
              </span>
              <p className="text-xs text-[#7286B2]">
                ID: {selectedChatId}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="border-[#35426A]/20 text-[#35426A] hover:bg-[#35426A]/10 flex items-center space-x-2"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setSelectedChatId('');
                setActiveTab('chats');
              }}
              className="border-[#35426A]/20 text-[#35426A] hover:bg-[#35426A]/10"
            >
              Voltar aos Chats
            </Button>
          </div>
        </div>

        {data.map((message: Message) => (
          <Card 
            key={message.id} 
            className={`${
              message.fromMe 
                ? 'ml-8 bg-gradient-to-r from-[#35426A]/10 to-[#1B2541]/5' 
                : 'mr-8 bg-white/70'
            } backdrop-blur-sm border-gray-200/50 rounded-xl`}
          >
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-3">
                    <Badge 
                      variant={message.fromMe ? 'default' : 'secondary'} 
                      className={`text-xs ${
                        message.fromMe 
                          ? 'bg-[#35426A] text-white' 
                          : 'bg-[#F8FFFF] text-[#7286B2] border-[#D6D2D3]'
                      }`}
                    >
                      {message.fromMe ? 'Você' : 'Contato'}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-[#35426A]/20 text-[#35426A]"
                    >
                      {message.messageType}
                    </Badge>
                    <span className="text-xs text-[#7286B2]">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {message.content && (
                      <p className="text-sm text-[#35426A] leading-relaxed">
                        {message.content}
                      </p>
                    )}
                    {message.caption && (
                      <p className="text-sm text-[#7286B2] italic bg-[#F8FFFF]/50 p-2 rounded-lg">
                        {message.caption}
                      </p>
                    )}
                    {message.fileName && (
                      <div className="flex items-center space-x-2 text-xs text-[#7286B2] bg-[#F8FFFF]/50 p-2 rounded-lg">
                        <Mail className="h-3 w-3" />
                        <span>{message.fileName}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Badge 
                  variant="outline" 
                  className="text-xs border-gray-300/50 text-[#7286B2] ml-4"
                >
                  {message.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col bg-gray-100 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
        <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 -m-6 mb-4 rounded-t-2xl">
          <DialogTitle className="text-white text-sm font-semibold tracking-[-0.03em] font-inter">
            Dados do WhatsApp
          </DialogTitle>
          <DialogDescription className="text-gray-200 text-xs tracking-[-0.03em] font-inter">
            Visualizar dados sincronizados da instância <strong className="text-white">{instanceName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-3 px-1">
          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200/20">
            {[
              { key: 'contacts', label: 'Conversas', icon: Users },
              { key: 'chats', label: 'Chats', icon: MessageCircle },
              { key: 'messages', label: 'Mensagens', icon: Mail }
            ].map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={activeTab === key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleTabChange(key as any)}
                className={`flex items-center space-x-2 h-7 text-xs ${
                  activeTab === key 
                    ? 'bg-gray-900 text-white hover:bg-gray-800' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </Button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-500" />
              <Input
                placeholder={`Buscar ${activeTab === 'contacts' ? 'contatos com conversas' : activeTab === 'chats' ? 'chats' : 'mensagens'}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 border-gray-300 focus:border-gray-900 focus:ring-gray-900 h-8 text-xs bg-white"
              />
            </div>
            
            {/* Botão de Atualizar */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="border-gray-300 text-gray-700 hover:bg-gray-100 flex items-center space-x-2 h-8 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </Button>
            
            {activeTab === 'chats' && (
              <Select
                value={includeGroups.toString()}
                onValueChange={(value) => setIncludeGroups(value === 'true')}
              >
                <SelectTrigger className="w-40 border-gray-300 focus:border-gray-900 focus:ring-gray-900 bg-white text-gray-900 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-300">
                  <SelectItem value="false" className="text-gray-900 hover:bg-gray-100 text-xs">Apenas individuais</SelectItem>
                  <SelectItem value="true" className="text-gray-900 hover:bg-gray-100 text-xs">Incluir grupos</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-900 border-t-transparent mx-auto"></div>
                <p className="text-gray-600 mt-2 text-xs">Carregando dados...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-6 text-gray-600">
                <p className="text-xs">Nenhum dado encontrado</p>
              </div>
            ) : (
              <>
                {activeTab === 'contacts' && renderContacts()}
                {activeTab === 'chats' && renderChats()}
                {activeTab === 'messages' && renderMessages()}
              </>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200/20 pt-3">
              <div className="text-xs text-gray-600">
                Página {page} de {pagination.totalPages} • {pagination.total} itens
              </div>
              
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={!pagination.hasPrev || isLoading}
                  className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Anterior
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!pagination.hasNext || isLoading}
                  className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
                >
                  Próximo
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 