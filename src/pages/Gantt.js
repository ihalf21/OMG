// src/pages/Gantt.js
import React, { useState, useMemo } from 'react';
import { getMonthDays, todayStr } from '../utils/dates';
import { calcForecast, statusColor, getDerivedDeadline } from '../utils/forecast';
import { Avatar, PageTopbar, useTooltip } from '../components/UI';

const HOURS_PER_DAY = 8;

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
  const { show, move, hide, TooltipEl } = useTooltip();

  const [showDone, setShowDone]       = useState(false);

  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days  = useMemo(() => hideOff ? allDays.filter(d => !d.off) : allDays, [allDays, hideOff]);
  const DAYS  = days.length;

  // Сортируем задачи по sortOrder, показываем только те что пересекаются с текущим месяцем
  const activeTasks = useMemo(() => {
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const todayS     = new Date().toISOString().slice(0,10);

    const active = tasks.filter(t => {
      if (t.status !== 'active') return false;
      // Если дедлайн задачи попадает в текущий месяц — всегда показываем
      // (даже если старт ещё не наступил: задача уже просрочена или вот-вот)
      if (t.deadline && t.deadline >= monthStart && t.deadline <= monthEnd) return true;
      // Определяем эффективную дату старта
      const effStart = t.startDate || t.createdDate || todayS;
      // Задача начинается до конца месяца
      if (effStart > monthEnd) return false;
      // Задача заканчивается после начала месяца (или нет даты конца)
      const fc = calcForecast(t, engineers);
      const endDate = fc?.forecastDate || monthEnd;
      if (endDate < monthStart) return false;
      return true;
    });
    return [...active].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }, [tasks, year, month, engineers]);

  // Эффективный дедлайн для каждой задачи: свой или расчётный по цепочке
  const effectiveDls = {};
  activeTasks.forEach(t => {
    if (t.deadline) {
      effectiveDls[t.id] = t.deadline;
    } else {
      const derived = getDerivedDeadline(t, activeTasks, engineers);
      if (derived) effectiveDls[t.id] = derived;
    }
  });

  const forecasts = {};
  tasks.forEach(t => { forecasts[t.id] = calcForecast(t, engineers, effectiveDls[t.id] || null); });

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
            background: d.today ? 'rgba(29,158,117,0.06)' : 'transparent',
            borderRight: i < DAYS-1 ? `0.5px solid ${d.today ? 'rgba(29,158,117,0.25)' : 'var(--border-light)'}` : 'none',
          }}/>
        ))}
      </div>
    );
  }

  function TodayLine() {
    if (todayIdx < 0) return null;
    return <div style={{ position:'absolute', top:0, bottom:0, left:L(todayIdx), width:1.5, background:'var(--accent)', opacity:0.5, zIndex:5, pointerEvents:'none' }}/>;
  }

  function fmtDate(str) {
    if (!str) return '—';
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  }

  // Эффективная дата старта + смещение на полдня если зависимая
  function effectiveStart(task) {
    // Если дата старта задана — используем её
    // Иначе soft-start: createdDate (фиксируется при создании), меняется ежедневно до завтра если не задана
    return task.startDate || task.createdDate || todayStr();
  }

  // Рассчитываем полудень для задачи: возвращает { endOffset, startOffset }
  // endOffset: сколько вычесть из правого края полосы (0 или 0.5)
  // startOffset: сколько добавить к левому краю полосы (0 или 0.5)
  function getHalfDayOffsets(task) {
    // Смещение правого края (окончание)
    let endOffset = 0;
    if (task.id) {
      // Ищем дочерние задачи — если они стартуют в тот же день что мы заканчиваем
      const child = tasks.find(t => t.dependsOn === task.id && t.startDate === forecasts[task.id]?.forecastDate);
      if (child) {
        const fc = forecasts[task.id];
        const hoursPerDay = (fc?.capacity || 1) * HOURS_PER_DAY;
        const hoursInLastDay = hoursPerDay > 0 ? (fc?.hoursLeft || 0) % hoursPerDay : 0;
        endOffset = hoursInLastDay > 4 ? 0.5 : 0;
      }
    }

    // Смещение левого края (начало) — для дочерней задачи
    let startOffset = 0;
    if (task.dependsOn && task.startDate) {
      const parent = tasks.find(t => t.id === task.dependsOn);
      const parentFc = parent ? forecasts[parent.id] : null;
      if (parentFc?.forecastDate === task.startDate) {
        const hoursPerDay = (parentFc?.capacity || 1) * HOURS_PER_DAY;
        const hoursInLastDay = hoursPerDay > 0 ? (parentFc?.hoursLeft || 0) % hoursPerDay : 0;
        startOffset = hoursInLastDay > 4 ? 0.5 : 0;
      }
    }
    return { endOffset, startOffset };
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

  // Строим данные для стрелки зависимости при наведении
  function getDependencyArrow(hovId) {
    if (!hovId || !ganttBodyRef.current) return null;
    const allVisible = [...activeTasks, ...doneTasks];
    const task = allVisible.find(t => t.id === hovId);
    if (!task) return null;

    let parentTask, childTask;
    if (task.dependsOn) {
      parentTask = allVisible.find(t => t.id === task.dependsOn);
      childTask  = task;
    } else {
      childTask  = allVisible.find(t => t.dependsOn === task.id);
      parentTask = task;
    }
    if (!parentTask || !childTask) return null;

    const base = ganttBodyRef.current.getBoundingClientRect();
    const pEl  = document.getElementById(`bar-${parentTask.id}`);
    const cEl  = document.getElementById(`bar-${childTask.id}`);
    if (!pEl || !cEl) return null;

    const pr = pEl.getBoundingClientRect();
    const cr = cEl.getBoundingClientRect();

    // Определяем направление: дочерняя выше или ниже родителя
    const childIsBelow = cr.top >= pr.top;

    // Точка выхода: 90% ширины родителя
    const x1 = pr.left - base.left + pr.width * 0.9;
    // Выходит снизу если дочерняя ниже, сверху если дочерняя выше
    const y1 = childIsBelow
      ? pr.bottom - base.top        // нижний край родителя
      : pr.top - base.top;          // верхний край родителя

    // Точка входа: левый край дочерней, середина по высоте
    const x2 = cr.left - base.left;
    const y2 = cr.top - base.top + cr.height / 2;

    return { x1, y1, x2, y2 };
  }

  const workdaysCount = allDays.filter(d => !d.off).length;
  const depArrow = getDependencyArrow(hoveredTask);

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
        <div ref={ganttBodyRef} style={{ minWidth: hideOff ? 600 : 860, position:'relative' }}>

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
                <div style={{ display:'flex' }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)' }}>
                    {days.map((d,i) => {
                      const [,, dd] = d.str.split('-').map(Number);
                      const jsDay   = new Date(d.str.split('-')[0], d.str.split('-')[1]-1, dd).getDay();
                      const dowRu   = DOW_RU[jsDay];
                      const isToday = d.today;
                      const isOff   = d.off && !hideOff;
                      return (
                        <div key={i} style={{
                          flex:1, textAlign:'center', padding:'3px 0 2px',
                          background: isToday ? 'rgba(29,158,117,0.07)' : isOff ? 'rgba(0,0,0,0.02)' : 'transparent',
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
                          : (!hideOff && d.holiday) ? 'rgba(0,0,0,0.06)'
                          : (!hideOff && d.weekend) ? 'rgba(0,0,0,0.04)'
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
            const hasStart  = !!task.startDate;
            // Задача без даты: серая штриховка, стартует с сегодня визуально
            const effectSt  = effectiveStart(task);
            const barColor  = hasStart ? (statusColor(fc?.deadlineStatus) || '#A8A6A0') : '#A8A6A0';
            const barBg     = hasStart ? barColor
              : 'repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 4px,#C8C7C3 4px,#C8C7C3 8px)';
            // Порядок из task.assignedEngineers — новые добавляются в конец
            const assignedEngs = (task.assignedEngineers||[]).map(id=>engineers.find(e=>e.id===id)).filter(Boolean);

            const { endOffset, startOffset } = getHalfDayOffsets(task);
            const barStartIdx = dateToIdxSafe(effectSt, 'next') ?? 0;
            const barStart    = barStartIdx + startOffset;
            const rawFcIdx    = fc?.forecastDate ? dateToIdxSafe(fc.forecastDate, 'prev') : null;
            const barEndIdx   = rawFcIdx !== null ? Math.min(DAYS, rawFcIdx + 1) : DAYS;
            const barEnd      = barEndIdx - endOffset;
            const dlIdx    = task.deadline ? dateToIdxSafe(task.deadline, 'prev') : null;
            // Расчётный дедлайн по цепочке (для задач без собственного дедлайна)
            const derivedDl    = !task.deadline ? (effectiveDls[task.id] || null) : null;
            const derivedDlIdx = derivedDl ? dateToIdxSafe(derivedDl, 'prev') : null;

            const isDepHovered = hoveredTask && (hoveredTask === task.id || hoveredTask === task.dependsOn || activeTasks.find(t => t.dependsOn === task.id && t.id === hoveredTask));
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
                    <TodayLine/>
                    {barStart < barEnd && (
                      <div
                        id={`bar-${task.id}`}
                        onClick={() => navigate('task', task.id)}
                        onMouseEnter={() => setHoveredTask(task.id)}
                        onMouseLeave={() => setHoveredTask(null)}
                        style={{
                          position:'absolute', left:L(barStart), width:W(barStart,barEnd),
                          top:7, height:30, background:barBg, borderRadius:6,
                          display:'flex', alignItems:'center', padding:'0 10px', gap:6,
                          cursor:'pointer', zIndex:3, overflow:'hidden',
                          boxShadow:'0 1px 4px rgba(0,0,0,0.18)',
                          opacity: hasStart ? 1 : 0.75,
                        }}
                      >
                        <div style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                          {assignedEngs.map((e,i) => {
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
                                marginLeft: i>0 ? -5 : 0,
                                flexShrink:0,
                              }}>{initials}</span>
                            );
                          }).slice(0,6)}
                          {assignedEngs.length > 6 && <span style={{ fontSize:10, color:'rgba(255,255,255,0.85)', marginLeft:4, flexShrink:0 }}>+{assignedEngs.length-6}</span>}
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>{fc?.progressPct||0}%</span>
                      </div>
                    )}
                    {/* Линия жёсткого дедлайна — только при наведении */}
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
                    {/* Линия расчётного дедлайна по цепочке — пунктир, только при наведении */}
                    {hoveredTask === task.id && derivedDlIdx !== null && derivedDlIdx >= 0 && derivedDlIdx < DAYS && (
                      <div style={{
                        position:'absolute', top:0, bottom:0,
                        left:`calc(${Ldl(derivedDlIdx)} - 1px)`,
                        width:2,
                        background:'repeating-linear-gradient(to bottom, var(--amber) 0px, var(--amber) 5px, transparent 5px, transparent 10px)',
                        zIndex:6, pointerEvents:'none',
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
                  const isSwitched = eng.regularTask !== task.regularTask;
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
                        <TodayLine/>
                        {barStart < barEnd && (
                          <div
                            onClick={e => { e.stopPropagation(); navigate('engineer', eng.id); }}
                            onMouseEnter={e => show(e, eng.name, [
                              isVac ? '✈️ В отпуске' : isSick ? '🤒 На больничном' : '✅ На задаче',
                              eng.role === 'responsible' ? 'Ответственный' : eng.role === 'intern' ? 'Стажёр (×0.5)' : '',
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
            const engagedPerDay = days.map(day => {
              const ids = new Set();
              activeTasks.forEach(task => {
                const fc = forecasts[task.id];
                const st = task.startDate || day.str;
                const en = fc?.forecastDate || day.str;
                if (st <= day.str && en >= day.str) {
                  task.assignedEngineers?.forEach(id => ids.add(id));
                }
              });
              return nonLeadEngs.filter(e => ids.has(e.id) && e.status === 'active').length;
            });
            const freePerDay = days.map((day, i) => {
              const ids = new Set();
              activeTasks.forEach(task => {
                const fc = forecasts[task.id];
                const st = task.startDate || day.str;
                const en = fc?.forecastDate || day.str;
                if (st <= day.str && en >= day.str) {
                  task.assignedEngineers?.forEach(id => ids.add(id));
                }
              });
              return nonLeadEngs.filter(e => !ids.has(e.id) && e.status === 'active');
            });

            return (
              <>
                <div style={{ display:'flex', alignItems:'center', marginTop:12, borderTop:'0.5px solid var(--border-light)', paddingTop:6 }}>
                  <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Задействовано</div>
                  <div style={{ flex:1, display:'flex' }}>
                    {days.map((d,i) => {
                      const cnt = engagedPerDay[i];
                      const total = nonLeadEngs.filter(e => e.status === 'active').length;
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
                          onMouseEnter={e => cnt > 0 && show(e, `Свободны ${d.day} мая`, freeEngs.map(e2 => `${e2.name} (${e2.regularTask||'—'})`).slice(0,5))}
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

                // Зависимость для завершённых
                const isDepHov = hoveredTask && (hoveredTask === task.id ||
                  hoveredTask === task.dependsOn ||
                  doneTasks.concat(activeTasks).find(t => t.dependsOn === task.id && t.id === hoveredTask));

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
                      <TodayLine/>
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

          {/* Стрелка зависимости */}
          {depArrow && (
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
              <path
                d={`M ${depArrow.x1.toFixed(1)} ${depArrow.y1.toFixed(1)}
                    L ${depArrow.x1.toFixed(1)} ${depArrow.y2.toFixed(1)}
                    L ${depArrow.x2.toFixed(1)} ${depArrow.y2.toFixed(1)}`}
                fill="none"
                stroke="#F0A030"
                strokeWidth="1.2"
                strokeOpacity="0.85"
                strokeLinejoin="round"
                markerEnd="url(#dep-arrow)"
              />
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
          ['#C0BEFC','Стажёр (×0.5)'],
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
