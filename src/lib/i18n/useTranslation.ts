/**
 * React Hook for i18n
 * Usage: const { t, locale, setLocale } = useTranslation();
 */

'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { Locale, getTranslation, detectLocale, Translation } from './translations';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  translation: Translation;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/**
 * Hook to use translations
 */
export function useTranslation() {
  const context = useContext(I18nContext);
  
  if (!context) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  
  return context;
}

/**
 * Provider component for i18n
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en-US');
  const [translation, setTranslation] = useState<Translation>(getTranslation('en-US'));

  useEffect(() => {
    // Detect locale from browser
    const browserLocale = detectLocale(navigator.language);
    
    // Check localStorage for saved preference
    const savedLocale = localStorage.getItem('xase-locale') as Locale;
    
    const initialLocale = savedLocale || browserLocale;
    setLocaleState(initialLocale);
    setTranslation(getTranslation(initialLocale));
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    setTranslation(getTranslation(newLocale));
    localStorage.setItem('xase-locale', newLocale);
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = translation;
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || key;
  };

  const value = { locale, setLocale, t, translation };
  
  return React.createElement(
    I18nContext.Provider,
    { value },
    children
  );
}
