// src/pages/Gantt.tsx
import React, { useState, useMemo } from 'react';
import { getMonthDays, todayStr, type MonthDay } from '../utils/dates';
import { calcForecast, statusColor, getDerivedDeadline } from '../utils/forecast';
import { isAvailableOn, isWorkingRole, leaveTypeOn } from '../domain/availability';
import { computeInheritedTeam, computeDynamicStarts, getTaskChain, segmentByWeek, arrowAnchorOffset, sortTasksByChain } from '../domain/gantt';
import { getEngineerActiveTasks } from '../domain/task';
import { formatDateShort } from '../utils/dates';
import { genId } from '../utils/ids';
import { Avatar, PageTopbar, Select, useTooltip, useConfirm, useDaySplit } from '../components/UI';
import type { Engineer, ISODate, Task } from '../domain/types';
import type { PageProps } from '../ui-types';

type Mode = 'tasks' | 'team';
type DragEngState = { engId: string; fromTaskId: string } | null;
type FreeModalState = { day: MonthDay; engineers: Engineer[] } | null;
const NO_DIRECTION_FILTER = '__no_direction__';

export default function Gantt({ data, updateData, navigate }: PageProps) {
  const { engineers, tasks, history } = data;
  const [mode, setMode]         = useState<Mode>('tasks');
  const [year, setYear]         = useState(new Date().getFullYear());
  const [month, setMonth]       = useState(new Date().getMonth());
  const [directionFilter, setDirectionFilter] = useState('all');
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [freeModal, setFreeModal]     = useState<FreeModalState>(null);
  const [dragIdx, setDragIdx]         = useState<number | null>(null);
  const [dragOver, setDragOver]       = useState<number | null>(null);
  const [dragChainIds, setDragChainIds] = useState<Set<string>>(new Set());
  const [dragEng, setDragEng]         = useState<DragEngState>(null);
  const [dragEngOver, setDragEngOver] = useState<string | null>(null);
  const ganttBodyRef = React.useRef<HTMLDivElement>(null);
  const weekRowRef   = React.useRef<HTMLDivElement>(null);
  const [weekRowH, setWeekRowH] = useState(0);
  const { show, move, hide, TooltipEl } = useTooltip();
  const { ConfirmEl } = useConfirm();
  const { askDaySplit, DaySplitEl } = useDaySplit();

  const [showDone, setShowDone]       = useState(false);
  const [hoveredCol, setHoveredCol]   = useState<number | null>(null);

  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days  = useMemo(() => allDays.filter(d => !d.off), [allDays]);

  const directionOptions = useMemo(() => {
    const dirs = new Set<string>();
    (data.directions || []).forEach(dir => {
      const value = dir.trim();
      if (value) dirs.add(value);
    });
    return Array.from(dirs);
  }, [data.directions]);

  const hasDirectionlessTasks = useMemo(
    () => tasks.some(task => !task.direction?.trim()),
    [tasks],
  );

  React.useEffect(() => {
    if (
      directionFilter !== 'all' &&
      directionFilter !== NO_DIRECTION_FILTER &&
      !directionOptions.includes(directionFilter)
    ) {
      setDirectionFilter('all');
    }
    if (directionFilter === NO_DIRECTION_FILTER && !hasDirectionlessTasks) {
      setDirectionFilter('all');
    }
  }, [directionFilter, directionOptions, hasDirectionlessTasks]);

  const directionMatches = React.useCallback((task: Task) => {
    const taskDirection = task.direction?.trim() || '';
    if (directionFilter === 'all') return true;
    if (directionFilter === NO_DIRECTION_FILTER) return !taskDirection;
    return taskDirection === directionFilter;
  }, [directionFilter]);

  React.useLayoutEffect(() => {
    if (weekRowRef.current) setWeekRowH(weekRowRef.current.offsetHeight);
  }, [days]);
  const DAYS  = days.length;

  // Все активные задачи без фильтра по месяцу (нужны для расчёта цепочек).
  // Топологическая сортировка: цепочки всегда идут от корня к листу.
  const allActiveTasks = useMemo(() =>
    sortTasksByChain(tasks.filter(t => t.status === 'active')),
  [tasks]);

  // Эффективная команда: задача наследует инженеров от родителя если своих нет.
  const inheritedEngIds = useMemo(() => computeInheritedTeam(allActiveTasks), [allActiveTasks]);

  // Динамические даты старта по цепочке зависимостей.
  const dynamicStarts = useMemo(() =>
    computeDynamicStarts(allActiveTasks, engineers, inheritedEngIds),
    [allActiveTasks, engineers, inheritedEngIds]);

  // Эффективный дедлайн:
  // - Дедлайн всей цепочки = максимальный (самый поздний) дедлайн любого её звена
  // - Листовая задача получает этот дедлайн как жёсткий (красная линия)
  // - Каждая родительская задача — мягкий дедлайн назад от листа (жёлтая линия)
  const effectiveDls = useMemo<Record<string, ISODate>>(() => {
    const result: Record<string, ISODate> = {};
    const leafIds = new Set<string>(
      allActiveTasks.filter(t => !allActiveTasks.some(c => c.dependsOn === t.id)).map(t => t.id)
    );

    // Максимальный дедлайн в линейной цепочке от данной задачи до листа
    function chainMaxDl(taskId: string, depth: number = 0): ISODate | null {
      if (depth > 9) return null;
      const task = allActiveTasks.find(t => t.id === taskId);
      if (!task) return null;
      const child = allActiveTasks.find(t => t.dependsOn === taskId);
      const childMax: ISODate | null = child ? chainMaxDl(child.id, depth + 1) : null;
      if (!task.deadline && !childMax) return null;
      if (!task.deadline) return childMax;
      if (!childMax) return task.deadline;
      return task.deadline > childMax ? task.deadline : childMax;
    }

    // Шаг 1: каждой листовой задаче — максимальный дедлайн всей её цепочки
    allActiveTasks.forEach(t => {
      if (!leafIds.has(t.id)) return;
      let rootId = t.id, cur: Task = t;
      for (let i = 0; i < 9; i++) {
        if (!cur.dependsOn) break;
        const p = allActiveTasks.find(x => x.id === cur.dependsOn);
        if (!p) break;
        rootId = p.id; cur = p;
      }
      const dl = chainMaxDl(rootId);
      if (dl) result[t.id] = dl;
    });

    // Шаг 2: родительские задачи — мягкий дедлайн назад от листа,
    // с учётом унаследованной команды для точного расчёта длительности
    const tasksForDl: Task[] = allActiveTasks.map(t => ({
      ...t,
      assignedEngineers: inheritedEngIds[t.id] || t.assignedEngineers || [],
      deadline: leafIds.has(t.id) ? (result[t.id] || null) : null,
    }));
    allActiveTasks.forEach(t => {
      if (leafIds.has(t.id)) return;
      const derived = getDerivedDeadline({ ...t, deadline: null }, tasksForDl, engineers);
      if (derived) result[t.id] = derived;
    });

    return result;
  }, [allActiveTasks, engineers, inheritedEngIds]);

  // Прогнозы: зависимые задачи используют унаследованную команду и dynStart вместо startDate
  const forecasts = useMemo<Record<string, ReturnType<typeof calcForecast>>>(() => {
    const result: Record<string, ReturnType<typeof calcForecast>> = {};
    allActiveTasks.forEach(t => {
      const dynStart = dynamicStarts[t.id];
      const engIds = inheritedEngIds[t.id] || t.assignedEngineers || [];
      // Для зависимых: убираем устаревший startDate, подставляем inherited engineers и dynStart
      const taskForFc: Task = t.dependsOn
        ? { ...t, assignedEngineers: engIds, startDate: null }
        : { ...t, assignedEngineers: engIds };
      const startOverride = t.dependsOn && dynStart ? dynStart : null;
      result[t.id] = calcForecast(taskForFc, engineers, effectiveDls[t.id] || null, startOverride, history);
    });
    tasks.filter(t => t.status === 'done').forEach(t => {
      result[t.id] = calcForecast(t, engineers, null, null, history);
    });
    return result;
  }, [allActiveTasks, dynamicStarts, effectiveDls, engineers, inheritedEngIds, tasks, history]);

  // Конец следующего месяца от сегодня — фолбэк для задач без оценки и без дедлайна
  const noEstFallbackEnd = useMemo<ISODate>(() => {
    const d = new Date();
    const nm = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
    const ny = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const last = new Date(ny, nm + 1, 0).getDate();
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }, []);

  // Активные задачи, пересекающиеся с текущим месяцем (используем динамические даты)
  const activeTasks = useMemo<Task[]>(() => {
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return allActiveTasks.filter(t => {
      if (!directionMatches(t)) return false;
      const effStart = dynamicStarts[t.id] || todayStr();
      if (effStart > monthEnd) return false;
      const fc = forecasts[t.id];
      const noEst = !(t.estimateHours || 0);
      const endDate = fc?.forecastDate || t.deadline || (noEst ? noEstFallbackEnd : monthEnd);
      if (endDate < monthStart) return false;
      return true;
    });
  }, [allActiveTasks, dynamicStarts, forecasts, year, month, noEstFallbackEnd, directionMatches]);

  // Завершённые задачи — фильтруем по completedDate в текущем месяце
  const doneTasks = useMemo<Task[]>(() => {
    if (!showDone) return [];
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return tasks.filter(t => {
      if (t.status !== 'done') return false;
      if (!directionMatches(t)) return false;
      const start = t.startDate || monthStart;
      const end   = t.completedDate || monthEnd;
      return start <= monthEnd && end >= monthStart;
    }).sort((a,b) => (a.completedDate||'').localeCompare(b.completedDate||''));
  }, [tasks, year, month, showDone, directionMatches]);

  const monthName = new Date(year, month, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); }

  // Переводим дату в индекс среди ВИДИМЫХ дней
  function dateToIdx(dateStr: ISODate | null | undefined): number | null {
    if (!dateStr) return null;
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    const idx = days.findIndex(d => d.day === dd);
    return idx >= 0 ? idx : null;
  }

  // Если дата попадает на скрытый (выходной) день — берём следующий видимый
  function dateToIdxSafe(dateStr: ISODate | null | undefined, fallback: 'next' | 'prev' = 'next'): number | null {
    if (!dateStr) return null;
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    let idx = days.findIndex(d => d.day === dd);
    if (idx >= 0) return idx;
    if (fallback === 'next') {
      idx = days.findIndex(d => d.day > dd);
      return idx >= 0 ? idx : null;
    } else {
      const prev = [...days].reverse().find(d => d.day < dd);
      return prev ? days.indexOf(prev) : null;
    }
  }

  function L(i: number)              { return `${(i / DAYS * 100).toFixed(4)}%`; }
  function W(s: number, e: number)   { return `${((e - s) / DAYS * 100).toFixed(4)}%`; }
  function Ldl(i: number)            { return `${((i + 1) / DAYS * 100).toFixed(4)}%`; }

  const todayIdx = days.findIndex(d => d.today);

  const avail = days.map(day =>
    engineers.filter(e => isAvailableOn(e, day.str)).length
  );
  const totalEng = engineers.filter(isWorkingRole).length;
  const LABEL_W  = 200;

  function BgCols() {
    return (
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0 }}>
        {days.map((d, i) => d.off ? (
          <div key={i} style={{
            position:'absolute',
            left: `${(i / DAYS * 100).toFixed(4)}%`,
            width: `${(1 / DAYS * 100).toFixed(4)}%`,
            top: 0, bottom: 0,
            background: 'var(--bg-secondary)',
          }}/>
        ) : null)}
      </div>
    );
  }

  function fmtDate(str: ISODate | null | undefined): string {
    if (!str) return '—';
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  }

  // Эффективная дата старта:
  // - независимые задачи: startDate
  // - зависимые: всегда dynStart из цепочки (игнорируем хранимый startDate — может быть устаревшим)
  function effectiveStart(task: Task): ISODate {
    if (!task.dependsOn) return task.startDate || todayStr();
    if (dynamicStarts[task.id]) return dynamicStarts[task.id]!;
    const parent = allActiveTasks.find(t => t.id === task.dependsOn);
    return (parent && dynamicStarts[parent.id]) || todayStr();
  }


  // Drag-and-drop: перетаскивание задачи вместе со всей цепочкой зависимостей
  function handleDrop(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const draggedTask = activeTasks[fromIdx];
    if (!draggedTask) return;

    // Получаем всю цепочку в порядке root→leaf, оставляем только активные
    const chainOrdered = getChain(draggedTask.id)
      .filter(t => activeTasks.some(a => a.id === t.id));
    const chainIds = new Set(chainOrdered.map(t => t.id));

    const toTask = activeTasks[toIdx];
    // Если цель — часть той же цепочки, ничего не делаем
    if (!toTask || chainIds.has(toTask.id)) {
      setDragIdx(null); setDragOver(null); setDragChainIds(new Set());
      return;
    }

    // Переставляем видимую цепочку внутри полного активного списка, чтобы
    // скрытые фильтром задачи не получали конфликтующие sortOrder.
    const withoutChain = allActiveTasks.filter(t => !chainIds.has(t.id));
    const insertAt = withoutChain.findIndex(t => t.id === toTask.id);
    const reordered = [
      ...withoutChain.slice(0, insertAt),
      ...chainOrdered,
      ...withoutChain.slice(insertAt),
    ];

    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        const idx = reordered.findIndex(r => r.id === t.id);
        return idx >= 0 ? { ...t, sortOrder: idx } : t;
      }),
    }));
    setDragIdx(null); setDragOver(null); setDragChainIds(new Set());
  }

  // Перенос инженера с одной задачи на другую (drag-and-drop)
  async function handleEngDrop(engId: string, fromTaskId: string, toTaskId: string) {
    if (fromTaskId === toTaskId) { setDragEng(null); setDragEngOver(null); return; }

    const toTask = data.tasks.find(t => t.id === toTaskId);
    const newStart = toTask?.startDate || todayStr();
    const newEnd   = toTask ? (forecasts[toTask.id]?.forecastDate || toTask.deadline || null) : null;

    // Ищем конфликтующие по датам задачи инженера
    const otherTasks  = getEngineerActiveTasks(data, engId, toTaskId);
    const conflicting = otherTasks.filter(ct => {
      const ctEnd = forecasts[ct.id]?.forecastDate || ct.deadline || null;
      if (!ctEnd) return true;
      if (!newEnd) return ctEnd >= newStart;
      return ctEnd >= newStart && (ct.startDate || todayStr()) <= newEnd;
    });

    const fromTask = data.tasks.find(t => t.id === fromTaskId);
    let dayFraction = 0;
    if (conflicting.length > 0) {
      const ct = conflicting[0];
      const ctEnd = forecasts[ct.id]?.forecastDate || ct.deadline || null;
      const isOverdue = !!(ct.deadline && todayStr() > ct.deadline);
      const msg = isOverdue
        ? `«${ct.name}» вышла за рамки дедлайна. Инженер будет переведён — разрешите просроченную задачу вручную.`
        : `Инженер уже задействован на «${ct.name}» (до ${formatDateShort(ctEnd)}). Снять и перевести?`;
      const { confirmed, fraction } = await askDaySplit('Конфликт планирования', msg, fromTask?.name || ct.name);
      if (!confirmed) { setDragEng(null); setDragEngOver(null); return; }
      dayFraction = fraction;
    }

    // Drag-and-drop — всегда явный перевод (снять со всех конфликтующих, добавить)
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id === toTaskId) return { ...t, assignedEngineers: [...(t.assignedEngineers||[]), engId] };
        if ((t.assignedEngineers||[]).includes(engId)) return { ...t, assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engId) };
        return t;
      }),
      history: [...(prev.history||[]), { id:genId('h'), date:todayStr(), engineerId:engId, type:'switch', fromTask:fromTaskId, toTask:toTaskId, note:'', dayFraction }],
    }));
    setDragEng(null);
    setDragEngOver(null);
  }

  // Цепочка задач — делегируется в domain/gantt
  function getChain(hovId: string): Task[] {
    return getTaskChain(hovId, [...activeTasks, ...doneTasks]);
  }

  // Строим данные для стрелок зависимости при наведении (все пары цепочки)
  interface DepArrow { key: string; x1: number; y1: number; x2: number; y2: number; }
  function getDependencyArrows(hovId: string | null): DepArrow[] {
    if (!hovId || !ganttBodyRef.current) return [];
    const chain = getChain(hovId);
    if (chain.length < 2) return [];
    const base = ganttBodyRef.current.getBoundingClientRect();
    const arrows: DepArrow[] = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const pTask = chain[i];
      const cTask = chain[i + 1];
      const pEl = document.getElementById(`bar-${pTask.id}`);
      const cEl = document.getElementById(`bar-${cTask.id}`);
      if (!pEl || !cEl) continue;
      const pr = pEl.getBoundingClientRect();
      const cr = cEl.getBoundingClientRect();
      const childIsBelow = cr.top >= pr.top;
      const parentLeft   = pr.left - base.left;
      const parentAnchor = parentLeft + arrowAnchorOffset(pr.width);
      const x2           = cr.left - base.left;
      // Защита от «сломанной» стрелки: если дочерняя задача начинается левее
      // правого края родителя (например, родитель без оценки рисуется во всю
      // ширину, а старт ребёнка считается от его левого края), анкер у правого
      // края увёл бы горизонтальный сегмент назад и развернул наконечник.
      // Отводим точку выхода чуть левее старта ребёнка (но не левее левого края
      // родителя), чтобы стрелка всегда шла вперёд.
      const ARROW_GAP = 8;
      const x1 = Math.max(parentLeft, Math.min(parentAnchor, x2 - ARROW_GAP));
      arrows.push({
        key: `${pTask.id}-${cTask.id}`,
        x1,
        y1: childIsBelow ? pr.bottom - base.top : pr.top - base.top,
        x2,
        y2: cr.top - base.top + cr.height / 2,
      });
    }
    return arrows;
  }

  const depArrows = getDependencyArrows(hoveredTask);
  const hoveredChainIds = useMemo<Set<string>>(() => {
    if (!hoveredTask) return new Set<string>();
    return new Set(getChain(hoveredTask).map(t => t.id));
  }, [hoveredTask, activeTasks, doneTasks]);

  function SegmentedButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button onClick={onClick} style={{
        padding:'7px 12px',
        border:'none',
        borderRadius:5,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
        fontSize:14,
        fontWeight: active ? 700 : 500,
        cursor:'pointer',
        transition:'background 0.15s, color 0.15s',
        whiteSpace:'nowrap',
      }}>{children}</button>
    );
  }

  function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button onClick={onClick} style={{
        padding:'7px 12px',
        border:'1.5px solid',
        borderColor: active ? 'var(--accent)' : 'var(--border-mid)',
        borderRadius:6,
        background: active ? 'var(--accent-bg)' : 'var(--bg-secondary)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize:14,
        fontWeight: active ? 700 : 500,
        cursor:'pointer',
        display:'flex',
        alignItems:'center',
        gap:6,
        transition:'background 0.15s, color 0.15s, border-color 0.15s',
        whiteSpace:'nowrap',
      }}>{children}</button>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Диаграмма Ганта">
        <button onClick={prevMonth} style={{ padding:'7px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:14, cursor:'pointer', color:'var(--text-primary)', fontWeight:600 }}>‹</button>
        <div style={{ padding:'7px 16px', border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:14, fontWeight:600, minWidth:160, textAlign:'center', background:'var(--bg-secondary)', color:'var(--text-primary)', textTransform:'capitalize' }}>{monthName}</div>
        <button onClick={nextMonth} style={{ padding:'7px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:14, cursor:'pointer', color:'var(--text-primary)', fontWeight:600 }}>›</button>
        <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
        <div style={{
          display:'flex',
          alignItems:'center',
          gap:3,
          padding:3,
          border:'1.5px solid var(--border-mid)',
          borderRadius:7,
          background:'var(--bg-secondary)',
        }}>
          <SegmentedButton active={mode === 'tasks'} onClick={() => setMode('tasks')}>Только задачи</SegmentedButton>
          <SegmentedButton active={mode === 'team'} onClick={() => setMode('team')}>С командой</SegmentedButton>
        </div>
        <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:13, color:'var(--text-tertiary)', whiteSpace:'nowrap' }}>Направление</span>
          <Select
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value)}
            style={{ width:190, padding:'7px 10px', fontSize:13 }}
          >
            <option value="all">Все направления</option>
            {directionOptions.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            {hasDirectionlessTasks && <option value={NO_DIRECTION_FILTER}>Без направления</option>}
          </Select>
        </div>
        <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
        {/* Завершённые задачи */}
        <ToggleButton active={showDone} onClick={() => setShowDone(v => !v)}>
          Завершённые
          {showDone && doneTasks.length > 0 && <span style={{ fontSize:12, color:'var(--text-tertiary)', fontWeight:400 }}>({doneTasks.length})</span>}
        </ToggleButton>
      </PageTopbar>

      <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }} onMouseMove={move}>
        <div ref={ganttBodyRef} style={{ minWidth: 600, position:'relative' }}
          onMouseLeave={() => setHoveredCol(null)}
        >
          {/* Глобальный оверлей: подсветка сегодня и ховера колонки — от строки дат до низа */}
          <div style={{ position:'absolute', top:weekRowH, bottom:0, left:LABEL_W, right:0, display:'flex', pointerEvents:'none', zIndex:0 }}>
            {days.map((d, i) => (
              <div key={i} style={{
                flex:1,
                background: hoveredCol === i
                  ? 'rgba(240,160,48,0.08)'
                  : d.today ? 'rgba(29,158,117,0.08)'
                  : 'transparent',
                borderRight: i < DAYS-1 ? `0.5px solid ${d.today ? 'rgba(29,158,117,0.25)' : 'var(--border-light)'}` : 'none',
              }}/>
            ))}
          </div>

          {/* ── WEEK NUMBER ROW ── */}
          {(() => {
            // Группируем видимые дни по ISO-неделям
            const DOW_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
            const segments = segmentByWeek(days);

            return (
              // sticky-обёртка: шапка остаётся видимой при скролле вниз
              <div ref={weekRowRef} style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
              }}>
              <>
                {/* Строка номеров недель */}
                <div style={{ display:'flex' }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)' }}>
                    {segments.map((seg, si) => (
                      <div key={si} style={{
                        flex: seg.count,
                        textAlign:'center', fontSize:11, padding:'3px 0 3px',
                        color:'var(--text-tertiary)', fontWeight:500,
                        borderRight: si<segments.length-1 ? '1px solid var(--border-mid)' : 'none',
                        background:'var(--bg-secondary)',
                        letterSpacing:'0.02em',
                      }}>
                        нед. {seg.week}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Строка чисел */}
                <div style={{ display:'flex' }} onMouseLeave={() => setHoveredCol(null)}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)', background:'var(--bg-primary)' }}>
                    {days.map((d,i) => {
                      const [yy, mm, dd] = d.str.split('-').map(Number);
                      const jsDay   = new Date(yy, mm-1, dd).getDay();
                      const dowRu   = DOW_RU[jsDay];
                      const isToday = d.today;
                      return (
                        <div key={i}
                          onMouseEnter={() => setHoveredCol(i)}
                          style={{
                            flex:1, textAlign:'center', padding:'3px 0 2px', cursor:'default',
                            background: isToday ? 'rgba(29,158,117,0.07)' : 'transparent',
                            borderRight: i<DAYS-1 ? `0.5px solid ${isToday?'rgba(29,158,117,0.25)':'var(--border-light)'}` : 'none',
                          }}>
                          <div style={{ fontSize:12, fontWeight: isToday?700:400, color: isToday?'var(--accent)':'var(--text-secondary)', lineHeight:1.3 }}>{d.day}</div>
                          <div style={{ fontSize:9, color: isToday?'var(--accent)':'var(--text-tertiary)', lineHeight:1.2, fontWeight: isToday?700:400 }}>{dowRu}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom:10 }}/>
              </>
              </div>
            );
          })()}

          {/* Task rows */}
          {activeTasks.map((task, rowIdx) => {
            const fc = forecasts[task.id];
            // Эффективная команда: унаследованные + дополнительные на этой задаче
            const assignedEngs: Engineer[] = (inheritedEngIds[task.id] || task.assignedEngineers || []).map(id=>engineers.find(e=>e.id===id)).filter((e): e is Engineer => !!e);

            const hasEngineers   = assignedEngs.length > 0;
            const hasEstimate    = (task.estimateHours || 0) > 0;
            // Дочерняя задача, родитель ещё не завершён — ждёт, показываем штриховкой
            const isWaitingChild = !!task.dependsOn && allActiveTasks.some(t => t.id === task.dependsOn);
            const effectSt       = effectiveStart(task);

            const isNotStartedYet = !isWaitingChild && effectSt > todayStr();

            let barColor: string;
            let barBg: string;
            if (isWaitingChild) {
              barColor = '#A8A6A0';
              barBg = 'repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 4px,#C8C7C3 4px,#C8C7C3 8px)';
            } else if (isNotStartedYet || !hasEngineers) {
              barColor = '#A8A6A0';
              barBg = '#A8A6A0';
            } else {
              const effectiveStatus = !hasEstimate ? 'ok' : fc?.deadlineStatus;
              barColor = statusColor(effectiveStatus) || '#A8A6A0';
              barBg = barColor;
            }

            const barStartIdx   = dateToIdxSafe(effectSt, 'next') ?? 0;
            const barStart      = barStartIdx;
            const rawFcIdx      = fc?.forecastDate ? dateToIdxSafe(fc.forecastDate, 'prev') : null;
            const dlCapIdx      = task.deadline ? dateToIdxSafe(task.deadline, 'prev') : null;
            const monthLastDay  = new Date(year, month + 1, 0).getDate();
            const monthEndStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(monthLastDay).padStart(2,'0')}`;
            const fcBeyondMonth = fc?.forecastDate && fc.forecastDate > monthEndStr;
            let barEndIdx: number;
            if (!hasEstimate) {
              const noEstEnd = task.deadline || noEstFallbackEnd;
              if (noEstEnd > monthEndStr) {
                barEndIdx = DAYS;
              } else {
                const idx = dateToIdxSafe(noEstEnd, 'prev');
                barEndIdx = idx !== null ? Math.min(DAYS, idx + 1) : DAYS;
              }
            } else {
              barEndIdx = rawFcIdx !== null
                ? Math.min(DAYS, rawFcIdx + 1)
                : fcBeyondMonth
                ? DAYS
                : dlCapIdx !== null ? Math.min(DAYS, dlCapIdx + 1) : barStartIdx + 2;
            }
            const barEnd      = barEndIdx;
            const colSpan    = barEnd - barStart;
            const maxAvatars = colSpan <= 1 ? 0 : colSpan === 2 ? 1 : colSpan === 3 ? 2 : colSpan <= 5 ? 4 : 6;
            const isParent   = allActiveTasks.some(t => t.dependsOn === task.id);
            // Жёсткий дедлайн листа — максимальный в цепочке
            const dlIdx      = !isParent && effectiveDls[task.id] ? dateToIdxSafe(effectiveDls[task.id], 'prev') : null;
            // Мягкий дедлайн предка — обратный расчёт от дедлайна листа
            const chainDlIdx = isParent && effectiveDls[task.id] ? dateToIdxSafe(effectiveDls[task.id], 'prev') : null;

            const isDepHovered = hoveredChainIds.has(task.id);
            const isDragging  = dragChainIds.has(task.id);
            const isOver      = dragOver === rowIdx && !dragChainIds.has(task.id);
            const isEngTarget = dragEng && dragEng.fromTaskId !== task.id && dragEngOver === task.id;
            const progressLabel = hasEstimate
              ? `${fc?.progressPct || 0}%`
              : colSpan <= 3 ? 'Оценить' : 'Нужна оценка';

            return (
              <React.Fragment key={task.id}>
                <div
                  draggable={!dragEng}
                  onDragStart={() => {
                    if (!dragEng) {
                      setDragIdx(rowIdx);
                      const chain = getChain(task.id);
                      setDragChainIds(new Set(chain.map(t => t.id)));
                    }
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOver(null); setDragChainIds(new Set()); }}
                  onDragOver={e => {
                    e.preventDefault();
                    if (dragEng) { if (dragEng.fromTaskId !== task.id) setDragEngOver(task.id); }
                    else setDragOver(rowIdx);
                  }}
                  onDrop={() => {
                    if (dragEng) { if (dragEng.fromTaskId !== task.id) handleEngDrop(dragEng.engId, dragEng.fromTaskId, task.id); }
                    else if (dragIdx !== null) handleDrop(dragIdx, rowIdx);
                  }}
                  style={{
                    display:'flex', alignItems:'center',
                    marginBottom: mode==='team' ? 3 : 9,
                    opacity: isDragging ? 0.4 : 1,
                    borderTop: isEngTarget ? '2px solid var(--success)' : isOver ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'border-color 0.1s, background 0.15s',
                    cursor: dragEng ? 'default' : 'grab',
                    background: isEngTarget ? 'var(--success-bg)' : isDepHovered ? 'rgba(240,160,48,0.08)' : 'transparent',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'var(--text-tertiary)', fontSize:14, cursor:'grab', flexShrink:0 }}>⠿</span>
                    <div style={{ minWidth:0 }}
                      onMouseEnter={e => show(e, task.name, [
                        [assignedEngs.length, 'инж.', task.direction].filter(Boolean).join(' · '),
                        task.dependsOn ? '↳ зависит от другой задачи' : '',
                      ].filter(Boolean))}
                      onMouseLeave={hide}
                    >
                      <div title={task.name} style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {task.name}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>
                        {assignedEngs.length} инж. · {task.direction||''}
                        {task.dependsOn && <span style={{ marginLeft:6 }}>↳ зависит</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex:1, position:'relative', height:44 }}>
                    <BgCols/>
                    {barStart < barEnd && (
                      <div
                        id={`bar-${task.id}`}
                        onClick={() => navigate('task', task.id)}
                        onMouseEnter={() => setHoveredTask(task.id)}
                        onMouseLeave={() => setHoveredTask(null)}
                        style={{
                          position:'absolute', left:L(barStart), width:W(barStart,barEnd),
                          top:7, height:30, background:barBg, borderRadius:6,
                          display:'flex', alignItems:'center',
                          padding: colSpan <= 2 ? '0 4px' : '0 8px',
                          gap: colSpan <= 2 ? 3 : 5,
                          cursor:'pointer', zIndex:3, overflow:'hidden',
                          boxShadow:'0 1px 4px rgba(0,0,0,0.18)',
                          opacity: isWaitingChild ? 0.75 : 1,
                        }}
                      >
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--bar-contrast)', whiteSpace:'nowrap', flexShrink:0 }}>{progressLabel}</span>
                        {maxAvatars > 0 && (
                          <div style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                            {assignedEngs.slice(0, maxAvatars).map((e,i) => {
                              const initials = e.name.split(' ').slice(0,2).map(p=>p[0]).join('');
                              const colors = ['#9FE1CB','#B5D4F4','#CECBF6','#F5C4B3','#FAC775','#C0DD97','#D3D1C7'];
                              const bg = colors[e.name.charCodeAt(0) % colors.length];
                              const txtColor = ['#085041','#0C447C','#3C3489','#712B13','#633806','#27500A','#444441'][e.name.charCodeAt(0) % 7];
                              return (
                                <span key={e.id} style={{
                                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                                  width:18, height:18, borderRadius:'50%',
                                  background:bg, color:txtColor,
                                  fontSize:7, fontWeight:700,
                                  border:'1.5px solid rgba(255,255,255,0.6)',
                                  marginLeft: i>0 ? -5 : 0, flexShrink:0,
                                }}>{initials}</span>
                              );
                            })}
                            {assignedEngs.length > maxAvatars && <span style={{ fontSize:10, color:'rgba(255,255,255,0.85)', marginLeft:4, flexShrink:0 }}>+{assignedEngs.length-maxAvatars}</span>}
                            {assignedEngs.length > 0 && <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)', marginLeft:4, flexShrink:0 }}>({assignedEngs.length})</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Жёсткий дедлайн (красная) — только у листа цепочки, только при наведении */}
                    {hoveredTask === task.id && dlIdx !== null && dlIdx >= 0 && dlIdx < DAYS && (
                      <div style={{
                        position:'absolute', top:0, bottom:0,
                        left:`calc(${Ldl(dlIdx)} - 1px)`,
                        width:2, background:'#E24B4A',
                        zIndex:6, pointerEvents:'none',
                        borderRadius:1,
                        boxShadow:'0 0 6px rgba(226,75,74,0.5)',
                      }}/>
                    )}
                    {/* Мягкий дедлайн (жёлтая) — у предков, только при наведении */}
                    {hoveredTask === task.id && chainDlIdx !== null && chainDlIdx >= 0 && chainDlIdx < DAYS && (
                      <div style={{
                        position:'absolute', top:0, bottom:0,
                        left:`calc(${Ldl(chainDlIdx)} - 1px)`,
                        width:2, background:'var(--amber)',
                        zIndex:6, pointerEvents:'none',
                        borderRadius:1,
                        boxShadow:'0 0 6px rgba(240,160,48,0.45)',
                      }}/>
                    )}
                  </div>
                </div>

                {mode==='team' && [
                  ...assignedEngs.filter(e=>e.role==='responsible'),
                  ...assignedEngs.filter(e=>e.role!=='responsible'&&e.role!=='intern'&&e.role!=='lead'),
                  ...assignedEngs.filter(e=>e.role==='intern'),
                ].map(eng => {
                  const baseColor = eng.role==='responsible' ? '#F5A830'
                    : eng.role==='intern' ? '#C0BEFC'
                    : '#9FE1CB';

                  function leaveColor(lt: ReturnType<typeof leaveTypeOn>) {
                    if (lt === 'vacation') return 'repeating-linear-gradient(45deg,#FAEEDA,#FAEEDA 5px,#FAC775 5px,#FAC775 10px)';
                    if (lt === 'sick')     return 'repeating-linear-gradient(45deg,#FCEBEB,#FCEBEB 5px,#F09595 5px,#F09595 10px)';
                    if (lt === 'dayoff')  return 'repeating-linear-gradient(45deg,#E2ECFB,#E2ECFB 5px,#A3C6F2 5px,#A3C6F2 10px)';
                    return baseColor;
                  }

                  // Сегменты: группируем дни бара по статусу отсутствия
                  type Seg = { from: number; to: number; leave: ReturnType<typeof leaveTypeOn> };
                  const segments: Seg[] = [];
                  if (barStart < barEnd) {
                    let curLeave = leaveTypeOn(eng, days[barStart].str);
                    let segFrom  = barStart;
                    for (let di = barStart + 1; di < barEnd; di++) {
                      const dl = leaveTypeOn(eng, days[di].str);
                      if (dl !== curLeave) {
                        segments.push({ from: segFrom, to: di, leave: curLeave });
                        curLeave = dl; segFrom = di;
                      }
                    }
                    segments.push({ from: segFrom, to: barEnd, leave: curLeave });
                  }

                  // Для тултипа берём статус на сегодня (или первый день бара)
                  const tooltipLeave = leaveTypeOn(eng, days[Math.min(barStart, DAYS-1)]?.str ?? todayStr());
                  const isDraggingThis = dragEng?.engId === eng.id;
                  return (
                    <div
                      key={eng.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDragEng({ engId: eng.id, fromTaskId: task.id }); setDragIdx(null); }}
                      onDragEnd={() => { setDragEng(null); setDragEngOver(null); }}
                      onDragOver={e => { e.preventDefault(); if (dragEng && dragEng.fromTaskId !== task.id) setDragEngOver(task.id); }}
                      onDrop={() => { if (dragEng && dragEng.fromTaskId !== task.id) handleEngDrop(dragEng.engId, dragEng.fromTaskId, task.id); }}
                      style={{ display:'flex', alignItems:'center', marginBottom:3, opacity: isDraggingThis ? 0.4 : 1, cursor:'grab' }}
                    >
                      <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14, paddingLeft:16, display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ color:'var(--text-tertiary)', fontSize:12, flexShrink:0 }}>⠿</span>
                        <div onClick={e => { e.stopPropagation(); navigate('engineer', eng.id); }}
                          style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer' }}
                          onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'}
                          onMouseLeave={e=>e.currentTarget.style.color='var(--text-secondary)'}
                        >{eng.name}</div>
                      </div>
                      <div style={{ flex:1, position:'relative', height:26 }}>
                        <BgCols/>
                        {barStart < barEnd && (
                          <div
                            onClick={e => { e.stopPropagation(); navigate('engineer', eng.id); }}
                            onMouseEnter={e => show(e, eng.name, [
                              tooltipLeave === 'vacation' ? '✈️ В отпуске (частично в периоде задачи)'
                                : tooltipLeave === 'sick' ? '🤒 На больничном'
                                : tooltipLeave === 'dayoff' ? '🏖️ Дейоф'
                                : '✅ На задаче',
                              eng.role === 'responsible' ? 'Ответственный' : eng.role === 'intern' ? 'Стажёр' : '',
                              eng.regularTask ? `Регулярная: ${eng.regularTask}` : '',
                              '⠿ Перетащите на другую задачу',
                            ].filter(Boolean))}
                            onMouseLeave={hide}
                            style={{ position:'absolute', left:L(barStart), width:W(barStart,barEnd), top:4, height:18, borderRadius:3, overflow:'hidden', cursor:'grab', zIndex:3 }}
                          >
                            {segments.map((seg, si) => {
                              const segW = (seg.to - seg.from) / (barEnd - barStart) * 100;
                              const segL = (seg.from - barStart) / (barEnd - barStart) * 100;
                              return (
                                <div key={si} style={{
                                  position:'absolute',
                                  left: `${segL.toFixed(4)}%`,
                                  width: `${segW.toFixed(4)}%`,
                                  height: '100%',
                                  background: leaveColor(seg.leave),
                                }}/>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {activeTasks.length === 0 && (
            <div style={{ textAlign:'center', padding:'28px 0', color:'var(--text-tertiary)', fontSize:13, borderTop:'0.5px solid var(--border-light)' }}>
              Нет активных задач для выбранного направления в {monthName}
            </div>
          )}

          {/* Занятые и свободные инженеры */}
          {(() => {
            // Для каждого дня считаем: задействованы (на активных задачах) и свободны.
            // Доступность считается per-day — учитывает дейофы и диапазоны отпусков.
            const nonLeadEngs = engineers.filter(isWorkingRole);
            const engagedPerDay: number[] = [];
            const freePerDay: Engineer[][] = [];
            const totalPerDay: number[] = [];
            days.forEach(day => {
              const availableForDay = nonLeadEngs.filter(e => isAvailableOn(e, day.str));
              const ids = new Set<string>();
              activeTasks.forEach(task => {
                const fc  = forecasts[task.id];
                const noEst = !(task.estimateHours || 0);

                // Эффективная дата старта: зависимые — из dynamicStarts
                const effStart = task.dependsOn
                  ? (dynamicStarts[task.id] ?? null)
                  : (task.startDate ?? todayStr());
                if (!effStart || effStart > day.str) return;

                // Эффективная дата конца: прогноз → дедлайн → fallback для без-оценочных → пропуск
                const endDate = fc?.forecastDate || task.deadline || (noEst ? noEstFallbackEnd : null);
                if (!endDate || endDate < day.str) return;

                (inheritedEngIds[task.id] || task.assignedEngineers || []).forEach(id => ids.add(id));
              });
              engagedPerDay.push(availableForDay.filter(e => ids.has(e.id)).length);
              freePerDay.push(availableForDay.filter(e => !ids.has(e.id)));
              totalPerDay.push(availableForDay.length);
            });

            return (
              <>
                <div style={{ display:'flex', alignItems:'center', marginTop:12, borderTop:'0.5px solid var(--border-light)', paddingTop:6 }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Задействовано</div>
                  <div style={{ flex:1, display:'flex' }}>
                    {days.map((d,i) => {
                      const cnt = engagedPerDay[i];
                      const total = totalPerDay[i];
                      const p = total > 0 ? cnt / total : 0;
                      // Задействовано: <75% — зелёный (есть запас), 75–90% — жёлтый, >90% — красный (перегрев)
                      let bg = 'var(--bg-secondary)', col: string = 'var(--text-tertiary)';
                      if (total > 0 && cnt > 0) {
                        if (p > 0.9)        { bg = 'var(--red-bg)';     col = 'var(--red)'; }
                        else if (p >= 0.75) { bg = 'var(--amber-bg)';   col = 'var(--amber)'; }
                        else                { bg = 'var(--success-bg)'; col = 'var(--success)'; }
                      }
                      return (
                        <div key={i} style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none' }}>
                          {cnt > 0 ? cnt : '—'}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', marginTop:3 }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Свободны</div>
                  <div style={{ flex:1, display:'flex' }}>
                    {days.map((d,i) => {
                      const freeEngs = freePerDay[i];
                      const cnt = freeEngs.length;
                      const total = totalPerDay[i];
                      const p = total > 0 ? cnt / total : 0;
                      // Свободны: <10% — зелёный (почти все заняты), 10–25% — жёлтый, >25% — красный (много простоя)
                      let bg = 'var(--bg-secondary)', col: string = 'var(--text-tertiary)';
                      if (total > 0 && cnt > 0) {
                        if (p > 0.25)       { bg = 'var(--red-bg)';     col = 'var(--red)'; }
                        else if (p >= 0.10) { bg = 'var(--amber-bg)';   col = 'var(--amber)'; }
                        else                { bg = 'var(--success-bg)'; col = 'var(--success)'; }
                      }
                      return (
                        <div key={i}
                          onClick={() => cnt > 0 && setFreeModal({ day: d, engineers: freeEngs })}
                          style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none', cursor: cnt > 0 ? 'pointer' : 'default' }}
                          onMouseEnter={e => { if (!cnt) return; const rows = freeEngs.slice(0,5).map((e2: Engineer)=>`${e2.name} (${e2.regularTask||'—'})`); if (freeEngs.length > 5) rows.push(`и ещё ${freeEngs.length - 5} инженеров`); show(e, `Свободны ${fmtDate(d.str)}`, rows); }}
                          onMouseLeave={hide}
                        >
                          {cnt > 0 ? cnt : '—'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}

          {/* Завершённые задачи */}
          {showDone && doneTasks.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'14px 0 8px', paddingTop:10, borderTop:'0.5px solid var(--border-light)' }}>
                <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, fontWeight:600, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Завершённые
                </div>
                <div style={{ flex:1, height:1, background:'var(--border-light)' }}/>
              </div>
              {doneTasks.map(task => {
                const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
                const startIdx = task.startDate ? dateToIdxSafe(task.startDate, 'next') : 0;
                const endIdx   = task.completedDate ? dateToIdxSafe(task.completedDate, 'prev') : (DAYS - 1);
                const barStart = startIdx ?? 0;
                const barEnd   = endIdx !== null ? Math.min(DAYS, endIdx + 1) : DAYS;

                const isDepHov = hoveredChainIds.has(task.id);

                return (
                  <div key={task.id}
                    style={{ display:'flex', alignItems:'center', marginBottom:8,
                      background: isDepHov ? 'rgba(240,160,48,0.08)' : 'transparent',
                      borderRadius:6, transition:'background 0.15s' }}
                  >
                    <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14, paddingLeft:24 }}>
                      <div title={task.name} style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-tertiary)' }}>
                        {task.name}
                        {task.dependsOn && <span style={{ marginLeft:6, fontSize:11 }}>↳</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>
                        ✓ {task.completedDate ? new Date(task.completedDate).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}) : '—'}
                        {task.direction ? ` · ${task.direction}` : ''}
                      </div>
                    </div>
                    <div style={{ flex:1, position:'relative', height:36 }}>
                      <BgCols/>
                        {barStart < barEnd && (
                        <div
                          id={`bar-${task.id}`}
                          onClick={() => navigate('task', task.id)}
                          onMouseEnter={() => setHoveredTask(task.id)}
                          onMouseLeave={() => setHoveredTask(null)}
                          style={{
                            position:'absolute', left:L(barStart), width:W(barStart,barEnd),
                            top:5, height:26,
                            background:'repeating-linear-gradient(45deg,#888780,#888780 4px,#6A6A68 4px,#6A6A68 8px)',
                            borderRadius:5, display:'flex', alignItems:'center', padding:'0 8px', gap:6,
                            cursor:'pointer', zIndex:3, overflow:'hidden', opacity:0.75,
                          }}
                        >
                          <div style={{ display:'flex', alignItems:'center' }}>
                            {assignedEngs.slice(0,4).map((e,i) => {
                              const colors=['#9FE1CB','#B5D4F4','#CECBF6','#F5C4B3','#FAC775'];
                              const bg=colors[e.name.charCodeAt(0)%colors.length];
                              const txtColors=['#085041','#0C447C','#3C3489','#712B13','#633806'];
                              const tc=txtColors[e.name.charCodeAt(0)%5];
                              const initials=e.name.split(' ').slice(0,2).map(p=>p[0]).join('');
                              return <span key={e.id} style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,borderRadius:'50%',background:bg,color:tc,fontSize:7,fontWeight:700,border:'1px solid rgba(255,255,255,0.5)',marginLeft:i>0?-4:0 }}>{initials}</span>;
                            })}
                            {assignedEngs.length > 4 && <span style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginLeft:3 }}>+{assignedEngs.length-4}</span>}
                          </div>
                          <span style={{ fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.8)', whiteSpace:'nowrap' }}>завершена</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {showDone && doneTasks.length === 0 && (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-tertiary)', fontSize:13, borderTop:'0.5px solid var(--border-light)', marginTop:14 }}>
              Нет завершённых задач за {monthName}
            </div>
          )}

          {/* Стрелки зависимостей (вся цепочка) */}
          {depArrows.length > 0 && (
            <svg style={{
              position:'absolute', top:0, left:0, width:'100%', height:'100%',
              pointerEvents:'none', overflow:'visible', zIndex:50,
            }}>
              <defs>
                <marker id="dep-arrow" markerWidth="6" markerHeight="5"
                  refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="#F0A030" opacity="0.9"/>
                </marker>
              </defs>
              {depArrows.map(arr => (
                <path key={arr.key}
                  d={`M ${arr.x1.toFixed(1)} ${arr.y1.toFixed(1)} L ${arr.x1.toFixed(1)} ${arr.y2.toFixed(1)} L ${arr.x2.toFixed(1)} ${arr.y2.toFixed(1)}`}
                  fill="none"
                  stroke="#F0A030"
                  strokeWidth="1.2"
                  strokeOpacity="0.85"
                  strokeLinejoin="round"
                  markerEnd="url(#dep-arrow)"
                />
              ))}
            </svg>
          )}

        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'10px 20px', borderTop:'0.5px solid var(--border-light)', background:'var(--bg-primary)', flexWrap:'wrap' }}>
        {[['#1D9E75','Опережение'],['var(--amber)','Впритык'],['var(--red)','Срыв сроков'],['#A8A6A0','Без дедлайна']].map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-secondary)' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:c }}/>{l}
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-secondary)' }}>
          <div style={{ width:2, height:12, background:'#E24B4A', borderRadius:1 }}/>
          Дедлайн (при наведении)
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-secondary)' }}>
          <div style={{ width:2, height:12, background:'repeating-linear-gradient(to bottom,var(--amber) 0,var(--amber) 3px,transparent 3px,transparent 6px)', borderRadius:1 }}/>
          Расчётный дедлайн (при наведении)
        </div>
        <div style={{ width:1, height:16, background:'var(--border-light)', margin:'0 2px' }}/>
        {[
          ['#F5A830','Ответственный'],
          ['#9FE1CB','Инженер'],
          ['#C0BEFC','Стажёр'],
          ['repeating-linear-gradient(45deg,#FAEEDA,#FAEEDA 3px,#FAC775 3px,#FAC775 6px)','Отпуск'],
          ['repeating-linear-gradient(45deg,#FCEBEB,#FCEBEB 3px,#F09595 3px,#F09595 6px)','Больничный'],
          ['repeating-linear-gradient(45deg,#E2ECFB,#E2ECFB 3px,#A3C6F2 3px,#A3C6F2 6px)','Дейоф'],
        ].map(([bg,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-secondary)' }}>
            <div style={{ width:10, height:10, borderRadius:2, background:bg }}/>{l}
          </div>
        ))}
      </div>

      {/* Модал свободных инженеров */}
      {freeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
          onClick={() => setFreeModal(null)}>
          <div style={{ background:'var(--bg-primary)', borderRadius:12, border:'0.5px solid var(--border-light)', padding:24, width:480, maxHeight:'80vh', overflowY:'auto', boxShadow:'var(--shadow-md)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Свободные инженеры</div>
            <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:16 }}>{freeModal.day.day} {monthName}</div>
            {freeModal.engineers.map(eng => {
              const recommended = tasks.filter(t =>
                t.status === 'active' && t.direction === eng.regularTask
              );
              return (
                <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                  <Avatar name={eng.name} size={36}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{eng.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>
                      {eng.regularTask || '—'}
                      {recommended.length > 0 && (
                        <span style={{ marginLeft:8, color:'var(--accent)', fontWeight:500 }}>
                          → {recommended[0].name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { navigate('engineer', eng.id); setFreeModal(null); }}
                    style={{ fontSize:12, padding:'5px 12px', border:'1.5px solid var(--accent)', borderRadius:6, background:'transparent', color:'var(--accent)', cursor:'pointer', fontWeight:500 }}>
                    Карточка
                  </button>
                </div>
              );
            })}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setFreeModal(null)} style={{ padding:'8px 20px', background:'var(--bg-secondary)', border:'0.5px solid var(--border-mid)', borderRadius:8, fontSize:13, cursor:'pointer' }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {TooltipEl}
      {ConfirmEl}
      {DaySplitEl}
    </div>
  );
}
