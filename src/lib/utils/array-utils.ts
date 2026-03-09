/**
 * Array Utilities
 * Helper functions for array manipulation
 */

export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set<string>();
  return array.filter(item => {
    const val = String(item[key]);
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

export function flatten<T>(array: (T | T[])[]): T[] {
  return array.flat(Infinity) as T[];
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const group = String(item[key]);
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(array: T[], key: keyof T, direction?: 'asc' | 'desc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return (direction || 'asc') === 'asc' ? -1 : 1;
    if (aVal > bVal) return (direction || 'asc') === 'asc' ? 1 : -1;
    return 0;
  });
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sample<T>(array: T[], size: number): T[] {
  return shuffle(array).slice(0, size);
}

export function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0];
  
  return arrays.reduce((acc, curr) => {
    const setCurr = new Set(curr);
    return acc.filter(x => setCurr.has(x));
  }, arrays[0]);
}

export function difference<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0];
  
  const first = arrays[0];
  const rest = arrays.slice(1);
  
  return rest.reduce((acc, curr) => {
    const setCurr = new Set(curr);
    return acc.filter(x => !setCurr.has(x));
  }, first);
}

export function union<T>(...arrays: T[][]): T[] {
  return unique(arrays.flat());
}

export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of array) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  return [pass, fail];
}

export function sum(array: number[]): number {
  return array.reduce((a, b) => a + b, 0);
}

export function average(array: number[]): number {
  if (array.length === 0) return 0;
  return sum(array) / array.length;
}

export function median(array: number[]): number {
  if (array.length === 0) return 0;
  const sorted = [...array].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i <= end; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i >= end; i += step) {
      result.push(i);
    }
  }
  return result;
}

export function pluck<T, K extends keyof T>(array: T[], key: K): T[K][] {
  return array.map(item => item[key]);
}

export const ArrayUtils = {
  chunk,
  flatten,
  unique,
  uniqueBy,
  groupBy,
  sortBy,
  shuffle,
  sample,
  intersection,
  difference,
  union,
  partition,
  sum,
  average,
  median,
  range,
  pluck,
};

export default ArrayUtils;
