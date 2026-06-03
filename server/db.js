// server/db.js — хранение данных в JSON-файле (не требует компиляции)
// Данные хранятся в server/data.json

const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');

// ── Тестовые данные ──────────────────────────────────────────────────────────

const SEED_DATA = {
  currentProjectId: 'p1',
  projects: [
    {
      id: 'p1',
      name: 'Проект 1',
      engineers: [
        { id:'e1',  name:'Иванов А.С.',    role:'lead',         regularTask:null,              status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e2',  name:'Козлова М.В.',   role:'responsible',  regularTask:'Релиз',           status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e3',  name:'Никонов Д.С.',   role:'engineer',     regularTask:'Регресс',         status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e4',  name:'Петров И.В.',    role:'engineer',     regularTask:'Синхронизация',   status:'vacation', vacationFrom:'2025-05-08', vacationTo:'2025-05-16' },
        { id:'e5',  name:'Соколова Е.А.', role:'engineer',     regularTask:'Регресс',         status:'sick',     vacationFrom:null,         vacationTo:null         },
        { id:'e6',  name:'Орлова Е.П.',   role:'engineer',     regularTask:'Регресс',         status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e7',  name:'Зайцев К.Р.',   role:'intern',       regularTask:'Смоук',           status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e8',  name:'Морозова Т.Н.', role:'engineer',     regularTask:'Синхронизация',   status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e9',  name:'Козлов А.В.',   role:'engineer',     regularTask:'Регресс',         status:'active',   vacationFrom:null,         vacationTo:null         },
        { id:'e10', name:'Петухов А.С.',  role:'engineer',     regularTask:'Спецзадачи',      status:'active',   vacationFrom:null,         vacationTo:null         },
      ],
      tasks: [
        { id:'t1', name:'Тестирование релиза 4.2',    direction:'Релиз',         status:'active', startDate:'2025-04-28', deadline:'2025-05-14', estimateHours:96,  assignedEngineers:['e2','e3','e6','e7','e8','e9'], completedDate:null },
        { id:'t2', name:'Синхронизация данных Q2',    direction:'Синхронизация', status:'active', startDate:'2025-05-01', deadline:'2025-05-20', estimateHours:80,  assignedEngineers:['e4','e8','e10'],               completedDate:null },
        { id:'t3', name:'Смоук-тестирование',         direction:'Смоук',         status:'active', startDate:'2025-05-05', deadline:'2025-05-12', estimateHours:40,  assignedEngineers:['e6','e7'],                     completedDate:null },
        { id:'t4', name:'Хот-фикс авторизации',       direction:'Спецзадачи',    status:'active', startDate:'2025-05-09', deadline:'2025-05-12', estimateHours:16,  assignedEngineers:['e3'],                          completedDate:null },
        { id:'t5', name:'Регрессионное тестирование', direction:'Регресс',       status:'active', startDate:'2025-05-01', deadline:null,         estimateHours:144, assignedEngineers:['e5','e6','e9'],                completedDate:null },
        { id:'t6', name:'Документация по API',        direction:'Спецзадачи',    status:'active', startDate:'2025-05-06', deadline:null,         estimateHours:64,  assignedEngineers:['e10'],                         completedDate:null },
      ],
      history: [
        { id:'h1', date:'2025-05-09', engineerId:'e3', type:'switch',   fromTask:'t5', toTask:'t4', note:'Срочный хот-фикс' },
        { id:'h2', date:'2025-05-06', engineerId:'e8', type:'switch',   fromTask:'t2', toTask:'t1', note:'Усиление команды релиза' },
        { id:'h3', date:'2025-05-08', engineerId:'e5', type:'sick',     fromTask:'t5', toTask:null, note:'' },
        { id:'h4', date:'2025-05-01', engineerId:'e4', type:'vacation', fromTask:'t2', toTask:null, note:'Плановый отпуск' },
      ],
    },
    {
      id: 'p2',
      name: 'Тестовый проект',
      engineers: [],
      tasks: [],
      history: [],
    },
  ],
};

// ── Миграция старого формата (flat) в мультипроектный ────────────────────────

function migrateIfNeeded(data) {
  if (!data.projects) {
    console.log('🔄 Мигрируем данные в формат с проектами...');
    return {
      currentProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Проект 1',
          engineers: data.engineers || [],
          tasks: data.tasks || [],
          history: data.history || [],
        },
      ],
    };
  }
  return data;
}

// ── Чтение / запись ──────────────────────────────────────────────────────────

function getAllData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log('📦 Файл данных не найден — создаём тестовые данные...');
    return seedDatabase();
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.projects) {
      const migrated = migrateIfNeeded(parsed);
      saveAllData(migrated);
      return migrated;
    }
    return parsed;
  } catch (err) {
    console.error('Ошибка чтения data.json:', err.message);
    return seedDatabase();
  }
}

function saveAllData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function seedDatabase() {
  const fresh = JSON.parse(JSON.stringify(SEED_DATA));
  saveAllData(fresh);
  console.log('✅ Тестовые данные загружены в data.json');
  return fresh;
}

module.exports = { getAllData, saveAllData };
