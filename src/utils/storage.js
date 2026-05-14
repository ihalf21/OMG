// utils/storage.js — работа с бэкендом (SQLite через Express API)
// Все данные хранятся на сервере в файле omg.db

const API = '/api';

// Загрузить все данные с сервера
export async function loadData() {
  try {
    const res = await fetch(`${API}/data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Ошибка загрузки данных:', err);
    return { engineers: [], tasks: [], history: [] };
  }
}

// Сохранить все данные на сервер
export async function saveData(data) {
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

// Сбросить к тестовым данным
export async function resetToSeed() {
  const res = await fetch(`${API}/seed`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Сохранить текущие данные как тестовые
export async function saveSeed() {
  const res = await fetch(`${API}/save-seed`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
export async function checkServer() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
