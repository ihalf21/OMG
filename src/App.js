import React, { useState, useEffect, useCallback, useRef } from 'react';
import { loadData, saveData, resetToSeed, saveSeed, checkServer } from './utils/storage';
import { todayStr } from './utils/dates';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import TaskCard from './pages/TaskCard';
import Team from './pages/Team';
import EngineerCard from './pages/EngineerCard';
import Gantt from './pages/Gantt';
import Estimate from './pages/Estimate';

// Исправляет статусы инженеров на основе дат отпуска
function normalizeStatuses(d) {
  const today = todayStr();
  const extraHistory = [];
  const engineers = (d.engineers || []).map(eng => {
    // Отпуск в будущем, но статус уже vacation → вернуть в active
    if (eng.status === 'vacation' && eng.vacationFrom && eng.vacationFrom > today) {
      return { ...eng, status: 'active' };
    }
    // Отпуск начался, а инженер ещё active → перевести в vacation
    if (eng.status === 'active' && eng.vacationFrom && eng.vacationFrom <= today) {
      return { ...eng, status: 'vacation' };
    }
    // Отпуск начался, а инженер на больничном → закрыть больничный, уйти в отпуск
    if (eng.status === 'sick' && eng.vacationFrom && eng.vacationFrom <= today) {
      extraHistory.push({ id: 'h' + Date.now() + eng.id, date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Больничный закрыт: начался отпуск' });
      return { ...eng, status: 'vacation' };
    }
    return eng;
  });
  return { ...d, engineers, history: [...(d.history || []), ...extraHistory] };
}

export default function App() {
  const [data, setData]         = useState(null);      // null = загружается
  const [loading, setLoading]   = useState(true);
  const [serverOk, setServerOk] = useState(true);
  const [page, setPage]         = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId]       = useState(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState(null);
  const [theme, setTheme]       = useState(() => localStorage.getItem('omg_theme') || 'light');
  const saveTimer = useRef(null);

  // Тема
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omg_theme', theme);
  }, [theme]);

  // Загрузка при старте
  useEffect(() => {
    (async () => {
      const ok = await checkServer();
      setServerOk(ok);
      if (ok) {
        const d = await loadData();
        setData(normalizeStatuses(d));
      }
      setLoading(false);
    })();
  }, []);

  // Автосохранение — debounce 800ms
  useEffect(() => {
    if (!data || !serverOk) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveData(data), 800);
    return () => clearTimeout(saveTimer.current);
  }, [data, serverOk]);

  function updateData(fn) {
    setData(prev => {
      const next = { ...fn(prev) };
      // Автоматически обновляем даты старта дочерних задач
      // если изменилась расчётная дата завершения родителя
      let changed = true;
      let iterations = 0;
      while (changed && iterations < 5) {
        changed = false;
        iterations++;
        next.tasks = next.tasks.map(task => {
          if (!task.dependsOn) return task;
          const parent = next.tasks.find(t => t.id === task.dependsOn);
          if (!parent || parent.status === 'archived') return task;
          // Импортируем calcForecast логику напрямую
          const parentEngs = parent.assignedEngineers || [];
          const cap = parentEngs.reduce((s, id) => {
            const e = next.engineers.find(e => e.id === id);
            if (!e || e.status === 'sick' || e.status === 'vacation') return s;
            const coeff = e.role === 'intern' ? 0.5 : e.role === 'responsible' ? 0.5 : e.role === 'lead' ? 0 : 1;
            return s + coeff;
          }, 0);
          // Простой расчёт даты завершения родителя
          if (!parent.startDate) return task;
          const totalHours = parent.estimateHours || 8;
          const hoursPerDay = cap * 8;
          const daysNeeded = hoursPerDay > 0 ? Math.ceil(totalHours / hoursPerDay) : 1;
          // addWorkdays simplified
          const d = new Date(parent.startDate);
          let added = 0;
          while (added < daysNeeded) {
            d.setDate(d.getDate() + 1);
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) added++;
          }
          const newStart = d.toISOString().slice(0, 10);
          if (task.startDate !== newStart && !task._manualStart) {
            changed = true;
            return { ...task, startDate: newStart };
          }
          return task;
        });
      }
      return next;
    });
  }

  function navigate(target, id) {
    setPage(target);
    if (target === 'task')     setSelectedTaskId(id);
    if (target === 'engineer') setSelectedEngineerId(id);
  }

  async function handleSaveSeed() {
    if (!window.confirm('Сохранить текущие данные как тестовые? Они будут использоваться при следующем сбросе.')) return;
    try {
      await saveSeed();
      alert('✅ Тестовые данные сохранены!');
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    }
  }

  async function handleReset() {
    if (!window.confirm('Сбросить все данные к тестовым? Это действие нельзя отменить.')) return;
    setLoading(true);
    try {
      const fresh = await resetToSeed();
      setData(normalizeStatuses(fresh));
      setPage('dashboard');
    } catch (err) {
      alert('Ошибка сброса: ' + err.message);
    }
    setLoading(false);
  }

  // ── Экран загрузки ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16, background:'var(--bg-tertiary)' }}>
        <div style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)' }}>OMG</div>
        <div style={{ fontSize:14, color:'var(--text-tertiary)' }}>Загрузка данных...</div>
      </div>
    );
  }

  // ── Сервер недоступен ─────────────────────────────────────────────────────
  if (!serverOk) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16, background:'var(--bg-tertiary)', padding:32 }}>
        <div style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)' }}>OMG</div>
        <div style={{ fontSize:16, color:'var(--red)', fontWeight:600 }}>Сервер недоступен</div>
        <div style={{ fontSize:14, color:'var(--text-secondary)', textAlign:'center', maxWidth:400, lineHeight:1.6 }}>
          Запусти сервер командой <code style={{ background:'var(--bg-secondary)', padding:'2px 8px', borderRadius:4 }}>npm start</code> в папке проекта, затем обнови страницу.
        </div>
        <button onClick={() => window.location.reload()} style={{ marginTop:8, padding:'10px 24px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          Обновить страницу
        </button>
      </div>
    );
  }

  const ctx = { data, updateData, navigate };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-tertiary)' }}>
      <Sidebar activePage={page} onNavigate={p => navigate(p)} onReset={handleReset} onSaveSeed={handleSaveSeed}/>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Topbar theme={theme} onToggleTheme={() => setTheme(t => t==='light'?'dark':'light')}/>
        {page==='dashboard' && <Dashboard {...ctx}/>}
        {page==='tasks'     && <Tasks     {...ctx}/>}
        {page==='task'      && <TaskCard  {...ctx} taskId={selectedTaskId}     onBack={()=>navigate('tasks')}/>}
        {page==='team'      && <Team      {...ctx}/>}
        {page==='engineer'  && <EngineerCard {...ctx} engineerId={selectedEngineerId} onBack={()=>navigate('team')}/>}
        {page==='gantt'     && <Gantt     {...ctx}/>}
        {page==='estimate'  && <Estimate  {...ctx}/>}
      </div>
    </div>
  );
}
