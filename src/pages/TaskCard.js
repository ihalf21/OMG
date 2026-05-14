import React, { useState } from 'react';
import { calcForecast, statusColor, statusLabel, statusBadgeStyle, fmtHours, roleCoeff, getDerivedDeadline } from '../utils/forecast';
import { REGULAR_TASKS } from './EngineerCard';
import { formatDate, formatDateShort, todayStr } from '../utils/dates';
import { Avatar, ProgressBar, Card, PageTopbar, BackBtn, BtnSecondary, BtnPrimary, BtnDanger, FieldRow, Modal, Select, ModalFooter, FormRow, Input } from '../components/UI';

export default function TaskCard({ data, updateData, navigate, taskId, onBack }) {
  const { engineers, tasks, history } = data;
  const task = tasks.find(t => t.id === taskId);
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState(null);
  const [showAddEng, setShowAddEng] = useState(false);
  const [selectedEng, setSelectedEng] = useState('');

  if (!task) return <div style={{ padding:24 }}>Задача не найдена</div>;

  const activeTasks = tasks.filter(t => t.status === 'active');
  const effectiveDl = task.deadline || getDerivedDeadline(task, activeTasks, engineers) || null;
  const fc        = calcForecast(task, engineers, effectiveDl);
  const barColor  = statusColor(fc?.deadlineStatus);
  const bs        = statusBadgeStyle(fc?.deadlineStatus);
  const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
  const taskHistory  = history.filter(h => h.fromTask===taskId||h.toTask===taskId).sort((a,b)=>b.date.localeCompare(a.date));
  const available    = engineers.filter(e => e.role!=='lead' && !task.assignedEngineers?.includes(e.id) && e.status==='active');
  // Рекомендованные: сначала те у кого regularTask совпадает с направлением задачи, потом остальные свободные
  const recommended = available
    .map(e => {
      const matchesDirection = task.direction && e.regularTask === task.direction;
      const exp = (e.experience || {})[task.direction] || 0;
      return { eng: e, matchesDirection, exp };
    })
    .sort((a,b) => {
      if (a.matchesDirection !== b.matchesDirection) return b.matchesDirection - a.matchesDirection;
      return b.exp - a.exp;
    })
    .slice(0, 4)
    .map(x => x.eng);

  function startEdit() {
    setEditForm({
      name: task.name, direction: task.direction || '',
      estimateHours: task.estimateHours || '',
      startDate: task.startDate, deadline: task.deadline || '',
      totalCases: task.totalCases || '',
      hoursAnalysis:    task.hoursAnalysis    || '',
      hoursActualize:   task.hoursActualize   || '',
      hoursDevelopment: task.hoursDevelopment || '',
      hoursTesting:     task.hoursTesting     || '',
    });
    setEditMode(true);
  }

  function saveEdit() {
    const breakdown = {
      hoursAnalysis:    parseInt(editForm.hoursAnalysis)    || 0,
      hoursActualize:   parseInt(editForm.hoursActualize)   || 0,
      hoursDevelopment: parseInt(editForm.hoursDevelopment) || 0,
      hoursTesting:     parseInt(editForm.hoursTesting)     || 0,
    };
    const totalFromBreakdown = Object.values(breakdown).reduce((s,v) => s+v, 0);
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id===taskId ? {
        ...t,
        name: editForm.name, direction: editForm.direction || null,
        estimateHours: totalFromBreakdown > 0 ? totalFromBreakdown : (parseInt(editForm.estimateHours) || t.estimateHours),
        ...breakdown,
        startDate: editForm.startDate || null,
        deadline: editForm.deadline || null,
        totalCases: editForm.totalCases ? parseInt(editForm.totalCases) : null,
      } : t),
    }));
    setEditMode(false);
  }

  function addEngineer(engId) {
    const eng = engineers.find(e=>e.id===engId);
    if (!eng) return;
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id===taskId?{...t,assignedEngineers:[...(t.assignedEngineers||[]),engId]}:t),
      history:[...prev.history,{id:'h'+Date.now(),date:todayStr(),engineerId:engId,type:'switch',fromTask:eng.homeTask||null,toTask:taskId,note:'Добавлен на задачу'}],
    }));
    setShowAddEng(false);
  }

  function removeEngineer(engId) {
    const eng = engineers.find(e=>e.id===engId);
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id===taskId?{...t,assignedEngineers:(t.assignedEngineers||[]).filter(id=>id!==engId)}:t),
      history:[...prev.history,{id:'h'+Date.now(),date:todayStr(),engineerId:engId,type:'return',fromTask:taskId,toTask:eng?.homeTask||null,note:'Возврат на домашнюю'}],
    }));
  }

  function completeTask() {
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id===taskId?{...t,status:'done',completedDate:todayStr()}:t),
    }));
    onBack();
  }

  function archiveTask() {
    if (!window.confirm(`Удалить задачу «${task.name}»?\n\nЗадача будет перемещена в архив. Её можно будет восстановить в разделе «Задачи» → «Архив».`)) return;
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id===taskId?{...t,status:'archived',archivedDate:todayStr()}:t),
    }));
    onBack();
  }

  // Эффективная мощность команды
  const totalCoeff = assignedEngs.reduce((s,e) => s + roleCoeff(e.role), 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title={editMode ? '✏️ '+task.name : task.name}>
        <BackBtn onClick={onBack} label="Задачи"/>
        {!editMode
          ? <><BtnSecondary onClick={startEdit}>✏️ Редактировать</BtnSecondary>
              {task.status==='active'&&<BtnDanger onClick={completeTask}>✓ Завершить</BtnDanger>}
              {task.status!=='archived'&&<BtnDanger onClick={archiveTask} style={{ borderColor:'var(--red)', color:'var(--red)', opacity:0.7 }}>🗑 Удалить</BtnDanger>}</>
          : <><BtnSecondary onClick={()=>setEditMode(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={saveEdit}>💾 Сохранить</BtnPrimary></>
        }
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

          {/* LEFT */}
          <div>
            <Card style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Детали задачи</div>
              {editMode ? (
                <>
                  <FormRow label="Название"><Input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/></FormRow>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <FormRow label="Направление">
                      <Select value={editForm.direction||''} onChange={e=>setEditForm(f=>({...f,direction:e.target.value}))}>
                        <option value="">— не задано —</option>
                        {REGULAR_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
                      </Select>
                    </FormRow>
                    <FormRow label="Оценка (чч)" hint="человеко-часы">
                      <Input type="number" value={editForm.estimateHours} onChange={e=>setEditForm(f=>({...f,estimateHours:e.target.value}))}/>
                    </FormRow>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <FormRow label="Дата старта"><Input type="date" value={editForm.startDate} onChange={e=>setEditForm(f=>({...f,startDate:e.target.value}))}/></FormRow>
                    <FormRow label="Дедлайн"><Input type="date" value={editForm.deadline} onChange={e=>setEditForm(f=>({...f,deadline:e.target.value}))}/></FormRow>
                  </div>
                  <FormRow label="Кейсов всего" hint="Оставьте пустым для авто-расчёта прогресса">
                    <Input type="number" value={editForm.totalCases} onChange={e=>setEditForm(f=>({...f,totalCases:e.target.value}))} placeholder="например, 500"/>
                  </FormRow>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', margin:'10px 0 6px', textTransform:'uppercase', letterSpacing:'0.04em' }}>Оценка по этапам (чч)</div>
                  {[
                    ['hoursAnalysis',    'Анализ'],
                    ['hoursActualize',   'Актуализация'],
                    ['hoursDevelopment', 'Разработка'],
                    ['hoursTesting',     'Тестирование'],
                  ].map(([k, l]) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ flex:1, fontSize:13, color:'var(--text-primary)' }}>{l}</span>
                      <Input type="number" value={editForm[k]||''} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))} placeholder="—" style={{ width:80, textAlign:'center' }}/>
                      <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>чч</span>
                    </div>
                  ))}
                  {(() => {
                    const total = ['hoursAnalysis','hoursActualize','hoursDevelopment','hoursTesting'].reduce((s,k)=>s+(parseInt(editForm[k])||0),0);
                    return total > 0 ? <div style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'right', marginBottom:4 }}>Итого: <strong style={{ color:'var(--text-primary)' }}>{total} чч</strong></div> : null;
                  })()}
                </>
              ) : (
                <>
                  <FieldRow label="Направление"><span style={{ fontSize:13, fontWeight:500, color:'var(--accent)' }}>{task.direction||'—'}</span></FieldRow>
                  <FieldRow label="Статус">
                    <span style={{ fontSize:12, padding:'3px 9px', borderRadius:4, fontWeight:500, ...bs }}>
                      {task.status==='done'?'Завершена':statusLabel(fc?.deadlineStatus)}
                    </span>
                  </FieldRow>
                  <FieldRow label="Дата старта">{formatDate(task.startDate)}</FieldRow>
                  <FieldRow label="Дедлайн">{task.deadline?<span style={{ color:'var(--red)',fontWeight:600 }}>{formatDate(task.deadline)}</span>:'—'}</FieldRow>
                  <FieldRow label="Итоговая оценка"><strong>{fmtHours(task.estimateHours)}</strong></FieldRow>
                  {/* Разбивка по этапам */}
                  {[['hoursAnalysis','Анализ'],['hoursActualize','Актуализация'],['hoursDevelopment','Разработка'],['hoursTesting','Тестирование']].map(([k,l]) =>
                    task[k] > 0 ? <FieldRow key={k} label={`  · ${l}`}><span style={{ color:'var(--text-secondary)' }}>{fmtHours(task[k])}</span></FieldRow> : null
                  )}
                  <FieldRow label="Кейсов всего">{task.totalCases||'—'}</FieldRow>
                </>
              )}
            </Card>

            {!editMode && (
              <>
                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Прогресс</div>

                  {/* Плановая задача без даты старта */}
                  {!task.startDate && (
                    <div style={{ padding:'10px 12px', background:'var(--bg-secondary)', borderRadius:8, marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <div style={{ fontSize:13, color:'var(--text-secondary)' }}>📋 Плановая задача — дата старта не задана</div>
                      <button onClick={() => updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id===taskId ? { ...t, startDate: todayStr() } : t) }))}
                        style={{ padding:'6px 14px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap' }}>
                        Начать сегодня
                      </button>
                    </div>
                  )}

                  <ProgressBar pct={fc?.progressPct||0} color={barColor} height={7}/>
                  <div style={{ fontSize:12, color:'var(--text-tertiary)', display:'flex', justifyContent:'space-between', marginTop:5 }}>
                    <span>{task.totalCases?`${task.doneCases} / ${task.totalCases} кейсов`:'Автоматический расчёт'}</span>
                    <span style={{ fontWeight:600 }}>{fc?.progressPct||0}%</span>
                  </div>

                  {/* Ручной ввод прогресса по кейсам */}
                  {task.totalCases > 0 && (
                    <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:13, color:'var(--text-secondary)', flex:1 }}>Внести факт:</span>
                      <input type="number" defaultValue={task.doneCases}
                        id={`progress-${taskId}`}
                        style={{ width:80, padding:'5px 8px', border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:13, background:'var(--bg-secondary)', color:'var(--text-primary)', textAlign:'center' }}
                      />
                      <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>из {task.totalCases}</span>
                      <button onClick={() => {
                        const val = parseInt(document.getElementById(`progress-${taskId}`)?.value);
                        if (!isNaN(val)) updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id===taskId?{...t,doneCases:Math.min(val,t.totalCases||val)}:t) }));
                      }} style={{ padding:'5px 12px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:500, cursor:'pointer' }}>
                        Сохранить
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop:12, background:'var(--bg-secondary)', borderRadius:8, padding:'12px 14px' }}>
                    {[
                      ['Осталось работы', fmtHours(fc?.hoursLeft), false],
                      ['Рабочих дней до конца', fc?.daysLeft??'—', false],
                      ['Расчётная дата завершения', fc?.forecastDate?formatDateShort(fc.forecastDate):'—', fc?.deadlineStatus==='overdue'],
                      ['Мощность команды', `${fc?.capacity?.toFixed(1)??0} ед.`, false],
                    ].map(([label,val,warn]) => (
                      <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:14, padding:'4px 0' }}>
                        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontWeight:600, color:warn?'var(--red)':'var(--text-primary)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>История изменений</div>
                  {taskHistory.length===0 && <div style={{ fontSize:14, color:'var(--text-tertiary)' }}>Нет событий</div>}
                  <div style={{ paddingLeft:20 }}>
                    {taskHistory.map((h,i) => {
                      const eng=engineers.find(e=>e.id===h.engineerId);
                      const ft=tasks.find(t=>t.id===h.fromTask);
                      const tt=tasks.find(t=>t.id===h.toTask);
                      return (
                        <div key={h.id} style={{ position:'relative', paddingBottom:i<taskHistory.length-1?14:0 }}>
                          {i<taskHistory.length-1&&<div style={{ position:'absolute', left:-16, top:8, bottom:-6, width:1, background:'var(--border-light)' }}/>}
                          <div style={{ position:'absolute', left:-20, top:4, width:9, height:9, borderRadius:'50%', background:h.type==='switch'?'var(--blue)':'var(--accent)', border:'2px solid var(--bg-primary)' }}/>
                          <div style={{ fontSize:14 }}>
                            <strong>{eng?.name||'—'}</strong>
                            {h.type==='switch'&&<> переключён {ft?`с «${ft.name}»`:''}</>}
                            {h.type==='return'&&<> возвращён {tt?`на «${tt.name}»`:'на домашнюю'}</>}
                          </div>
                          {h.note&&<div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{h.note}</div>}
                          <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(h.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </>
            )}
          </div>

          {/* RIGHT */}
          <div>
            <Card style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Команда на задаче</div>
              {assignedEngs.map(eng => {
                const isHome = eng.homeTask===taskId;
                const coeff  = roleCoeff(eng.role);
                return (
                  <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                    <Avatar name={eng.name} size={32}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--blue)' }} onClick={()=>navigate('engineer',eng.id)}>{eng.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>
                        {isHome?'домашняя':'переключён'} · коэфф. {coeff}
                      </div>
                    </div>
                    {!isHome && (
                      <button onClick={()=>removeEngineer(eng.id)} style={{ fontSize:12, color:'var(--accent)', border:'1.5px solid var(--accent)', padding:'4px 10px', borderRadius:4, background:'transparent', cursor:'pointer', fontWeight:500 }}>↩ Вернуть</button>
                    )}
                  </div>
                );
              })}
              {assignedEngs.length > 0 && (
                <div style={{ fontSize:12, color:'var(--text-tertiary)', paddingTop:8, borderTop:'0.5px solid var(--border-light)', marginTop:4 }}>
                  Суммарная мощность: <strong style={{ color:'var(--text-primary)' }}>{totalCoeff.toFixed(1)} ед.</strong>
                </div>
              )}
              <div style={{ paddingTop:10, marginTop:4, borderTop:assignedEngs.length>0?'0.5px solid var(--border-light)':'none' }}>
                <BtnSecondary onClick={()=>setShowAddEng(true)} style={{ width:'100%', justifyContent:'center', fontSize:14 }}>+ Добавить инженера</BtnSecondary>
              </div>
            </Card>

            {recommended.length>0 && (
              <Card>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Рекомендованные</div>
                <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:10 }}>
                  {task.direction ? <>По направлению <strong style={{ color:'var(--accent)' }}>{task.direction}</strong></> : 'Доступные инженеры'}
                </div>
                {recommended.map(eng => {
                  const matchDir  = task.direction && eng.regularTask === task.direction;
                  const expStars  = (eng.experience||{})[task.direction] || 0;
                  return (
                    <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                      <Avatar name={eng.name} size={30}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                          {eng.name}
                          {matchDir && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:3, background:'var(--accent-bg)', color:'var(--accent)', fontWeight:600 }}>основное</span>}
                        </div>
                        <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>
                          {eng.regularTask || '—'}
                          {expStars > 0 && <span style={{ marginLeft:6 }}>{'★'.repeat(expStars)}{'☆'.repeat(5-expStars)}</span>}
                        </div>
                      </div>
                      <button onClick={()=>addEngineer(eng.id)} style={{ fontSize:12, color:'var(--accent)', border:'1.5px solid var(--accent)', padding:'4px 10px', borderRadius:4, background:'transparent', cursor:'pointer', fontWeight:500 }}>Добавить ↗</button>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        </div>
      </div>

      {showAddEng && (
        <Modal title="Добавить инженера" onClose={()=>setShowAddEng(false)}>
          <FormRow label="Выберите инженера">
            <Select value={selectedEng} onChange={e=>setSelectedEng(e.target.value)}>
              <option value="">—</option>
              {available.map(e=><option key={e.id} value={e.id}>{e.name} (коэфф. {roleCoeff(e.role)})</option>)}
            </Select>
          </FormRow>
          <ModalFooter onCancel={()=>setShowAddEng(false)} onSave={()=>selectedEng&&addEngineer(selectedEng)} saveLabel="Добавить"/>
        </Modal>
      )}
    </div>
  );
}
