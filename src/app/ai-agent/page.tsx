'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppLayout } from '@/components/AppSidebar';
import { 
  Bot, 
  Settings, 
  Webhook, 
  Activity, 
  MessageSquare, 
  Clock, 
  Users, 
  AlertTriangle,
  Zap,
  Copy,
  CheckCircle,
  XCircle,
  Plus,
  Edit,
  Trash2,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

interface AIAgentConfig {
  id: string;
  instanceId: string;
  isActive: boolean;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  maxMessagesPerMinute: number;
  maxConsecutiveResponses: number;
  cooldownMinutes: number;
  fallbackMessage: string;
  // Campos do formulário guiado (Camada 1)
  companyName?: string;
  product?: string;
  mainPain?: string;
  successCase?: string;
  priceObjection?: string;
  goal: 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION';
  instance: {
    id: string;
    instanceName: string;
    status: string;
    connectedNumber: string;
  };
}

interface WebhookReadiness {
  isReady: boolean;
  issues: string[];
  webhook?: any;
  settings?: any;
}

interface Stats {
  totalMessages: number;
  aiResponses: number;
  avgResponseTime: number;
  activeConversations: number;
  errorsToday: number;
  uptime: number;
  tokensUsedToday: number;
  tokensUsedThisMonth: number;
  freeTokensRemaining: number;
}

export default function AIAgentPage() {
  const [agents, setAgents] = useState<AIAgentConfig[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [usingNgrok, setUsingNgrok] = useState(false);
  const [ngrokConfigured, setNgrokConfigured] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<Record<string, WebhookReadiness>>({});
  const [webhookSetupLoading, setWebhookSetupLoading] = useState<Record<string, boolean>>({});

  // Estados para templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [promptMode, setPromptMode] = useState<'auto' | 'template' | 'custom'>('auto');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    instanceId: '',
    isActive: true,
    model: 'gpt-3.5-turbo',
    systemPrompt: '',
    maxTokens: 150,
    temperature: 0.7,
    maxMessagesPerMinute: 5,
    maxConsecutiveResponses: 3,
    cooldownMinutes: 30,
    fallbackMessage: 'Desculpe, não posso responder no momento.',
    autoConfigureWebhook: true,
    // Campos do formulário guiado (Camada 1)
    companyName: '',
    product: '',
    mainPain: '',
    successCase: '',
    priceObjection: '',
    goal: 'SALES' as 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION'
  });

  // Edit state
  const [editingAgent, setEditingAgent] = useState<AIAgentConfig | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editFormData, setEditFormData] = useState({
    isActive: true,
    model: 'gpt-3.5-turbo',
    systemPrompt: '',
    maxTokens: 150,
    temperature: 0.7,
    maxMessagesPerMinute: 5,
    maxConsecutiveResponses: 3,
    cooldownMinutes: 30,
    fallbackMessage: '',
    // Campos do formulário guiado (Camada 1)
    companyName: '',
    product: '',
    mainPain: '',
    successCase: '',
    priceObjection: '',
    goal: 'SALES' as 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION'
  });

  // Estados para templates no formulário de edição
  const [editTemplates, setEditTemplates] = useState<any[]>([]);
  const [editSelectedTemplate, setEditSelectedTemplate] = useState<string>('');
  const [editPromptMode, setEditPromptMode] = useState<'auto' | 'template' | 'custom'>('auto');
  const [editLoadingTemplates, setEditLoadingTemplates] = useState(false);

  useEffect(() => {
    loadData();
    loadInstances();
    loadWebhookUrl();
  }, []);

  // Carregar templates quando o objetivo mudar
  useEffect(() => {
    if (formData.goal) {
      loadTemplates(formData.goal);
    }
  }, [formData.goal]);

  // Carregar templates quando o objetivo mudar no formulário de edição
  useEffect(() => {
    if (editFormData.goal && showEditForm) {
      loadEditTemplates(editFormData.goal);
    }
  }, [editFormData.goal, showEditForm]);

  const loadData = async () => {
    try {
      const [agentsRes, statsRes] = await Promise.all([
        fetch('/api/ai-agent/configs'),
        fetch('/api/ai-agent/stats')
      ]);

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        const agentsList = agentsData.agents || [];
        setAgents(agentsList);
        
        // Verificar status do webhook para cada agente
        await checkWebhookStatusForAgents(agentsList);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const checkWebhookStatusForAgents = async (agentsList: AIAgentConfig[]) => {
    const statusMap: Record<string, WebhookReadiness> = {};
    
    for (const agent of agentsList) {
      try {
        const response = await fetch(`/api/ai-agent/webhook/setup?instanceId=${agent.instanceId}`);
        if (response.ok) {
          const data = await response.json();
          statusMap[agent.id] = data.readiness;
        }
      } catch (error) {
        console.error(`Erro ao verificar webhook para ${agent.instance.instanceName}:`, error);
        statusMap[agent.id] = {
          isReady: false,
          issues: ['Erro ao verificar status']
        };
      }
    }
    
    setWebhookStatus(statusMap);
  };

  const setupWebhook = async (agentId: string, instanceId: string) => {
    try {
      setWebhookSetupLoading(prev => ({ ...prev, [agentId]: true }));
      
      const response = await fetch('/api/ai-agent/webhook/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId })
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Webhook configurado com sucesso!');
        loadData();
      } else {
        // Mostrar mensagem de erro mais específica
        if (result.error?.includes('não encontrada') || result.error?.includes('não está conectada')) {
          toast.error('Instância não encontrada ou desconectada. Verifique se a instância está criada e conectada no WhatsApp.');
        } else if (result.error?.includes('404')) {
          toast.error('Instância não existe na Evolution API. Verifique o nome da instância.');
        } else {
          toast.error(result.error || 'Erro ao configurar webhook');
        }
        
        // Log detalhado para debug
        console.error('Erro detalhado do webhook:', result);
      }
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      toast.error('Erro de conexão ao configurar webhook');
    } finally {
      setWebhookSetupLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const loadInstances = async () => {
    try {
      const response = await fetch('/api/whatsapp/instances');
      if (response.ok) {
        const data = await response.json();
        setInstances(data.instances || []);
      }
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
    }
  };

  const loadWebhookUrl = async () => {
    try {
      const response = await fetch('/api/ai-agent/webhook-url');
      if (response.ok) {
        const data = await response.json();
        setWebhookUrl(data.webhookUrl);
        setUsingNgrok(data.usingNgrok);
        setNgrokConfigured(data.ngrokConfigured);
      } else {
        // Fallback para URL local
        setWebhookUrl(`${window.location.origin}/api/ai-agent/webhook/messages-upsert`);
      }
    } catch (error) {
      console.error('Erro ao carregar URL do webhook:', error);
      // Fallback para URL local
      setWebhookUrl(`${window.location.origin}/api/ai-agent/webhook/messages-upsert`);
    }
  };

  const createAgent = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/ai-agent/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (response.ok) {
        let message = 'Agente criado com sucesso!';
        if (result.webhookConfigured) {
          message += ' Webhook configurado automaticamente.';
        } else if (formData.autoConfigureWebhook && formData.isActive) {
          message += ' Webhook não foi configurado automaticamente - configure manualmente.';
        }
        
        toast.success(message);
        setShowCreateForm(false);
        loadData();
        // Reset form
        setFormData({
          instanceId: '',
          isActive: true,
          model: 'gpt-3.5-turbo',
          systemPrompt: '',
          maxTokens: 150,
          temperature: 0.7,
          maxMessagesPerMinute: 5,
          maxConsecutiveResponses: 3,
          cooldownMinutes: 30,
          fallbackMessage: 'Desculpe, não posso responder no momento.',
          autoConfigureWebhook: true,
          // Campos do formulário guiado (Camada 1)
          companyName: '',
          product: '',
          mainPain: '',
          successCase: '',
          priceObjection: '',
          goal: 'SALES' as 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION'
        });
        // Reset template states
        setPromptMode('auto');
        setSelectedTemplate('');
        setTemplates([]);
      } else {
        toast.error(result.error || 'Erro ao criar agente');
      }
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      toast.error('Erro ao criar agente');
    } finally {
      setCreating(false);
    }
  };

  const toggleAgent = async (agentId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/ai-agent/configs/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });

      if (!response.ok) throw new Error('Erro ao atualizar agente');

      await loadData();
      toast.success(`Agente ${isActive ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (error) {
      console.error('Erro ao atualizar agente:', error);
      toast.error('Erro ao atualizar agente');
    }
  };

  const editAgent = async () => {
    if (!editingAgent) return;
    
    console.log('🔄 Iniciando edição do agente:', editingAgent.id);
    console.log('📝 Dados a serem enviados:', JSON.stringify(editFormData, null, 2));
    
    setLoading(true);
    try {
      const response = await fetch(`/api/ai-agent/configs/${editingAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });

      console.log('📡 Resposta da API:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Erro da API:', errorData);
        throw new Error(errorData.error || 'Erro ao atualizar agente');
      }

      const result = await response.json();
      console.log('✅ Agente atualizado com sucesso:', result);

      await loadData();
      setShowEditForm(false);
      setEditingAgent(null);
      toast.success('Agente atualizado com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao atualizar agente:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar agente');
    } finally {
      setLoading(false);
    }
  };

  const handleEditAgent = (agent: AIAgentConfig) => {
    setEditingAgent(agent);
    setEditFormData({
      isActive: agent.isActive,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      maxTokens: agent.maxTokens,
      temperature: agent.temperature,
      maxMessagesPerMinute: agent.maxMessagesPerMinute,
      maxConsecutiveResponses: agent.maxConsecutiveResponses,
      cooldownMinutes: agent.cooldownMinutes,
      fallbackMessage: agent.fallbackMessage,
      companyName: agent.companyName || '',
      product: agent.product || '',
      mainPain: agent.mainPain || '',
      successCase: agent.successCase || '',
      priceObjection: agent.priceObjection || '',
      goal: agent.goal
    });

    // Determinar modo do prompt
    if (agent.systemPrompt && agent.systemPrompt.trim() !== '' && 
        agent.systemPrompt !== 'Você é um assistente virtual útil e amigável.') {
      setEditPromptMode('custom');
    } else {
      setEditPromptMode('auto');
    }

    // Carregar templates para o objetivo
    loadEditTemplates(agent.goal);
    
    setShowEditForm(true);
  };

  const deleteAgent = async (agentId: string, instanceName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o agente ${instanceName}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/ai-agent/configs/${agentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Erro ao excluir agente');

      await loadData();
      toast.success('Agente excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir agente:', error);
      toast.error('Erro ao excluir agente');
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada!');
  };

  const availableInstances = instances.filter(instance => 
    !agents.some(agent => agent.instanceId === instance.id)
  );

  const loadTemplates = async (goal: string) => {
    try {
      setLoadingTemplates(true);
      const response = await fetch(`/api/ai-agent/templates?goal=${goal}`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    try {
      const variables = {
        companyName: formData.companyName || '[Nome da Empresa]',
        product: formData.product || '[Produto/Serviço]',
        mainPain: formData.mainPain || '[Principal Problema]',
        successCase: formData.successCase || '[Case de Sucesso]',
        priceObjection: formData.priceObjection || '[Resposta para Objeção de Preço]'
      };

      const response = await fetch('/api/ai-agent/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, variables })
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, systemPrompt: data.prompt }));
        toast.success('Template aplicado com sucesso!');
      } else {
        toast.error('Erro ao aplicar template');
      }
    } catch (error) {
      console.error('Erro ao aplicar template:', error);
      toast.error('Erro ao aplicar template');
    }
  };

  const loadEditTemplates = async (goal: string) => {
    try {
      setEditLoadingTemplates(true);
      const response = await fetch(`/api/ai-agent/templates?goal=${goal}`);
      if (response.ok) {
        const data = await response.json();
        setEditTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Erro ao carregar templates de edição:', error);
    } finally {
      setEditLoadingTemplates(false);
    }
  };

  const applyEditTemplate = async (templateId: string) => {
    try {
      const variables = {
        companyName: editFormData.companyName || '[Nome da Empresa]',
        product: editFormData.product || '[Produto/Serviço]',
        mainPain: editFormData.mainPain || '[Principal Problema]',
        successCase: editFormData.successCase || '[Case de Sucesso]',
        priceObjection: editFormData.priceObjection || '[Resposta para Objeção de Preço]'
      };

      const response = await fetch('/api/ai-agent/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, variables })
      });

      if (response.ok) {
        const data = await response.json();
        setEditFormData(prev => ({ ...prev, systemPrompt: data.prompt }));
        toast.success('Template aplicado com sucesso!');
      } else {
        toast.error('Erro ao aplicar template');
      }
    } catch (error) {
      console.error('Erro ao aplicar template:', error);
      toast.error('Erro ao aplicar template');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#35426A]"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-[100dvh] bg-gray-100 pt-4 pb-8 px-2">
        <div className="container mx-auto pl-1 sm:pl-2 md:pl-4 lg:pl-8 max-w-[99%] sm:max-w-[97%] md:max-w-[95%] lg:max-w-[92%]">
          {/* Título */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4">
            <div>
              <h1 className="text-lg sm:text-base md:text-lg font-bold text-gray-900 tracking-[-0.03em] font-inter">
                Assistentes Virtuais
              </h1>
              <p className="text-xs sm:text-xs md:text-xs text-gray-600 tracking-[-0.03em] font-inter">
                Configure e gerencie seus bots inteligentes para WhatsApp
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 mt-3 md:mt-0">
              <Button 
                onClick={() => setShowCreateForm(true)}
                disabled={availableInstances.length === 0}
                className="h-8 sm:h-7 bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 text-xs sm:text-xs"
              >
                Novo Agente
              </Button>
              
              <Link href="/ai-agent/knowledge">
                <Button 
                  variant="outline"
                  className="h-8 sm:h-7 bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 text-xs sm:text-xs"
                >
                  Base de Conhecimento
                </Button>
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="agents" className="space-y-4">
            <TabsList className="grid grid-cols-4 mb-4 bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] p-1 rounded-2xl max-w-[400px]">
              <TabsTrigger 
                value="agents" 
                className="data-[state=active]:bg-gray-800/10 data-[state=active]:text-gray-900 data-[state=active]:border-b-0 text-gray-600 hover:text-gray-900 transition-colors rounded-xl text-xs flex items-center gap-1.5"
              >
                Agentes
              </TabsTrigger>
              <TabsTrigger 
                value="dashboard" 
                className="data-[state=active]:bg-gray-800/10 data-[state=active]:text-gray-900 data-[state=active]:border-b-0 text-gray-600 hover:text-gray-900 transition-colors rounded-xl text-xs flex items-center gap-1.5"
              >
                Dashboard
              </TabsTrigger>
              <TabsTrigger 
                value="knowledge" 
                className="data-[state=active]:bg-gray-800/10 data-[state=active]:text-gray-900 data-[state=active]:border-b-0 text-gray-600 hover:text-gray-900 transition-colors rounded-xl text-xs flex items-center gap-1.5"
              >
                Conhecimento
              </TabsTrigger>
              <TabsTrigger 
                value="webhook" 
                className="data-[state=active]:bg-gray-800/10 data-[state=active]:text-gray-900 data-[state=active]:border-b-0 text-gray-600 hover:text-gray-900 transition-colors rounded-xl text-xs flex items-center gap-1.5"
              >
                Configuração
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-4">
              {stats && (
                <>
                  {/* Token Usage Card */}
                  <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-gray-900 tracking-[-0.03em] font-inter text-base">
                        Uso de Tokens OpenAI
                      </CardTitle>
                      <CardDescription className="text-gray-600 tracking-[-0.03em] font-inter text-xs">
                        Acompanhe seu consumo mensal de tokens
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-blue-50/50 rounded-lg">
                          <div className="text-xl font-bold text-blue-600 mb-1">
                            {stats.tokensUsedToday.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600">Tokens hoje</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50/50 rounded-lg">
                          <div className="text-xl font-bold text-orange-600 mb-1">
                            {stats.tokensUsedThisMonth.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600">Tokens este mês</div>
                        </div>
                        <div className="text-center p-3 bg-green-50/50 rounded-lg">
                          <div className="text-xl font-bold text-green-600 mb-1">
                            {stats.freeTokensRemaining.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600">Tokens restantes</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-900">
                          <span>Uso mensal</span>
                          <span>{Math.round((stats.tokensUsedThisMonth / 100000) * 100)}%</span>
                        </div>
                        <Progress 
                          value={(stats.tokensUsedThisMonth / 100000) * 100} 
                          className="h-2"
                        />
                        <div className="text-xs text-gray-600">
                          Limite: 100.000 tokens gratuitos por mês
                        </div>
                      </div>

                      {stats.freeTokensRemaining < 10000 && (
                        <Alert className="bg-yellow-50/50 border-yellow-200">
                          <AlertDescription className="text-yellow-800 text-xs">
                            Atenção: Você tem menos de 10.000 tokens restantes este mês.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-600">Mensagens Hoje</p>
                            <p className="text-xl font-bold text-gray-900">{stats.totalMessages}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-600">Respostas IA</p>
                            <p className="text-xl font-bold text-gray-900">{stats.aiResponses}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-600">Tempo Médio</p>
                            <p className="text-xl font-bold text-gray-900">{stats.avgResponseTime}s</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-600">Conversas Ativas</p>
                            <p className="text-xl font-bold text-gray-900">{stats.activeConversations}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Knowledge Base Card */}
                  <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2 tracking-[-0.03em] font-inter">
                            Base de Conhecimento
                          </h3>
                          <p className="text-gray-600 mb-3 tracking-[-0.03em] font-inter text-xs">
                            Torne seus agentes mais inteligentes com conhecimento específico sobre objeções, FAQs, cases e muito mais.
                          </p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            <Badge variant="secondary" className="text-xs">Objeções</Badge>
                            <Badge variant="secondary" className="text-xs">FAQs</Badge>
                            <Badge variant="secondary" className="text-xs">Cases</Badge>
                            <Badge variant="secondary" className="text-xs">Processos</Badge>
                          </div>
                        </div>
                        <div className="ml-4">
                          <Link href="/ai-agent/knowledge">
                            <Button className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 h-8 text-xs">
                              Gerenciar Conhecimento
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Agents Tab */}
            <TabsContent value="agents" className="space-y-4">
              {/* Create Form */}
              {showCreateForm && (
                <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900 tracking-[-0.03em] font-inter text-base">Criar Novo Agente</CardTitle>
                    <CardDescription className="text-gray-600 tracking-[-0.03em] font-inter text-xs">
                      Configure um novo assistente virtual para uma instância do WhatsApp
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="instance" className="text-gray-900 text-xs">Instância do WhatsApp</Label>
                        <Select 
                          value={formData.instanceId} 
                          onValueChange={(value) => setFormData({...formData, instanceId: value})}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Selecione uma instância" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableInstances.map((instance) => (
                              <SelectItem key={instance.id} value={instance.id}>
                                {instance.instanceName} ({instance.connectedNumber || 'Não conectado'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="model" className="text-gray-900 text-xs">Modelo da OpenAI</Label>
                        <Select 
                          value={formData.model} 
                          onValueChange={(value) => setFormData({...formData, model: value})}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Rápido)</SelectItem>
                            <SelectItem value="gpt-4">GPT-4 (Mais inteligente)</SelectItem>
                            <SelectItem value="gpt-4-turbo">GPT-4 Turbo (Balanceado)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Formulário Guiado - Camada 1 */}
                    <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">1</div>
                        <h3 className="text-base font-semibold text-gray-900 tracking-[-0.03em] font-inter">Contexto Principal</h3>
                      </div>
                      <p className="text-xs text-gray-600 mb-3 tracking-[-0.03em] font-inter">
                        Preencha essas informações para que o agente tenha contexto inteligente sobre seu negócio. 
                        O prompt será gerado automaticamente com base nessas informações.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Nome da Empresa</Label>
                          <Input
                            value={formData.companyName}
                            onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                            placeholder="Ex: TechSolutions"
                            className="h-8"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Produto/Serviço</Label>
                          <Input
                            value={formData.product}
                            onChange={(e) => setFormData({...formData, product: e.target.value})}
                            placeholder="Ex: Sistema de gestão empresarial"
                            className="h-8"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Principal Problema que Resolve</Label>
                          <Input
                            value={formData.mainPain}
                            onChange={(e) => setFormData({...formData, mainPain: e.target.value})}
                            placeholder="Ex: Desorganização de processos internos"
                            className="h-8"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Objetivo do Agente</Label>
                          <Select 
                            value={formData.goal} 
                            onValueChange={(value: 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION') => 
                              setFormData({...formData, goal: value})
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SALES">Vendas</SelectItem>
                              <SelectItem value="SUPPORT">Suporte</SelectItem>
                              <SelectItem value="LEAD_GENERATION">Geração de Leads</SelectItem>
                              <SelectItem value="QUALIFICATION">Qualificação</SelectItem>
                              <SelectItem value="RETENTION">Retenção</SelectItem>
                              <SelectItem value="EDUCATION">Educação</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Case de Sucesso (Opcional)</Label>
                          <Textarea
                            value={formData.successCase}
                            onChange={(e) => setFormData({...formData, successCase: e.target.value})}
                            placeholder="Ex: Empresa X reduziu 50% do tempo em processos administrativos..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-gray-900 font-medium text-xs">Resposta para Objeção de Preço (Opcional)</Label>
                          <Textarea
                            value={formData.priceObjection}
                            onChange={(e) => setFormData({...formData, priceObjection: e.target.value})}
                            placeholder="Ex: Nosso investimento se paga em 3 meses com a economia gerada..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-5 h-5 bg-gray-400 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                        <Label className="text-gray-900 font-medium text-xs">Configuração do Prompt</Label>
                      </div>

                      {/* Seletor de Modo */}
                      <div className="space-y-2">
                        <Label className="text-gray-900 font-medium text-xs">Modo de Configuração</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setPromptMode('auto')}
                            className={`p-2 text-xs rounded-lg border transition-all ${
                              promptMode === 'auto' 
                                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <div className="font-medium">Automático</div>
                            <div className="text-xs opacity-75">Baseado nos campos</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPromptMode('template')}
                            className={`p-2 text-xs rounded-lg border transition-all ${
                              promptMode === 'template' 
                                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <div className="font-medium">Template</div>
                            <div className="text-xs opacity-75">Pré-configurado</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPromptMode('custom')}
                            className={`p-2 text-xs rounded-lg border transition-all ${
                              promptMode === 'custom' 
                                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <div className="font-medium">Customizado</div>
                            <div className="text-xs opacity-75">Escrever próprio</div>
                          </button>
                        </div>
                      </div>

                      {/* Seleção de Template */}
                      {promptMode === 'template' && (
                        <div className="space-y-3">
                          <Label className="text-gray-900 font-medium text-xs">Escolha um Template</Label>
                          {loadingTemplates ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                              Carregando templates...
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {templates.map((template) => (
                                <div
                                  key={template.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedTemplate === template.id
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                  }`}
                                  onClick={() => {
                                    setSelectedTemplate(template.id);
                                    applyTemplate(template.id);
                                  }}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h4 className="font-medium text-xs text-gray-900">{template.name}</h4>
                                      <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {template.variables.map((variable: string) => (
                                          <span key={variable} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
                                            {variable}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    {selectedTemplate === template.id && (
                                      <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
                                    )}
                                  </div>
                                </div>
                              ))}
                              {templates.length === 0 && (
                                <p className="text-xs text-gray-500 text-center py-4">
                                  Nenhum template disponível para este objetivo
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Campo de Prompt Customizado */}
                      {promptMode === 'custom' && (
                        <div className="space-y-2">
                          <Label className="text-gray-900 font-medium text-xs">Prompt Customizado</Label>
                          <Textarea
                            value={formData.systemPrompt}
                            onChange={(e) => setFormData({...formData, systemPrompt: e.target.value})}
                            placeholder="Escreva seu prompt personalizado aqui..."
                            className="min-h-[120px] text-xs"
                          />
                        </div>
                      )}

                      {/* Modo Automático - Apenas informativo */}
                      {promptMode === 'auto' && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700">
                            ✅ O prompt será gerado automaticamente com base nas informações preenchidas acima. 
                            Preencha os campos da empresa para obter o melhor resultado.
                          </p>
                        </div>
                      )}

                      {/* Preview do Prompt (quando template ou custom) */}
                      {(promptMode === 'template' || promptMode === 'custom') && formData.systemPrompt && (
                        <div className="space-y-2">
                          <Label className="text-gray-900 font-medium text-xs">Preview do Prompt</Label>
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                              {formData.systemPrompt.substring(0, 500)}
                              {formData.systemPrompt.length > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-gray-900 font-medium text-xs">Máximo de Tokens</Label>
                      <Input
                        id="maxTokens"
                        type="number"
                        value={formData.maxTokens}
                        onChange={(e) => setFormData({...formData, maxTokens: parseInt(e.target.value)})}
                        min={50}
                        max={1000}
                        className="h-8"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-gray-900 font-medium text-xs">Temperatura (0-1)</Label>
                      <Input
                        id="temperature"
                        type="number"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) => setFormData({...formData, temperature: parseFloat(e.target.value)})}
                        min={0}
                        max={1}
                        className="h-8"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-gray-900 font-medium text-xs">Mensagens por Minuto</Label>
                      <Input
                        id="maxMessagesPerMinute"
                        type="number"
                        value={formData.maxMessagesPerMinute}
                        onChange={(e) => setFormData({...formData, maxMessagesPerMinute: parseInt(e.target.value)})}
                        min={1}
                        max={20}
                        className="h-8"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="autoConfigureWebhook"
                        checked={formData.autoConfigureWebhook}
                        onCheckedChange={(checked) => setFormData({...formData, autoConfigureWebhook: checked})}
                      />
                      <Label className="text-gray-900 font-medium text-xs">
                        Configurar webhook automaticamente
                        <span className="text-xs text-gray-600 block">
                          Tentará configurar automaticamente as settings e webhook na Evolution API
                        </span>
                      </Label>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={createAgent} 
                        disabled={creating || !formData.instanceId}
                        className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 flex items-center gap-1.5 h-8 text-xs"
                      >
                        {creating ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-700"></div>
                        ) : (
                          <Bot className="h-3 w-3" />
                        )}
                        {creating ? 'Criando...' : 'Criar Agente'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowCreateForm(false)}
                        className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 h-8 text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Agents List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map((agent) => (
                  <Card key={agent.id} className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <h3 className="font-semibold text-gray-900 tracking-[-0.03em] font-inter text-sm">
                            {agent.instance.instanceName}
                          </h3>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditAgent(agent)}
                            className="h-6 w-6 p-0 hover:bg-gray-100"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAgent(agent.id, agent.instance.instanceName)}
                            className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Bot className="h-3 w-3" />
                          <span>{agent.model}</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Zap className="h-3 w-3" />
                          <span>Max: {agent.maxTokens} tokens</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Clock className="h-3 w-3" />
                          <span>Temp: {agent.temperature}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={agent.isActive}
                              onCheckedChange={(checked) => toggleAgent(agent.id, checked)}
                              className="data-[state=checked]:bg-green-500"
                            />
                            <span className={`text-xs font-medium ${agent.isActive ? 'text-green-600' : 'text-gray-600'}`}>
                              {agent.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <Badge 
                            variant={agent.isActive ? "default" : "secondary"}
                            className={`text-xs ${agent.isActive ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                          >
                            {agent.isActive ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Knowledge Tab */}
            <TabsContent value="knowledge" className="space-y-6">
              {/* Knowledge Base Card */}
              <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2 tracking-[-0.03em] font-inter">
                        Base de Conhecimento
                      </h3>
                      <p className="text-gray-600 mb-4 tracking-[-0.03em] font-inter">
                        Torne seus agentes mais inteligentes com conhecimento específico sobre objeções, FAQs, cases e muito mais.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge variant="secondary">Objeções</Badge>
                        <Badge variant="secondary">FAQs</Badge>
                        <Badge variant="secondary">Cases</Badge>
                        <Badge variant="secondary">Processos</Badge>
                      </div>
                    </div>
                    <div className="ml-6">
                      <Link href="/ai-agent/knowledge">
                        <Button className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10">
                          Gerenciar Conhecimento
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Knowledge Types Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">Objeções</h4>
                    <p className="text-sm text-gray-600 tracking-[-0.03em] font-inter">Respostas para objeções de preço, tempo, autoridade</p>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">FAQs</h4>
                    <p className="text-sm text-gray-600 tracking-[-0.03em] font-inter">Perguntas frequentes sobre produtos e serviços</p>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">Cases</h4>
                    <p className="text-sm text-gray-600 tracking-[-0.03em] font-inter">Histórias de sucesso e resultados alcançados</p>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">Features</h4>
                    <p className="text-sm text-gray-600 tracking-[-0.03em] font-inter">Funcionalidades e benefícios do produto</p>
                  </CardContent>
                </Card>
              </div>

              {/* How it Works */}
              <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-gray-900 tracking-[-0.03em] font-inter">Como Funciona</CardTitle>
                  <CardDescription className="text-gray-600 tracking-[-0.03em] font-inter">
                    Sistema de conhecimento em duas camadas para máxima inteligência
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2 tracking-[-0.03em] font-inter">
                        <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">1</div>
                        Camada 1: Contexto Principal
                      </h4>
                      <p className="text-sm text-gray-600 ml-8 tracking-[-0.03em] font-inter">
                        Informações básicas sobre sua empresa, produto, dores e objetivos. 
                        Sempre usado para gerar contexto inteligente automaticamente.
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2 tracking-[-0.03em] font-inter">
                        <div className="w-6 h-6 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center text-sm">2</div>
                        Camada 2: Base de Conhecimento
                      </h4>
                      <p className="text-sm text-gray-600 ml-8 tracking-[-0.03em] font-inter">
                        Conhecimento específico adicional como objeções, FAQs, cases. 
                        Usado quando relevante para a conversa através de busca semântica.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Webhook Tab */}
            <TabsContent value="webhook" className="space-y-6">
              <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 tracking-[-0.03em] font-inter">
                    Configuração do Webhook
                  </CardTitle>
                  <CardDescription className="text-gray-600 tracking-[-0.03em] font-inter">
                    Configure o webhook na Evolution API para receber mensagens automaticamente
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-gray-900">URL do Webhook</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={webhookUrl} 
                        readOnly 
                        className="font-mono text-sm bg-white border-gray-300 text-gray-900"
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={copyWebhookUrl}
                        className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10"
                      >
                        Copiar
                      </Button>
                    </div>
                    {usingNgrok ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <span>Usando NGROK_URL configurada no .env.local</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <span>Usando URL local - configure NGROK_URL no .env.local para desenvolvimento</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-600">
                      Use esta URL como webhook na configuração da sua instância Evolution API
                    </p>
                  </div>

                  {!ngrokConfigured && (
                    <Alert className="bg-amber-50/50 border-amber-200">
                      <AlertDescription className="text-amber-800">
                        <strong>Dica para Desenvolvimento:</strong><br />
                        Configure a variável <code className="bg-white border border-gray-300 px-1 rounded text-gray-900">NGROK_URL</code> no seu arquivo .env.local<br />
                        Exemplo: <code className="bg-white border border-gray-300 px-1 rounded text-gray-900">NGROK_URL=https://abc123.ngrok-free.app</code><br />
                        Assim o webhook será configurado automaticamente com a URL pública!
                      </AlertDescription>
                    </Alert>
                  )}

                  <Alert className="bg-blue-50/50 border-blue-200">
                    <AlertDescription className="text-blue-800">
                      <strong>Configuração Automática:</strong><br />
                      Use os botões "Auto-Config" nos seus agentes para configurar automaticamente!<br />
                      Ou configure manualmente seguindo as instruções abaixo.
                    </AlertDescription>
                  </Alert>

                  <div className="bg-green-50/50 p-4 rounded-lg border border-green-200">
                    <h4 className="font-medium mb-2 text-green-800">Checklist de Configuração:</h4>
                    <ul className="space-y-1 text-sm text-green-700">
                      <li>• Instância deve estar CONNECTED</li>
                      <li>• Settings configurados (always_online, read_messages, reject_call)</li>
                      <li>• Webhook configurado com URL pública e evento MESSAGES_UPSERT</li>
                      <li>• Agente IA ativo na instância</li>
                      <li>• OPENAI_API_KEY configurada no ambiente</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-blue-800">
                      Para usar com ngrok (desenvolvimento):
                    </h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
                      <li>Instale o ngrok: <code className="bg-white border border-gray-300 px-1 rounded text-gray-900">npm install -g ngrok</code></li>
                      <li>Execute: <code className="bg-white border border-gray-300 px-1 rounded text-gray-900">ngrok http 3000</code></li>
                      <li>Use a URL HTTPS fornecida pelo ngrok + /api/ai-agent/webhook/messages-upsert</li>
                      <li>Configure na Evolution API usando os comandos de configuração automática</li>
                    </ol>
                  </div>

                  <div className="bg-red-50/50 p-4 rounded-lg border border-red-200">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-red-800">
                      Problemas Comuns e Soluções:
                    </h4>
                    <div className="space-y-3 text-sm text-red-700">
                      <div>
                        <strong>"Instância não encontrada":</strong>
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li>Verifique se a instância foi criada na Evolution API</li>
                          <li>Confirme se o nome da instância está correto</li>
                          <li>Certifique-se que a instância está no estado "CONNECTED"</li>
                        </ul>
                      </div>
                      <div>
                        <strong>"Erro 404 - Not Found":</strong>
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li>A instância não existe na Evolution API</li>
                          <li>Verifique a URL base da Evolution API</li>
                          <li>Confirme se a API Key está correta</li>
                        </ul>
                      </div>
                      <div>
                        <strong>"Webhook não configurado":</strong>
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li>Use a configuração automática ou configure manualmente</li>
                          <li>Certifique-se que a URL do webhook é acessível publicamente</li>
                          <li>Para desenvolvimento, use ngrok para expor localhost</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modal de Edição */}
      <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-gray-300 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 -m-6 mb-6 rounded-t-lg">
            <DialogTitle className="flex items-center gap-2 text-white tracking-[-0.03em] font-inter">
              <Edit className="h-5 w-5" />
              Editar Agente: {editingAgent?.instance.instanceName}
            </DialogTitle>
            <DialogDescription className="text-gray-200 tracking-[-0.03em] font-inter">
              Modifique as configurações do agente de IA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-1">
            {/* Status */}
            <div className="flex items-center space-x-2 p-4 bg-gray-50 rounded-lg border">
              <Switch
                id="edit-active"
                checked={editFormData.isActive}
                onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, isActive: checked }))}
                className="data-[state=checked]:bg-green-500"
              />
              <Label htmlFor="edit-active" className="text-gray-900 font-medium">
                Agente Ativo
              </Label>
            </div>

            {/* Formulário Guiado - Camada 1 */}
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <h3 className="text-base font-semibold text-gray-900 tracking-[-0.03em] font-inter">Contexto Principal</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4 tracking-[-0.03em] font-inter">
                Preencha essas informações para que o agente tenha contexto inteligente sobre seu negócio. 
                O prompt será gerado automaticamente com base nessas informações.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Nome da Empresa</Label>
                  <Input
                    value={editFormData.companyName}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Ex: TechSolutions"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Produto/Serviço</Label>
                  <Input
                    value={editFormData.product}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, product: e.target.value }))}
                    placeholder="Ex: Sistema de gestão empresarial"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Principal Problema que Resolve</Label>
                  <Input
                    value={editFormData.mainPain}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, mainPain: e.target.value }))}
                    placeholder="Ex: Desorganização de processos internos"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Objetivo do Agente</Label>
                  <Select 
                    value={editFormData.goal} 
                    onValueChange={(value: 'SALES' | 'SUPPORT' | 'LEAD_GENERATION' | 'QUALIFICATION' | 'RETENTION' | 'EDUCATION') => {
                      setEditFormData(prev => ({ ...prev, goal: value }));
                      // Carregar templates para o novo objetivo se estiver no modo template
                      if (editPromptMode === 'template') {
                        loadEditTemplates(value);
                        setEditSelectedTemplate(''); // Reset template selection
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALES">Vendas</SelectItem>
                      <SelectItem value="SUPPORT">Suporte</SelectItem>
                      <SelectItem value="LEAD_GENERATION">Geração de Leads</SelectItem>
                      <SelectItem value="QUALIFICATION">Qualificação</SelectItem>
                      <SelectItem value="RETENTION">Retenção</SelectItem>
                      <SelectItem value="EDUCATION">Educação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Case de Sucesso (Opcional)</Label>
                  <Textarea
                    value={editFormData.successCase}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, successCase: e.target.value }))}
                    placeholder="Ex: Empresa X reduziu 50% do tempo em processos administrativos..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Resposta para Objeção de Preço (Opcional)</Label>
                  <Textarea
                    value={editFormData.priceObjection}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, priceObjection: e.target.value }))}
                    placeholder="Ex: Nosso investimento se paga em 3 meses com a economia gerada..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Configuração do Prompt - Seção 2 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <Label className="text-gray-900 font-medium text-base">Configuração do Prompt</Label>
              </div>

              {/* Seletor de Modo */}
              <div className="space-y-2">
                <Label className="text-gray-900 font-medium text-sm">Modo de Configuração</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPromptMode('auto')}
                    className={`p-2 text-xs rounded-lg border transition-all ${
                      editPromptMode === 'auto' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">Automático</div>
                    <div className="text-xs opacity-75">Baseado nos campos</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditPromptMode('template');
                      loadEditTemplates(editFormData.goal);
                    }}
                    className={`p-2 text-xs rounded-lg border transition-all ${
                      editPromptMode === 'template' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">Template</div>
                    <div className="text-xs opacity-75">Pré-configurado</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPromptMode('custom')}
                    className={`p-2 text-xs rounded-lg border transition-all ${
                      editPromptMode === 'custom' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">Customizado</div>
                    <div className="text-xs opacity-75">Escrever próprio</div>
                  </button>
                </div>
              </div>

              {/* Seleção de Template */}
              {editPromptMode === 'template' && (
                <div className="space-y-3">
                  <Label className="text-gray-900 font-medium text-sm">Escolha um Template</Label>
                  {editLoadingTemplates ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                      Carregando templates...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editTemplates.map((template) => (
                        <div
                          key={template.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            editSelectedTemplate === template.id
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            setEditSelectedTemplate(template.id);
                            applyEditTemplate(template.id);
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-xs text-gray-900">{template.name}</h4>
                              <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {template.variables.map((variable: string) => (
                                  <span key={variable} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
                                    {variable}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {editSelectedTemplate === template.id && (
                              <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
                            )}
                          </div>
                        </div>
                      ))}
                      {editTemplates.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">
                          Nenhum template disponível para este objetivo
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Campo de Prompt Customizado */}
              {editPromptMode === 'custom' && (
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium text-sm">Prompt Customizado</Label>
                  <Textarea
                    value={editFormData.systemPrompt}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    placeholder="Escreva seu prompt personalizado aqui..."
                    className="min-h-[120px] text-xs"
                  />
                </div>
              )}

              {/* Modo Automático - Apenas informativo */}
              {editPromptMode === 'auto' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">
                    ✅ O prompt será gerado automaticamente com base nas informações preenchidas acima. 
                    Preencha os campos da empresa para obter o melhor resultado.
                  </p>
                </div>
              )}

              {/* Preview do Prompt (quando template ou custom) */}
              {(editPromptMode === 'template' || editPromptMode === 'custom') && editFormData.systemPrompt && (
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium text-sm">Preview do Prompt</Label>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {editFormData.systemPrompt.substring(0, 500)}
                      {editFormData.systemPrompt.length > 500 && '...'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modelo */}
            <div className="space-y-2">
              <Label className="text-gray-900 font-medium">Modelo de IA</Label>
              <Select value={editFormData.model} onValueChange={(value) => setEditFormData(prev => ({ ...prev, model: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Rápido e Econômico)</SelectItem>
                  <SelectItem value="gpt-4">GPT-4 (Mais Inteligente)</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo (Balanceado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Configurações Avançadas */}
            <div className="space-y-4">
              <Label className="text-gray-900 font-medium text-lg">Configurações Avançadas</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Máximo de Tokens</Label>
                  <Input
                    type="number"
                    value={editFormData.maxTokens}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 150 }))}
                    min="50"
                    max="4000"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Temperatura (0-1)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editFormData.temperature}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) || 0.7 }))}
                    min="0"
                    max="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Mensagens por Minuto</Label>
                  <Input
                    type="number"
                    value={editFormData.maxMessagesPerMinute}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, maxMessagesPerMinute: parseInt(e.target.value) || 5 }))}
                    min="1"
                    max="60"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 font-medium">Cooldown (minutos)</Label>
                  <Input
                    type="number"
                    value={editFormData.cooldownMinutes}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, cooldownMinutes: parseInt(e.target.value) || 30 }))}
                    min="0"
                    max="1440"
                  />
                </div>
              </div>
            </div>

            {/* Mensagem de Fallback */}
            <div className="space-y-2">
              <Label className="text-gray-900 font-medium">Mensagem de Fallback</Label>
              <Textarea
                value={editFormData.fallbackMessage}
                onChange={(e) => setEditFormData(prev => ({ ...prev, fallbackMessage: e.target.value }))}
                placeholder="Mensagem enviada quando há erro ou limite atingido..."
              />
            </div>
          </div>

          <DialogFooter className="bg-gray-50 p-6 -m-6 mt-6 rounded-b-lg border-t">
            <Button
              variant="outline"
              onClick={() => setShowEditForm(false)}
              disabled={loading}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </Button>
            <Button
              onClick={editAgent}
              disabled={loading}
              className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
} 