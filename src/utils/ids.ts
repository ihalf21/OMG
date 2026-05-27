// src/utils/ids.ts — генератор уникальных ID.

export function genId(prefix: string = ''): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().split('-')[0];
  }
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
