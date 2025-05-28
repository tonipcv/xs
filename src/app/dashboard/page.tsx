'use client';

import { AppLayout } from '@/components/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-gray-600">Visão geral do sistema</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Instâncias WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-gray-900">3</div>
                <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                  Ativas
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Agentes IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-gray-900">5</div>
                <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                  Configurados
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Mensagens Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-gray-900">127</div>
                <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">
                  +12%
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Respostas IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-gray-900">89</div>
                <Badge variant="outline" className="bg-teal-50 text-teal-600 border-teal-200">
                  70% Auto
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">
              Ações Rápidas
            </CardTitle>
            <CardDescription>
              Acesse rapidamente as principais funcionalidades
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <h3 className="font-medium text-gray-900 mb-2">Nova Instância</h3>
                <p className="text-sm text-gray-600">Conectar novo WhatsApp</p>
              </div>
              
              <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <h3 className="font-medium text-gray-900 mb-2">Configurar IA</h3>
                <p className="text-sm text-gray-600">Criar novo agente</p>
              </div>
              
              <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <h3 className="font-medium text-gray-900 mb-2">Ver Relatórios</h3>
                <p className="text-sm text-gray-600">Análise detalhada</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
} 