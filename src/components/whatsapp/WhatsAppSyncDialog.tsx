'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  RefreshCw,
  Users,
  MessageCircle,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Zap,
  RotateCcw
} from 'lucide-react';

interface SyncStats {
  contacts: { total: number; created: number; updated: number; progress?: number; };
  chats: { total: number; created: number; updated: number; progress?: number; };
  messages: { total: number; created: number; updated: number; progress?: number; };
  errors: string[];
}

interface WhatsAppSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
}

export function WhatsAppSyncDialog({
  open,
  onOpenChange,
  instanceId,
  instanceName
}: WhatsAppSyncDialogProps) {
  const [syncType, setSyncType] = useState<'full' | 'contacts' | 'chats' | 'messages'>('full');
  const [syncMode, setSyncMode] = useState<'batch' | 'individual'>('batch');
  const [batchSize, setBatchSize] = useState(50);
  const [includeGroups, setIncludeGroups] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('');
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string>('');

  const handleSync = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setProgress(0);
    setCurrentPhase('Iniciando sincronização...');
    setStats(null);
    setEstimatedTime('');

    const startTime = Date.now();

    try {
      const body = {
        type: syncType,
        mode: syncMode,
        batchSize,
        includeGroups,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo })
      };

      const response = await fetch(`/api/whatsapp/instances/${instanceId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro durante sincronização');
      }

      const elapsed = Date.now() - startTime;
      const timeStr = elapsed > 60000 
        ? `${Math.round(elapsed / 60000)}min ${Math.round((elapsed % 60000) / 1000)}s`
        : `${Math.round(elapsed / 1000)}s`;

      setStats(data.stats);
      setProgress(100);
      setCurrentPhase('Sincronização concluída!');
      setEstimatedTime(`Concluído em ${timeStr}`);
      
      toast.success(`✅ Sync ${syncType} executado com sucesso!`, {
        description: `${data.stats.contacts.total} contatos, ${data.stats.chats.total} chats, ${data.stats.messages.total} mensagens em ${timeStr}`
      });

    } catch (error: any) {
      console.error('Erro durante sync:', error);
      toast.error('❌ Erro durante sincronização', {
        description: error.message
      });
      setCurrentPhase(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getSyncDescription = () => {
    const baseDesc = (() => {
      switch (syncType) {
        case 'full':
          return 'Sincroniza todos os dados: contatos, chats e mensagens';
        case 'contacts':
          return 'Sincroniza apenas os contatos da agenda';
        case 'chats':
          return 'Sincroniza apenas as conversas/chats';
        case 'messages':
          return 'Sincroniza mensagens dos chats existentes';
        default:
          return '';
      }
    })();

    const modeDesc = syncMode === 'individual' 
      ? ' (processamento individual com progresso em tempo real)' 
      : ' (processamento em lotes)';

    return baseDesc + modeDesc;
  };

  // Simulação de progresso baseado no modo
  useEffect(() => {
    if (isLoading && syncMode === 'individual') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 95) {
            const increment = Math.random() * 5;
            return Math.min(prev + increment, 95);
          }
          return prev;
        });
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isLoading, syncMode]);

  const renderStats = () => {
    if (!stats) return null;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center space-x-2 p-2 bg-blue-50 rounded-xl">
            <Users className="h-4 w-4 text-blue-600" />
            <div>
              <div className="font-semibold text-blue-900 text-xs">{stats.contacts.total}</div>
              <div className="text-xs text-blue-600">Contatos</div>
              {stats.contacts.progress && (
                <div className="text-xs text-blue-500">{stats.contacts.progress}%</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-xl">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <div>
              <div className="font-semibold text-green-900 text-xs">{stats.chats.total}</div>
              <div className="text-xs text-green-600">Chats</div>
              {stats.chats.progress && (
                <div className="text-xs text-green-500">{stats.chats.progress}%</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 p-2 bg-purple-50 rounded-xl">
            <Mail className="h-4 w-4 text-purple-600" />
            <div>
              <div className="font-semibold text-purple-900 text-xs">{stats.messages.total}</div>
              <div className="text-xs text-purple-600">Mensagens</div>
              {stats.messages.progress && (
                <div className="text-xs text-purple-500">{stats.messages.progress}%</div>
              )}
            </div>
          </div>
        </div>

        {stats.errors.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center space-x-2 mb-2">
              <XCircle className="h-3 w-3 text-red-600" />
              <span className="text-xs font-medium text-red-900">Erros encontrados:</span>
            </div>
            <ul className="text-xs text-red-700 space-y-1">
              {stats.errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-gray-100 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
        <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 -m-6 mb-4 rounded-t-2xl">
          <DialogTitle className="flex items-center space-x-2 text-white text-sm font-semibold tracking-[-0.03em] font-inter">
            <RefreshCw className="h-4 w-4" />
            <span>Sincronizar WhatsApp</span>
          </DialogTitle>
          <DialogDescription className="text-gray-200 text-xs tracking-[-0.03em] font-inter">
            Sincronizar dados da instância <strong>{instanceName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-1">
          {/* Tipo de Sync */}
          <div className="space-y-2">
            <Label htmlFor="syncType" className="text-gray-900 font-medium text-xs">Tipo de Sincronização</Label>
            <Select value={syncType} onValueChange={(value: any) => setSyncType(value)}>
              <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-300">
                <SelectItem value="full" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <Download className="h-3 w-3" />
                    <span>Completo (Tudo)</span>
                  </div>
                </SelectItem>
                <SelectItem value="contacts" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <Users className="h-3 w-3" />
                    <span>Apenas Contatos</span>
                  </div>
                </SelectItem>
                <SelectItem value="chats" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <MessageCircle className="h-3 w-3" />
                    <span>Apenas Chats</span>
                  </div>
                </SelectItem>
                <SelectItem value="messages" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-3 w-3" />
                    <span>Apenas Mensagens</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600">
              {getSyncDescription()}
            </p>
          </div>

          {/* Modo de Processamento */}
          <div className="space-y-2">
            <Label htmlFor="syncMode" className="text-gray-900 font-medium text-xs">Modo de Processamento</Label>
            <Select value={syncMode} onValueChange={(value: any) => setSyncMode(value)}>
              <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-300">
                <SelectItem value="batch" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <RotateCcw className="h-3 w-3" />
                    <span>Lotes (Mais rápido)</span>
                  </div>
                </SelectItem>
                <SelectItem value="individual" className="text-gray-900 hover:bg-gray-100 text-xs">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-3 w-3" />
                    <span>Individual (Progresso detalhado)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600">
              {syncMode === 'batch' 
                ? 'Processa dados em lotes para maior velocidade' 
                : 'Processa um registro por vez com feedback de progresso'
              }
            </p>
          </div>

          {/* Opções Avançadas */}
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batchSize" className="text-gray-900 font-medium text-xs">Tamanho do Lote</Label>
                <Input
                  id="batchSize"
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 50)}
                  min={10}
                  max={500}
                  className="text-xs bg-white border-gray-300 text-gray-900 h-8"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="includeGroups" className="text-gray-900 font-medium text-xs">Incluir Grupos</Label>
                <div className="flex items-center space-x-2 pt-1">
                  <Switch
                    id="includeGroups"
                    checked={includeGroups}
                    onCheckedChange={setIncludeGroups}
                    className="data-[state=checked]:bg-gray-900"
                  />
                  <span className="text-xs text-gray-900">{includeGroups ? 'Sim' : 'Não'}</span>
                </div>
              </div>
            </div>

            {syncType === 'messages' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom" className="text-gray-900 font-medium text-xs">Data Início</Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="text-xs bg-white border-gray-300 text-gray-900 h-8"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateTo" className="text-gray-900 font-medium text-xs">Data Fim</Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="text-xs bg-white border-gray-300 text-gray-900 h-8"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{currentPhase}</span>
                <Badge variant="secondary" className="text-xs px-2 py-1">
                  <Clock className="h-3 w-3 mr-1" />
                  Em andamento
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Stats */}
          {renderStats()}
        </div>

        <div className="bg-gray-200/50 p-4 -m-6 mt-4 rounded-b-2xl border-t">
          <div className="flex items-center justify-between w-full">
            {estimatedTime && (
              <span className="text-xs text-gray-600">{estimatedTime}</span>
            )}
            <div className="flex space-x-2 ml-auto">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
              >
                {isLoading ? 'Aguarde...' : 'Fechar'}
              </Button>
              <Button
                onClick={handleSync}
                disabled={isLoading}
                className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg h-7 text-xs min-w-[100px]"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Download className="mr-1.5 h-3 w-3" />
                    Iniciar Sync
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 