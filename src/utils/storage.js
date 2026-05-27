// utils/storage.js — работа с бэкендом (Express API)
// Все данные хранятся на сервере в файле server/data.json

const API = '/api';

// Загрузить все данные с сервера
export async function loadData() {
  try {
    const res = await fetch(`${API}/data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Ошибка загрузки данных:', err);
    return { currentProjectId: null, projects: [] };
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

export async function checkServer() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
