'use client';

import { AppLayout } from '@/components/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

const plans = [
  {
    name: "Plano Básico",
    price: "R$ 29",
    period: "mês",
    popular: false,
    features: [
      "Até 3 instâncias WhatsApp",
      "1 agente IA por instância",
      "Suporte por email",
      "Dashboard básico",
    ],
  },
  {
    name: "Plano Pro",
    price: "R$ 79",
    period: "mês",
    popular: true,
    features: [
      "Até 10 instâncias WhatsApp",
      "Agentes IA ilimitados",
      "Base de conhecimento avançada",
      "Suporte prioritário",
      "Analytics avançados",
      "Webhooks personalizados",
    ],
  },
  {
    name: "Plano Enterprise",
    price: "R$ 199",
    period: "mês",
    popular: false,
    features: [
      "Instâncias ilimitadas",
      "Agentes IA ilimitados",
      "API completa",
      "Suporte 24/7",
      "Customizações",
      "Onboarding dedicado",
    ],
  },
];

export default function PlanosPage() {
  return (
    <AppLayout>
      <div className="min-h-[100dvh] bg-gray-100 pt-4 pb-8 px-2">
        <div className="container mx-auto pl-1 sm:pl-2 md:pl-4 lg:pl-8 max-w-[99%] sm:max-w-[97%] md:max-w-[95%] lg:max-w-[92%]">
          {/* Título */}
          <div className="mb-6">
            <h1 className="text-lg sm:text-base md:text-lg font-bold text-gray-900 tracking-[-0.03em] font-inter">
              Planos e Preços
            </h1>
            <p className="text-xs sm:text-xs md:text-xs text-gray-600 tracking-[-0.03em] font-inter">
              Escolha o plano ideal para suas necessidades
            </p>
          </div>

          {/* Cards dos Planos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.16)] transition-all duration-300 rounded-2xl relative ${
                  plan.popular ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-blue-500 text-white px-3 py-1 text-xs">
                      Mais Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-gray-900 tracking-[-0.03em] font-inter text-lg">
                    {plan.name}
                  </CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600 text-sm">/{plan.period}</span>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2 text-sm text-gray-700">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    className={`w-full h-10 rounded-xl text-sm font-medium transition-all duration-300 ${
                      plan.popular 
                        ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg' 
                        : 'bg-gray-800/5 border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] text-gray-700 hover:bg-gray-800/10'
                    }`}
                  >
                    Escolher Plano
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Informações Adicionais */}
          <div className="mt-8 text-center">
            <Card className="bg-gray-800/5 border-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-2xl">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 tracking-[-0.03em] font-inter">
                  Todos os planos incluem:
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Garantia de 7 dias</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Atualizações gratuitas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Documentação completa</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
} 