import { loadStripe, Stripe as StripeJs } from '@stripe/stripe-js';

let stripePromise: Promise<StripeJs | null> | null = null;

export const getStripe = () => {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    stripePromise = loadStripe(pk);
  }
  return stripePromise;
};
