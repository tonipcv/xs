'use client';

import { CheckIcon } from 'lucide-react';

interface PricingCardProps {
  name: string;
  price: string;
  pricePerDay: string;
  period: string;
  popular?: boolean;
  features: string[];
  onClick: () => void;
  isLoading?: boolean;
  t: any;
}

export function PricingCard({
  name,
  price,
  pricePerDay,
  period,
  popular = false,
  features,
  onClick,
  isLoading = false,
  t,
}: PricingCardProps) {
  return (
    <div className={`relative bg-white rounded-2xl border ${popular ? 'border-[#35426A]' : 'border-gray-100'} shadow-lg p-8`}>
      {popular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-[#35426A] text-white text-xs font-medium px-3 py-1 rounded-full">
            {t.plans.mostPopular}
          </span>
        </div>
      )}

      <div className="text-center mb-8">
        <h3 className="text-xl font-bold mb-4 text-[#35426A]">{name}</h3>
        <div className="mb-2">
          <span className="text-4xl font-bold text-[#35426A]">{price}</span>
          <span className="text-[#7286B2]">/{period}</span>
        </div>
        <p className="text-sm text-[#7286B2]">{pricePerDay}</p>
      </div>

      <ul className="space-y-4 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <CheckIcon className="w-5 h-5 text-[#35426A] flex-shrink-0 mt-0.5" />
            <span className="text-[#7286B2]">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        disabled={isLoading}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-white
          ${popular ? 'bg-teal-500 hover:bg-teal-400' : 'bg-teal-400 hover:bg-teal-500'}
          transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          t.plans.startNow
        )}
      </button>
    </div>
  );
} 