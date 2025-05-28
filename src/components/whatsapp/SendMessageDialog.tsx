'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, MessageSquare, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
  number: z.string()
    .min(1, 'Número é obrigatório')
    .regex(/^\d+$/, 'Digite apenas números')
    .min(10, 'Número deve ter pelo menos 10 dígitos')
    .max(15, 'Número deve ter no máximo 15 dígitos'),
  text: z.string()
    .min(1, 'Mensagem é obrigatória')
    .max(4096, 'Mensagem deve ter no máximo 4096 caracteres'),
});

type FormData = z.infer<typeof formSchema>;

interface WhatsAppInstance {
  id: string;
  instanceName: string;
  status: string;
  connectedNumber?: string;
}

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: WhatsAppInstance | null;
}

export function SendMessageDialog({
  open,
  onOpenChange,
  instance,
}: SendMessageDialogProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number: '',
      text: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    if (!instance) return;

    setLoading(true);
    try {
      // Formatar número (remover caracteres especiais)
      let formattedNumber = data.number.replace(/\D/g, '');
      
      console.log('Número original:', data.number);
      console.log('Número formatado:', formattedNumber);
      
      // Se não começar com código do país, adicionar 55 (Brasil)
      if (!formattedNumber.startsWith('55') && formattedNumber.length <= 11) {
        formattedNumber = '55' + formattedNumber;
        console.log('Adicionado código do país:', formattedNumber);
      }
      
      // NÃO adicionar @s.whatsapp.net aqui, deixar para o backend fazer
      // O backend vai adicionar se necessário

      const requestData = {
        number: formattedNumber, // Enviar apenas números
        text: data.text.trim(),
      };

      console.log('Enviando dados:', requestData);

      const response = await fetch(`/api/whatsapp/instances/${instance.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Erro da API:', error);
        throw new Error(error.error || 'Erro ao enviar mensagem');
      }

      const result = await response.json();
      console.log('Resultado:', result);
      
      toast.success('Mensagem enviada com sucesso!', {
        description: `Enviada para ${formattedNumber}`,
      });
      
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      form.reset();
      onOpenChange(false);
    }
  };

  const formatPhoneExample = () => {
    return 'Exemplos: 11999887766, 5511999887766, +5511999887766';
  };

  if (!instance) return null;

  const isConnected = instance.status === 'CONNECTED';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-100 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
        <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 -m-6 mb-4 rounded-t-2xl">
          <DialogTitle className="text-white text-sm font-semibold tracking-[-0.03em] font-inter">Enviar Mensagem</DialogTitle>
          <DialogDescription className="text-gray-200 text-xs tracking-[-0.03em] font-inter">
            Enviar mensagem de texto via WhatsApp através da instância "{instance.instanceName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-1">
          {/* Instance Status Card */}
          <Card className="bg-white border-gray-300 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-900 font-semibold tracking-[-0.03em] font-inter">
                  <MessageSquare className="h-4 w-4" />
                  Status da Instância
                </CardTitle>
                <Badge className={`${isConnected ? 'bg-green-500' : 'bg-red-500'} text-white text-xs px-2 py-1 rounded-full border-0`}>
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
              </div>
              <CardDescription className="text-gray-600 text-xs tracking-[-0.03em] font-inter">
                {isConnected 
                  ? `Pronto para enviar mensagens${instance.connectedNumber ? ` • ${instance.connectedNumber}` : ''}`
                  : 'Instância deve estar conectada para enviar mensagens'
                }
              </CardDescription>
            </CardHeader>
          </Card>

          {!isConnected ? (
            <Card className="border-red-200 bg-red-50 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-xl">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 text-red-800">
                  <Smartphone className="h-4 w-4" />
                  <span className="font-medium text-xs">
                    Instância não conectada
                  </span>
                </div>
                <p className="text-xs text-red-700 mt-1">
                  Conecte a instância primeiro para enviar mensagens.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-900 font-medium text-xs">Número do Destinatário</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="11999887766"
                          {...field}
                          disabled={loading}
                          className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:ring-gray-900 h-8 text-xs"
                        />
                      </FormControl>
                      <FormDescription className="text-gray-600 text-xs">
                        {formatPhoneExample()}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-900 font-medium text-xs">Mensagem</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Digite sua mensagem aqui..."
                          rows={4}
                          {...field}
                          disabled={loading}
                          className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:ring-gray-900 text-xs"
                        />
                      </FormControl>
                      <FormDescription className="text-gray-600 text-xs">
                        Máximo 4096 caracteres • {field.value.length}/4096
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-gray-200/50 p-4 -m-6 mt-4 rounded-b-2xl border-t flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100 h-7 text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg h-7 text-xs"
                  >
                    {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    <Send className="mr-1.5 h-3 w-3" />
                    Enviar Mensagem
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 