import { useState, useEffect } from 'react';
import { getStripe } from '@/lib/stripe';

interface PricingPlanProps {
  userId: string;
}

interface PriceIds {
  price_monthly: string;
  price_yearly: string;
}

export default function PricingPlans({ userId }: PricingPlanProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceIds, setPriceIds] = useState<PriceIds | null>(null);

  console.log('PricingPlans rendered with userId:', userId);

  // Buscar ou criar produtos/preços ao carregar o componente
  useEffect(() => {
    console.log('PricingPlans useEffect triggered');
    const fetchPrices = async () => {
      try {
        console.log('Fetching prices...');
        const response = await fetch('/api/get-or-create-prices');
        console.log('API Response status:', response.status);
        const data = await response.json();
        console.log('API Response data:', data);

        if (!response.ok) {
          console.error('API Response not ok:', response.status, data);
          throw new Error(data.error || 'Erro ao buscar preços');
        }

        console.log('Setting price IDs:', data.prices);
        setPriceIds(data.prices);
      } catch (err) {
        console.error('Error fetching prices:', err);
        setError('Erro ao carregar os preços. Por favor, tente novamente.');
      }
    };

    fetchPrices();
  }, []);

  console.log('Current state - priceIds:', priceIds, 'error:', error, 'isLoading:', isLoading);

  const handleSubscribe = async (priceId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Create checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          userId,
        }),
      });

      const { sessionId } = await response.json();
      
      // Redirect to checkout
      const stripe = await getStripe();
      const result = await stripe?.redirectToCheckout({
        sessionId,
      });

      if (result?.error) {
        throw new Error(result.error.message);
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 text-red-700 p-4 rounded-md">
          <p className="font-semibold">Erro ao carregar os planos:</p>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!priceIds) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando planos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Protocolo Face Korean
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Escolha o plano ideal para sua jornada de transformação facial
          </p>
        </div>

        <div className="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto">
          {/* Plano Mensal */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-lg transition-shadow duration-300">
            <div className="flex flex-col h-full">
              <h3 className="text-2xl font-semibold text-gray-900">Mensal</h3>
              <p className="mt-4 text-gray-500">Acesso completo por 30 dias</p>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-gray-900">R$97</span>
                <span className="text-gray-500">/mês</span>
              </div>
              <ul className="mt-6 space-y-4 flex-grow">
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Acesso a todos os módulos</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Exercícios detalhados</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Rotina de skincare</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe(priceIds.price_monthly)}
                disabled={isLoading}
                className="mt-8 w-full bg-rose-600 text-white rounded-md py-3 px-4 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isLoading ? 'Processando...' : 'Começar agora'}
              </button>
            </div>
          </div>

          {/* Plano Anual */}
          <div className="bg-white border-2 border-rose-500 rounded-lg shadow-sm p-6 hover:shadow-lg transition-shadow duration-300">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold text-gray-900">Anual</h3>
                <span className="px-3 py-1 text-sm text-rose-600 bg-rose-100 rounded-full">Economia de 50%</span>
              </div>
              <p className="mt-4 text-gray-500">Acesso completo por 12 meses</p>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-gray-900">R$497</span>
                <span className="text-gray-500">/ano</span>
              </div>
              <ul className="mt-6 space-y-4 flex-grow">
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Tudo do plano mensal</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Economia de R$667</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="ml-3 text-gray-700">Acesso vitalício aos updates</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe(priceIds.price_yearly)}
                disabled={isLoading}
                className="mt-8 w-full bg-rose-600 text-white rounded-md py-3 px-4 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isLoading ? 'Processando...' : 'Melhor valor! Começar agora'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 