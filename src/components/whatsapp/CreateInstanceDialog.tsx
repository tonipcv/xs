'use client';

import { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
  instanceName: z.string().optional(),
  sessionToken: z.string().optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  autoReconnect: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
}

export function CreateInstanceDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateInstanceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [suggestedNames, setSuggestedNames] = useState<string[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      instanceName: '',
      sessionToken: '',
      webhookUrl: '',
      autoReconnect: true,
    },
  });

  const instanceName = form.watch('instanceName');

  // Verificar disponibilidade do nome em tempo real
  useEffect(() => {
    const checkNameAvailability = async () => {
      if (!instanceName || instanceName.trim().length < 2) {
        setNameAvailable(null);
        setSuggestedNames([]);
        return;
      }

      setCheckingName(true);
      try {
        const response = await fetch('/api/whatsapp/instances/check-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName: instanceName.trim() }),
        });

        const data = await response.json();
        setNameAvailable(data.available);

        if (!data.available && data.suggestions) {
          setSuggestedNames(data.suggestions);
        } else {
          setSuggestedNames([]);
        }
      } catch (error) {
        console.error('Erro ao verificar nome:', error);
        setNameAvailable(null);
        setSuggestedNames([]);
      } finally {
        setCheckingName(false);
      }
    };

    const timeoutId = setTimeout(checkNameAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [instanceName]);

  const handleSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      // Verificar nome antes de enviar se foi informado
      if (data.instanceName && data.instanceName.trim()) {
        if (nameAvailable === false) {
          toast.error('Nome da instância já está em uso', {
            description: 'Escolha um nome diferente ou use uma das sugestões'
          });
          setLoading(false);
          return;
        }
      }

      // Limpar campos vazios
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => {
          if (typeof value === 'string') {
            return value.trim() !== '';
          }
          return value !== undefined;
        })
      ) as FormData;

      await onSubmit(cleanData);
      form.reset();
      setNameAvailable(null);
      setSuggestedNames([]);
    } catch (error) {
      // Erro já é tratado no componente pai
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      form.reset();
      setNameAvailable(null);
      setSuggestedNames([]);
      onOpenChange(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    form.setValue('instanceName', suggestion);
  };

  const renderNameStatus = () => {
    if (!instanceName || instanceName.trim().length < 2) return null;

    if (checkingName) {
      return (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Verificando disponibilidade...</span>
        </div>
      );
    }

    if (nameAvailable === true) {
      return (
        <div className="flex items-center space-x-2 text-sm text-green-700">
          <CheckCircle className="h-3 w-3" />
          <span>Nome disponível</span>
        </div>
      );
    }

    if (nameAvailable === false) {
      return (
        <div className="flex items-center space-x-2 text-sm text-red-700">
          <XCircle className="h-3 w-3" />
          <span>Nome já está em uso</span>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-gray-100 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
        <DialogHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 -m-6 mb-4 rounded-t-2xl">
          <DialogTitle className="text-white text-sm font-semibold tracking-[-0.03em] font-inter">Nova Instância WhatsApp</DialogTitle>
          <DialogDescription className="text-gray-200 text-xs tracking-[-0.03em] font-inter">
            Crie uma nova instância do WhatsApp Business. Deixe o nome em branco
            para gerar automaticamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3 px-1">
            <FormField
              control={form.control}
              name="instanceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-900 font-medium text-xs">Nome da Instância (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: minha-empresa-wa"
                      {...field}
                      disabled={loading}
                      className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:ring-gray-900 h-8 text-xs"
                    />
                  </FormControl>
                  {renderNameStatus()}
                  <FormDescription className="text-gray-600 text-xs">
                    Se não informado, será gerado automaticamente
                  </FormDescription>
                  <FormMessage />
                  
                  {/* Sugestões de nomes */}
                  {suggestedNames.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Lightbulb className="h-3 w-3" />
                        <span>Sugestões de nomes disponíveis:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {suggestedNames.map((suggestion, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="cursor-pointer hover:bg-gray-900 hover:text-white border-gray-900 text-gray-900 text-xs px-2 py-1"
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sessionToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-900 font-medium text-xs">Token de Sessão (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Cole aqui o token de uma sessão anterior para reconectar sem QR Code"
                      rows={3}
                      {...field}
                      disabled={loading}
                      className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:ring-gray-900 text-xs"
                    />
                  </FormControl>
                  <FormDescription className="text-gray-600 text-xs">
                    Use para reconectar uma sessão existente sem escanear QR Code
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-900 font-medium text-xs">URL do Webhook (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://seu-site.com/webhook/whatsapp"
                      type="url"
                      {...field}
                      disabled={loading}
                      className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:ring-gray-900 h-8 text-xs"
                    />
                  </FormControl>
                  <FormDescription className="text-gray-600 text-xs">
                    URL para receber eventos do WhatsApp em tempo real
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="autoReconnect"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-gray-300 p-3 bg-white">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm text-gray-900 font-medium">Reconexão Automática</FormLabel>
                    <FormDescription className="text-gray-600 text-xs">
                      Tentar reconectar automaticamente em caso de desconexão
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                      className="data-[state=checked]:bg-gray-900"
                    />
                  </FormControl>
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
                disabled={loading || (!!instanceName && nameAvailable === false)}
                className="bg-gray-900 hover:bg-gray-800 text-white shadow-lg h-7 text-xs"
              >
                {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Criar Instância
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 