'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Smartphone, QrCode, Trash2, RefreshCw, MessageSquare, Send, Eye, Settings, CheckCircle, AlertTriangle } from 'lucide-react';
import { CreateInstanceDialog } from './CreateInstanceDialog';
import { QRCodeDialog } from './QRCodeDialog';
import { SendMessageDialog } from './SendMessageDialog';
import { WhatsAppSyncDialog } from './WhatsAppSyncDialog';
import { WhatsAppDataViewer } from './WhatsAppDataViewer';
import { toast } from 'sonner';

interface WhatsAppInstance {
  id: string;
  instanceName: string;
  status: string;
  connectedNumber?: string;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  reconnectAttempts: number;
  qrCode?: string;
  webhookEnabled: boolean;
  webhookUrl?: string;
  _count: {
    messages: number;
  };
}

export function WhatsAppInstances() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [dataViewerOpen, setDataViewerOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{[key: string]: any}>({});

  // URL correta do webhook
  const CORRECT_WEBHOOK_URL = 'https://zp-bay.vercel.app/api/ai-agent/webhook';

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    try {
      const response = await fetch('/api/whatsapp/instances');
      if (!response.ok) throw new Error('Erro ao carregar instâncias');
      
      const data = await response.json();
      setInstances(data.instances);
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInstance = async (data: {
    instanceName?: string;
    sessionToken?: string;
    webhookUrl?: string;
    autoReconnect?: boolean;
  }) => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao criar instância');
      }

      const result = await response.json();
      toast.success('Instância criada com sucesso!');
      setCreateDialogOpen(false);
      
      // Se tem QR Code, abrir dialog do QR
      if (result.instance.qrCode) {
        setSelectedInstance(result.instance);
        setQrDialogOpen(true);
      }
      
      loadInstances();
    } catch (error) {
      console.error('Erro ao criar instância:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar instância');
    }
  };

  const handleShowQRCode = async (instance: WhatsAppInstance) => {
    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/qrcode`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao obter QR Code');
      }

      const data = await response.json();
      setSelectedInstance({ ...instance, qrCode: data.qrCode });
      setQrDialogOpen(true);
    } catch (error) {
      console.error('Erro ao obter QR Code:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao obter QR Code');
    }
  };

  const handleCheckStatus = async (instance: WhatsAppInstance) => {
    try {
      // Usar o novo endpoint de sincronização
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/sync-status`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao sincronizar status');
      }

      const result = await response.json();
      toast.success(`Status sincronizado: ${result.data.status}`);
      loadInstances(); // Recarregar para atualizar status
    } catch (error) {
      console.error('Erro ao sincronizar status:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar status');
    }
  };

  const handleRestart = async (instance: WhatsAppInstance) => {
    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/restart`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao reiniciar instância');
      }

      const result = await response.json();
      toast.success('Instância reiniciada com sucesso!');
      loadInstances(); // Recarregar para atualizar status
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao reiniciar instância');
    }
  };

  const handleDeleteInstance = async (instance: WhatsAppInstance) => {
    if (!confirm(`Tem certeza que deseja deletar a instância "${instance.instanceName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao deletar instância');
      }

      toast.success('Instância deletada com sucesso!');
      loadInstances();
    } catch (error) {
      console.error('Erro ao deletar instância:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao deletar instância');
    }
  };

  const handleSendMessage = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setMessageDialogOpen(true);
  };

  const handleSync = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setSyncDialogOpen(true);
  };

  const handleViewData = (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setDataViewerOpen(true);
  };

  const handleConfigureWebhook = async (instance: WhatsAppInstance) => {
    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: CORRECT_WEBHOOK_URL,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao configurar webhook');
      }

      const result = await response.json();
      toast.success('Webhook configurado com sucesso!');
      loadInstances(); // Recarregar para atualizar status
      checkAllWebhooks(); // Verificar webhooks novamente
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao configurar webhook');
    }
  };

  /**
   * Verificar status dos webhooks de todas as instâncias
   */
  const checkAllWebhooks = async () => {
    try {
      const response = await fetch('/api/whatsapp/webhooks/check-all', {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        setWebhookStatus(data.webhooks || {});
      }
    } catch (error) {
      console.error('Erro ao verificar webhooks:', error);
    }
  };

  /**
   * Corrigir webhook de uma instância específica
   */
  const fixWebhook = async (instanceName: string) => {
    try {
      // Encontrar a instância pelo nome para obter o ID
      const instance = instances.find(inst => inst.instanceName === instanceName);
      if (!instance) {
        toast.error(`Instância ${instanceName} não encontrada`);
        return;
      }

      const response = await fetch(`/api/whatsapp/instances/${instance.id}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: CORRECT_WEBHOOK_URL,
        }),
      });

      if (response.ok) {
        toast.success(`Webhook configurado para ${instanceName}!`);
        // Atualizar status local
        setWebhookStatus(prev => ({
          ...prev,
          [instanceName]: {
            ...prev[instanceName],
            isCorrect: true,
            url: CORRECT_WEBHOOK_URL,
          }
        }));
        // Recarregar instâncias
        loadInstances();
      } else {
        const errorData = await response.json();
        toast.error(`Erro ao configurar webhook: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      toast.error('Erro ao configurar webhook');
    }
  };

  // Verificar webhooks automaticamente ao carregar
  useEffect(() => {
    if (instances.length > 0) {
      checkAllWebhooks();
    }
  }, [instances]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED': return 'bg-teal-500';
      case 'CONNECTING': return 'bg-purple-400';
      case 'DISCONNECTED': return 'bg-purple-300';
      default: return 'bg-purple-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'CONNECTED': return 'Conectado';
      case 'CONNECTING': return 'Conectando';
      case 'DISCONNECTED': return 'Desconectado';
      case 'CREATED': return 'Criado';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Button */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            className="h-8 sm:h-7 bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 text-xs sm:text-xs"
          >
            <Plus className="h-3 w-3 mr-1.5" />
            Nova Instância
          </Button>
        </div>
      </div>

      {/* Instances Grid */}
      {instances.length === 0 ? (
        <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl">
          <CardContent className="p-6 text-center">
            <Smartphone className="h-8 w-8 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">
              Nenhuma instância criada
            </h3>
            <p className="text-gray-600 mb-4 text-xs tracking-[-0.03em] font-inter">
              Crie sua primeira instância do WhatsApp Business para começar a gerenciar suas conversas
            </p>
            <Button 
              onClick={() => setCreateDialogOpen(true)}
              className="bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-2xl text-gray-700 hover:bg-gray-800/10 h-8 text-xs"
            >
              <Plus className="h-3 w-3 mr-1.5" />
              Criar Primeira Instância
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {instances.map((instance) => {
            const webhookInfo = webhookStatus[instance.instanceName];
            
            return (
              <Card 
                key={instance.id} 
                className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Smartphone className="h-4 w-4 text-gray-700" />
                      </div>
                      <div>
                        <CardTitle className="text-gray-900 text-sm font-semibold tracking-[-0.03em] font-inter">
                          {instance.instanceName}
                        </CardTitle>
                        {instance.connectedNumber && (
                          <CardDescription className="text-gray-600 text-xs tracking-[-0.03em] font-inter">
                            {instance.connectedNumber}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge 
                      className={`${getStatusColor(instance.status)} text-white text-xs px-2 py-1 rounded-full border-0`}
                    >
                      {getStatusText(instance.status)}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-100/50 p-2 rounded-lg text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {instance._count.messages}
                      </div>
                      <div className="text-xs text-gray-600">Mensagens</div>
                    </div>
                    <div className="bg-gray-100/50 p-2 rounded-lg text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {instance.status === 'CONNECTED' ? 'Online' : 'Offline'}
                      </div>
                      <div className="text-xs text-gray-600">Status</div>
                    </div>
                  </div>

                  {/* Webhook Warning */}
                  {webhookInfo && !webhookInfo.isCorrect && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <div className="flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-xs font-medium text-amber-800">
                            Webhook incorreto
                          </h4>
                          <p className="text-xs text-amber-700 mt-1">
                            Esta instância precisa do webhook correto para funcionar adequadamente.
                          </p>
                          <Button
                            size="sm"
                            onClick={() => handleConfigureWebhook(instance)}
                            className="mt-2 h-6 bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 rounded"
                          >
                            Corrigir Agora
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Webhook OK Indicator */}
                  {webhookInfo && webhookInfo.isCorrect && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-medium text-green-800">
                          Webhook configurado corretamente
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {instance.status !== 'CONNECTED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleShowQRCode(instance)}
                        className="h-7 bg-gray-800/5 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-gray-700 hover:bg-gray-800/10 text-xs"
                      >
                        <QrCode className="h-3 w-3 mr-1" />
                        QR Code
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCheckStatus(instance)}
                      className="h-7 bg-gray-800/5 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-gray-700 hover:bg-gray-800/10 text-xs"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Sync
                    </Button>

                    {/* Botão de Restart para instâncias em CONNECTING */}
                    {instance.status === 'CONNECTING' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestart(instance)}
                        className="h-7 bg-orange-50 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-orange-700 hover:bg-orange-100 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Restart
                      </Button>
                    )}

                    {instance.status === 'CONNECTED' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendMessage(instance)}
                          className="h-7 bg-teal-50 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-teal-700 hover:bg-teal-100 text-xs"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Enviar
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(instance)}
                          className="h-7 bg-purple-50 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-purple-700 hover:bg-purple-100 text-xs"
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Sync
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewData(instance)}
                          className="h-7 bg-teal-50 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-teal-700 hover:bg-teal-100 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Dados
                        </Button>
                      </>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteInstance(instance)}
                      className="h-7 bg-purple-50 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 rounded-xl text-purple-700 hover:bg-purple-100 text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Deletar
                    </Button>
                  </div>

                  {/* Meta Info */}
                  <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-gray-200">
                    <div>Mensagens: {instance._count.messages}</div>
                    {instance.lastConnectedAt && (
                      <div>Último acesso: {new Date(instance.lastConnectedAt).toLocaleDateString('pt-BR')}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateInstanceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateInstance}
      />

      {selectedInstance && (
        <>
          <QRCodeDialog
            open={qrDialogOpen}
            onOpenChange={setQrDialogOpen}
            instance={selectedInstance}
            onStatusChange={loadInstances}
          />

          <SendMessageDialog
            open={messageDialogOpen}
            onOpenChange={setMessageDialogOpen}
            instance={selectedInstance}
          />

          <WhatsAppSyncDialog
            open={syncDialogOpen}
            onOpenChange={setSyncDialogOpen}
            instanceId={selectedInstance.id}
            instanceName={selectedInstance.instanceName}
          />

          <WhatsAppDataViewer
            open={dataViewerOpen}
            onOpenChange={setDataViewerOpen}
            instanceId={selectedInstance.id}
            instanceName={selectedInstance.instanceName}
          />
        </>
      )}
    </div>
  );
} 