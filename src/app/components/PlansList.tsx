'use client';

import { PricingCard } from './PricingCard';

interface Plan {
  name: string;
  price: string;
  pricePerDay: string;
  period: string;
  popular: boolean;
  features: string[];
}

interface PlansListProps {
  plans: Plan[];
  handlePlanSelection: (plan: Plan) => void;
  t: any;
}

export function PlansList({ plans, handlePlanSelection, t }: PlansListProps) {
  return (
    <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-20 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-2">
      {plans.map((plan) => (
        <PricingCard
          key={plan.name}
          {...plan}
          onClick={() => handlePlanSelection(plan)}
          t={t}
        />
      ))}
    </div>
  );
} 