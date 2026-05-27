import React, { useState, useEffect, useCallback, useRef } from 'react';
import { loadData, saveData, checkServer } from './utils/storage';
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

// Исправляет статусы инженеров на основе дат отпуска/дейофа (работает на одном проекте)
function normalizeStatuses(d) {
  const today = todayStr();
  const extraHistory = [];
  const removeFromTasks = new Set();

  const engineers = (d.engineers || []).map(eng => {
    // ── Дейоф ────────────────────────────────────────────────────────────────
    if (eng.dayoffDate) {
      if (eng.dayoffDate < today) {
        if (eng.status === 'dayoff') {
          extraHistory.push({ id: 'h' + Date.now() + eng.id, date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Возврат с дейофа' });
          return { ...eng, status: 'active', dayoffDate: null };
        }
        // Запланирован, но приложение не открывали в тот день — просто чистим
        return { ...eng, dayoffDate: null };
      }
      if (eng.dayoffDate === today && eng.status === 'active') {
        removeFromTasks.add(eng.id);
        return { ...eng, status: 'dayoff' };
      }
    }

    // ── Отпуск ────────────────────────────────────────────────────────────────
    if (eng.status === 'vacation' && eng.vacationTo && eng.vacationTo < today) {
      extraHistory.push({ id: 'h' + Date.now() + eng.id, date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Возврат из отпуска' });
      return { ...eng, status: 'active', vacationFrom: null, vacationTo: null };
    }
    if (eng.status === 'vacation' && eng.vacationFrom && eng.vacationFrom > today) {
      return { ...eng, status: 'active' };
    }
    if (eng.status === 'active' && eng.vacationFrom && eng.vacationFrom <= today) {
      removeFromTasks.add(eng.id);
      return { ...eng, status: 'vacation' };
    }
    if (eng.status === 'sick' && eng.vacationFrom && eng.vacationFrom <= today) {
      extraHistory.push({ id: 'h' + Date.now() + eng.id, date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Больничный закрыт: начался отпуск' });
      removeFromTasks.add(eng.id);
      return { ...eng, status: 'vacation' };
    }
    return eng;
  });

  const tasks = removeFromTasks.size > 0
    ? (d.tasks || []).map(t => ({
        ...t,
        assignedEngineers: (t.assignedEngineers || []).filter(id => !removeFromTasks.has(id)),
      }))
    : (d.tasks || []);

  return { ...d, engineers, tasks, history: [...(d.history || []), ...extraHistory] };
}

export default function App() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [serverOk, setServerOk] = useState(true);
  const [page, setPage]         = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId]         = useState(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState(null);
  const [theme, setTheme]       = useState(() => localStorage.getItem('omg_theme') || 'light');
  const saveTimer = useRef(null);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omg_theme', theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const ok = await checkServer();
      setServerOk(ok);
      if (ok) {
        const d = await loadData();
        // Поддержка старого flat-формата на клиенте (резервная миграция)
        const base = d.projects
          ? d
          : { currentProjectId: 'p1', projects: [{ id: 'p1', name: 'Проект 1', engineers: d.engineers || [], tasks: d.tasks || [], history: d.history || [] }] };
        setData({ ...base, projects: base.projects.map(p => normalizeStatuses(p)) });
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

  // Обновляет данные текущего проекта (используется страницами)
  function updateProjectData(fn) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p =>
        p.id === prev.currentProjectId ? fn(p) : p
      ),
    }));
  }

  function navigate(target, id) {
    setPage(target);
    if (target === 'task')     setSelectedTaskId(id);
    if (target === 'engineer') setSelectedEngineerId(id);
  }

  // ── Управление проектами ──────────────────────────────────────────────────

  function selectProject(id) {
    setData(prev => ({ ...prev, currentProjectId: id }));
    setPage('dashboard');
  }

  function addProject(name) {
    const newId = 'p' + Date.now();
    setData(prev => ({
      ...prev,
      projects: [...prev.projects, { id: newId, name, engineers: [], tasks: [], history: [] }],
      currentProjectId: newId,
    }));
    setPage('dashboard');
  }

  function editProject(id, name) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, name } : p),
    }));
  }

  // ── Тестовые данные ───────────────────────────────────────────────────────

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

  const currentProject = data?.projects?.find(p => p.id === data.currentProjectId) ?? data?.projects?.[0];
  const ctx = { data: currentProject, updateData: updateProjectData, navigate };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-tertiary)' }}>
      <Sidebar
        activePage={page}
        onNavigate={p => navigate(p)}
        projects={data?.projects || []}
        currentProjectId={data?.currentProjectId}
        onSelectProject={selectProject}
        onAddProject={addProject}
        onEditProject={editProject}
      />
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Topbar theme={theme} onToggleTheme={() => setTheme(t => t==='light'?'dark':'light')}/>
        <div style={{ flex:1, overflow:'hidden', display:'flex', justifyContent:'center', alignItems:'stretch' }}>
        <div style={{ width:'100%', maxWidth:1680, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {page==='dashboard' && <Dashboard {...ctx}/>}
        {page==='tasks'     && <Tasks     {...ctx}/>}
        {page==='task'      && <TaskCard  {...ctx} taskId={selectedTaskId}     onBack={()=>navigate('tasks')}/>}
        {page==='team'      && <Team      {...ctx}/>}
        {page==='engineer'  && <EngineerCard {...ctx} engineerId={selectedEngineerId} onBack={()=>navigate('team')}/>}
        {page==='gantt'     && <Gantt     {...ctx}/>}
        {page==='estimate'  && <Estimate  {...ctx}/>}
        </div>
        </div>
      </div>
    </div>
  );
}
