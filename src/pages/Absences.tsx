import React, { useState, useMemo, useRef } from 'react';
import { getMonthDays, todayStr, formatDateShort } from '../utils/dates';
import { isWorkingRole } from '../domain/availability';
import { segmentByWeek } from '../domain/gantt';
import { PageTopbar, useTooltip } from '../components/UI';
import type { ISODate } from '../domain/types';
import type { PageProps } from '../ui-types';
import { getAbsencePeriods, type AbsencePeriod } from '../utils/absences';

const LABEL_W = 160;

// Палитра для раскраски по направлению (regularTask)
const DIR_PALETTE = [
  '#4C91F0','#52B870','#F0A050','#D85F5F',
  '#9B70E0','#50C8B0','#E07898','#80A8D0',
  '#D8C060','#68C868',
];

function dirColor(dir: string | null): string {
  if (!dir) return '#A8A6A0';
  let h = 0;
  for (let i = 0; i < dir.length; i++) h = (h * 31 + dir.charCodeAt(i)) & 0xffff;
  return DIR_PALETTE[h % DIR_PALETTE.length];
}

function barBackground(type: 'vacation' | 'sick' | 'dayoff', color: string): string {
  if (type === 'sick') {
    return `repeating-linear-gradient(45deg, ${color} 0, ${color} 5px, rgba(255,255,255,0.38) 5px, rgba(255,255,255,0.38) 10px)`;
  }
  return color;
}

function isAbsentOn(periods: AbsencePeriod[], dateStr: ISODate): boolean {
  return periods.some(p => p.start <= dateStr && p.end >= dateStr);
}

function fmtRange(start: ISODate, end: ISODate): string {
  const FAR = '2099-12-31';
  if (start === end) return formatDateShort(start);
  if (end >= FAR)    return `с ${formatDateShort(start)}`;
  return `${formatDateShort(start)} — ${formatDateShort(end)}`;
}

const TYPE_LABEL: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Дейоф' };

export default function Absences({ data, navigate }: PageProps) {
  const { engineers, history } = data;
  const today = todayStr();

  const [year,  setYear]  = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [hideOff, setHideOff] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const weekRowRef = useRef<HTMLDivElement>(null);
  const [weekRowH, setWeekRowH] = useState(0);
  const { show, move, hide, TooltipEl } = useTooltip();

  const allDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const days    = useMemo(() => hideOff ? allDays.filter(d => !d.off) : allDays, [allDays, hideOff]);
  const DAYS    = days.length;

  React.useLayoutEffect(() => {
    if (weekRowRef.current) setWeekRowH(weekRowRef.current.offsetHeight);
  }, [days]);

  const monthFirstStr = `${year}-${String(month + 1).padStart(2, '0')}-01` as ISODate;
  const monthLastDay  = new Date(year, month + 1, 0).getDate();
  const monthLastStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}` as ISODate;
  const monthName     = new Date(year, month, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
  const workdaysCount = allDays.filter(d => !d.off).length;

  const absencesByEng = useMemo(() => {
    const result: Record<string, AbsencePeriod[]> = {};
    engineers.filter(isWorkingRole).forEach(eng => {
      result[eng.id] = getAbsencePeriods(eng, history, today);
    });
    return result;
  }, [engineers, history, today]);

  const workingEngs = useMemo(() =>
    engineers
      .filter(isWorkingRole)
      .sort((a, b) => (a.regularTask || '').localeCompare(b.regularTask || '')),
    [engineers]
  );

  const visibleEngs = useMemo(() => {
    if (showAll) return workingEngs;
    return workingEngs.filter(eng =>
      (absencesByEng[eng.id] || []).some(p => p.start <= monthLastStr && p.end >= monthFirstStr)
    );
  }, [workingEngs, absencesByEng, showAll, monthFirstStr, monthLastStr]);

  const absentPerDay = useMemo(() =>
    days.map(day => workingEngs.filter(eng => isAbsentOn(absencesByEng[eng.id] || [], day.str)).length),
    [days, workingEngs, absencesByEng]
  );

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  function L(i: number)            { return `${(i / DAYS * 100).toFixed(4)}%`; }
  function W(s: number, e: number) { return `${((e - s) / DAYS * 100).toFixed(4)}%`; }

  function dateToIdx(dateStr: ISODate, fallback: 'next' | 'prev' = 'next'): number | null {
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (dy !== year || dm - 1 !== month) return null;
    let idx = days.findIndex(d => d.day === dd);
    if (idx >= 0) return idx;
    if (!hideOff) return null;
    if (fallback === 'next') {
      idx = days.findIndex(d => d.day > dd);
      return idx >= 0 ? idx : null;
    }
    const prev = [...days].reverse().find(d => d.day < dd);
    return prev ? days.indexOf(prev) : null;
  }

  function clamp(date: ISODate, side: 'start' | 'end'): ISODate {
    return side === 'start'
      ? (date < monthFirstStr ? monthFirstStr : date)
      : (date > monthLastStr  ? monthLastStr  : date);
  }

  function BgCols() {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {days.map((d, i) => d.off ? (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i / DAYS * 100).toFixed(4)}%`,
            width: `${(1 / DAYS * 100).toFixed(4)}%`,
            top: 0, bottom: 0,
            background: 'var(--bg-secondary)',
          }}/>
        ) : null)}
      </div>
    );
  }

  const DOW_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageTopbar title="График отсутствий">
        <button onClick={prevMonth} style={{ padding: '7px 12px', border: '1.5px solid var(--border-mid)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>‹</button>
        <div style={{ padding: '7px 16px', border: '1.5px solid var(--border-mid)', borderRadius: 6, fontSize: 14, fontWeight: 600, minWidth: 160, textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{monthName}</div>
        <button onClick={nextMonth} style={{ padding: '7px 12px', border: '1.5px solid var(--border-mid)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>›</button>
        <div style={{ width: 1, height: 24, background: 'var(--border-light)' }}/>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, cursor: 'pointer', userSelect: 'none', padding: '6px 12px', border: '1.5px solid var(--border-mid)', borderRadius: 6, background: hideOff ? 'var(--accent-bg)' : 'var(--bg-secondary)', color: hideOff ? 'var(--accent)' : 'var(--text-secondary)' }}>
          <input type="checkbox" checked={hideOff} onChange={e => setHideOff(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}/>
          Только рабочие дни
          {hideOff && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>({workdaysCount} дн.)</span>}
        </label>
        <button
          onClick={() => setShowAll(v => !v)}
          style={{ padding: '6px 12px', border: '1.5px solid var(--border-mid)', borderRadius: 6, background: showAll ? 'var(--accent-bg)' : 'var(--bg-secondary)', color: showAll ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 14, fontWeight: showAll ? 600 : 400, cursor: 'pointer' }}
        >
          {showAll ? 'Только с отсутствием' : 'Все инженеры'}
        </button>
      </PageTopbar>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }} onMouseMove={move}>
        <div style={{ minWidth: hideOff ? 480 : 720, position: 'relative' }} onMouseLeave={() => setHoveredCol(null)}>

          {/* Оверлей сегодня и ховера — от шапки до низа */}
          <div style={{ position: 'absolute', top: weekRowH, bottom: 0, left: LABEL_W, right: 0, display: 'flex', pointerEvents: 'none', zIndex: 0 }}>
            {days.map((d, i) => (
              <div key={i} style={{
                flex: 1,
                background: hoveredCol === i
                  ? 'rgba(240,160,48,0.08)'
                  : d.today ? 'rgba(29,158,117,0.08)'
                  : 'transparent',
                borderRight: i < DAYS - 1 ? `0.5px solid ${d.today ? 'rgba(29,158,117,0.25)' : 'var(--border-light)'}` : 'none',
              }}/>
            ))}
          </div>

          {/* Sticky-шапка: недели + числа */}
          <div ref={weekRowRef} style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}/>
              <div style={{ flex: 1, display: 'flex', borderBottom: '0.5px solid var(--border-light)' }}>
                {segmentByWeek(days).map((seg, si, arr) => (
                  <div key={si} style={{
                    flex: seg.count, textAlign: 'center', fontSize: 11, padding: '3px 0',
                    color: 'var(--text-tertiary)', fontWeight: 500,
                    borderRight: si < arr.length - 1 ? '1px solid var(--border-mid)' : 'none',
                    background: 'var(--bg-secondary)', letterSpacing: '0.02em',
                  }}>нед. {seg.week}</div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex' }} onMouseLeave={() => setHoveredCol(null)}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0 }}/>
              <div style={{ flex: 1, display: 'flex', borderBottom: '0.5px solid var(--border-light)', background: 'var(--bg-primary)' }}>
                {days.map((d, i) => {
                  const [yy, mm, dd] = d.str.split('-').map(Number);
                  const dow  = DOW_RU[new Date(yy, mm - 1, dd).getDay()];
                  const isOff = d.off && !hideOff;
                  return (
                    <div key={i} onMouseEnter={() => setHoveredCol(i)} style={{
                      flex: 1, textAlign: 'center', padding: '3px 0 2px', cursor: 'default',
                      background: d.today ? 'rgba(29,158,117,0.07)' : isOff ? 'var(--bg-secondary)' : 'transparent',
                      borderRight: i < DAYS - 1 ? `0.5px solid ${d.today ? 'rgba(29,158,117,0.25)' : 'var(--border-light)'}` : 'none',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: d.today ? 700 : 400, color: d.today ? 'var(--accent)' : isOff ? 'var(--text-tertiary)' : 'var(--text-secondary)', lineHeight: 1.3 }}>{d.day}</div>
                      <div style={{ fontSize: 9, color: d.today ? 'var(--accent)' : 'var(--text-tertiary)', lineHeight: 1.2, fontWeight: d.today ? 700 : 400 }}>{dow}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}/>
          </div>

          {/* Строки инженеров */}
          {visibleEngs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>
              Нет отсутствий в {monthName}
              {!showAll && <div style={{ marginTop: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowAll(true)}>Показать всех инженеров</span>
              </div>}
            </div>
          )}

          {visibleEngs.map(eng => {
            const periods = (absencesByEng[eng.id] || [])
              .filter(p => p.start <= monthLastStr && p.end >= monthFirstStr);
            const color = dirColor(eng.regularTask);

            return (
              <div key={eng.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <div
                  onClick={() => navigate('engineer', eng.id)}
                  style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, paddingRight: 12, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.querySelector('div')! as HTMLElement).style.color = 'var(--accent)'}
                  onMouseLeave={e => (e.currentTarget.querySelector('div')! as HTMLElement).style.color = 'var(--text-primary)'}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)', transition: 'color 0.12s' }}>{eng.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eng.regularTask || '—'}</div>
                </div>

                <div style={{ flex: 1, position: 'relative', height: 44 }}>
                  <BgCols/>
                  {periods.map((period, pi) => {
                    const cStart = clamp(period.start, 'start');
                    const cEnd   = clamp(period.end,   'end');
                    const si = dateToIdx(cStart, 'next');
                    const ei = dateToIdx(cEnd,   'prev');
                    if (si === null || ei === null || ei < si) return null;
                    const barEnd  = ei + 1;
                    const colSpan = barEnd - si;
                    const barH    = period.type === 'dayoff' ? 18 : 30;
                    const barTop  = (44 - barH) / 2;
                    const label   = TYPE_LABEL[period.type];
                    return (
                      <div
                        key={pi}
                        onClick={() => navigate('engineer', eng.id)}
                        onMouseEnter={e => show(e, eng.name, [label, fmtRange(period.start, period.end), eng.regularTask || ''].filter(Boolean))}
                        onMouseLeave={hide}
                        style={{
                          position: 'absolute',
                          left: L(si), width: W(si, barEnd),
                          top: barTop, height: barH,
                          background: barBackground(period.type, color),
                          borderRadius: 5,
                          display: 'flex', alignItems: 'center',
                          padding: colSpan <= 1 ? 0 : '0 7px',
                          cursor: 'pointer', zIndex: 3, overflow: 'hidden',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        }}
                      >
                        {colSpan >= 2 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {colSpan <= 3 ? label.charAt(0) : colSpan <= 6 ? label.slice(0, 3) : label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Строка итогов: сколько человек отсутствует каждый день */}
          {workingEngs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, borderTop: '0.5px solid var(--border-light)', paddingTop: 6 }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, fontSize: 12, color: 'var(--text-tertiary)', paddingRight: 12 }}>Отсутствует</div>
              <div style={{ flex: 1, display: 'flex' }}>
                {days.map((d, i) => {
                  const cnt   = absentPerDay[i];
                  const total = workingEngs.length;
                  const p     = total > 0 ? cnt / total : 0;
                  let bg  = 'var(--bg-secondary)';
                  let col = 'var(--text-tertiary)';
                  if (cnt > 0) {
                    if (p > 0.3)        { bg = 'var(--red-bg)';   col = 'var(--red)'; }
                    else if (p >= 0.15) { bg = 'var(--amber-bg)'; col = 'var(--amber)'; }
                    else                { bg = 'var(--blue-bg)';  col = 'var(--blue)'; }
                  }
                  return (
                    <div key={i} style={{ flex: 1, height: 22, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: col, borderRight: i < DAYS - 1 ? '0.5px solid var(--bg-primary)' : 'none' }}>
                      {cnt > 0 ? cnt : '—'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Легенда */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', borderTop: '0.5px solid var(--border-light)', background: 'var(--bg-primary)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ width: 14, height: 10, borderRadius: 2, background: '#7090D0' }}/>
          Отпуск
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ width: 14, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg,#7090D0 0,#7090D0 3px,rgba(255,255,255,0.5) 3px,rgba(255,255,255,0.5) 6px)' }}/>
          Больничный
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div style={{ width: 14, height: 7, borderRadius: 2, background: '#7090D0', opacity: 0.85 }}/>
          Дейоф
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border-light)' }}/>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Цвет полоски = направление (regularTask) инженера</div>
        <div style={{ width: 1, height: 16, background: 'var(--border-light)' }}/>
        {[
          { label: '1–14%', bg: 'var(--blue-bg)', col: 'var(--blue)' },
          { label: '15–29%', bg: 'var(--amber-bg)', col: 'var(--amber)' },
          { label: '30%+', bg: 'var(--red-bg)', col: 'var(--red)' },
        ].map(({ label, bg, col }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 14, height: 10, borderRadius: 2, background: bg, border: `1px solid ${col}` }}/>
            {label} команды отсутствует
          </div>
        ))}
      </div>

      {TooltipEl}
    </div>
  );
}
