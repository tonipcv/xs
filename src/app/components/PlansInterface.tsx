'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { getStripe } from '@/lib/stripe';
import { PlansList } from './PlansList';
import { PRICE_IDS, PRICE_VALUES, REGION_CURRENCIES, CURRENCY_SYMBOLS } from '@/lib/prices';
import { Navigation } from './Navigation';
import { translations } from '@/lib/i18n';
import { event as fbEvent } from '@/lib/fpixel';

interface PlansInterfaceProps {
  userRegion?: 'US' | 'UK' | 'EU' | 'BR' | 'OTHER';
  userId: string;
}

function getPlansForRegion(region: 'US' | 'UK' | 'EU' | 'BR' | 'OTHER', t: any) {
  const currency = REGION_CURRENCIES[region];
  const symbol = CURRENCY_SYMBOLS[currency];

  return [
    {
      name: t.plans.basic,
      price: `${symbol}${PRICE_VALUES.INICIANTE[currency]}`,
      pricePerDay: `${symbol}${(PRICE_VALUES.INICIANTE[currency] / 30).toFixed(2)} ${t.plans.perDay}`,
      period: t.plans.month,
      popular: false,
      features: [
        t.features.allExercises,
        t.features.exclusiveGroup,
        t.features.chatSupport,
        t.features.guarantee,
      ],
    },
    {
      name: t.plans.pro,
      price: `${symbol}${PRICE_VALUES.PRO[currency]}`,
      pricePerDay: `${symbol}${(PRICE_VALUES.PRO[currency] / 30).toFixed(2)} ${t.plans.perDay}`,
      period: t.plans.month,
      popular: true,
      features: [
        t.features.allBasicPlan,
        t.features.exclusiveContent,
        t.features.prioritySupport,
        t.features.individualMentoring,
        t.features.extendedGuarantee,
      ],
    },
  ];
}

export default function PlansInterface({ userRegion = 'OTHER', userId }: PlansInterfaceProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState('pt-BR');

  useEffect(() => {
    // Detecta o idioma do navegador
    const browserLang = navigator.language;
    // Verifica se temos tradução para o idioma, senão usa inglês como fallback
    const supportedLocale = translations[browserLang] ? browserLang : 
                          browserLang.startsWith('pt') ? 'pt-BR' :
                          browserLang.startsWith('es') ? 'es' : 'en';
    setLocale(supportedLocale);
  }, []);

  const t = translations[locale];
  const plans = getPlansForRegion(userRegion, t);

  const handleLogout = async () => {
    await signOut({ redirect: true, callbackUrl: '/login' });
  };

  const handlePlanSelection = async (plan: { name: string }) => {
    try {
      setIsLoading(true);
      setError(null);

      const currency = REGION_CURRENCIES[userRegion];
      const priceId = plan.name === t.plans.basic
        ? PRICE_IDS.INICIANTE[currency]
        : PRICE_IDS.PRO[currency];
      
      if (!priceId) {
        throw new Error('Plano não encontrado');
      }

      // Get plan price based on the selected plan
      const planPrice = plan.name === t.plans.basic
        ? PRICE_VALUES.INICIANTE[currency]
        : PRICE_VALUES.PRO[currency];

      // Track InitiateCheckout with Facebook Pixel
      fbEvent('InitiateCheckout', {
        currency: currency,
        value: planPrice,
        content_type: 'product',
        content_name: plan.name,
        content_ids: [priceId]
      });

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          userId,
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/planos`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar sessão de pagamento');
      }

      const stripe = await getStripe();
      
      if (!stripe) {
        throw new Error('Erro ao carregar o Stripe');
      }

      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D6D2D3] to-[#F8FFFF] font-normal tracking-[-0.03em]">
      {/* Header */}
      <header className="fixed w-full top-0 bg-[#D6D2D3]/80 backdrop-blur-lg z-40 border-b border-gray-100/20">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="p-2">
              <span className="text-[#1B2541] text-2xl font-light tracking-[-0.03em] uppercase">
                VUOM
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-[#7286B2] hover:text-[#35426A] transition-colors duration-200"
            >
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="pt-24 pb-32 px-4">
        <div className="w-full max-w-6xl mx-auto">
          {/* Título */}
          <div className="text-center mb-12">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3 text-[#35426A]">
              {t.choosePlan}
            </h1>
            <p className="text-[#7286B2] text-base md:text-lg max-w-2xl mx-auto">
              {t.startJourney}
            </p>
            {error && (
              <div className="mt-4 text-red-500 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Cards dos planos */}
          <PlansList
            plans={plans}
            handlePlanSelection={handlePlanSelection}
            t={t}
          />
        </div>
      </div>

      <Navigation />
    </div>
  );
} 