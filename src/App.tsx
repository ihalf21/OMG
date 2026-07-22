import React, { useState, useEffect, useRef } from 'react';
import { loadData, loadMe, saveData, checkServer } from './utils/storage';
import { todayStr } from './utils/dates';
import { genId } from './utils/ids';
import Sidebar from './components/Sidebar';
import Topbar, { type Theme } from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import TaskCard from './pages/TaskCard';
import Team from './pages/Team';
import EngineerCard from './pages/EngineerCard';
import Gantt from './pages/Gantt';
import Estimate from './pages/Estimate';
import Reports from './pages/Reports';
import Absences from './pages/Absences';
import Notes from './pages/Notes';
import Admin from './pages/Admin';
import { REGULAR_TASKS } from './domain/tasks';
import type { Engineer, HistoryEntry, Project, ProjectState, Task, User, Workspace } from './domain/types';
import type { NavTarget } from './ui-types';

// Исправляет статусы инженеров на основе дат отпуска/дейофа (работает на одном проекте)
function normalizeStatuses(d: ProjectState): ProjectState {
  const today = todayStr();
  const extraHistory: HistoryEntry[] = [];
  const removeFromTasks = new Set<string>();

  const engineers: Engineer[] = (d.engineers || []).map(eng => {
    // ── Дейоф ────────────────────────────────────────────────────────────────
    if (eng.dayoffDate) {
      if (eng.dayoffDate < today) {
        if (eng.status === 'dayoff') {
          extraHistory.push({ id: genId('h'), date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Возврат с дейофа' });
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
      extraHistory.push({ id: genId('h'), date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Возврат из отпуска' });
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
      extraHistory.push({ id: genId('h'), date: today, engineerId: eng.id, type: 'return', fromTask: null, toTask: null, note: 'Больничный закрыт: начался отпуск' });
      removeFromTasks.add(eng.id);
      return { ...eng, status: 'vacation' };
    }
    return eng;
  });

  const tasks: Task[] = removeFromTasks.size > 0
    ? (d.tasks || []).map(t => ({
        ...t,
        assignedEngineers: (t.assignedEngineers || []).filter(id => !removeFromTasks.has(id)),
      }))
    : (d.tasks || []);

  return { ...d, engineers, tasks, history: [...(d.history || []), ...extraHistory] };
}

// Старый flat-формат (на случай если сервер вернёт legacy данные)
interface LegacyData {
  engineers?: Engineer[];
  tasks?: Task[];
  history?: HistoryEntry[];
  projects?: Project[];
  currentProjectId?: string;
}

function ensureWorkspace(d: LegacyData | Workspace): Workspace {
  const defaultDirections = [...REGULAR_TASKS];
  if ('projects' in d && d.projects) {
    const ws = d as Workspace;
    return {
      ...ws,
      // Миграция: проекты без directions получают список по умолчанию
      projects: ws.projects.map(p => ({
        ...p,
        directions: p.directions ?? defaultDirections,
      })),
    };
  }
  return {
    currentProjectId: 'p1',
    projects: [{
      id: 'p1',
      name: 'Проект 1',
      engineers: (d as LegacyData).engineers || [],
      tasks: (d as LegacyData).tasks || [],
      history: (d as LegacyData).history || [],
      directions: defaultDirections,
    }],
  };
}

export default function App() {
  const [data, setData]         = useState<Workspace | null>(null);
  const [loading, setLoading]   = useState(true);
  const [serverOk, setServerOk] = useState(true);
  const [saveConflict, setSaveConflict] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage]         = useState<NavTarget>('dashboard');
  const [selectedTaskId, setSelectedTaskId]               = useState<string | null>(null);
  const [selectedEngineerId, setSelectedEngineerId]       = useState<string | null>(null);
  const [selectedEstimateTaskId, setSelectedEstimateTaskId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('omg_theme') as Theme) || 'light');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omg_theme', theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const ok = await checkServer();
      setServerOk(ok);
      if (ok) {
        const [user, d] = await Promise.all([loadMe(), loadData()]);
        setCurrentUser(user);
        const base = ensureWorkspace(d as unknown as LegacyData);
        setData({ ...base, projects: base.projects.map(p => normalizeStatuses(p)) });
      }
      setLoading(false);
    })();
  }, []);

  // Пересчёт статусов при переходе через полночь.
  useEffect(() => {
    let lastDay = todayStr();
    const interval = setInterval(() => {
      const currentDay = todayStr();
      if (currentDay !== lastDay) {
        lastDay = currentDay;
        setData(prev => prev ? { ...prev, projects: prev.projects.map(p => normalizeStatuses(p)) } : prev);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (page === 'admin' && currentUser?.globalRole !== 'admin') {
      setPage('dashboard');
    }
  }, [page, currentUser]);

  // Автосохранение — debounce 800ms
  useEffect(() => {
    if (!data || !serverOk || saveConflict) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveData(data)
        .then(result => {
          if (result.conflict) {
            setSaveConflict(
              `Проект «${result.conflict.projectName}» уже изменён другим пользователем. Обновите страницу перед продолжением.`
            );
            return;
          }

          if (result.savedProjects.length === 0) {
            setSaveConflict(null);
            return;
          }

          setData(prev => prev ? ({
            ...prev,
            projects: prev.projects.map(project => {
              const meta = result.savedProjects.find(saved => saved.id === project.id);
              return meta
                ? { ...project, revision: meta.revision, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy }
                : project;
            }),
          }) : prev);
          setSaveConflict(null);
        })
        .catch(err => {
          console.error('Ошибка сохранения данных:', err);
        });
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, serverOk, saveConflict]);

  // Обновляет данные текущего проекта (используется страницами)
  function updateProjectData(fn: (state: ProjectState) => ProjectState) {
    setData(prev => prev ? ({
      ...prev,
      projects: prev.projects.map(p => p.id === prev.currentProjectId ? fn(p) : p),
    }) : prev);
  }

  function navigate(target: NavTarget, id?: string) {
    if (target === 'admin' && currentUser?.globalRole !== 'admin') {
      setPage('dashboard');
      return;
    }
    setPage(target);
    if (target === 'task'     && id) setSelectedTaskId(id);
    if (target === 'engineer' && id) setSelectedEngineerId(id);
    if (target === 'estimate')       setSelectedEstimateTaskId(id || null);
  }

  // ── Управление проектами ──────────────────────────────────────────────────

  function selectProject(id: string) {
    setData(prev => prev ? ({ ...prev, currentProjectId: id }) : prev);
    setPage('dashboard');
  }

  function addProject(name: string) {
    const newId = genId('p');
    setData(prev => prev ? ({
      ...prev,
      projects: [...prev.projects, { id: newId, name, engineers: [], tasks: [], history: [], directions: [] }],
      currentProjectId: newId,
    }) : prev);
    setPage('dashboard');
  }

  function editProject(id: string, patch: {
    name: string;
    lead: string;
    jiraUrl: string;
    directions: string[];
    plannedEngineers: number | null;
    leadIncluded: boolean;
  }) {
    setData(prev => prev ? ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? {
        ...p,
        name: patch.name,
        lead: patch.lead || undefined,
        jiraUrl: patch.jiraUrl || undefined,
        directions: patch.directions,
        plannedEngineers: patch.plannedEngineers,
        leadIncluded: patch.leadIncluded,
      } : p),
    }) : prev);
  }

  function archiveProject(id: string) {
    const isCurrentProject = data?.currentProjectId === id;
    setData(prev => {
      if (!prev) return prev;
      const activeOthers = prev.projects.filter(p => !p.archived && p.id !== id);
      const newCurrentId = prev.currentProjectId === id && activeOthers.length > 0
        ? activeOthers[0].id
        : prev.currentProjectId;
      return {
        ...prev,
        currentProjectId: newCurrentId,
        projects: prev.projects.map(p => p.id === id
          ? { ...p, archived: true, archivedAt: todayStr() }
          : p
        ),
      };
    });
    if (isCurrentProject) setPage('dashboard');
  }

  function restoreProject(id: string) {
    setData(prev => prev ? ({
      ...prev,
      projects: prev.projects.map(p => p.id === id
        ? { ...p, archived: false, archivedAt: null }
        : p
      ),
    }) : prev);
  }

  function deleteProject(id: string) {
    setData(prev => prev ? ({
      ...prev,
      projects: prev.projects.filter(p => p.id !== id),
    }) : prev);
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

  if (!data) return null;
  const isGlobalAdmin = currentUser?.globalRole === 'admin';

  const currentProject = data.projects.find(p => p.id === data.currentProjectId && !p.archived)
    ?? data.projects.find(p => !p.archived)
    ?? data.projects[0];
  if (!currentProject) return null;

  const ctx = { data: currentProject, updateData: updateProjectData, navigate };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-tertiary)' }}>
      <Sidebar
        activePage={page}
        onNavigate={p => navigate(p)}
        projects={data.projects.filter(p => !p.archived)}
        archivedProjects={data.projects.filter(p => p.archived)}
        currentProjectId={data.currentProjectId}
        onSelectProject={selectProject}
        onAddProject={addProject}
        onEditProject={editProject}
        onArchiveProject={archiveProject}
        onRestoreProject={restoreProject}
        onDeleteProject={deleteProject}
        isGlobalAdmin={isGlobalAdmin}
      />
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Topbar theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}/>
        {saveConflict && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 24px', background:'var(--red-bg)', color:'var(--red)', borderBottom:'0.5px solid var(--border-light)', fontSize:13, fontWeight:600 }}>
            <span>{saveConflict}</span>
            <button
              onClick={() => window.location.reload()}
              style={{ padding:'5px 12px', border:'1.5px solid var(--red)', borderRadius:6, background:'transparent', color:'var(--red)', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}
            >
              Обновить
            </button>
          </div>
        )}
        <div style={{ flex:1, overflow:'hidden', display:'flex', justifyContent:'center', alignItems:'stretch' }}>
        <div style={{ width:'100%', maxWidth:1680, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {page==='dashboard' && <Dashboard {...ctx}/>}
        {page==='tasks'     && <Tasks     {...ctx}/>}
        {page==='task'      && <TaskCard  {...ctx} taskId={selectedTaskId!}     onBack={()=>navigate('tasks')}/>}
        {page==='team'      && <Team      {...ctx}/>}
        {page==='absences'  && <Absences  {...ctx}/>}
        {page==='engineer'  && <EngineerCard {...ctx} engineerId={selectedEngineerId!} onBack={()=>navigate('team')}/>}
        {page==='gantt'     && <Gantt     {...ctx}/>}
        {page==='estimate'  && <Estimate  {...ctx} initialTaskId={selectedEstimateTaskId || undefined}/>}
        {page==='reports'   && <Reports   {...ctx}/>}
        {page==='admin'     && isGlobalAdmin && <Admin projects={data.projects} currentUser={currentUser!}/>}
        {page==='notes'     && <Notes/>}
        </div>
        </div>
      </div>
    </div>
  );
}
