import React, { useState } from 'react';
import { calcForecast, statusColor, statusLabel, statusBadgeStyle, engineersNeeded, getDerivedDeadline } from '../utils/forecast';
import { formatDateShort } from '../utils/dates';
import { Avatar, ProgressBar, Card, SectionTitle, PageTopbar } from '../components/UI';

export default function Dashboard({ data, updateData, navigate }) {
  const { engineers, tasks } = data;
  const activeTasks  = tasks.filter(t => t.status === 'active');
  const allActive    = activeTasks;

  // Для каждой активной задачи считаем эффективный дедлайн (свой или расчётный по цепочке)
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
  activeTasks.forEach(t => {
    forecasts[t.id] = calcForecast(t, engineers, effectiveDls[t.id] || null);
  });

  const tasksWithDl  = activeTasks.filter(t => effectiveDls[t.id]);
  const tasksNoDl    = activeTasks.filter(t => !effectiveDls[t.id]);
  const unavailable  = engineers.filter(e=>e.status!=='active'&&e.role!=='lead');

  const atRisk  = tasksWithDl.filter(t=>forecasts[t.id]?.deadlineStatus==='overdue').length;
  const onTrack = tasksWithDl.filter(t=>forecasts[t.id]?.deadlineStatus==='ok').length;

  const [progressInputs, setProgressInputs] = useState({});

  function saveProgress(taskId) {
    const val = parseInt(progressInputs[taskId]);
    if (!val||isNaN(val)) return;
    updateData(prev => ({ ...prev, tasks:prev.tasks.map(t=>t.id===taskId?{...t,doneCases:val}:t) }));
    setProgressInputs(p=>({...p,[taskId]:''}));
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Дашборд"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {/* Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {(() => {
            const total     = engineers.filter(e=>e.role!=='lead').length;
            const available = engineers.filter(e=>e.role!=='lead'&&e.status==='active').length;
            const unav      = total - available;
            return [
              { label:'Инженеров в команде',
                value: `${available}/${total}`,
                sub: unav > 0 ? `${unav} недоступн${unav===1?'ый':'ых'}` : 'все доступны',
                subColor: unav>0?'var(--amber)':'var(--success)',
                valueColor:'var(--text-primary)' },
              { label:'Активных задач', value:tasks.filter(t=>t.status==='active').length, sub:`${activeTasks.filter(t=>t.deadline).length} с жёстким дедлайном`, subColor:'var(--text-tertiary)', valueColor:'var(--text-primary)' },
              { label:'Под угрозой', value:atRisk, sub:'требуют внимания', subColor:atRisk>0?'var(--red)':'var(--text-tertiary)', valueColor:atRisk>0?'var(--red)':'var(--text-primary)' },
              { label:'С опережением', value:onTrack, sub:'идут по плану', subColor:'var(--success)', valueColor:'var(--success)' },
            ];
          })().map((m,i)=>(
            <div key={i} style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, padding:'16px 18px', boxShadow:'var(--shadow-sm)' }}>
              <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:8, fontWeight:500 }}>{m.label}</div>
              <div style={{ fontSize:26, fontWeight:700, color:m.valueColor }}>{m.value}</div>
              <div style={{ fontSize:13, color:m.subColor, marginTop:4 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Tasks with deadline (own or derived) */}
        <div style={{ marginBottom:20 }}>
          <SectionTitle action="Все задачи →" onAction={()=>navigate('tasks')}>Задачи с дедлайном</SectionTitle>
          {tasksWithDl.length===0&&<div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'12px 0' }}>Нет задач с дедлайном</div>}
          {tasksWithDl.map(task=>{
            const fc=forecasts[task.id];
            const dl=effectiveDls[task.id];
            const isDerived=!task.deadline;
            const isQueued=!!(task.dependsOn&&activeTasks.find(t=>t.id===task.dependsOn));
            const barColor=isQueued?'#A8A6A0':statusColor(fc?.deadlineStatus);
            const bs=isQueued?{ bg:'var(--bg-secondary)', color:'var(--text-secondary)' }:statusBadgeStyle(fc?.deadlineStatus);
            const assignedEngs=engineers.filter(e=>task.assignedEngineers?.includes(e.id));
            return (
              <Card key={task.id} onClick={()=>navigate('task',task.id)} style={{ marginBottom:8, display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:barColor, flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', marginTop:3 }}>{task.direction||''} · старт {formatDateShort(task.startDate)}</div>
                </div>
                <div style={{ display:'flex', flexShrink:0 }}>
                  {assignedEngs.slice(0,3).map((e,i)=><Avatar key={e.id} name={e.name} size={28} style={{ marginLeft:i>0?-7:0, border:'2px solid var(--bg-primary)' }}/>)}
                  {assignedEngs.length>3&&<span style={{ fontSize:13, color:'var(--text-tertiary)', marginLeft:7 }}>+{assignedEngs.length-3}</span>}
                </div>
                {task.totalCases&&(
                  <div style={{ width:150, flexShrink:0 }}>
                    <ProgressBar pct={fc?.progressPct||0} color={barColor} height={5}/>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', display:'flex', justifyContent:'space-between', marginTop:3 }}>
                      <span>{task.doneCases}/{task.totalCases}</span><span>{fc?.progressPct||0}%</span>
                    </div>
                  </div>
                )}
                <div style={{ flexShrink:0, textAlign:'right', minWidth:110 }}>
                  {isDerived&&<div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:2 }}>расчётный дедлайн</div>}
                  <div style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:500 }}>до {formatDateShort(dl)}</div>
                  <div style={{ marginTop:4, ...bs, fontSize:12, padding:'2px 8px', borderRadius:4, display:'inline-block', fontWeight:500 }}>{isQueued?'В очереди':statusLabel(fc?.deadlineStatus)}</div>
                  {!isQueued&&fc?.deadlineStatus === 'overdue' && (() => {
                    const needed = engineersNeeded(task, engineers, isDerived ? dl : null);
                    return needed > 0 ? (
                      <div style={{ marginTop:4, fontSize:11, color:'var(--red)', fontWeight:500 }}>
                        +{needed} инж. чтобы уложиться
                      </div>
                    ) : null;
                  })()}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tasks without deadline */}
        {tasksNoDl.length>0&&(
          <div style={{ marginBottom:20 }}>
            <SectionTitle>Задачи без дедлайна</SectionTitle>
            {tasksNoDl.map(task=>{
              const fc=forecasts[task.id];
              const isQueued=!!(task.dependsOn&&activeTasks.find(t=>t.id===task.dependsOn));
              return (
                <Card key={task.id} onClick={()=>navigate('task',task.id)} style={{ marginBottom:8, display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:9, height:9, borderRadius:'50%', background:'#A8A6A0', flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600 }}>{task.name}</div>
                    <div style={{ fontSize:13, color:'var(--text-tertiary)', marginTop:3 }}>Расчёт: {fc?.forecastDate?formatDateShort(fc.forecastDate):'—'} · {task.assignedEngineers?.length||0} инж.</div>
                  </div>
                  <div style={{ fontSize:12, padding:'3px 9px', borderRadius:4, background:'var(--bg-secondary)', color:'var(--text-secondary)', fontWeight:500 }}>{isQueued?'В очереди':'В работе'}</div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Quick progress */}
        {tasksWithDl.filter(t=>t.totalCases).length>0&&(
          <div style={{ marginBottom:20 }}>
            <SectionTitle>Внести фактический прогресс</SectionTitle>
            <Card>
              {tasksWithDl.filter(t=>t.totalCases).map((task,idx,arr)=>(
                <div key={task.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:idx<arr.length-1?'0.5px solid var(--border-light)':'none' }}>
                  <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{task.name}</div>
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', whiteSpace:'nowrap' }}>план: {task.totalCases} · факт:</div>
                  <input type="number" placeholder="кейсов"
                    value={progressInputs[task.id]||''}
                    onChange={e=>setProgressInputs(p=>({...p,[task.id]:e.target.value}))}
                    style={{ width:90, padding:'6px 9px', border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:14, background:'var(--bg-secondary)', color:'var(--text-primary)', textAlign:'center' }}
                  />
                  <button onClick={()=>saveProgress(task.id)} style={{ padding:'6px 16px', border:'none', borderRadius:6, background:'var(--accent)', fontSize:14, color:'#fff', cursor:'pointer', fontWeight:500 }}>Обновить</button>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Team status */}
        <div style={{ marginBottom:20 }}>
          <SectionTitle action="Вся команда →" onAction={()=>navigate('team')}>Статус команды сегодня</SectionTitle>
          <Card>
            {unavailable.length===0&&<div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'4px 0' }}>Все инженеры доступны</div>}
            {engineers.filter(e=>e.status==='vacation').map(e=>(
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border-light)', fontSize:14 }}>
                <span style={{ fontSize:16 }}>✈️</span>
                <span><strong>{e.name}</strong> — в отпуске{e.vacationTo?` до ${formatDateShort(e.vacationTo)}`:''}</span>
              </div>
            ))}
            {engineers.filter(e=>e.status==='sick').map(e=>(
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border-light)', fontSize:14 }}>
                <span style={{ fontSize:16 }}>🤒</span>
                <span><strong>{e.name}</strong> — на больничном</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
