// src/utils/ids.js — генератор уникальных ID.
// Использует crypto.randomUUID когда доступен (8-символьный префикс UUID),
// иначе fallback на Date.now() + random. Префикс сохраняется для читаемости JSON.

export function genId(prefix = '') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().split('-')[0];
  }
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
