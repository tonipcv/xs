/**
 * String Utilities
 * Helper functions for string manipulation
 */

export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
    .replace(/^[A-Z]/, char => char.toLowerCase());
}

export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str: string): string {
  return str
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, char => map[char]);
}

export function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function padLeft(str: string | number, length: number, char = '0'): string {
  return String(str).padStart(length, char);
}

export function padRight(str: string | number, length: number, char = ' '): string {
  return String(str).padEnd(length, char);
}

export function extractNumbers(str: string): number[] {
  const matches = str.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

export function count(str: string, substring: string): number {
  if (!substring) return 0;
  return (str.split(substring).length - 1);
}

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

export function wordCount(str: string): number {
  return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === cleaned.split('').reverse().join('');
}

export function pad(str: string, length: number, char: string = ' ', direction: 'left' | 'right' | 'center' = 'center'): string {
  const padLen = length - str.length;
  if (padLen <= 0) return str;
  
  if (direction === 'left') {
    return char.repeat(padLen) + str;
  } else if (direction === 'right') {
    return str + char.repeat(padLen);
  } else {
    // center
    const leftPad = Math.floor(padLen / 2);
    const rightPad = padLen - leftPad;
    return char.repeat(leftPad) + str + char.repeat(rightPad);
  }
}

export function random(length: number = 8, charset: string = 'alphanumeric'): string {
  const charsets: Record<string, string> = {
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    numeric: '0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  };
  const chars = charsets[charset] || charsets.alphanumeric;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function mask(str: string, visibleCount: number, maskChar: string = '*'): string {
  if (visibleCount >= str.length) return str;
  const maskLength = str.length - visibleCount;
  return maskChar.repeat(maskLength) + str.substring(maskLength);
}

export const StringUtils = {
  truncate,
  slugify,
  camelCase,
  kebabCase,
  snakeCase,
  capitalize,
  titleCase,
  stripHtml,
  escapeHtml,
  isValidEmail,
  isValidUrl,
  hashString,
  removeAccents,
  padLeft,
  padRight,
  extractNumbers,
  count,
  levenshtein,
  similarity,
  wordCount,
  isPalindrome,
  pad,
  random,
  mask,
};

export default StringUtils;
