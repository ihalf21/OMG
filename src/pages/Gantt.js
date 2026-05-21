// src/pages/Gantt.js
import React, { useState, useMemo } from 'react';
import { getMonthDays, todayStr, addWorkdays } from '../utils/dates';
import { calcForecast, calcDependentStart, calcScheduledChildStart, statusColor, getDerivedDeadline, HOURS_PER_DAY } from '../utils/forecast';
import { Avatar, PageTopbar, useTooltip } from '../components/UI';

export default function Gantt({ data, updateData, navigate }) {
  const { engineers, tasks } = data;
  const [mode, setMode]         = useState('tasks');
  const [year, setYear]         = useState(new Date().getFullYear());
  const [month, setMonth]       = useState(new Date().getMonth());
  const [hideOff, setHideOff]   = useState(true);
  const [hoveredTask, setHoveredTask] = useState(null);
  const [freeModal, setFreeModal]     = useState(null);
  const [dragIdx, setDragIdx]         = useState(null);
  const [dragOver, setDragOver]       = useState(null);
  const [dragEng, setDragEng]         = useState(null); // { engId, fromTaskId }
  const [dragEngOver, setDragEngOver] = useState(null); // taskId — цель при drag инженера
  const ganttBodyRef = React.useRef(null);
  const weekRowRef   = React.useRef(null);
  const [weekRowH, setWeekRowH] = useState(0);
  const { show, move, hide, TooltipEl } = useTooltip();

  const [showDone, setShowDone]       = useState(false);
  const [hoveredCol, setHoveredCol]   = useState(null);

  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days  = useMemo(() => hideOff ? allDays.filter(d => !d.off) : allDays, [allDays, hideOff]);

  React.useLayoutEffect(() => {
    if (weekRowRef.current) setWeekRowH(weekRowRef.current.offsetHeight);
  }, [days]);
  const DAYS  = days.length;

  // Все активные задачи без фильтра по месяцу (нужны для расчёта цепочек)
  const allActiveTasks = useMemo(() =>
    tasks.filter(t => t.status === 'active')
      .sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
  [tasks]);

  // Для каждой задачи — эффективная команда:
  // если задача не имеет инженеров, наследуем от ближайшего предка с командой.
  // Это позволяет планировать длинные цепочки: команда переходит с задачи на задачу.
  const inheritedEngIds = useMemo(() => {
    const cache = {};
    function get(taskId, depth) {
      if (depth > 9 || cache[taskId] !== undefined) return cache[taskId] || [];
      const task = allActiveTasks.find(t => t.id === taskId);
      if (!task) { cache[taskId] = []; return []; }
      const own = task.assignedEngineers || [];
      if (!task.dependsOn) { cache[taskId] = own; return own; }
      const parentIds = get(task.dependsOn, depth + 1);
      if (own.length === 0) { cache[taskId] = parentIds; return parentIds; }
      // Дочерняя задача с доп. инженерами: унаследованная команда + свои (без дублей)
      const merged = [...new Set([...parentIds, ...own])];
      cache[taskId] = merged; return merged;
    }
    allActiveTasks.forEach(t => get(t.id, 0));
    return cache;
  }, [allActiveTasks]);

  // Динамические даты старта по цепочке зависимостей (до 9 уровней).
  // Зависимые задачи используют унаследованную команду для расчёта длительности.
  const dynamicStarts = useMemo(() => {
    const cache = {};
    function getDynStart(taskId, depth) {
      if (depth > 9) return null;
      if (cache[taskId] !== undefined) return cache[taskId];
      const task = allActiveTasks.find(t => t.id === taskId);
      if (!task) { cache[taskId] = null; return null; }
      if (!task.dependsOn) { cache[taskId] = task.startDate || null; return cache[taskId]; }
      const parent = allActiveTasks.find(t => t.id === task.dependsOn);
      if (!parent) { cache[taskId] = task.startDate || null; return cache[taskId]; }
      const parentDynStart = getDynStart(parent.id, depth + 1);
      // Задача с унаследованной командой для корректного расчёта capacity
      const parentEff = { ...parent, assignedEngineers: inheritedEngIds[parent.id] || [] };

      let date;
      if (!parent.dependsOn && parent.startDate) {
        // Корневая запущенная задача — elapsed-based прогресс
        const { date: d } = calcDependentStart(parentEff, engineers);
        if (d) { date = d; }
        else {
          // Нет ни унаследованных инженеров — используем дедлайн или оценку
          if (parent.deadline) date = addWorkdays(parent.deadline, 1);
          else { const hrs = parent.estimateHours || HOURS_PER_DAY; date = addWorkdays(parent.startDate, Math.round(hrs / HOURS_PER_DAY)); }
        }
      } else {
        // Зависимая или ещё не начатая задача — schedule-forward без учёта elapsed
        if (!parentDynStart) { cache[taskId] = null; return null; }
        const d = calcScheduledChildStart(parentEff, engineers, parentDynStart);
        if (d) { date = d; }
        else {
          if (parent.deadline) date = addWorkdays(parent.deadline, 1);
          else { const hrs = parent.estimateHours || HOURS_PER_DAY; date = addWorkdays(parentDynStart, Math.round(hrs / HOURS_PER_DAY)); }
        }
      }

      cache[taskId] = date;
      return date;
    }
    allActiveTasks.forEach(t => getDynStart(t.id, 0));
    return cache;
  }, [allActiveTasks, engineers, inheritedEngIds]);

  // Эффективный дедлайн:
  // - Дедлайн всей цепочки = максимальный (самый поздний) дедлайн любого её звена
  // - Листовая задача получает этот дедлайн как жёсткий (красная линия)
  // - Каждая родительская задача — мягкий дедлайн назад от листа (жёлтая линия)
  const effectiveDls = useMemo(() => {
    const result = {};
    const leafIds = new Set(
      allActiveTasks.filter(t => !allActiveTasks.some(c => c.dependsOn === t.id)).map(t => t.id)
    );

    // Максимальный дедлайн в линейной цепочке от данной задачи до листа
    function chainMaxDl(taskId, depth = 0) {
      if (depth > 9) return null;
      const task = allActiveTasks.find(t => t.id === taskId);
      if (!task) return null;
      const child = allActiveTasks.find(t => t.dependsOn === taskId);
      const childMax = child ? chainMaxDl(child.id, depth + 1) : null;
      if (!task.deadline && !childMax) return null;
      if (!task.deadline) return childMax;
      if (!childMax) return task.deadline;
      return task.deadline > childMax ? task.deadline : childMax;
    }

    // Шаг 1: каждой листовой задаче — максимальный дедлайн всей её цепочки
    allActiveTasks.forEach(t => {
      if (!leafIds.has(t.id)) return;
      let rootId = t.id, cur = t;
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
    const tasksForDl = allActiveTasks.map(t => ({
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
  const forecasts = useMemo(() => {
    const result = {};
    allActiveTasks.forEach(t => {
      const dynStart = dynamicStarts[t.id];
      const engIds = inheritedEngIds[t.id] || t.assignedEngineers || [];
      // Для зависимых: убираем устаревший startDate, подставляем inherited engineers и dynStart
      const taskForFc = t.dependsOn
        ? { ...t, assignedEngineers: engIds, startDate: null }
        : { ...t, assignedEngineers: engIds };
      const startOverride = t.dependsOn && dynStart ? dynStart : null;
      result[t.id] = calcForecast(taskForFc, engineers, effectiveDls[t.id] || null, startOverride);
    });
    tasks.filter(t => t.status === 'done').forEach(t => {
      result[t.id] = calcForecast(t, engineers);
    });
    return result;
  }, [allActiveTasks, dynamicStarts, effectiveDls, engineers, inheritedEngIds, tasks]);

  // Активные задачи, пересекающиеся с текущим месяцем (используем динамические даты)
  const activeTasks = useMemo(() => {
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return allActiveTasks.filter(t => {
      if (t.deadline && t.deadline >= monthStart && t.deadline <= monthEnd) return true;
      const effStart = dynamicStarts[t.id] || t.createdDate || todayStr();
      if (effStart > monthEnd) return false;
      const fc = forecasts[t.id];
      const endDate = fc?.forecastDate || t.deadline || monthEnd;
      if (endDate < monthStart) return false;
      return true;
    });
  }, [allActiveTasks, dynamicStarts, forecasts, year, month]);

  // Завершённые задачи — фильтруем по completedDate в текущем месяце
  const doneTasks = useMemo(() => {
    if (!showDone) return [];
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return tasks.filter(t => {
      if (t.status !== 'done') return false;
      const start = t.startDate || monthStart;
      const end   = t.completedDate || monthEnd;
      return start <= monthEnd && end >= monthStart;
    }).sort((a,b) => (a.completedDate||'').localeCompare(b.completedDate||''));
  }, [tasks, year, month, showDone]);

  const monthName = new Date(year, month, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); }

  // Переводим дату в индекс среди ВИДИМЫХ дней
  function dateToIdx(dateStr) {
    if (!dateStr) return null;
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    // Найти индекс в отфильтрованном массиве
    const idx = days.findIndex(d => d.day === dd);
    return idx >= 0 ? idx : null;
  }

  // Если дата попадает на скрытый (выходной) день — берём следующий видимый
  function dateToIdxSafe(dateStr, fallback = 'next') {
    if (!dateStr) return null;
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    let idx = days.findIndex(d => d.day === dd);
    if (idx >= 0) return idx;
    if (!hideOff) return null;
    // Дата скрыта — ищем ближайший видимый день
    if (fallback === 'next') {
      idx = days.findIndex(d => d.day > dd);
      return idx >= 0 ? idx : null;
    } else {
      const prev = [...days].reverse().find(d => d.day < dd);
      return prev ? days.indexOf(prev) : null;
    }
  }

  function L(i)   { return `${(i / DAYS * 100).toFixed(4)}%`; }
  function W(s,e) { return `${((e - s) / DAYS * 100).toFixed(4)}%`; }
  function Ldl(i) { return `${((i + 1) / DAYS * 100).toFixed(4)}%`; }

  const todayIdx = days.findIndex(d => d.today);

  const avail = days.map(day =>
    engineers.filter(e => {
      if (e.role === 'lead') return false;
      if (e.status === 'sick') return false;
      if (e.status === 'vacation' && e.vacationFrom && e.vacationTo)
        return day.str < e.vacationFrom || day.str > e.vacationTo;
      return true;
    }).length
  );
  const totalEng = engineers.filter(e => e.role !== 'lead').length;
  const LABEL_W  = 200;

  function BgCols() {
    return (
      <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none', zIndex:0 }}>
        {days.map((d,i) => (
          <div key={i} style={{
            flex:1, height:'100%',
            background: d.holiday ? 'var(--bg-tertiary)' : d.weekend ? 'var(--bg-secondary)' : 'transparent',
          }}/>
        ))}
      </div>
    );
  }

  function fmtDate(str) {
    if (!str) return '—';
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  }

  // Эффективная дата старта:
  // - независимые задачи: startDate или createdDate
  // - зависимые: всегда dynStart из цепочки (игнорируем хранимый startDate — может быть устаревшим)
  function effectiveStart(task) {
    if (!task.dependsOn) return task.startDate || task.createdDate || todayStr();
    if (dynamicStarts[task.id]) return dynamicStarts[task.id];
    const parent = allActiveTasks.find(t => t.id === task.dependsOn);
    return dynamicStarts[parent?.id] || task.createdDate || todayStr();
  }


  // Drag-and-drop: поменять задачи местами
  function handleDrop(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const reordered = [...activeTasks];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        const idx = reordered.findIndex(r => r.id === t.id);
        return idx >= 0 ? { ...t, sortOrder: idx } : t;
      }),
    }));
    setDragIdx(null);
    setDragOver(null);
  }

  // Перенос инженера с одной задачи на другую
  function handleEngDrop(engId, fromTaskId, toTaskId) {
    if (fromTaskId === toTaskId) { setDragEng(null); setDragEngOver(null); return; }
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id === fromTaskId) return { ...t, assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engId) };
        if (t.id === toTaskId)   return { ...t, assignedEngineers: [...(t.assignedEngineers||[]), engId] };
        return t;
      }),
      history: [...(prev.history||[]), { id:'h'+Date.now(), date:todayStr(), engineerId:engId, type:'switch', fromTask:fromTaskId, toTask:toTaskId, note:'' }],
    }));
    setDragEng(null);
    setDragEngOver(null);
  }

  // Собираем все задачи цепочки (вверх к корню + вниз к листу) для подсветки и стрелок
  function getChain(hovId) {
    const allVisible = [...activeTasks, ...doneTasks];
    const task = allVisible.find(t => t.id === hovId);
    if (!task) return [];
    const chain = [task];
    let cur = task;
    for (let i = 0; i < 9; i++) {
      if (!cur.dependsOn) break;
      const parent = allVisible.find(t => t.id === cur.dependsOn);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    cur = task;
    for (let i = 0; i < 9; i++) {
      const child = allVisible.find(t => t.dependsOn === cur.id);
      if (!child) break;
      chain.push(child);
      cur = child;
    }
    return chain;
  }

  // Строим данные для стрелок зависимости при наведении (все пары цепочки)
  function getDependencyArrows(hovId) {
    if (!hovId || !ganttBodyRef.current) return [];
    const chain = getChain(hovId);
    if (chain.length < 2) return [];
    const base = ganttBodyRef.current.getBoundingClientRect();
    const arrows = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const pTask = chain[i];
      const cTask = chain[i + 1];
      const pEl = document.getElementById(`bar-${pTask.id}`);
      const cEl = document.getElementById(`bar-${cTask.id}`);
      if (!pEl || !cEl) continue;
      const pr = pEl.getBoundingClientRect();
      const cr = cEl.getBoundingClientRect();
      const childIsBelow = cr.top >= pr.top;
      arrows.push({
        key: `${pTask.id}-${cTask.id}`,
        x1: pr.left - base.left + pr.width * 0.9,
        y1: childIsBelow ? pr.bottom - base.top : pr.top - base.top,
        x2: cr.left - base.left,
        y2: cr.top - base.top + cr.height / 2,
      });
    }
    return arrows;
  }

  const workdaysCount = allDays.filter(d => !d.off).length;
  const depArrows = getDependencyArrows(hoveredTask);
  const hoveredChainIds = useMemo(() => {
    if (!hoveredTask) return new Set();
    return new Set(getChain(hoveredTask).map(t => t.id));
  }, [hoveredTask, activeTasks, doneTasks]); // getChain зависит от activeTasks и doneTasks

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Диаграмма Ганта">
        <button onClick={prevMonth} style={{ padding:'7px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:14, cursor:'pointer', color:'var(--text-primary)', fontWeight:600 }}>‹</button>
        <div style={{ padding:'7px 16px', border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:14, fontWeight:600, minWidth:160, textAlign:'center', background:'var(--bg-secondary)', color:'var(--text-primary)', textTransform:'capitalize' }}>{monthName}</div>
        <button onClick={nextMonth} style={{ padding:'7px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:14, cursor:'pointer', color:'var(--text-primary)', fontWeight:600 }}>›</button>
        <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
        {[['team','👥 С командой'],['tasks','📋 Только задачи']].map(([val,label]) => (
          <button key={val} onClick={() => setMode(val)} style={{
            padding:'7px 14px', border:'1.5px solid var(--border-mid)', borderRadius:6,
            background: mode===val ? 'var(--accent)' : 'var(--bg-secondary)',
            color: mode===val ? '#fff' : 'var(--text-secondary)',
            fontSize:14, fontWeight: mode===val ? 600 : 500, cursor:'pointer',
          }}>{label}</button>
        ))}
        <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
        {/* Завершённые задачи */}
        <button onClick={() => setShowDone(v => !v)} style={{
          padding:'6px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6,
          background: showDone ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
          color: showDone ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize:14, fontWeight: showDone ? 600 : 500, cursor:'pointer',
          display:'flex', alignItems:'center', gap:6,
          borderColor: showDone ? 'var(--border-primary)' : 'var(--border-mid)',
        }}>
          {showDone ? '✅' : '☑️'} Завершённые
          {showDone && doneTasks.length > 0 && <span style={{ fontSize:12, color:'var(--text-tertiary)', fontWeight:400 }}>({doneTasks.length})</span>}
        </button>
        {/* Чекбокс скрыть выходные */}
        <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:14, color:'var(--text-secondary)', cursor:'pointer', userSelect:'none', padding:'6px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background: hideOff ? 'var(--accent-bg)' : 'var(--bg-secondary)', color: hideOff ? 'var(--accent)' : 'var(--text-secondary)' }}>
          <input type="checkbox" checked={hideOff} onChange={e => setHideOff(e.target.checked)} style={{ cursor:'pointer', accentColor:'var(--accent)' }}/>
          Только рабочие дни
          {hideOff && <span style={{ fontSize:12, color:'var(--text-tertiary)', fontWeight:400 }}>({workdaysCount} дн.)</span>}
        </label>
      </PageTopbar>

      <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }} onMouseMove={move}>
        <div ref={ganttBodyRef} style={{ minWidth: hideOff ? 600 : 860, position:'relative' }}
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
            function getISOWeek(str) {
              const [y,m,d] = str.split('-').map(Number);
              const date = new Date(y, m-1, d);
              const tmp  = new Date(Date.UTC(y, m-1, d));
              tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay()||7));
              const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
              return Math.ceil((((tmp-yearStart)/86400000)+1)/7);
            }
            // Строим сегменты недель
            const segments = [];
            days.forEach((d, i) => {
              const wk = getISOWeek(d.str);
              if (!segments.length || segments[segments.length-1].week !== wk) {
                segments.push({ week: wk, start: i, count: 1 });
              } else {
                segments[segments.length-1].count++;
              }
            });

            return (
              <>
                {/* Строка номеров недель */}
                <div ref={weekRowRef} style={{ display:'flex' }}>
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
                  <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)' }}>
                    {days.map((d,i) => {
                      const [,, dd] = d.str.split('-').map(Number);
                      const jsDay   = new Date(d.str.split('-')[0], d.str.split('-')[1]-1, dd).getDay();
                      const dowRu   = DOW_RU[jsDay];
                      const isToday = d.today;
                      const isOff   = d.off && !hideOff;
                      return (
                        <div key={i}
                          onMouseEnter={() => setHoveredCol(i)}
                          style={{
                            flex:1, textAlign:'center', padding:'3px 0 2px', cursor:'default',
                            background: isToday ? 'rgba(29,158,117,0.07)' : isOff ? 'var(--bg-secondary)' : 'transparent',
                            borderRight: i<DAYS-1 ? `0.5px solid ${isToday?'rgba(29,158,117,0.25)':'var(--border-light)'}` : 'none',
                          }}>
                          <div style={{ fontSize:12, fontWeight: isToday?700:400, color: isToday?'var(--accent)': isOff?'var(--text-tertiary)':'var(--text-secondary)', lineHeight:1.3 }}>{d.day}</div>
                          <div style={{ fontSize:9, color: isToday?'var(--accent)': isOff?'var(--text-tertiary)':'var(--text-tertiary)', lineHeight:1.2, fontWeight: isToday?700:400 }}>{dowRu}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Полоска сег./вых./праз. */}
                <div style={{ display:'flex', marginBottom:10 }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex' }}>
                    {days.map((d,i) => (
                      <div key={i} style={{
                        flex:1, height:13,
                        background: d.today ? 'rgba(29,158,117,0.18)'
                          : d.holiday ? 'var(--bg-tertiary)'
                          : d.weekend ? 'var(--bg-secondary)'
                          : 'transparent',
                        borderRight: i<DAYS-1 ? `0.5px solid ${d.today?'rgba(29,158,117,0.25)':'var(--border-light)'}` : 'none',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        {d.today && <span style={{ fontSize:8, color:'var(--accent)', fontWeight:700 }}>●</span>}
                        {!hideOff && !d.today && d.holiday && <span style={{ fontSize:7, color:'var(--text-tertiary)' }}>пр</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {/* Task rows */}
          {activeTasks.map((task, rowIdx) => {
            const fc = forecasts[task.id];
            const hasStart  = task.dependsOn ? false : !!task.startDate;
            // Задача без даты: серая штриховка, стартует с сегодня визуально
            const effectSt  = effectiveStart(task);
            const barColor  = hasStart ? (statusColor(fc?.deadlineStatus) || '#A8A6A0') : '#A8A6A0';
            const barBg     = hasStart ? barColor
              : 'repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 4px,#C8C7C3 4px,#C8C7C3 8px)';
            // Эффективная команда: унаследованные + дополнительные на этой задаче
            const assignedEngs = (inheritedEngIds[task.id] || task.assignedEngineers || []).map(id=>engineers.find(e=>e.id===id)).filter(Boolean);

            const barStartIdx   = dateToIdxSafe(effectSt, 'next') ?? 0;
            const barStart      = barStartIdx;
            const rawFcIdx      = fc?.forecastDate ? dateToIdxSafe(fc.forecastDate, 'prev') : null;
            const dlCapIdx      = task.deadline ? dateToIdxSafe(task.deadline, 'prev') : null;
            const monthLastDay  = new Date(year, month + 1, 0).getDate();
            const monthEndStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(monthLastDay).padStart(2,'0')}`;
            const fcBeyondMonth = fc?.forecastDate && fc.forecastDate > monthEndStr;
            const barEndIdx     = rawFcIdx !== null
              ? Math.min(DAYS, rawFcIdx + 1)
              : fcBeyondMonth
              ? DAYS
              : dlCapIdx !== null ? Math.min(DAYS, dlCapIdx + 1) : barStartIdx + 2;
            const barEnd      = barEndIdx;
            const colSpan    = barEnd - barStart;
            const maxAvatars = colSpan <= 1 ? 0 : colSpan === 2 ? 1 : colSpan === 3 ? 2 : colSpan <= 5 ? 4 : 6;
            const isParent   = allActiveTasks.some(t => t.dependsOn === task.id);
            // Жёсткий дедлайн листа — максимальный в цепочке
            const dlIdx      = !isParent && effectiveDls[task.id] ? dateToIdxSafe(effectiveDls[task.id], 'prev') : null;
            // Мягкий дедлайн предка — обратный расчёт от дедлайна листа
            const chainDlIdx = isParent && effectiveDls[task.id] ? dateToIdxSafe(effectiveDls[task.id], 'prev') : null;

            const isDepHovered = hoveredChainIds.has(task.id);
            const isDragging  = dragIdx === rowIdx;
            const isOver      = dragOver === rowIdx;
            const isEngTarget = dragEng && dragEng.fromTaskId !== task.id && dragEngOver === task.id;

            return (
              <React.Fragment key={task.id}>
                <div
                  draggable={!dragEng}
                  onDragStart={() => { if (!dragEng) setDragIdx(rowIdx); }}
                  onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
                  onDragOver={e => {
                    e.preventDefault();
                    if (dragEng) { if (dragEng.fromTaskId !== task.id) setDragEngOver(task.id); }
                    else setDragOver(rowIdx);
                  }}
                  onDrop={() => {
                    if (dragEng) { if (dragEng.fromTaskId !== task.id) handleEngDrop(dragEng.engId, dragEng.fromTaskId, task.id); }
                    else handleDrop(dragIdx, rowIdx);
                  }}
                  style={{
                    display:'flex', alignItems:'center',
                    marginBottom: mode==='team' ? 3 : 9,
                    opacity: isDragging ? 0.4 : 1,
                    borderTop: isEngTarget ? '2px solid var(--success)' : isOver && dragIdx !== rowIdx ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'border-color 0.1s, background 0.15s',
                    cursor: dragEng ? 'default' : 'grab',
                    background: isEngTarget ? 'var(--success-bg)' : isDepHovered ? 'rgba(240,160,48,0.08)' : 'transparent',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ color:'var(--text-tertiary)', fontSize:14, cursor:'grab', flexShrink:0 }}>⠿</span>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {task.name}
                        {!hasStart && <span style={{ fontSize:11, color:'var(--text-tertiary)', marginLeft:6, fontWeight:400 }}>плановая</span>}
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
                          opacity: hasStart ? 1 : 0.75,
                        }}
                      >
                        <span style={{ fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap', flexShrink:0 }}>{fc?.progressPct||0}%</span>
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
                  const isVac      = eng.status==='vacation';
                  const isSick     = eng.status==='sick';
                  const baseColor  = eng.role==='responsible' ? '#F5A830'
                    : eng.role==='intern'       ? '#C0BEFC'
                    : '#9FE1CB';
                  const engColor   = isVac
                    ? 'repeating-linear-gradient(45deg,#FAEEDA,#FAEEDA 5px,#FAC775 5px,#FAC775 10px)'
                    : isSick
                    ? 'repeating-linear-gradient(45deg,#FCEBEB,#FCEBEB 5px,#F09595 5px,#F09595 10px)'
                    : baseColor;
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
                              isVac ? '✈️ В отпуске' : isSick ? '🤒 На больничном' : '✅ На задаче',
                              eng.role === 'responsible' ? 'Ответственный' : eng.role === 'intern' ? 'Стажёр' : '',
                              eng.regularTask ? `Регулярная: ${eng.regularTask}` : '',
                              '⠿ Перетащите на другую задачу',
                            ].filter(Boolean))}
                            onMouseLeave={hide}
                            style={{ position:'absolute', left:L(barStart), width:W(barStart,barEnd), top:4, height:18, background:engColor, borderRadius:3, cursor:'grab', zIndex:3 }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Занятые и свободные инженеры */}
          {(() => {
            // Для каждого дня считаем: задействованы (на активных задачах) и свободны
            const nonLeadEngs = engineers.filter(e => e.role !== 'lead');
            const activeNonLead = nonLeadEngs.filter(e => e.status === 'active');
            const engagedPerDay = [];
            const freePerDay = [];
            days.forEach(day => {
              const ids = new Set();
              activeTasks.forEach(task => {
                const fc = forecasts[task.id];
                const st = task.startDate || day.str;
                const en = fc?.forecastDate || day.str;
                if (st <= day.str && en >= day.str) {
                  (inheritedEngIds[task.id] || task.assignedEngineers || []).forEach(id => ids.add(id));
                }
              });
              engagedPerDay.push(activeNonLead.filter(e => ids.has(e.id)).length);
              freePerDay.push(activeNonLead.filter(e => !ids.has(e.id)));
            });

            return (
              <>
                <div style={{ display:'flex', alignItems:'center', marginTop:12, borderTop:'0.5px solid var(--border-light)', paddingTop:6 }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Задействовано</div>
                  <div style={{ flex:1, display:'flex' }}>
                    {days.map((d,i) => {
                      const cnt = engagedPerDay[i];
                      const total = activeNonLead.length;
                      const p = total > 0 ? cnt / total : 0;
                      const bg = p > 0.8 ? 'var(--success-bg)' : p > 0.4 ? 'var(--amber-bg)' : 'var(--bg-secondary)';
                      const col = p > 0.8 ? 'var(--success)' : p > 0.4 ? 'var(--amber)' : 'var(--text-tertiary)';
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
                      const bg = cnt > 0 ? 'var(--red-bg)' : 'var(--bg-secondary)';
                      const col = cnt > 0 ? 'var(--red)' : 'var(--text-tertiary)';
                      return (
                        <div key={i}
                          onClick={() => cnt > 0 && setFreeModal({ day: d, engineers: freeEngs })}
                          style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none', cursor: cnt > 0 ? 'pointer' : 'default' }}
                          onMouseEnter={e => { if (!cnt) return; const rows = freeEngs.slice(0,5).map(e2=>`${e2.name} (${e2.regularTask||'—'})`); if (freeEngs.length > 5) rows.push(`и ещё ${freeEngs.length - 5} инженеров`); show(e, `Свободны ${fmtDate(d.str)}`, rows); }}
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
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-tertiary)' }}>
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
          <div style={{ width:10, height:10, borderRadius:2, background:'repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 3px,#C8C7C3 3px,#C8C7C3 6px)' }}/>
          Плановая
        </div>
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
    </div>
  );
}
