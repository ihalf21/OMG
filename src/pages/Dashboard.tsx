import React, { useState } from 'react';
import { calcForecast, statusColor, statusLabel, statusBadgeStyle, engineersNeeded, computeEffectiveDls, type Forecast } from '../utils/forecast';
import { computeInheritedTeam, computeDynamicStarts } from '../domain/gantt';
import { isAvailableToday, isWorkingRole, leaveTypeToday } from '../domain/availability';
import { formatDateShort, todayStr } from '../utils/dates';
import { taskEstimateHours } from '../domain/stages';
import { Avatar, Card, SectionTitle, PageTopbar, Modal } from '../components/UI';
import type { Task } from '../domain/types';
import type { PageProps } from '../ui-types';

function byDeadline(
  a: Task, b: Task,
  dls: Record<string, string>,
): number {
  const da = dls[a.id], db = dls[b.id];
  if (da && db) return da.localeCompare(db);
  if (da) return -1;
  if (db) return 1;
  return 0;
}

const hasEstimate = (task: Task) => taskEstimateHours(task) > 0;

export default function Dashboard({ data, navigate }: PageProps) {
  const { engineers, tasks, history } = data;
  const activeTasks    = tasks.filter(t => t.status === 'active');
  const inheritedEngIds = computeInheritedTeam(activeTasks);
  const dynamicStarts   = computeDynamicStarts(activeTasks, engineers, inheritedEngIds);
  const effectiveDls    = computeEffectiveDls(activeTasks, engineers, inheritedEngIds);

  const forecasts: Record<string, Forecast> = {};
  activeTasks.forEach(t => {
    const engIds   = inheritedEngIds[t.id] || t.assignedEngineers || [];
    const dynStart = dynamicStarts[t.id];
    const taskForFc = t.dependsOn
      ? { ...t, assignedEngineers: engIds, startDate: null as null }
      : { ...t, assignedEngineers: engIds };
    const startOverride = t.dependsOn && dynStart ? dynStart : null;
    forecasts[t.id] = calcForecast(taskForFc, engineers, effectiveDls[t.id] || null, startOverride, history);
  });

  const today = todayStr();
  const isQueued = (t: Task) =>
    !!(t.dependsOn && activeTasks.find(a => a.id === t.dependsOn))
    || !!(t.startDate && t.startDate > today);

  const sort = (arr: Task[]) => [...arr].sort((a, b) => byDeadline(a, b, effectiveDls));

  // Приоритет 1: в работе, срыв сроков — по дедлайну
  const g1 = sort(activeTasks.filter(t => !isQueued(t) && forecasts[t.id]?.deadlineStatus === 'overdue'));
  // Приоритет 2: в работе, впритык или опережение — по дедлайну (без дедлайна в конце)
  const g2 = sort(activeTasks.filter(t => !isQueued(t) && forecasts[t.id]?.deadlineStatus !== 'overdue'));
  // Приоритет 3: в очереди с дедлайном — по дедлайну
  const g3 = sort(activeTasks.filter(t =>  isQueued(t) && !!effectiveDls[t.id]));
  // Приоритет 4: в очереди без дедлайна
  const g4 =      activeTasks.filter(t =>  isQueued(t) && !effectiveDls[t.id]);

  const unavailable = engineers.filter(e => isWorkingRole(e) && !isAvailableToday(e));
  const atRisk  = g1.length;

  // ─── Требует внимания ───────────────────────────────────────────────────────
  // 1. Рабочие инженеры, не назначенные ни на одну активную задачу
  const assignedSet = new Set<string>();
  activeTasks.forEach(t => (t.assignedEngineers || []).forEach(id => assignedSet.add(id)));
  const idleEngineers = engineers.filter(e => isWorkingRole(e) && isAvailableToday(e) && !assignedSet.has(e.id));
  // 2. Задачи со срывом сроков (совпадает с группой «Срыв сроков»)
  const overdueTasks = g1;
  // 3. Задачи в работе без оценки. Дедлайн не обязателен: без оценки команда
  //    всё равно не видит реальный объём работ.
  const noEstimateTasks = activeTasks.filter(
    t => !isQueued(t) && !hasEstimate(t),
  );
  const attentionCount = idleEngineers.length + overdueTasks.length + noEstimateTasks.length;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showAttention, setShowAttention] = useState(false);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Дашборд"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {/* Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {(() => {
            const total     = engineers.filter(isWorkingRole).length;
            const available = engineers.filter(e => isWorkingRole(e) && isAvailableToday(e)).length;
            const unav      = total - available;

            const planned = data.plannedEngineers ?? null;
            const staffingNote = planned != null ? (() => {
              const headcount = (data.leadIncluded ?? false) ? engineers.length : total;
              const diff = headcount - planned;
              if (diff === 0) return null;
              if (diff < 0)   return { text: `план ${planned} · недобор ${-diff}`, color: 'var(--red)' };
              return                  { text: `план ${planned} · перебор ${diff}`, color: 'var(--amber)' };
            })() : null;

            return [
              { label:'Инженеров в команде',
                value: `${available}/${total}`,
                sub: unav > 0 ? `${unav} недоступн${unav===1?'ый':'ых'}` : 'все доступны',
                subColor: unav>0?'var(--amber)':'var(--success)',
                valueColor:'var(--text-primary)', note: staffingNote, onClick: undefined as (()=>void)|undefined },
              { label:'Активных задач', value:tasks.filter(t=>t.status==='active').length, sub:`${activeTasks.filter(t=>t.deadline).length} с жёстким дедлайном`, subColor:'var(--text-tertiary)', valueColor:'var(--text-primary)', note: null, onClick: undefined as (()=>void)|undefined },
              { label:'Под угрозой', value:atRisk, sub:'требуют внимания', subColor:atRisk>0?'var(--red)':'var(--text-tertiary)', valueColor:atRisk>0?'var(--red)':'var(--text-primary)', note: null, onClick: undefined as (()=>void)|undefined },
              { label:'Требует внимания', value:attentionCount,
                sub: attentionCount>0
                  ? `${idleEngineers.length} без задач · ${overdueTasks.length} срыв · ${noEstimateTasks.length} без оценки`
                  : 'всё в порядке',
                subColor: attentionCount>0?'var(--red)':'var(--success)',
                valueColor: attentionCount>0?'var(--red)':'var(--success)',
                note: null, onClick: (()=>setShowAttention(true)) as (()=>void)|undefined },
            ];
          })().map((m,i)=>(
            <div key={i} onClick={m.onClick} style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 18px', boxShadow:'var(--shadow-sm)', cursor:m.onClick?'pointer':undefined, transition:'border-color 0.15s' }}
              onMouseEnter={m.onClick?(e: React.MouseEvent<HTMLDivElement>)=>(e.currentTarget.style.borderColor='var(--border-mid)'):undefined}
              onMouseLeave={m.onClick?(e: React.MouseEvent<HTMLDivElement>)=>(e.currentTarget.style.borderColor='var(--border-light)'):undefined}
            >
              <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:8, fontWeight:500 }}>{m.label}</div>
              <div style={{ fontSize:26, fontWeight:700, color:m.valueColor }}>{m.value}</div>
              <div style={{ fontSize:13, color:m.subColor, marginTop:4 }}>{m.sub}</div>
              {m.note && <div style={{ fontSize:12, color:m.note.color, marginTop:4, fontWeight:600 }}>{m.note.text}</div>}
            </div>
          ))}
        </div>

        {/* Tasks — 4 priority groups */}
        {(() => {
          const allActive = [...g1, ...g2, ...g3, ...g4];

          function TaskCard({ task, queued }: { task: Task; queued: boolean }) {
            const fc  = forecasts[task.id];
            const dl  = effectiveDls[task.id];
            const estimated = hasEstimate(task);
            const isDerived = !task.deadline || (!!dl && dl < task.deadline);
            const barColor  = queued ? '#A8A6A0' : statusColor(fc?.deadlineStatus);
            const bs        = queued
              ? { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
              : !estimated
                ? { bg: 'var(--blue-bg)', color: 'var(--blue)' }
              : statusBadgeStyle(fc?.deadlineStatus);
            const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
            return (
              <div style={{ position:'relative', marginBottom:8 }}
                onMouseEnter={() => setHoveredId(task.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Card onClick={() => navigate('task', task.id)} style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:9, height:9, borderRadius:'50%', background:barColor, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
                    <div style={{ fontSize:13, color:'var(--text-tertiary)', marginTop:3 }}>{task.direction||''}{task.direction&&' · '}старт {formatDateShort(task.startDate)}</div>
                  </div>
                  <div style={{ display:'flex', flexShrink:0 }}>
                    {assignedEngs.slice(0,3).map((e,i) => <Avatar key={e.id} name={e.name} size={28} style={{ marginLeft:i>0?-7:0, border:'2px solid var(--bg-primary)' }}/>)}
                    {assignedEngs.length>3 && <span style={{ fontSize:13, color:'var(--text-tertiary)', marginLeft:7 }}>+{assignedEngs.length-3}</span>}
                  </div>
                  <div style={{ flexShrink:0, textAlign:'right', minWidth:110 }}>
                    {dl ? (
                      <>
                        {isDerived && <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:2 }}>расчётный дедлайн</div>}
                        <div style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:500 }}>до {formatDateShort(dl)}</div>
                        <div style={{ marginTop:4, ...bs, fontSize:12, padding:'2px 8px', borderRadius:4, display:'inline-block', fontWeight:500 }}>
                          {queued ? 'В очереди' : !estimated ? 'Нужна оценка' : statusLabel(fc?.deadlineStatus)}
                        </div>
                        {!queued && fc?.deadlineStatus === 'overdue' && (() => {
                          const needed = engineersNeeded(task, engineers, isDerived ? dl : null, history);
                          return needed && needed > 0
                            ? <div style={{ marginTop:4, fontSize:11, color:'var(--red)', fontWeight:500 }}>+{needed} инж. чтобы уложиться</div>
                            : null;
                        })()}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>
                          {fc?.forecastDate ? `расчёт: ${formatDateShort(fc.forecastDate)}` : 'без дедлайна'}
                        </div>
                        <div style={{ marginTop:4, ...bs, fontSize:12, padding:'2px 8px', borderRadius:4, display:'inline-block', fontWeight:500 }}>
                          {queued ? 'В очереди' : !estimated ? 'Нужна оценка' : statusLabel(fc?.deadlineStatus)}
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            );
          }

          function GroupLabel({ label, color }: { label: string; color?: string }) {
            return (
              <div style={{ display:'flex', alignItems:'center', gap:8, margin:'12px 0 6px' }}>
                <span style={{ fontSize:12, fontWeight:600, color: color || 'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
                <div style={{ flex:1, height:'0.5px', background:'var(--border-light)' }}/>
              </div>
            );
          }

          return (
            <div style={{ marginBottom:20 }}>
              <SectionTitle action="Все задачи →" onAction={() => navigate('tasks')}>Задачи</SectionTitle>
              {allActive.length === 0 && <div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'12px 0' }}>Нет активных задач</div>}

              {g1.length > 0 && <>
                <GroupLabel label="Срыв сроков" color="var(--red)"/>
                {g1.map(t => <TaskCard key={t.id} task={t} queued={false}/>)}
              </>}

              {g2.length > 0 && <>
                <GroupLabel label="В работе"/>
                {g2.map(t => <TaskCard key={t.id} task={t} queued={false}/>)}
              </>}

              {(g3.length > 0 || g4.length > 0) && <>
                <GroupLabel label="В очереди"/>
                {g3.map(t => <TaskCard key={t.id} task={t} queued={true}/>)}
                {g4.map(t => <TaskCard key={t.id} task={t} queued={true}/>)}
              </>}
            </div>
          );
        })()}

        {/* Team status */}
        <div style={{ marginBottom:20 }}>
          <SectionTitle action="Вся команда →" onAction={()=>navigate('team')}>Статус команды сегодня</SectionTitle>
          <Card>
            {unavailable.length===0&&<div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'4px 0' }}>Все инженеры доступны</div>}
            {unavailable.map(e => {
              const leave = leaveTypeToday(e);
              const icon = leave === 'vacation' ? '✈️' : leave === 'sick' ? '🤒' : leave === 'dayoff' ? '🏖️' : '·';
              const text = leave === 'vacation' ? `в отпуске${e.vacationTo ? ` до ${formatDateShort(e.vacationTo)}` : ''}`
                : leave === 'sick' ? 'на больничном'
                : leave === 'dayoff' ? `на дейофе${e.dayoffDate ? ` (${formatDateShort(e.dayoffDate)})` : ''}`
                : 'недоступен';
              return (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border-light)', fontSize:14 }}>
                  <span style={{ fontSize:16 }}>{icon}</span>
                  <span><strong>{e.name}</strong> — {text}</span>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      {showAttention && (
        <Modal title="Требует внимания" width={560} onClose={() => setShowAttention(false)}>
          {attentionCount === 0 && (
            <div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'4px 0' }}>
              Всё в порядке — критичных ситуаций нет.
            </div>
          )}

          {([
            {
              key:'idle', color:'var(--amber)', icon:'👤',
              title:'Инженеры без задач',
              empty:'Все инженеры распределены',
              items: idleEngineers.map(e => ({
                id:e.id,
                primary:e.name,
                secondary: 'на работе, без задачи',
                onClick: () => { setShowAttention(false); navigate('engineer', e.id); },
              })),
            },
            {
              key:'overdue', color:'var(--red)', icon:'⚠️',
              title:'Срыв сроков',
              empty:'',
              items: overdueTasks.map(t => ({
                id:t.id,
                primary:t.name,
                secondary:`дедлайн ${formatDateShort(effectiveDls[t.id])}`,
                onClick: () => { setShowAttention(false); navigate('task', t.id); },
              })),
            },
            {
              key:'noEstimate', color:'var(--blue)', icon:'📋',
              title:'В работе без оценки',
              empty:'',
              items: noEstimateTasks.map(t => ({
                id:t.id,
                primary:t.name,
                secondary: effectiveDls[t.id]
                  ? `нужно добавить оценку · дедлайн ${formatDateShort(effectiveDls[t.id])}`
                  : `нужно добавить оценку · старт ${formatDateShort(t.startDate)}`,
                onClick: () => { setShowAttention(false); navigate('estimate', t.id); },
              })),
            },
          ] as const).filter(s => s.items.length > 0).map(s => (
            <div key={s.key} style={{ marginBottom:18 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:15 }}>{s.icon}</span>
                <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{s.title}</span>
                <span style={{ fontSize:12, fontWeight:700, color:'#fff', background:s.color, borderRadius:10, padding:'1px 8px', minWidth:18, textAlign:'center' }}>{s.items.length}</span>
              </div>
              {s.items.map(it => (
                <div key={it.id} onClick={it.onClick}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', marginBottom:6, borderRadius:8, cursor:'pointer', background:'var(--bg-secondary)', border:'0.5px solid var(--border-light)', transition:'border-color 0.15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-mid)')}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border-light)')}
                >
                  <div style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.primary}</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{it.secondary}</div>
                  </div>
                  <span style={{ fontSize:13, color:'var(--text-tertiary)', flexShrink:0 }}>→</span>
                </div>
              ))}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
