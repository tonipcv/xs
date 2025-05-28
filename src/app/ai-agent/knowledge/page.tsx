'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppLayout } from '@/components/AppSidebar';
import { 
  Brain, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  BookOpen,
  MessageSquare,
  DollarSign,
  HelpCircle,
  TrendingUp,
  Zap,
  FileText,
  Settings,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';
import { KnowledgeType } from '@prisma/client';

interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  type: KnowledgeType;
  tags?: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  instance: {
    instanceName: string;
  };
  companyName?: string;
  product?: string;
}

const typeConfig = {
  OBJECTION: { icon: DollarSign, label: 'Objeções', color: 'bg-red-100 text-red-800', emoji: '💰' },
  FAQ: { icon: HelpCircle, label: 'FAQ', color: 'bg-blue-100 text-blue-800', emoji: '❓' },
  CASE: { icon: TrendingUp, label: 'Cases', color: 'bg-green-100 text-green-800', emoji: '📈' },
  FEATURE: { icon: Zap, label: 'Features', color: 'bg-purple-100 text-purple-800', emoji: '⚡' },
  PROCESS: { icon: Settings, label: 'Processos', color: 'bg-orange-100 text-orange-800', emoji: '🔄' },
  SCRIPT: { icon: MessageSquare, label: 'Scripts', color: 'bg-indigo-100 text-indigo-800', emoji: '📝' },
  POLICY: { icon: FileText, label: 'Políticas', color: 'bg-gray-100 text-gray-800', emoji: '📋' },
  MANUAL: { icon: BookOpen, label: 'Manual', color: 'bg-yellow-100 text-yellow-800', emoji: '📖' }
};

export default function KnowledgePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [filteredChunks, setFilteredChunks] = useState<KnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<KnowledgeType | 'ALL'>('ALL');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingChunk, setEditingChunk] = useState<KnowledgeChunk | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'FAQ' as KnowledgeType,
    tags: '',
    priority: 3
  });

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadChunks();
    }
  }, [selectedAgent]);

  useEffect(() => {
    filterChunks();
  }, [chunks, searchTerm, filterType]);

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/ai-agent/configs');
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
        if (data.agents?.length > 0) {
          setSelectedAgent(data.agents[0].id);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar agentes:', error);
      toast.error('Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  };

  const loadChunks = async () => {
    if (!selectedAgent) return;
    
    try {
      const response = await fetch(`/api/ai-agent/knowledge?agentId=${selectedAgent}`);
      if (response.ok) {
        const data = await response.json();
        setChunks(data.chunks || []);
      }
    } catch (error) {
      console.error('Erro ao carregar conhecimento:', error);
      toast.error('Erro ao carregar base de conhecimento');
    }
  };

  const filterChunks = () => {
    let filtered = chunks;

    if (searchTerm) {
      filtered = filtered.filter(chunk => 
        chunk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chunk.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chunk.tags?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== 'ALL') {
      filtered = filtered.filter(chunk => chunk.type === filterType);
    }

    setFilteredChunks(filtered);
  };

  const createChunk = async () => {
    if (!selectedAgent) return;
    
    setCreating(true);
    try {
      const response = await fetch('/api/ai-agent/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          ...formData
        })
      });

      if (response.ok) {
        toast.success('Conhecimento adicionado com sucesso!');
        setShowCreateForm(false);
        resetForm();
        loadChunks();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao criar conhecimento');
      }
    } catch (error) {
      console.error('Erro ao criar conhecimento:', error);
      toast.error('Erro ao criar conhecimento');
    } finally {
      setCreating(false);
    }
  };

  const updateChunk = async () => {
    if (!editingChunk) return;
    
    setCreating(true);
    try {
      const response = await fetch(`/api/ai-agent/knowledge/${editingChunk.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Conhecimento atualizado com sucesso!');
        setEditingChunk(null);
        resetForm();
        loadChunks();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao atualizar conhecimento');
      }
    } catch (error) {
      console.error('Erro ao atualizar conhecimento:', error);
      toast.error('Erro ao atualizar conhecimento');
    } finally {
      setCreating(false);
    }
  };

  const deleteChunk = async (chunkId: string, title: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${title}"?`)) return;
    
    try {
      const response = await fetch(`/api/ai-agent/knowledge/${chunkId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Conhecimento excluído com sucesso!');
        loadChunks();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao excluir conhecimento');
      }
    } catch (error) {
      console.error('Erro ao excluir conhecimento:', error);
      toast.error('Erro ao excluir conhecimento');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'FAQ',
      tags: '',
      priority: 3
    });
  };

  const startEdit = (chunk: KnowledgeChunk) => {
    setEditingChunk(chunk);
    setFormData({
      title: chunk.title,
      content: chunk.content,
      type: chunk.type,
      tags: chunk.tags || '',
      priority: chunk.priority
    });
  };

  const getTypeStats = () => {
    const stats: Record<KnowledgeType, number> = {
      OBJECTION: 0, FAQ: 0, CASE: 0, FEATURE: 0,
      PROCESS: 0, SCRIPT: 0, POLICY: 0, MANUAL: 0
    };
    
    chunks.forEach(chunk => {
      stats[chunk.type]++;
    });
    
    return stats;
  };

  const selectedAgentData = agents.find(a => a.id === selectedAgent);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-[100dvh] bg-gray-100 pt-4 pb-8 px-2">
        <div className="container mx-auto pl-1 sm:pl-2 md:pl-4 lg:pl-8 max-w-[99%] sm:max-w-[97%] md:max-w-[95%] lg:max-w-[92%]">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link href="/ai-agent">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg sm:text-base md:text-lg font-bold text-gray-900 tracking-[-0.03em] font-inter">
                  Base de Conhecimento
                </h1>
                <p className="text-xs sm:text-xs md:text-xs text-gray-600 tracking-[-0.03em] font-inter">
                  Gerencie o conhecimento dos seus agentes IA
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-3 md:mt-0">
              <Button 
                onClick={() => setShowCreateForm(true)}
                disabled={!selectedAgent}
                className="h-8 sm:h-7 bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 text-xs sm:text-xs"
              >
                <Plus className="h-3 w-3 mr-1.5" />
                Novo Conhecimento
              </Button>
            </div>
          </div>

          {agents.length === 0 ? (
            <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
              <CardContent className="p-6 text-center">
                <Brain className="h-8 w-8 text-gray-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">
                  Nenhum agente encontrado
                </h3>
                <p className="text-gray-600 mb-4 text-xs tracking-[-0.03em] font-inter">
                  Você precisa criar um agente primeiro para adicionar conhecimento.
                </p>
                <Link href="/ai-agent">
                  <Button className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 h-8 text-xs">
                    Criar Agente
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Agent Selector */}
              <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl mb-4">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Label className="text-gray-900 font-medium text-xs">Agente Selecionado:</Label>
                    <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                      <SelectTrigger className="w-full sm:w-[300px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.instance.instanceName} 
                            {agent.companyName && ` - ${agent.companyName}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {Object.entries(getTypeStats()).map(([type, count]) => {
                  const config = typeConfig[type as KnowledgeType];
                  const Icon = config.icon;
                  return (
                    <Card key={type} className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600">{config.label}</p>
                            <p className="text-lg font-bold text-gray-900">{count}</p>
                          </div>
                          <Icon className="h-4 w-4 text-gray-600" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Search and Filters */}
              <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl mb-4">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-3 w-3 text-gray-400" />
                        <Input
                          placeholder="Buscar por título, conteúdo ou tags..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-7 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="w-full md:w-48">
                      <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todos os tipos</SelectItem>
                          {Object.entries(typeConfig).map(([type, config]) => (
                            <SelectItem key={type} value={type}>
                              {config.emoji} {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Knowledge List */}
              <div className="space-y-4">
                {filteredChunks.length === 0 ? (
                  <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                    <CardContent className="p-8 text-center">
                      <Brain className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {chunks.length === 0 ? 'Nenhum conhecimento adicionado' : 'Nenhum resultado encontrado'}
                      </h3>
                      <p className="text-gray-600 mb-4">
                        {chunks.length === 0 
                          ? 'Adicione conhecimento específico para tornar seu agente mais inteligente.'
                          : 'Tente ajustar os filtros ou termo de busca.'
                        }
                      </p>
                      {chunks.length === 0 && (
                        <Button 
                          onClick={() => setShowCreateForm(true)}
                          className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10"
                        >
                          Adicionar Primeiro Conhecimento
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  filteredChunks.map((chunk) => {
                    const config = typeConfig[chunk.type];
                    const Icon = config.icon;
                    return (
                      <Card key={chunk.id} className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <Badge className={config.color}>
                                  <Icon className="h-3 w-3 mr-1" />
                                  {config.label}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <div
                                      key={i}
                                      className={`w-2 h-2 rounded-full ${
                                        i < chunk.priority ? 'bg-yellow-400' : 'bg-gray-200'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {chunk.title}
                              </h3>
                              
                              <p className="text-gray-600 mb-3 line-clamp-3">
                                {chunk.content}
                              </p>
                              
                              {chunk.tags && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {chunk.tags.split(',').map((tag, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {tag.trim()}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              <p className="text-xs text-gray-600">
                                Criado em {new Date(chunk.createdAt).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(chunk)}
                                className="border-gray-300 text-gray-700 hover:bg-gray-100"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteChunk(chunk.id, chunk.title)}
                                className="border-red-300 text-red-600 hover:bg-red-500 hover:text-white"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Create/Edit Modal */}
        <Dialog open={showCreateForm || !!editingChunk} onOpenChange={(open) => {
          if (!open) {
            setShowCreateForm(false);
            setEditingChunk(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-gray-300 shadow-2xl">
            <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 -m-6 mb-6 rounded-t-lg">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Brain className="h-5 w-5" />
                {editingChunk ? 'Editar Conhecimento' : 'Adicionar Conhecimento'}
              </DialogTitle>
              <DialogDescription className="text-gray-200">
                {editingChunk ? 'Modifique as informações do conhecimento' : 'Adicione novo conhecimento à base do agente'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Tipo de Conhecimento</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as KnowledgeType }))}>
                    <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-300 text-gray-900">
                      {Object.entries(typeConfig).map(([type, config]) => (
                        <SelectItem key={type} value={type} className="text-gray-900 hover:bg-gray-100">
                          {config.emoji} {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Prioridade (1-5)</Label>
                  <Select value={formData.priority.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: parseInt(value) }))}>
                    <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-300 text-gray-900">
                      <SelectItem value="1" className="text-gray-900 hover:bg-gray-100">⭐ 1 - Baixa</SelectItem>
                      <SelectItem value="2" className="text-gray-900 hover:bg-gray-100">⭐⭐ 2 - Baixa-Média</SelectItem>
                      <SelectItem value="3" className="text-gray-900 hover:bg-gray-100">⭐⭐⭐ 3 - Média</SelectItem>
                      <SelectItem value="4" className="text-gray-900 hover:bg-gray-100">⭐⭐⭐⭐ 4 - Alta</SelectItem>
                      <SelectItem value="5" className="text-gray-900 hover:bg-gray-100">⭐⭐⭐⭐⭐ 5 - Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-medium">Título</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex: Como responder objeção de preço"
                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-medium">Conteúdo</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Descreva o conhecimento detalhadamente..."
                  className="min-h-[120px] bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 font-medium">Tags (separadas por vírgula)</Label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="Ex: preço, desconto, valor, investimento"
                  className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-gray-900"
                />
              </div>
            </div>

            <DialogFooter className="flex gap-3 pt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingChunk(null);
                  resetForm();
                }}
                className="border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancelar
              </Button>
              <Button 
                onClick={editingChunk ? updateChunk : createChunk}
                disabled={creating || !formData.title || !formData.content}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                {creating ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Brain className="h-4 w-4 mr-2" />
                )}
                {creating ? 'Salvando...' : (editingChunk ? 'Atualizar' : 'Adicionar')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
} 