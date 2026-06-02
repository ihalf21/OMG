import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../ui-types';
import type { Engineer, ISODate, Task } from '../domain/types';
import { calcForecast, fmtHours, statusColor, statusLabel } from '../utils/forecast';
import { getMonthDays, todayStr } from '../utils/dates';
import { isAvailableOn, isWorkingRole } from '../domain/availability';
import {
  computeInheritedTeam, computeDynamicStarts, segmentByWeek, arrowAnchorOffset,
} from '../domain/gantt';
import { PageTopbar, BtnPrimary } from '../components/UI';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const LABEL_W = 200;
const DOW_RU  = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

const ROLE_LABEL: Record<string, string> = {
  lead: 'Лид', responsible: 'Ответственный', engineer: 'Инженер', intern: 'Стажёр',
};

const ENG_STATUS_LABEL: Record<string, string> = {
  active: 'Активен', vacation: 'В отпуске', sick: 'На больничном', dayoff: 'Выходной',
};

const DIR_PALETTE = [
  '#4C91F0','#52B870','#F0A050','#D85F5F','#9B70E0',
  '#50C8B0','#E07898','#80A8D0','#D8C060','#68C868',
];

function dirColor(dir: string | null | undefined): string {
  if (!dir) return '#A8A6A0';
  let h = 0;
  for (let i = 0; i < dir.length; i++) h = (h * 31 + dir.charCodeAt(i)) & 0xffff;
  return DIR_PALETTE[h % DIR_PALETTE.length];
}

function pluralEng(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return `${n} инженеров`;
  if (m10 === 1) return `${n} инженер`;
  if (m10 >= 2 && m10 <= 4) return `${n} инженера`;
  return `${n} инженеров`;
}

function fmtDate(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function dateDelta(completed: ISODate, deadline: ISODate): number {
  const c  = new Date(completed + 'T00:00:00').getTime();
  const dl = new Date(deadline  + 'T00:00:00').getTime();
  return Math.round((dl - c) / 86400000);
}

// ─── SVG Donut Chart ─────────────────────────────────────────────────────────

interface DonutSeg { value: number; color: string; }

function DonutChart({ segments, size = 100 }: { segments: DonutSeg[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = size / 2, cy = size / 2;
  const R = size * 0.38, r = size * 0.23;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

  if (total === 0) return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="#E8E6E0"/>
      <circle cx={cx} cy={cy} r={r} fill="white"/>
    </svg>
  );

  const nonZero = segments.filter(s => s.value > 0);

  // Single segment: use circles instead of arc (SVG can't draw 360° arc)
  if (nonZero.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill={nonZero[0].color}/>
        <circle cx={cx} cy={cy} r={r} fill="white"/>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.16} fontWeight="700" fill="#1a1917">{total}</text>
      </svg>
    );
  }

  let angle = 0;
  const paths: React.ReactElement[] = [];
  segments.forEach((seg, i) => {
    if (seg.value === 0) return;
    const sweep = (seg.value / total) * 360;
    const a1 = angle, a2 = angle + sweep;
    const large = sweep > 180 ? 1 : 0;
    const x1 = cx + R * Math.cos(toRad(a1)), y1 = cy + R * Math.sin(toRad(a1));
    const x2 = cx + R * Math.cos(toRad(a2)), y2 = cy + R * Math.sin(toRad(a2));
    const x3 = cx + r * Math.cos(toRad(a2)), y3 = cy + r * Math.sin(toRad(a2));
    const x4 = cx + r * Math.cos(toRad(a1)), y4 = cy + r * Math.sin(toRad(a1));
    paths.push(
      <path key={i} fill={seg.color}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`}
      />
    );
    angle += sweep;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <circle cx={cx} cy={cy} r={r} fill="white"/>
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.16} fontWeight="700" fill="#1a1917">{total}</text>
    </svg>
  );
}

// ─── ReportGanttView (read-only, unchanged) ───────────────────────────────────

interface ReportGanttViewProps {
  tasks: Task[]; engineers: Engineer[]; year: number; month: number;
}

function ReportGanttView({ tasks, engineers, year, month }: ReportGanttViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days    = useMemo(() => allDays.filter(d => !d.off), [allDays]);
  const DAYS    = days.length;

  function L(i: number)            { return `${(i / DAYS * 100).toFixed(4)}%`; }
  function W(s: number, e: number) { return `${((e - s) / DAYS * 100).toFixed(4)}%`; }

  function dateToIdx(iso: ISODate | null | undefined, fallback: 'next' | 'prev' = 'next'): number | null {
    if (!iso) return null;
    const [dy, dm, dd] = iso.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    let idx = days.findIndex(d => d.day === dd);
    if (idx >= 0) return idx;
    if (fallback === 'next') { idx = days.findIndex(d => d.day > dd); return idx >= 0 ? idx : null; }
    const prev = [...days].reverse().find(d => d.day < dd);
    return prev ? days.indexOf(prev) : null;
  }

  const allActiveTasks = useMemo(() =>
    tasks.filter(t => t.status === 'active').sort((a,b) => (a.sortOrder??999)-(b.sortOrder??999)),
  [tasks]);

  const inheritedEngIds = useMemo(() => computeInheritedTeam(allActiveTasks), [allActiveTasks]);
  const dynamicStarts   = useMemo(() => computeDynamicStarts(allActiveTasks, engineers, inheritedEngIds), [allActiveTasks, engineers, inheritedEngIds]);

  const noEstFallbackEnd = useMemo(() => {
    const ld = new Date(year, month+1, 0).getDate();
    return `${year}-${String(month+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
  }, [year, month]);

  const forecasts = useMemo(() => {
    const r: Record<string, ReturnType<typeof calcForecast>> = {};
    allActiveTasks.forEach(t => {
      const dynStart = dynamicStarts[t.id];
      const engIds   = inheritedEngIds[t.id] || t.assignedEngineers || [];
      const tfc = t.dependsOn ? { ...t, assignedEngineers: engIds, startDate: null } : { ...t, assignedEngineers: engIds };
      r[t.id] = calcForecast(tfc, engineers, null, t.dependsOn && dynStart ? dynStart : null);
    });
    return r;
  }, [allActiveTasks, engineers, inheritedEngIds, dynamicStarts]);

  const activeTasks = useMemo(() => {
    const ms = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const ld = new Date(year,month+1,0).getDate();
    const me = `${year}-${String(month+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
    return allActiveTasks.filter(t => {
      const effStart = dynamicStarts[t.id] || todayStr();
      if (effStart > me) return false;
      const fc = forecasts[t.id]; const noEst = !(t.estimateHours||0);
      const endDate = fc?.forecastDate || t.deadline || (noEst ? noEstFallbackEnd : me);
      return endDate >= ms;
    });
  }, [allActiveTasks, dynamicStarts, forecasts, year, month, noEstFallbackEnd]);

  const doneTasks = useMemo(() => {
    const ms = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const ld = new Date(year,month+1,0).getDate();
    const me = `${year}-${String(month+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
    return tasks.filter(t => {
      if (t.status !== 'done') return false;
      return (t.startDate||ms) <= me && (t.completedDate||me) >= ms;
    }).sort((a,b) => (a.completedDate||'').localeCompare(b.completedDate||''));
  }, [tasks, year, month]);

  function effectiveStart(task: Task): ISODate {
    if (!task.dependsOn) return task.startDate || todayStr();
    if (dynamicStarts[task.id]) return dynamicStarts[task.id]!;
    const parent = allActiveTasks.find(t => t.id === task.dependsOn);
    return (parent && dynamicStarts[parent.id]) || todayStr();
  }

  interface Arrow { key: string; x1:number; y1:number; x2:number; y2:number }
  const [arrows, setArrows]         = useState<Arrow[]>([]);
  const [bodyHeight, setBodyHeight] = useState(0);
  const allVisibleTasks = useMemo(() => [...activeTasks,...doneTasks],[activeTasks,doneTasks]);

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
      const pr = pEl.getBoundingClientRect(), cr = cEl.getBoundingClientRect();
      const childIsBelow = cr.top >= pr.top;
      newArrows.push({ key:`${child.dependsOn}-${child.id}`,
        x1: pr.left-base.left+arrowAnchorOffset(pr.width), y1: childIsBelow?pr.bottom-base.top:pr.top-base.top,
        x2: cr.left-base.left, y2: cr.top-base.top+cr.height/2 });
    });
    setArrows(newArrows);
  }, [allVisibleTasks, days]);

  function BgCols() {
    return (
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0 }}>
        {days.map((d,i) => d.off ? <div key={i} style={{ position:'absolute', left:`${(i/DAYS*100).toFixed(4)}%`, width:`${(1/DAYS*100).toFixed(4)}%`, top:0, bottom:0, background:'var(--bg-secondary)' }}/> : null)}
      </div>
    );
  }

  const nonLeadEngs = engineers.filter(isWorkingRole);
  const engagedPerDay: number[] = [], freePerDay: number[] = [], totalPerDay: number[] = [];
  days.forEach(day => {
    const avail = nonLeadEngs.filter(e => isAvailableOn(e, day.str));
    const ids = new Set<string>();
    activeTasks.forEach(task => {
      const fc = forecasts[task.id]; const noEst = !(task.estimateHours||0);
      const effStart = task.dependsOn?(dynamicStarts[task.id]??null):(task.startDate??todayStr());
      if (!effStart||effStart>day.str) return;
      const endDate = fc?.forecastDate||task.deadline||(noEst?noEstFallbackEnd:null);
      if (!endDate||endDate<day.str) return;
      (inheritedEngIds[task.id]||task.assignedEngineers||[]).forEach(id=>ids.add(id));
    });
    doneTasks.forEach(task => {
      const start=task.startDate, end=task.completedDate||task.deadline;
      if (!start||start>day.str) return;
      if (end&&end<day.str) return;
      (task.assignedEngineers||[]).forEach(id=>ids.add(id));
    });
    engagedPerDay.push(avail.filter(e=>ids.has(e.id)).length);
    freePerDay.push(avail.filter(e=>!ids.has(e.id)).length);
    totalPerDay.push(avail.length);
  });

  const segments = segmentByWeek(days);

  return (
    <div ref={bodyRef} style={{ position:'relative', minWidth:600 }}>
      <div style={{ position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex' }}>
          <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
          <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)' }}>
            {segments.map((seg,si) => (
              <div key={si} style={{ flex:seg.count, textAlign:'center', fontSize:11, padding:'3px 0', color:'var(--text-tertiary)', fontWeight:500, borderRight:si<segments.length-1?'1px solid var(--border-mid)':'none', background:'var(--bg-secondary)', letterSpacing:'0.02em' }}>нед. {seg.week}</div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex' }}>
          <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0 }}/>
          <div style={{ flex:1, display:'flex', borderBottom:'0.5px solid var(--border-light)', background:'var(--bg-primary)' }}>
            {days.map((d,i) => {
              const [yy,mm,dd]=d.str.split('-').map(Number), dow=DOW_RU[new Date(yy,mm-1,dd).getDay()];
              return (
                <div key={i} style={{ flex:1, textAlign:'center', padding:'3px 0 2px', background:d.today?'rgba(29,158,117,0.07)':'transparent', borderRight:i<DAYS-1?`0.5px solid ${d.today?'rgba(29,158,117,0.25)':'var(--border-light)'}`:'none' }}>
                  <div style={{ fontSize:12, fontWeight:d.today?700:400, color:d.today?'var(--accent)':'var(--text-secondary)', lineHeight:1.3 }}>{d.day}</div>
                  <div style={{ fontSize:9, color:d.today?'var(--accent)':'var(--text-tertiary)', lineHeight:1.2 }}>{dow}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginBottom:10 }}/>
      </div>

      {activeTasks.map(task => {
        const fc           = forecasts[task.id];
        const assignedEngs = (inheritedEngIds[task.id]||task.assignedEngineers||[]).map(id=>engineers.find(e=>e.id===id)).filter((e): e is Engineer=>!!e);
        const hasEngineers = assignedEngs.length>0, hasEstimate=(task.estimateHours||0)>0;
        const isWaiting    = !!task.dependsOn&&allActiveTasks.some(t=>t.id===task.dependsOn);
        const effectSt     = effectiveStart(task);
        let barBg: string;
        if (isWaiting) barBg='repeating-linear-gradient(45deg,#A8A6A0,#A8A6A0 4px,#C8C7C3 4px,#C8C7C3 8px)';
        else if (!hasEngineers) barBg='#A8A6A0';
        else barBg=statusColor(!hasEstimate?'ok':fc?.deadlineStatus)||'#A8A6A0';
        const barStart=dateToIdx(effectSt,'next')??0;
        const rawFcIdx=fc?.forecastDate?dateToIdx(fc.forecastDate,'prev'):null;
        const dlCapIdx=task.deadline?dateToIdx(task.deadline,'prev'):null;
        const fcBeyond=fc?.forecastDate&&fc.forecastDate>noEstFallbackEnd;
        let barEnd: number;
        if (!hasEstimate) { const ne=task.deadline||noEstFallbackEnd; barEnd=ne>noEstFallbackEnd?DAYS:(dateToIdx(ne,'prev')!==null?Math.min(DAYS,dateToIdx(ne,'prev')!+1):DAYS); }
        else barEnd=rawFcIdx!==null?Math.min(DAYS,rawFcIdx+1):fcBeyond?DAYS:dlCapIdx!==null?Math.min(DAYS,dlCapIdx+1):barStart+2;
        const colSpan=barEnd-barStart;
        return (
          <div key={task.id} style={{ display:'flex', alignItems:'center', marginBottom:9 }}>
            <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14 }}>
              <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{assignedEngs.length} инж.{task.direction?` · ${task.direction}`:''}{task.dependsOn&&<span style={{ marginLeft:6 }}>↳ зависит</span>}</div>
            </div>
            <div style={{ flex:1, position:'relative', height:44 }}>
              <BgCols/>
              {barStart<barEnd&&(
                <div id={`rbar-${task.id}`} style={{ position:'absolute', left:L(barStart), width:W(barStart,barEnd), top:7, height:30, background:barBg, borderRadius:6, display:'flex', alignItems:'center', padding:colSpan<=2?'0 4px':'0 8px', gap:colSpan<=2?3:5, zIndex:3, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.18)', opacity:isWaiting?0.75:1 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap', flexShrink:0 }}>{fc?.progressPct||0}%</span>
                  {assignedEngs.length>0&&colSpan>1&&<span style={{ fontSize:11, color:'rgba(255,255,255,0.88)', whiteSpace:'nowrap', flexShrink:0 }}>{pluralEng(assignedEngs.length)}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {doneTasks.length>0&&doneTasks.map(task => {
        const assignedEngs=engineers.filter(e=>(task.assignedEngineers||[]).includes(e.id));
        const barStart=task.startDate?dateToIdx(task.startDate,'next')??0:0;
        const barEnd=(task.completedDate?dateToIdx(task.completedDate,'prev'):DAYS-1)!==null?Math.min(DAYS,(task.completedDate?dateToIdx(task.completedDate,'prev')!:DAYS-1)+1):DAYS;
        return (
          <div key={task.id} style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
            <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, paddingRight:14 }}>
              <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text-tertiary)' }}>{task.name}{task.dependsOn&&<span style={{ marginLeft:6, fontSize:11 }}>↳</span>}</div>
              <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>✓ {task.completedDate?new Date(task.completedDate).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'—'}{task.direction?` · ${task.direction}`:''}</div>
            </div>
            <div style={{ flex:1, position:'relative', height:36 }}>
              <BgCols/>
              {barStart<barEnd&&(
                <div id={`rbar-${task.id}`} style={{ position:'absolute', left:L(barStart), width:W(barStart,barEnd), top:5, height:26, backgroundColor:'var(--bg-tertiary)', backgroundImage:'repeating-linear-gradient(45deg,var(--border-mid) 0,var(--border-mid) 3px,transparent 3px,transparent 9px)', borderRadius:5, display:'flex', alignItems:'center', padding:'0 8px', gap:6, zIndex:3, overflow:'hidden', border:'1px solid var(--border-mid)' }}>
                  {assignedEngs.length>0&&<span style={{ fontSize:11, color:'var(--text-secondary)', whiteSpace:'nowrap', flexShrink:0, fontWeight:500 }}>{pluralEng(assignedEngs.length)}</span>}
                  <span style={{ fontSize:11, fontWeight:500, color:'var(--text-tertiary)', whiteSpace:'nowrap' }}>завершена</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display:'flex', alignItems:'center', marginTop:12, borderTop:'0.5px solid var(--border-light)', paddingTop:6 }}>
        <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Задействовано</div>
        <div style={{ flex:1, display:'flex' }}>
          {days.map((d,i) => {
            const cnt=engagedPerDay[i], total=totalPerDay[i], p=total>0?cnt/total:0;
            let bg='var(--bg-secondary)', col='var(--text-tertiary)';
            if (total>0&&cnt>0) { if (p>0.9){bg='var(--red-bg)';col='var(--red)';}else if(p>=0.75){bg='var(--amber-bg)';col='var(--amber)';}else{bg='var(--success-bg)';col='var(--success)';} }
            return <div key={i} style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none' }}>{cnt>0?cnt:'—'}</div>;
          })}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', marginTop:3 }}>
        <div style={{ width:LABEL_W, minWidth:LABEL_W, flexShrink:0, fontSize:12, color:'var(--text-tertiary)', paddingRight:14 }}>Свободны</div>
        <div style={{ flex:1, display:'flex' }}>
          {days.map((d,i) => {
            const cnt=freePerDay[i], total=totalPerDay[i], p=total>0?cnt/total:0;
            let bg='var(--bg-secondary)', col='var(--text-tertiary)';
            if (total>0&&cnt>0) { if(p<0.1){bg='var(--success-bg)';col='var(--success)';}else if(p<=0.25){bg='var(--amber-bg)';col='var(--amber)';}else{bg='var(--red-bg)';col='var(--red)';} }
            return <div key={i} style={{ flex:1, height:22, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:col, borderRight:i<DAYS-1?'0.5px solid var(--bg-primary)':'none' }}>{cnt>0?cnt:'—'}</div>;
          })}
        </div>
      </div>

      {arrows.length>0&&(
        <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:bodyHeight||'100%', pointerEvents:'none', overflow:'visible', zIndex:50 }}>
          {arrows.map(a => {
            const x1=+a.x1.toFixed(1),y1=+a.y1.toFixed(1),x2=+a.x2.toFixed(1),y2=+a.y2.toFixed(1);
            return (
              <g key={a.key}>
                <path d={`M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`} fill="none" stroke="#F0A030" strokeWidth="1.2" strokeOpacity="0.85" strokeLinejoin="round"/>
                <polygon points={`${x2-7},${y2-3.5} ${x2+0.5},${y2} ${x2-7},${y2+3.5}`} fill="#F0A030" opacity="0.9"/>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  background:'none', border:'none', cursor:'pointer',
  fontSize:20, color:'var(--text-secondary)', lineHeight:1, padding:'4px 10px', borderRadius:6,
};

const thStyle: React.CSSProperties = {
  padding:'6px 10px', fontSize:11, fontWeight:600, color:'var(--text-tertiary)',
  textAlign:'left', borderBottom:'1px solid var(--border-light)',
  background:'var(--bg-secondary)', whiteSpace:'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding:'7px 10px', fontSize:12, color:'var(--text-primary)',
  borderBottom:'0.5px solid var(--border-light)', verticalAlign:'middle',
};

function SectionHead({ title, mt = 32 }: { title: string; mt?: number }) {
  return (
    <div style={{ marginTop:mt, marginBottom:14, paddingBottom:8, borderBottom:'2px solid var(--border-mid)' }}>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{title}</span>
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export default function Reports({ data }: PageProps) {
  const today   = new Date();
  const [year, setYear]     = useState(today.getFullYear());
  const [month, setMonth]   = useState(today.getMonth());
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }

  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
  const monthEnd   = (() => { const ld=new Date(year,month+1,0).getDate(); return `${year}-${String(month+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`; })();
  const today_str  = todayStr();

  // ── Active tasks & forecasts ─────────────────────────────────────────────
  const allActiveTasks = useMemo(() =>
    data.tasks.filter(t=>t.status==='active').sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999)),
  [data.tasks]);

  const inheritedEngIds = useMemo(() => computeInheritedTeam(allActiveTasks), [allActiveTasks]);
  const dynamicStarts   = useMemo(() => computeDynamicStarts(allActiveTasks,data.engineers,inheritedEngIds), [allActiveTasks,data.engineers,inheritedEngIds]);

  const forecasts = useMemo(() => {
    const r: Record<string,ReturnType<typeof calcForecast>> = {};
    allActiveTasks.forEach(t => {
      const dynStart=dynamicStarts[t.id], engIds=inheritedEngIds[t.id]||t.assignedEngineers||[];
      const tfc=t.dependsOn?{...t,assignedEngineers:engIds,startDate:null}:{...t,assignedEngineers:engIds};
      r[t.id]=calcForecast(tfc,data.engineers,null,t.dependsOn&&dynStart?dynStart:null);
    });
    return r;
  }, [allActiveTasks,data.engineers,inheritedEngIds,dynamicStarts]);

  // ── Done tasks for the month ─────────────────────────────────────────────
  const doneTasks = useMemo(() =>
    data.tasks.filter(t=>t.status==='done'&&(t.startDate||monthStart)<=monthEnd&&(t.completedDate||monthEnd)>=monthStart)
      .sort((a,b)=>(a.completedDate||'').localeCompare(b.completedDate||'')),
  [data.tasks,monthStart,monthEnd]);

  // ── Active tasks visible in the selected month (same filter as Gantt) ────
  const activeTasksInMonth = useMemo(() =>
    allActiveTasks.filter(t => {
      const effStart = t.dependsOn ? (dynamicStarts[t.id] ?? todayStr()) : (t.startDate ?? todayStr());
      if (effStart > monthEnd) return false;
      const fc = forecasts[t.id];
      const noEst = !(t.estimateHours || 0);
      const endDate = fc?.forecastDate || t.deadline || (noEst ? monthEnd : monthEnd);
      return endDate >= monthStart;
    }),
  [allActiveTasks, dynamicStarts, forecasts, monthStart, monthEnd]);

  // ── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let ok=0, risk=0, overdue=0, queued=0, noFc=0, totalEst=0, totalLeft=0;
    activeTasksInMonth.forEach(t => {
      const fc=forecasts[t.id];
      totalEst  += t.estimateHours||0;
      totalLeft += fc?.hoursLeft??0;
      if (!t.startDate||t.startDate>today_str) { queued++; return; }
      switch (fc?.deadlineStatus) {
        case 'ok':      ok++;      break;
        case 'risk':    risk++;    break;
        case 'overdue': overdue++; break;
        default:        noFc++;
      }
    });
    const overallPct = totalEst>0 ? Math.min(100,Math.round(((totalEst-totalLeft)/totalEst)*100)) : 0;
    return { ok, risk, overdue, queued, noFc, totalEst, totalLeft, overallPct };
  }, [activeTasksInMonth,forecasts,today_str]);

  const activeEngCnt   = data.engineers.filter(e=>e.status==='active'&&isWorkingRole(e)).length;
  const unavailCnt     = data.engineers.filter(e=>e.status!=='active'&&isWorkingRole(e)).length;
  const doneCnt        = doneTasks.length;

  // ── Tasks by direction ───────────────────────────────────────────────────
  const tasksByDir = useMemo(() => {
    const g = new Map<string, Task[]>();
    activeTasksInMonth.forEach(t => {
      const k=t.direction||'Без направления';
      if (!g.has(k)) g.set(k,[]);
      g.get(k)!.push(t);
    });
    return Array.from(g.entries());
  }, [activeTasksInMonth]);

  // ── Direction summary ────────────────────────────────────────────────────
  const dirSummary = useMemo(() => {
    const m = new Map<string,{engCnt:number;activeCnt:number;doneCnt:number;totalHrs:number}>();
    data.engineers.filter(isWorkingRole).forEach(e => {
      const k=e.regularTask||'Без направления';
      if (!m.has(k)) m.set(k,{engCnt:0,activeCnt:0,doneCnt:0,totalHrs:0});
      m.get(k)!.engCnt++;
    });
    activeTasksInMonth.forEach(t => {
      const k=t.direction||'Без направления';
      if (!m.has(k)) m.set(k,{engCnt:0,activeCnt:0,doneCnt:0,totalHrs:0});
      m.get(k)!.activeCnt++;
      m.get(k)!.totalHrs+=t.estimateHours||0;
    });
    doneTasks.forEach(t => {
      const k=t.direction||'Без направления';
      if (!m.has(k)) m.set(k,{engCnt:0,activeCnt:0,doneCnt:0,totalHrs:0});
      m.get(k)!.doneCnt++;
    });
    return Array.from(m.entries()).sort((a,b)=>b[1].engCnt-a[1].engCnt);
  }, [data.engineers,activeTasksInMonth,doneTasks]);

  // ── Engineer → tasks ─────────────────────────────────────────────────────
  const engTasksMap = useMemo(() => {
    const m = new Map<string,string[]>();
    allActiveTasks.forEach(t => {
      (inheritedEngIds[t.id]||t.assignedEngineers||[]).forEach(id => {
        if (!m.has(id)) m.set(id,[]);
        m.get(id)!.push(t.name);
      });
    });
    return m;
  }, [allActiveTasks,inheritedEngIds]);

  // ── Export PDF ───────────────────────────────────────────────────────────
  async function handleExport() {
    const el = printRef.current; if (!el) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF }   = await import('jspdf');
      const canvas  = await html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
      const imgData = canvas.toDataURL('image/png');
      const pdf     = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
      const imgW=pageW, imgH=canvas.height*imgW/canvas.width;
      let pos=0, left=imgH;
      pdf.addImage(imgData,'PNG',0,pos,imgW,imgH); left-=pageH;
      while(left>0){pos-=pageH;pdf.addPage();pdf.addImage(imgData,'PNG',0,pos,imgW,imgH);left-=pageH;}
      pdf.save(`report-${year}-${String(month+1).padStart(2,'0')}.pdf`);
    } catch(e){console.error(e);}
    finally{setExporting(false);}
  }

  // ── Donut segments ───────────────────────────────────────────────────────
  const donutSegs: DonutSeg[] = [
    { value: doneCnt,       color: '#4c91f0' },
    { value: stats.ok,      color: '#1d9e75' },
    { value: stats.risk,    color: '#ef9f27' },
    { value: stats.overdue, color: '#e24b4a' },
    { value: stats.queued,  color: '#c8c7c3' },
    { value: stats.noFc,    color: '#a8a6a0' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
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
        <div ref={printRef} style={{ background:'var(--bg-primary)' }}>

          {/* ── 1. Project header ── */}
          <div style={{ padding:'18px 20px 14px', borderRadius:10, border:'0.5px solid var(--border-light)', background:'var(--bg-primary)', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--text-primary)', lineHeight:1.2 }}>{data.name}</div>
                <div style={{ display:'flex', gap:16, marginTop:6, flexWrap:'wrap' }}>
                  {data.lead && <span style={{ fontSize:13, color:'var(--text-secondary)' }}>Лид: <b>{data.lead}</b></span>}
                  {data.jiraUrl && <a href={data.jiraUrl} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'var(--accent)' }}>Jira ↗</a>}
                  <span style={{ fontSize:13, color:'var(--text-tertiary)' }}>Отчёт за {MONTHS[month]} {year}</span>
                  <span style={{ fontSize:13, color:'var(--text-tertiary)' }}>Сформирован: {new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Summary cards ── */}
          <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', marginBottom:16, background:'var(--bg-primary)' }}>
            <SectionHead title="Сводка" mt={0}/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
              {[
                { label:'В работе',           value:activeTasksInMonth.length, sub:'активных задач' },
                { label:'Завершено за месяц',  value:doneCnt,                sub:`из ${activeTasksInMonth.length+doneCnt} всего` },
                { label:'Активных инженеров',  value:activeEngCnt,          sub:unavailCnt>0?`${unavailCnt} недоступны`:'все доступны' },
                { label:'Прогресс проекта',    value:`${stats.overallPct}%`, sub:stats.totalEst>0?`${fmtHours(stats.totalLeft)} осталось`:'нет оценок' },
              ].map(s=>(
                <div key={s.label} style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'12px 14px' }}>
                  <div style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>{s.value}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)' }}>{s.sub}</div>
                </div>
              ))}
            </div>
            {stats.totalEst>0&&(
              <div style={{ marginBottom:12 }}>
                <div style={{ height:8, background:'var(--bg-tertiary)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${stats.overallPct}%`, height:'100%', background:'#1d9e75', borderRadius:4 }}/>
                </div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {[
                { label:'В срок',     value:stats.ok,      color:'var(--success)',   bg:'var(--success-bg)' },
                { label:'Впритык',    value:stats.risk,    color:'var(--amber)',     bg:'var(--amber-bg)' },
                { label:'Срыв',       value:stats.overdue, color:'var(--red)',       bg:'var(--red-bg)' },
                { label:'В очереди',  value:stats.queued,  color:'var(--text-secondary)', bg:'var(--bg-secondary)' },
              ].map(s=>(
                <div key={s.label} style={{ background:s.bg, borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:s.color, fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 3. Charts ── */}
          <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', marginBottom:16, background:'var(--bg-primary)' }}>
            <SectionHead title="Визуализация" mt={0}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>

              {/* Chart A: task status donut */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:12 }}>Статус задач</div>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <DonutChart segments={donutSegs} size={100}/>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[
                      { label:'Завершено',   value:doneCnt,       color:'#4c91f0' },
                      { label:'В срок',      value:stats.ok,      color:'#1d9e75' },
                      { label:'Впритык',     value:stats.risk,    color:'#ef9f27' },
                      { label:'Срыв',        value:stats.overdue, color:'#e24b4a' },
                      { label:'В очереди',   value:stats.queued,  color:'#c8c7c3' },
                      { label:'Без оценки',  value:stats.noFc,    color:'#a8a6a0' },
                    ].filter(x=>x.value>0).map(x=>(
                      <div key={x.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:x.color, flexShrink:0 }}/>
                        <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{x.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', marginLeft:'auto' }}>{x.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart B: team by direction */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:12 }}>Команда по направлениям</div>
                {dirSummary.length===0
                  ? <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>Нет данных</div>
                  : <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {dirSummary.slice(0,8).map(([dir,s])=>(
                        <div key={dir} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:8, height:8, borderRadius:2, background:dirColor(dir), flexShrink:0 }}/>
                          <div style={{ fontSize:11, color:'var(--text-primary)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{dir}</div>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', flexShrink:0 }}>{s.engCnt}</div>
                          <div style={{ width:60, height:6, background:'var(--bg-secondary)', borderRadius:3, flexShrink:0 }}>
                            <div style={{ width:`${dirSummary[0]?.[1].engCnt>0?(s.engCnt/dirSummary[0][1].engCnt)*100:0}%`, height:'100%', background:dirColor(dir), borderRadius:3 }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* Chart C: task progress bars */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:12 }}>Прогресс задач</div>
                {activeTasksInMonth.length===0
                  ? <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>Нет активных задач</div>
                  : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {activeTasksInMonth.slice(0,10).map(t=>{
                        const fc=forecasts[t.id];
                        const pct=fc?.progressPct??0;
                        const barColor=statusColor(fc?.deadlineStatus)||'#a8a6a0';
                        return (
                          <div key={t.id}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                              <span style={{ fontSize:10, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'75%' }}>{t.name}</span>
                              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)', flexShrink:0 }}>{pct}%</span>
                            </div>
                            <div style={{ height:5, background:'var(--bg-secondary)', borderRadius:3 }}>
                              <div style={{ width:`${pct}%`, height:'100%', background:barColor, borderRadius:3 }}/>
                            </div>
                          </div>
                        );
                      })}
                      {activeTasksInMonth.length>10&&(
                        <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>+ ещё {activeTasksInMonth.length-10}</div>
                      )}
                    </div>
                }
              </div>
            </div>
          </div>

          {/* ── 4. Task table ── */}
          <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', marginBottom:16, background:'var(--bg-primary)' }}>
            <SectionHead title="Задачи в работе" mt={0}/>
            {activeTasksInMonth.length===0
              ? <div style={{ fontSize:13, color:'var(--text-tertiary)', padding:'12px 0' }}>Нет активных задач за этот месяц</div>
              : tasksByDir.map(([dir, tasks]) => (
                  <div key={dir} style={{ marginBottom:20 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:dirColor(dir), flexShrink:0 }}/>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{dir}</span>
                      <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>{tasks.length} задач</span>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Задача</th>
                          <th style={{...thStyle, width:110}}>Прогресс</th>
                          <th style={{...thStyle, width:80}}>Начало</th>
                          <th style={{...thStyle, width:80}}>Дедлайн</th>
                          <th style={{...thStyle, width:80}}>Прогноз</th>
                          <th style={{...thStyle, width:160}}>Инженеры</th>
                          <th style={{...thStyle, width:80}}>Оценка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map(t => {
                          const fc = forecasts[t.id];
                          const engIds = inheritedEngIds[t.id]||t.assignedEngineers||[];
                          const engNames = engIds.map(id=>data.engineers.find(e=>e.id===id)?.name).filter(Boolean);
                          const pct = fc?.progressPct??0;
                          const barColor = statusColor(fc?.deadlineStatus)||'#a8a6a0';
                          const badgeBg  = fc?.deadlineStatus==='ok'?'var(--success-bg)':fc?.deadlineStatus==='risk'?'var(--amber-bg)':fc?.deadlineStatus==='overdue'?'var(--red-bg)':'var(--bg-secondary)';
                          const badgeCol = fc?.deadlineStatus==='ok'?'var(--success)':fc?.deadlineStatus==='risk'?'var(--amber)':fc?.deadlineStatus==='overdue'?'var(--red)':'var(--text-secondary)';
                          const effStart = t.dependsOn?dynamicStarts[t.id]??t.startDate:t.startDate;
                          return (
                            <tr key={t.id}>
                              <td style={tdStyle}>
                                <div style={{ fontWeight:500 }}>{t.name}{t.dependsOn&&<span style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:4 }}>↳</span>}</div>
                                {t.totalCases&&t.totalCases>0 ? <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:1 }}>{t.doneCases}/{t.totalCases} кейсов</div> : null}
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <div style={{ flex:1, height:5, background:'var(--bg-tertiary)', borderRadius:3 }}>
                                    <div style={{ width:`${pct}%`, height:'100%', background:barColor, borderRadius:3 }}/>
                                  </div>
                                  <span style={{ fontSize:11, fontWeight:700, color:badgeCol, background:badgeBg, padding:'1px 5px', borderRadius:4, flexShrink:0 }}>{pct}%</span>
                                </div>
                              </td>
                              <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{fmtDate(effStart)}</td>
                              <td style={{...tdStyle, fontSize:11, color:t.deadline?'var(--text-primary)':'var(--text-tertiary)'}}>{fmtDate(t.deadline)}</td>
                              <td style={{...tdStyle, fontSize:11}}>{fc?.forecastDate ? <span style={{ color:badgeCol }}>{fmtDate(fc.forecastDate)}</span> : <span style={{ color:'var(--text-tertiary)' }}>—</span>}</td>
                              <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{engNames.length>0?engNames.join(', '):'—'}</td>
                              <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{fmtHours(t.estimateHours)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
            }
          </div>

          {/* ── 5. Completed tasks ── */}
          {doneTasks.length>0&&(
            <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', marginBottom:16, background:'var(--bg-primary)' }}>
              <SectionHead title={`Завершённые задачи — ${MONTHS[month]}`} mt={0}/>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Задача</th>
                    <th style={{...thStyle, width:100}}>Направление</th>
                    <th style={{...thStyle, width:90}}>Завершена</th>
                    <th style={{...thStyle, width:90}}>Дедлайн</th>
                    <th style={{...thStyle, width:90}}>Отклонение</th>
                    <th style={{...thStyle, width:160}}>Инженеры</th>
                  </tr>
                </thead>
                <tbody>
                  {doneTasks.map(t => {
                    const delta = t.completedDate&&t.deadline ? dateDelta(t.completedDate,t.deadline) : null;
                    const engNames = (t.assignedEngineers||[]).map(id=>data.engineers.find(e=>e.id===id)?.name).filter(Boolean);
                    const deltaColor = delta===null?'var(--text-tertiary)':delta>=0?'var(--success)':'var(--red)';
                    const deltaBg   = delta===null?'transparent':delta>=0?'var(--success-bg)':'var(--red-bg)';
                    return (
                      <tr key={t.id}>
                        <td style={tdStyle}><span style={{ fontWeight:500 }}>✓ {t.name}</span></td>
                        <td style={{...tdStyle, fontSize:11}}>
                          {t.direction&&<span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:dirColor(t.direction), display:'inline-block' }}/>{t.direction}</span>}
                          {!t.direction&&<span style={{ color:'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td style={{...tdStyle, fontSize:11}}>{fmtDate(t.completedDate)}</td>
                        <td style={{...tdStyle, fontSize:11, color:t.deadline?'var(--text-primary)':'var(--text-tertiary)'}}>{fmtDate(t.deadline)}</td>
                        <td style={tdStyle}>
                          {delta===null
                            ? <span style={{ color:'var(--text-tertiary)', fontSize:11 }}>—</span>
                            : <span style={{ fontSize:11, fontWeight:600, color:deltaColor, background:deltaBg, padding:'2px 6px', borderRadius:4 }}>
                                {delta===0?'в срок':delta>0?`+${delta} дн.`:`${delta} дн.`}
                              </span>
                          }
                        </td>
                        <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{engNames.length>0?engNames.join(', '):'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(() => {
                const withDl = doneTasks.filter(t=>t.completedDate&&t.deadline);
                const onTime = withDl.filter(t=>dateDelta(t.completedDate!,t.deadline!)>=0).length;
                const late   = withDl.length - onTime;
                if (withDl.length===0) return null;
                return (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid var(--border-light)', fontSize:12, color:'var(--text-secondary)', display:'flex', gap:16 }}>
                    <span>Всего завершено: <b>{doneTasks.length}</b></span>
                    {onTime>0&&<span style={{ color:'var(--success)' }}>В срок: <b>{onTime}</b></span>}
                    {late>0&&<span style={{ color:'var(--red)' }}>С задержкой: <b>{late}</b></span>}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── 6. Team ── */}
          <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', marginBottom:16, background:'var(--bg-primary)' }}>
            <SectionHead title="Команда" mt={0}/>

            {/* Engineers table */}
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:24 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Инженер</th>
                  <th style={{...thStyle, width:120}}>Роль</th>
                  <th style={{...thStyle, width:130}}>Направление</th>
                  <th style={thStyle}>Задачи</th>
                  <th style={{...thStyle, width:120}}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.engineers.filter(isWorkingRole).map(e => {
                  const tasks = engTasksMap.get(e.id)||[];
                  const statusColor2 = e.status==='active'?'var(--success)':e.status==='vacation'?'var(--amber)':e.status==='sick'?'var(--red)':'var(--text-secondary)';
                  const statusBg     = e.status==='active'?'var(--success-bg)':e.status==='vacation'?'var(--amber-bg)':e.status==='sick'?'var(--red-bg)':'var(--bg-secondary)';
                  return (
                    <tr key={e.id}>
                      <td style={{...tdStyle, fontWeight:500}}>{e.name}</td>
                      <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{ROLE_LABEL[e.role]||e.role}</td>
                      <td style={{...tdStyle, fontSize:11}}>
                        {e.regularTask
                          ? <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:8,height:8,borderRadius:2,background:dirColor(e.regularTask),display:'inline-block' }}/>{e.regularTask}</span>
                          : <span style={{ color:'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{...tdStyle, fontSize:11, color:'var(--text-secondary)'}}>{tasks.length>0?tasks.slice(0,3).join(', ')+(tasks.length>3?` +${tasks.length-3}`:''):'—'}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize:11, fontWeight:600, color:statusColor2, background:statusBg, padding:'2px 7px', borderRadius:4 }}>
                          {ENG_STATUS_LABEL[e.status]||e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Direction summary */}
            {dirSummary.length>0&&(
              <>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Сводка по направлениям</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Направление</th>
                      <th style={{...thStyle, width:100}}>Инженеров</th>
                      <th style={{...thStyle, width:120}}>Активных задач</th>
                      <th style={{...thStyle, width:100}}>Завершено</th>
                      <th style={{...thStyle, width:100}}>Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dirSummary.map(([dir,s])=>(
                      <tr key={dir}>
                        <td style={tdStyle}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:10,height:10,borderRadius:2,background:dirColor(dir),display:'inline-block' }}/>
                            <span style={{ fontWeight:500 }}>{dir}</span>
                          </span>
                        </td>
                        <td style={{...tdStyle, fontSize:12, fontWeight:600}}>{s.engCnt>0?pluralEng(s.engCnt):'—'}</td>
                        <td style={{...tdStyle, fontSize:12}}>{s.activeCnt}</td>
                        <td style={{...tdStyle, fontSize:12, color:s.doneCnt>0?'var(--success)':'var(--text-tertiary)'}}>{s.doneCnt}</td>
                        <td style={{...tdStyle, fontSize:12, color:'var(--text-secondary)'}}>{s.totalHrs>0?fmtHours(s.totalHrs):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* ── 7. Gantt ── */}
          <div style={{ border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 20px', background:'var(--bg-primary)' }}>
            <SectionHead title="Диаграмма Ганта" mt={0}/>
            <ReportGanttView tasks={data.tasks} engineers={data.engineers} year={year} month={month}/>
          </div>

        </div>
      </div>
    </div>
  );
}
