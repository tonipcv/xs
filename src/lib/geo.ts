import type { Region } from './prices';

export function detectUserRegion(): Region {
  if (typeof window === 'undefined') return 'OTHER';

  // Detectar região pelo idioma do navegador
  const language = navigator.language.toLowerCase();
  const languages = navigator.languages?.map(l => l.toLowerCase()) || [];
  
  // Detectar região pelo timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Brasil
  if (
    language.startsWith('pt-br') || 
    languages.some(l => l.startsWith('pt-br')) ||
    timezone.includes('America/Sao_Paulo') ||
    timezone.includes('Brazil')
  ) {
    return 'BR';
  }
  
  // Reino Unido
  if (
    language.startsWith('en-gb') || 
    languages.some(l => l.startsWith('en-gb')) ||
    timezone.includes('Europe/London') ||
    timezone.includes('GB')
  ) {
    return 'UK';
  }
  
  // União Europeia
  const euTimezones = ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome'];
  const euLanguages = ['de', 'fr', 'es', 'it', 'nl', 'pt-pt'];
  if (
    euLanguages.some(l => language.startsWith(l)) ||
    euLanguages.some(l => languages.some(ul => ul.startsWith(l))) ||
    euTimezones.some(t => timezone.includes(t))
  ) {
    return 'EU';
  }
  
  // Estados Unidos
  if (
    language.startsWith('en-us') || 
    languages.some(l => l.startsWith('en-us')) ||
    timezone.includes('America/New_York') ||
    timezone.includes('America/Los_Angeles') ||
    timezone.includes('America/Chicago') ||
    timezone.includes('America/Denver')
  ) {
    return 'US';
  }
  
  return 'OTHER';
} 