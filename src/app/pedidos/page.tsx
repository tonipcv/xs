'use client';

import { useState, useEffect } from 'react';
import { Send, Plus, X } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useSession } from 'next-auth/react';

type Prayer = {
  id: string;
  request: string;
  response?: string;
  status: string;
  createdAt: Date;
};

export default function PrayerRequestsPage() {
  const [newRequest, setNewRequest] = useState('');
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPrayers, setIsLoadingPrayers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { data: session } = useSession();

  // Carregar pedidos do usuário
  useEffect(() => {
    const loadPrayers = async () => {
      try {
        setIsLoadingPrayers(true);
        const response = await fetch('/api/prayers');
        const data = await response.json();
        if (data.prayers) {
          setPrayers(data.prayers);
        }
      } catch (error) {
        console.error('Error loading prayers:', error);
      } finally {
        setIsLoadingPrayers(false);
      }
    };

    if (session) {
      loadPrayers();
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.trim() || isLoading) return;

    setIsLoading(true);

    try {
      // Primeiro, salva o pedido no banco
      const saveResponse = await fetch('/api/prayers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ request: newRequest.trim() }),
      });

      const savedPrayer = await saveResponse.json();

      // Depois, gera a oração com a IA
      const aiResponse = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: `Por favor, crie uma oração personalizada para o seguinte pedido: "${newRequest}". 
                   A oração deve ser em português, respeitosa e baseada em princípios bíblicos.` 
        }),
      });

      const aiData = await aiResponse.json();

      // Atualiza o pedido com a resposta da IA
      const updateResponse = await fetch(`/api/prayers/${savedPrayer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          response: aiData.response,
          status: 'completed'
        }),
      });

      const updatedPrayer = await updateResponse.json();
      setPrayers(prev => [updatedPrayer, ...prev]);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setNewRequest('');
      setIsLoading(false);
      setShowForm(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D6D2D3] to-[#F8FFFF] font-normal tracking-[-0.03em]">
      {/* Header */}
      <header className="fixed w-full top-0 bg-[#D6D2D3]/80 backdrop-blur-lg z-50 border-b border-gray-100/20">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[#1B2541] text-sm font-light uppercase">Pedidos de Oração</span>
            <button
              onClick={() => setShowForm(true)}
              className="bg-[#35426A] text-white rounded-full p-1.5"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="pt-12 pb-20 h-screen">
        <div className="h-full flex flex-col">
          {/* Lista de Pedidos */}
          <div className="flex-1 overflow-y-auto px-3">
            <div className="space-y-2 py-2">
              {isLoadingPrayers ? (
                // Loading state
                <div className="flex items-center justify-center py-8">
                  <div className="animate-pulse space-y-2">
                    <div className="h-24 w-full bg-gray-200 rounded-lg"></div>
                    <div className="h-24 w-full bg-gray-200 rounded-lg"></div>
                    <div className="h-24 w-full bg-gray-200 rounded-lg"></div>
                  </div>
                </div>
              ) : prayers.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center py-8 text-[#7286B2]">
                  <p className="text-sm">Nenhum pedido de oração ainda.</p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="mt-2 text-sm text-[#35426A] hover:underline"
                  >
                    Criar primeiro pedido
                  </button>
                </div>
              ) : (
                // Lista de pedidos
                prayers.map((prayer) => (
                  <div
                    key={prayer.id}
                    className="bg-white rounded-lg shadow-sm overflow-hidden"
                  >
                    <div className="p-3 border-b border-gray-100">
                      <p className="text-sm text-[#35426A]">{prayer.request}</p>
                      <p className="text-xs text-[#7286B2] mt-1">
                        {new Date(prayer.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {prayer.response && (
                      <div className="p-3 bg-gray-50">
                        <p className="text-sm text-[#7286B2] italic">
                          {prayer.response}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Modal de Novo Pedido */}
          {showForm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50">
              <div className="bg-white w-full max-w-lg rounded-t-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-sm font-medium text-[#35426A]">Novo Pedido de Oração</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-[#7286B2] hover:text-[#35426A]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <textarea
                    value={newRequest}
                    onChange={(e) => setNewRequest(e.target.value)}
                    placeholder="Compartilhe seu pedido de oração..."
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#35426A] placeholder-[#7286B2] focus:ring-1 focus:ring-[#35426A] focus:border-transparent min-h-[100px]"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#35426A] hover:bg-[#7286B2] text-white rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Enviando...' : 'Enviar Pedido'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      <Navigation />
    </div>
  );
} 