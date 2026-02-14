export type Region = 'US' | 'UK' | 'EU' | 'BR' | 'OTHER';

export const REGION_NAMES = {
  US: 'United States',
  UK: 'United Kingdom',
  EU: 'Europe',
  BR: 'Brazil',
  OTHER: 'Other Countries'
} as const;

export const REGION_CURRENCIES = {
  US: 'USD',
  UK: 'GBP',
  EU: 'EUR',
  BR: 'BRL',
  OTHER: 'USD'
} as const;

export const CURRENCY_SYMBOLS = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  BRL: 'R$'
} as const;

export const PRICE_IDS = {
  INICIANTE: {
    USD: 'price_1RHUZiCodiLHkuBGqxoV4vd7',
    GBP: 'price_1RHUa9CodiLHkuBGzvqPoceq',
    EUR: 'price_1RHUiYCodiLHkuBGr9UB45Qm',
    BRL: 'price_1RHTEKCodiLHkuBGpp8UD9vd'
  },
  PRO: {
    USD: 'price_1RHUgsCodiLHkuBGzh7StNRK',
    GBP: 'price_1RHUghCodiLHkuBGGo7lsx31',
    EUR: 'price_1RHUhvCodiLHkuBGFcX6pLBh',
    BRL: 'price_1RHTG7CodiLHkuBG6tUiqlUU'
  }
} as const;

export const PRICE_VALUES = {
  INICIANTE: {
    USD: 9,
    GBP: 9,
    EUR: 9,
    BRL: 19
  },
  PRO: {
    USD: 99,
    GBP: 99,
    EUR: 99,
    BRL: 197
  }
} as const; 