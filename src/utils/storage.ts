// utils/storage.ts — работа с бэкендом (Express API).

import type { Workspace } from '../domain/types';

const API = '/api';

export async function loadData(): Promise<Workspace> {
  try {
    const res = await fetch(`${API}/data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Ошибка загрузки данных:', err);
    return { currentProjectId: '', projects: [] };
  }
}

export async function saveData(data: Workspace): Promise<void> {
  try {
    await fetch(`${API}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error('Ошибка сохранения данных:', err);
  }
}

export async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
