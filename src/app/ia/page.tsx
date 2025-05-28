'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Navigation } from '../components/Navigation';

export default function AIPage() {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setChat(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      setChat(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setChat(prev => [...prev, { 
        role: 'assistant', 
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D6D2D3] to-[#F8FFFF] font-normal tracking-[-0.03em]">
      {/* Header */}
      <header className="fixed w-full top-0 bg-[#D6D2D3]/80 backdrop-blur-lg z-50 border-b border-gray-100/20">
        <div className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[#1B2541] text-sm font-light uppercase">IA</span>
          </div>
        </div>
      </header>

      <main className="pt-12 pb-20 h-screen">
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto px-3">
            <div className="space-y-2 py-2">
              {chat.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-[#35426A] text-white'
                        : 'bg-gray-100 text-[#35426A]'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 bg-gray-100">
                    <div className="animate-pulse flex space-x-1">
                      <div className="h-1.5 w-1.5 bg-[#35426A] rounded-full"></div>
                      <div className="h-1.5 w-1.5 bg-[#35426A] rounded-full"></div>
                      <div className="h-1.5 w-1.5 bg-[#35426A] rounded-full"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 bg-white/80 backdrop-blur-sm p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Pergunte algo..."
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#35426A] placeholder-[#7286B2] focus:ring-1 focus:ring-[#35426A] focus:border-transparent"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="bg-[#35426A] hover:bg-[#7286B2] text-white rounded-lg px-3 transition-colors disabled:opacity-50 disabled:hover:bg-[#35426A]"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </main>

      <Navigation />
    </div>
  );
} 