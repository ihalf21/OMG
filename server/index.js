// server/index.js — Express REST API для OMG

const express = require('express');
const cors    = require('cors');
const { getAllData, saveAllData } = require('./db');

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
