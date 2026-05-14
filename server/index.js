// server/index.js — Express REST API для OMG

const express = require('express');
const cors    = require('cors');
const { getAllData, saveAllData, seedDatabase } = require('./db');

const app  = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

// ── Маршруты ─────────────────────────────────────────────────────────────────

// GET /api/data — загрузить все данные
app.get('/api/data', (req, res) => {
  try {
    const data = getAllData();
    res.json(data);
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data — сохранить все данные
app.post('/api/data', (req, res) => {
  try {
    saveAllData(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/save-seed — сохранить текущие данные как тестовые
app.post('/api/save-seed', (req, res) => {
  try {
    const current = getAllData();
    // Перезаписываем SEED в db.js не нужно — просто сохраняем отдельный файл
    const seedPath = require('path').join(__dirname, 'seed.json');
    require('fs').writeFileSync(seedPath, JSON.stringify(current, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/save-seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seed — сбросить к тестовым данным (из seed.json или встроенных)
app.post('/api/seed', (req, res) => {
  try {
    const seedPath = require('path').join(__dirname, 'seed.json');
    const fs = require('fs');
    if (fs.existsSync(seedPath)) {
      // Используем сохранённые пользователем тестовые данные
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
      saveAllData(seedData);
      console.log('✅ Сброс к пользовательским тестовым данным (seed.json)');
      res.json(seedData);
    } else {
      // Используем встроенные тестовые данные
      const data = seedDatabase();
      res.json(data);
    }
  } catch (err) {
    console.error('POST /api/seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health — проверка работы сервера
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── Запуск ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   OMG Server запущен               ║
║   http://localhost:${PORT}           ║
╚════════════════════════════════════╝
  `);
});
