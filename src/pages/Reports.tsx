import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../ui-types';
import type { Engineer, ISODate, Task } from '../domain/types';
import { calcForecast, statusColor } from '../utils/forecast';
import { getMonthDays, todayStr, type MonthDay } from '../utils/dates';
import { isAvailableOn, isWorkingRole } from '../domain/availability';
import {
  computeInheritedTeam, computeDynamicStarts, segmentByWeek, arrowAnchorOffset,
} from '../domain/gantt';
import { PageTopbar, BtnPrimary } from '../components/UI';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const LABEL_W = 200;
const DOW_RU  = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function pluralEng(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return `${n} инженеров`;
  if (m10 === 1) return `${n} инженер`;
  if (m10 >= 2 && m10 <= 4) return `${n} инженера`;
  return `${n} инженеров`;
}

// ─── Gantt-рендер для отчёта (read-only, workdays-only, active+done) ──────────

interface ReportGanttViewProps {
  tasks:     Task[];
  engineers: Engineer[];
  year:      number;
  month:     number;
}

function ReportGanttView({ tasks, engineers, year, month }: ReportGanttViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // ── Дни: только рабочие (как Gantt с hideOff=true) ─────────────────────────
  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days    = useMemo(() => allDays.filter(d => !d.off), [allDays]);
  const DAYS    = days.length;

  function L(i: number)            { return `${(i / DAYS * 100).toFixed(4)}%`; }
  function W(s: number, e: number) { return `${((e - s) / DAYS * 100).toFixed(4)}%`; }

  // Перевести дату в индекс среди ВИДИМЫХ дней (workdays)
  function dateToIdx(iso: ISODate | null | undefined, fallback: 'next' | 'prev' = 'next'): number | null {
    if (!iso) return null;
    const [dy, dm, dd] = iso.split('-').map(Number);
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

  // ── Вычисления (те же что в Gantt) ──────────────────────────────────────────
  const allActiveTasks = useMemo(() =>
    tasks.filter(t => t.status === 'active')
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
  [tasks]);

  const inheritedEngIds = useMemo(() => computeInheritedTeam(allActiveTasks), [allActiveTasks]);

  const dynamicStarts = useMemo(() =>
    computeDynamicStarts(allActiveTasks, engineers, inheritedEngIds),
  [allActiveTasks, engineers, inheritedEngIds]);

  const noEstFallbackEnd = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  }, [year, month]);

  const forecasts = useMemo(() => {
    const r: Record<string, ReturnType<typeof calcForecast>> = {};
    allActiveTasks.forEach(t => {
      const dynStart  = dynamicStarts[t.id];
      const engIds    = inheritedEngIds[t.id] || t.assignedEngineers || [];
      const taskForFc = t.dependsOn ? { ...t, assignedEngineers: engIds, startDate: null } : { ...t, assignedEngineers: engIds };
      const startOv   = t.dependsOn && dynStart ? dynStart : null;
      r[t.id] = calcForecast(taskForFc, engineers, null, startOv);
    });
    return r;
  }, [allActiveTasks, engineers, inheritedEngIds, dynamicStarts]);

  // Активные задачи, попадающие в текущий месяц
  const activeTasks = useMemo(() => {
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return allActiveTasks.filter(t => {
      const effStart = dynamicStarts[t.id] || todayStr();
      if (effStart > monthEnd) return false;
      const fc    = forecasts[t.id];
      const noEst = !(t.estimateHours || 0);
      const endDate = fc?.forecastDate || t.deadline || (noEst ? noEstFallbackEnd : monthEnd);
      return endDate >= monthStart;
    });
  }, [allActiveTasks, dynamicStarts, forecasts, year, month, noEstFallbackEnd]);

  // Завершённые задачи за текущий месяц
  const doneTasks = useMemo(() => {
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay    = new Date(year, month+1, 0).getDate();
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return tasks.filter(t => {
      if (t.status !== 'done') return false;
      const start = t.startDate || monthStart;
      const end   = t.completedDate || monthEnd;
      return start <= monthEnd && end >= monthStart;
    }).sort((a, b) => (a.completedDate||'').localeCompare(b.completedDate||''));
  }, [tasks, year, month]);

  // ── Effective start (как в Gantt) ───────────────────────────────────────────
  function effectiveStart(task: Task): ISODate {
    if (!task.dependsOn) return task.startDate || todayStr();
    if (dynamicStarts[task.id]) return dynamicStarts[task.id]!;
    const parent = allActiveTasks.find(t => t.id === task.dependsOn);
    return (parent && dynamicStarts[parent.id]) || todayStr();
  }

  // ── Стрелки зависимостей (всегда, не только на hover) ─────────────────────
  interface Arrow { key: string; x1: number; y1: number; x2: number; y2: number }
  const [arrows, setArrows]       = useState<Arrow[]>([]);
  const [bodyHeight, setBodyHeight] = useState(0);

  const allVisibleTasks = useMemo(
    () => [...activeTasks, ...doneTasks],
    [activeTasks, doneTasks],
  );

  useLayoutEffect(() => {
    if (!bodyRef.current) return;
    setBodyHeight(bodyRef.current.scrollHeight);
    const base = bodyRef.current.getBoundingClientRect();
    const newArrows: Arrow[] = [];

    allVisibleTasks.forEach(child => {
      if (!child.dependsOn) return;
      const pEl = document.getElementById(`rbar-${child.dependsOn}`);
      const cEl = document.getElementById(`rbar-${child.id}`);
      if (!pEl || !cEl) return;
      const pr = pEl.getBoundingClientRect();
      const cr = cEl.getBoundingClientRect();
      const childIsBelow = cr.top >= pr.top;
      newArrows.push({
        key: `${child.dependsOn}-${child.id}`,
        x1: pr.left - base.left + arrowAnchorOffset(pr.width),
        y1: childIsBelow ? pr.bottom - base.top : pr.top - base.top,
        x2: cr.left - base.left,
        y2: cr.top - base.top + cr.height / 2,
      });
    });

    setArrows(newArrows);
  }, [allVisibleTasks, days]);

  // ── Фон-колонки (выходные — серые) ─────────────────────────────────────────
  function BgCols() {
    return (
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0 }}>
        {days.map((d, i) => d.off ? (
          <div key={i} style={{ position:'absolute', left:`${(i/DAYS*100).toFixed(4)}%`, width:`${(1/DAYS*100).toFixed(4)}%`, top:0, bottom:0, background:'var(--bg-secondary)' }}/>
        ) : null)}
      </div>
    );
  }

  // ── Занятость инженеров по дням ────────────────────────────────────────────
  const nonLeadEngs = engineers.filter(isWorkingRole);
  const engagedPerDay: number[] = [];
  const freePerDay:    number[] = [];
  const totalPerDay:   number[] = [];

  days.forEach(day => {
    const availForDay = nonLeadEngs.filter(e => isAvailableOn(e, day.str));
    const ids = new Set<string>();

    // Активные задачи
    activeTasks.forEach(task => {
      const fc    = forecasts[task.id];
      const noEst = !(task.estimateHours || 0);
      const effStart = task.dependsOn
        ? (dynamicStarts[task.id] ?? null)
        : (task.startDate ?? todayStr());
      if (!effStart || effStart > day.str) return;
      const endDate = fc?.forecastDate || task.deadline || (noEst ? noEstFallbackEnd : null);
      if (!endDate || endDate < day.str) return;
      (inheritedEngIds[task.id] || task.assignedEngineers || []).forEach(id => ids.add(id));
    });

    // Завершённые задачи (за тот день были в работе)
    doneTasks.forEach(task => {
      const start = task.startDate;
      const end   = task.completedDate || task.deadline;
      if (!start || start > day.str) return;
      if (end && end < day.str) return;
      (task.assignedEngineers || []).forEach(id => ids.add(id));
    });

    const engaged = availForDay.filter(e => ids.has(e.id)).length;
    const free    = availForDay.filter(e => !ids.has(e.id)).length;
    engagedPerDay.push(engaged);
    freePerDay.push(free);
    totalPerDay.push(availForDay.length);
  });

  // ── Рендер ─────────────────────────────────────────────────────────────────
  const segments = segmentByWeek(days);

  return (
    <div ref={bodyRef} style={{ position:'relative', minWidth:600 }}>

      {/* Шапка: недели + числа (точно как в Gantt) */}
      <div style={{ position:'sticky', top:0, zIndex:10 }}>
        {/* Строка недель */}
        <div style={{ display:'flex' }}>
          <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
          <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)' }}>
            {segments.map((seg, si) => (
              <div key={si} style={{
                flex:seg.count, textAlign:'center', fontSize:11, padding:'3px 0',
                color:'var(--text-tertiary)', fontWeight:500,
                borderRight: si<segments.length-1 ? '1px solid var(--border-mid)' : 'none',
                background:'var(--bg-secondary)', letterSpacing:'0.02em',
              }}>
                нед. {seg.week}
              </div>
            ))}
          </div>
        </div>
        {/* Строка чисел */}
        <div style={{ display:'flex' }}>
          <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
          <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)', background:'var(--bg-primary)' }}>
            {days.map((d, i) => {
              const [yy, mm, dd] = d.str.split('-').map(Number);
              const dow = DOW_RU[new Date(yy, mm-1, dd).getDay()];
              return (
                <div key={i} style={{
                  flex:1, textAlign:'center', padding:'3px 0 2px',
                  background: d.today ? 'rgba(29,158,117,0.07)' : 'transparent',
                  borderRight: i<DAYS-1 ? `0.5px solid ${d.today?'rgba(29,158,117,0.25)':'var(--border-light)'}` : 'none',
                }}>
                  <div style={{ fontSize:12, fontWeight:d.today?700:400, color:d.today?'var(--accent)':'var(--text-secondary)', lineHeight:1.3 }}>{d.day}</div>
                  <div style={{ fontSize:9, color:d.today?'var(--accent)':'var(--text-tertiary)', lineHeight:1.2 }}>{dow}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginBottom:10 }}/>
      </div>

      {/* ── Активные задачи ── */}
      {activeTasks.map(task => {
        const fc            = forecasts[task.id];
        const assignedEngs  = (inheritedEngIds[task.id] || task.assignedEngineers || [])
          .map(id => engineers.find(e => e.id === id)).filter((e): e is Engineer => !!e);
        const hasEngineers  = assignedEngs.length > 0;
        const hasEstimate   = (task.estimateHours || 0) > 0;
        const isWaitingChild = !!task.dependsOn && allActiveTasks.some(t => t.id === task.dependsOn);
        const effectSt      = effectiveStart(task);

        let barBg: string;
        if (isWaitingChild) {
          barBg = 'repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 4px,#C8C7C3 4px,#C8C7C3 8px)';
        } else if (!hasEngineers) {
          barBg = '#A8A6A0';
        } else {
          const effectiveStatus = !hasEstimate ? 'ok' : fc?.deadlineStatus;
          barBg = statusColor(effectiveStatus) || '#A8A6A0';
        }

        const barStart = dateToIdx(effectSt, 'next') ?? 0;
        const rawFcIdx = fc?.forecastDate ? dateToIdx(fc.forecastDate, 'prev') : null;
        const dlCapIdx = task.deadline ? dateToIdx(task.deadline, 'prev') : null;
        const monthEnd = noEstFallbackEnd;
        const fcBeyond = fc?.forecastDate && fc.forecastDate > monthEnd;

        let barEnd: number;
        if (!hasEstimate) {
          const noEstEnd = task.deadline || noEstFallbackEnd;
          barEnd = noEstEnd > monthEnd ? DAYS
            : (dateToIdx(noEstEnd, 'prev') !== null ? Math.min(DAYS, dateToIdx(noEstEnd, 'prev')! + 1) : DAYS);
        } else {
          barEnd = rawFcIdx !== null ? Math.min(DAYS, rawFcIdx + 1)
            : fcBeyond ? DAYS
            : dlCapIdx !== null ? Math.min(DAYS, dlCapIdx + 1)
            : barStart + 2;
        }

        const colSpan   = barEnd - barStart;
        const maxAv     = colSpan <= 1 ? 0 : colSpan === 2 ? 1 : colSpan === 3 ? 2 : colSpan <= 5 ? 4 : 6;

        return (
          <div key={task.id} style={{ display:'flex', alignItems:'center', marginBottom:9 }}>
            <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14 }}>
              <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {task.name}
              </div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>
                {assignedEngs.length} инж.{task.direction ? ` · ${task.direction}` : ''}
                {task.dependsOn && <span style={{ marginLeft:6 }}>↳ зависит</span>}
              </div>
            </div>
            <div style={{ flex:1, position:'relative', height:44 }}>
              <BgCols/>
              {barStart < barEnd && (
                <div
                  id={`rbar-${task.id}`}
                  style={{
                    position:'absolute', left:L(barStart), width:W(barStart, barEnd),
                    top:7, height:30, background:barBg, borderRadius:6,
                    display:'flex', alignItems:'center',
                    padding: colSpan <= 2 ? '0 4px' : '0 8px',
                    gap: colSpan <= 2 ? 3 : 5,
                    zIndex:3, overflow:'hidden',
                    boxShadow:'0 1px 4px rgba(0,0,0,0.18)',
                    opacity: isWaitingChild ? 0.75 : 1,
                  }}
                >
                  <span style={{ fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap', flexShrink:0 }}>
                    {fc?.progressPct||0}%
                  </span>
                  {assignedEngs.length > 0 && colSpan > 1 && (
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.88)', whiteSpace:'nowrap', flexShrink:0 }}>
                      {pluralEng(assignedEngs.length)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Завершённые задачи (без разделителя, вместе с активными) ── */}
      {doneTasks.length > 0 && (
        <>
          {doneTasks.map(task => {
            const assignedEngs = engineers.filter(e => (task.assignedEngineers||[]).includes(e.id));
            const startIdx = task.startDate ? dateToIdx(task.startDate, 'next') : 0;
            const endIdx   = task.completedDate ? dateToIdx(task.completedDate, 'prev') : (DAYS - 1);
            const barStart = startIdx ?? 0;
            const barEnd   = endIdx !== null ? Math.min(DAYS, endIdx + 1) : DAYS;

            return (
              <div key={task.id} style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14 }}>
                  <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-tertiary)' }}>
                    {task.name}
                    {task.dependsOn && <span style={{ marginLeft:6, fontSize:11 }}>↳</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>
                    ✓ {task.completedDate
                      ? new Date(task.completedDate).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})
                      : '—'}
                    {task.direction ? ` · ${task.direction}` : ''}
                  </div>
                </div>
                <div style={{ flex:1, position:'relative', height:36 }}>
                  <BgCols/>
                  {barStart < barEnd && (
                    <div
                      id={`rbar-${task.id}`}
                      style={{
                        position:'absolute', left:L(barStart), width:W(barStart, barEnd),
                        top:5, height:26,
                        // CSS-переменные вместо хардкода — работает в тёмной и светлой теме
                        backgroundColor: 'var(--bg-tertiary)',
                        backgroundImage: 'repeating-linear-gradient(45deg, var(--border-mid) 0, var(--border-mid) 3px, transparent 3px, transparent 9px)',
                        borderRadius:5, display:'flex', alignItems:'center', padding:'0 8px', gap:6,
                        zIndex:3, overflow:'hidden',
                        border: '1px solid var(--border-mid)',
                      }}
                    >
                      {assignedEngs.length > 0 && (
                        <span style={{ fontSize:11, color:'var(--text-secondary)', whiteSpace:'nowrap', flexShrink:0, fontWeight:500 }}>
                          {pluralEng(assignedEngs.length)}
                        </span>
                      )}
                      <span style={{ fontSize:11, fontWeight:500, color:'var(--text-tertiary)', whiteSpace:'nowrap' }}>
                        завершена
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Занятость инженеров ── */}
      <div style={{ display:'flex', alignItems:'center', marginTop:12, borderTop:'0.5px solid var(--border-light)', paddingTop:6 }}>
        <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Задействовано</div>
        <div style={{ flex:1, display:'flex' }}>
          {days.map((d, i) => {
            const cnt   = engagedPerDay[i];
            const total = totalPerDay[i];
            const p     = total > 0 ? cnt / total : 0;
            let bg = 'var(--bg-secondary)', col = 'var(--text-tertiary)';
            if (total > 0 && cnt > 0) {
              if (p > 0.9)       { bg = 'var(--red-bg)';     col = 'var(--red)'; }
              else if (p >= 0.75){ bg = 'var(--amber-bg)';   col = 'var(--amber)'; }
              else               { bg = 'var(--success-bg)'; col = 'var(--success)'; }
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
          {days.map((d, i) => {
            const cnt   = freePerDay[i];
            const total = totalPerDay[i];
            const p     = total > 0 ? cnt / total : 0;
            let bg = 'var(--bg-secondary)', col = 'var(--text-tertiary)';
            if (total > 0 && cnt > 0) {
              if (p < 0.1)       { bg = 'var(--success-bg)'; col = 'var(--success)'; }
              else if (p <= 0.25){ bg = 'var(--amber-bg)';   col = 'var(--amber)'; }
              else               { bg = 'var(--red-bg)';     col = 'var(--red)'; }
            }
            return (
              <div key={i} style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none' }}>
                {cnt > 0 ? cnt : '—'}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SVG-стрелки зависимостей ── */}
      {arrows.length > 0 && (
        <svg style={{ position:'absolute', top:0, left:0, width:'100%', height: bodyHeight || '100%', pointerEvents:'none', overflow:'visible', zIndex:50 }}>
          {arrows.map(a => {
            const x1 = +a.x1.toFixed(1), y1 = +a.y1.toFixed(1);
            const x2 = +a.x2.toFixed(1), y2 = +a.y2.toFixed(1);
            return (
              <g key={a.key}>
                <path
                  d={`M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`}
                  fill="none" stroke="#F0A030" strokeWidth="1.2"
                  strokeOpacity="0.85" strokeLinejoin="round"
                />
                {/* Инлайн-наконечник — html2canvas не поддерживает SVG marker */}
                <polygon
                  points={`${x2-7},${y2-3.5} ${x2+0.5},${y2} ${x2-7},${y2+3.5}`}
                  fill="#F0A030" opacity="0.9"
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─── Страница Отчёты ──────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  background:'none', border:'none', cursor:'pointer',
  fontSize:20, color:'var(--text-secondary)', lineHeight:1, padding:'4px 10px', borderRadius:6,
};

export default function Reports({ data }: PageProps) {
  const today = new Date();
  const [year, setYear]       = useState(today.getFullYear());
  const [month, setMonth]     = useState(today.getMonth());
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }

  const activeCnt = data.tasks.filter(t => t.status === 'active').length;
  const doneCnt   = useMemo(() => {
    const ms = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const ld = new Date(year, month+1, 0).getDate();
    const me = `${year}-${String(month+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
    return data.tasks.filter(t => t.status==='done' && (t.completedDate||me)>=ms && (t.startDate||ms)<=me).length;
  }, [data.tasks, year, month]);
  const engCnt = data.engineers.filter(e => e.status === 'active').length;

  async function handleExport() {
    const el = printRef.current;
    if (!el) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF }   = await import('jspdf');
      const canvas  = await html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf     = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
      const pageW   = pdf.internal.pageSize.getWidth();
      const pageH   = pdf.internal.pageSize.getHeight();
      const imgW    = pageW, imgH = canvas.height * imgW / canvas.width;
      let pos=0, left=imgH;
      pdf.addImage(imgData,'PNG',0,pos,imgW,imgH);
      left -= pageH;
      while (left>0){ pos-=pageH; pdf.addPage(); pdf.addImage(imgData,'PNG',0,pos,imgW,imgH); left-=pageH; }
      pdf.save(`report-${year}-${String(month+1).padStart(2,'0')}.pdf`);
    } catch(e){ console.error(e); }
    finally{ setExporting(false); }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <PageTopbar title="Отчёты">
        <div style={{ display:'flex', alignItems:'center', gap:2 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <div style={{ fontSize:15, fontWeight:600, minWidth:168, textAlign:'center', color:'var(--text-primary)' }}>
            {MONTHS[month]} {year}
          </div>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>
        <BtnPrimary onClick={handleExport} style={{ opacity:exporting?0.65:1, pointerEvents:exporting?'none':undefined }}>
          {exporting ? 'Генерация…' : '↓ Скачать PDF'}
        </BtnPrimary>
      </PageTopbar>

      <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
        {/* Статистика */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'В работе',           value: activeCnt },
            { label:'Завершено за месяц', value: doneCnt },
            { label:'Активных инженеров', value: engCnt },
            { label:'Всего инженеров',    value: data.engineers.length },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, padding:'14px 18px' }}>
              <div style={{ fontSize:24, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{s.value}</div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Диаграмма — printRef без overflow:hidden, иначе SVG стрелки обрезаются */}
        <div ref={printRef} style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px' }}>
          {/* Заголовок отчёта */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)' }}>
              {data.name} — {MONTHS[month]} {year}
            </div>
            <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3 }}>
              В работе: {activeCnt} · Завершено: {doneCnt} · Инженеров: {data.engineers.filter(e=>e.status==='active').length}
            </div>
          </div>
          <ReportGanttView
            tasks={data.tasks}
            engineers={data.engineers}
            year={year}
            month={month}
          />
        </div>
      </div>
    </div>
  );
}
