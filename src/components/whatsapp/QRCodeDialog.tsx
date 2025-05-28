'use client';

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Smartphone, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface WhatsAppInstance {
  id: string;
  instanceName: string;
  status: string;
  qrCode?: string;
  connectedNumber?: string;
}

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance | null;
  onStatusChange?: () => void;
}

export function QRCodeDialog({ 
  open, 
  onOpenChange, 
  instance,
  onStatusChange 
}: QRCodeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(instance?.status || '');
  const [qrCode, setQrCode] = useState(instance?.qrCode || '');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (instance) {
      setCurrentStatus(instance.status);
      setQrCode(instance.qrCode || '');
    }
  }, [instance]);

  // Polling para verificar status automaticamente
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (open && instance && (currentStatus === 'CONNECTING' || currentStatus === 'CREATED')) {
      setPolling(true);
      interval = setInterval(async () => {
        await checkStatus();
      }, 3000); // Verificar a cada 3 segundos
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      setPolling(false);
    };
  }, [open, instance, currentStatus]);

  const refreshQRCode = async () => {
    if (!instance) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/qrcode`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao obter QR Code');
      }

      const data = await response.json();
      setQrCode(data.qrCode);
      
      // Atualizar instância com código de pareamento se disponível
      if (data.pairingCode && instance) {
        (instance as any).pairingCode = data.pairingCode;
      }
      
      toast.success('QR Code atualizado!');
    } catch (error) {
      console.error('Erro ao atualizar QR Code:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar QR Code');
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!instance) return;

    try {
      const response = await fetch(`/api/whatsapp/instances/${instance.id}/status`);
      if (!response.ok) return;

      const data = await response.json();
      const newStatus = data.status;
      
      if (newStatus !== currentStatus) {
        setCurrentStatus(newStatus);
        
        if (newStatus === 'CONNECTED') {
          toast.success('WhatsApp conectado com sucesso!');
          onStatusChange?.();
        } else if (newStatus === 'DISCONNECTED') {
          toast.error('WhatsApp desconectado');
          onStatusChange?.();
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return {
          color: 'bg-green-500',
          icon: CheckCircle,
          text: 'Conectado',
          description: 'WhatsApp conectado e pronto para uso'
        };
      case 'CONNECTING':
        return {
          color: 'bg-yellow-500',
          icon: RefreshCw,
          text: 'Conectando',
          description: 'Aguardando leitura do QR Code'
        };
      case 'DISCONNECTED':
        return {
          color: 'bg-red-500',
          icon: XCircle,
          text: 'Desconectado',
          description: 'WhatsApp desconectado'
        };
      default:
        return {
          color: 'bg-gray-500',
          icon: Smartphone,
          text: status || 'Criado',
          description: 'Instância criada'
        };
    }
  };

  if (!instance) return null;

  const statusInfo = getStatusInfo(currentStatus);
  const StatusIcon = statusInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-gray-100 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
        <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 -m-6 mb-4 rounded-t-2xl">
          <DialogTitle className="text-white text-sm font-semibold tracking-[-0.03em] font-inter">Conectar WhatsApp</DialogTitle>
          <DialogDescription className="text-gray-200 text-xs tracking-[-0.03em] font-inter">
            Escaneie o QR Code com seu WhatsApp para conectar a instância "{instance.instanceName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-1">
          {/* Status Card */}
          <Card className="bg-white border-gray-300 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-900 font-semibold tracking-[-0.03em] font-inter">
                  <StatusIcon className={`h-4 w-4 ${polling && statusInfo.icon === RefreshCw ? 'animate-spin' : ''}`} />
                  Status da Conexão
                </CardTitle>
                <Badge className={`${statusInfo.color} text-white text-xs px-2 py-1 rounded-full border-0`}>
                  {statusInfo.text}
                </Badge>
              </div>
              <CardDescription className="text-gray-600 text-xs tracking-[-0.03em] font-inter">
                {statusInfo.description}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* QR Code Display */}
          {currentStatus !== 'CONNECTED' && (
            <Card className="bg-white border-gray-300 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl">
              <CardContent className="p-4">
                {instance.qrCode ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                      <img 
                        src={instance.qrCode} 
                        alt="QR Code WhatsApp" 
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    
                    <div className="text-center space-y-2">
                      <p className="text-xs text-gray-600 tracking-[-0.03em] font-inter">
                        1. Abra o WhatsApp no seu celular
                      </p>
                      <p className="text-xs text-gray-600 tracking-[-0.03em] font-inter">
                        2. Toque em Menu ou Configurações e selecione Dispositivos conectados
                      </p>
                      <p className="text-xs text-gray-600 tracking-[-0.03em] font-inter">
                        3. Toque em Conectar um dispositivo
                      </p>
                      <p className="text-xs text-gray-600 tracking-[-0.03em] font-inter">
                        4. Aponte seu telefone para esta tela para capturar o código
                      </p>
                    </div>

                    {(instance as any)?.pairingCode && (
                      <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-200">
                        <p className="text-xs text-blue-800 font-medium">
                          Código de Pareamento (alternativo):
                        </p>
                        <p className="text-sm font-mono font-bold text-blue-900">
                          {(instance as any).pairingCode}
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          Digite este código no WhatsApp se não conseguir escanear o QR
                        </p>
                      </div>
                    )}
                    
                    <Button 
                      variant="outline" 
                      onClick={refreshQRCode}
                      disabled={loading}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
                    >
                      {loading ? (
                        <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                      )}
                      Atualizar QR Code
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-3 py-6">
                    <Smartphone className="h-12 w-12 text-gray-400" />
                    <p className="text-gray-600 text-center text-xs tracking-[-0.03em] font-inter">
                      QR Code não disponível. Clique em "Gerar QR Code" para criar um novo.
                    </p>
                    <Button 
                      onClick={refreshQRCode} 
                      disabled={loading}
                      className="bg-gray-900 hover:bg-gray-800 text-white h-7 text-xs"
                    >
                      {loading ? (
                        <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                      )}
                      Gerar QR Code
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Success Message */}
          {currentStatus === 'CONNECTED' && (
            <Card className="border-green-300 bg-green-50 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium text-xs">
                    WhatsApp conectado com sucesso!
                  </span>
                </div>
                {instance.connectedNumber && (
                  <p className="text-xs text-green-700 mt-1">
                    Número conectado: {instance.connectedNumber}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Action Buttons */}
        <div className="bg-gray-200/50 p-4 -m-6 mt-4 rounded-b-2xl border-t flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
          >
            {currentStatus === 'CONNECTED' ? 'Concluir' : 'Fechar'}
          </Button>
          {(currentStatus === 'CONNECTING' || currentStatus === 'CREATED') && (
            <Button 
              onClick={checkStatus} 
              disabled={loading || polling}
              className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg h-7 text-xs"
            >
              {loading ? (
                <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1.5" />
              )}
              Verificar Status
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 