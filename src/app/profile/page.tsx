'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSession } from "next-auth/react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: string;
  tokensUsed: number;
  tokensLimit: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    // Simular dados do perfil
    if (session?.user) {
      setProfile({
        id: '1',
        name: session.user.name || 'Usuário',
        email: session.user.email || '',
        phone: '+55 11 99999-9999',
        plan: 'Pro',
        tokensUsed: 1250,
        tokensLimit: 5000
      });
    }
  }, [session]);

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Perfil</h1>
          <p className="text-gray-600">Gerencie suas informações pessoais</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações Pessoais */}
          <div className="lg:col-span-2">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Informações Pessoais
                    </CardTitle>
                    <CardDescription>
                      Atualize seus dados pessoais
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={profile.phone || ''}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="plan">Plano</Label>
                    <div className="mt-1">
                      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                        {profile.plan}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {isEditing && (
                  <div className="flex gap-2 pt-4">
                    <Button size="sm">Salvar</Button>
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Estatísticas */}
          <div className="space-y-6">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  Uso de Tokens
                </CardTitle>
                <CardDescription>
                  Consumo mensal de IA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Usado</span>
                    <span className="font-medium">{profile.tokensUsed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Limite</span>
                    <span className="font-medium">{profile.tokensLimit.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${(profile.tokensUsed / profile.tokensLimit) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {Math.round((profile.tokensUsed / profile.tokensLimit) * 100)}% utilizado
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  Estatísticas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Instâncias Ativas</span>
                  <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                    3
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Agentes IA</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                    5
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mensagens Hoje</span>
                  <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">
                    127
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
