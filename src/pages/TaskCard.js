import React, { useState, useRef } from 'react';
import { calcForecast, statusColor, statusLabel, statusBadgeStyle, fmtHours, getDerivedDeadline } from '../utils/forecast';
import { isAvailableToday, isWorkingRole } from '../domain/availability';
import { REGULAR_TASKS } from './EngineerCard';
import { formatDate, formatDateShort, todayStr } from '../utils/dates';
import { Avatar, ProgressBar, Card, PageTopbar, BackBtn, BtnSecondary, BtnPrimary, BtnDanger, FieldRow, Modal, Select, ModalFooter, FormRow, Input, DatePicker, useConfirm } from '../components/UI';

export default function TaskCard({ data, updateData, navigate, taskId, onBack }) {
  const { engineers, tasks, history } = data;
  const task = tasks.find(t => t.id === taskId);
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState(null);
  const [showAddEng, setShowAddEng] = useState(false);
  const [selectedEng, setSelectedEng] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [completeDateMode, setCompleteDateMode] = useState('today');
  const [completeCustomDate, setCompleteCustomDate] = useState('');
  const { confirm, ConfirmEl } = useConfirm();
  const progressInputRef = useRef(null);

  if (!task) return <div style={{ padding:24 }}>Задача не найдена</div>;

  const activeTasks = tasks.filter(t => t.status === 'active');
  // Текущий дочерний элемент (задача, которая зависит от этой)
  const currentChild = tasks.find(t => t.dependsOn === taskId && t.status === 'active');
  const effectiveDl = task.deadline || getDerivedDeadline(task, activeTasks, engineers) || null;
  const fc        = calcForecast(task, engineers, effectiveDl);
  const barColor  = statusColor(fc?.deadlineStatus);
  const bs        = statusBadgeStyle(fc?.deadlineStatus);
  const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
  const taskHistory  = history.filter(h => h.fromTask===taskId||h.toTask===taskId).sort((a,b)=>b.date.localeCompare(a.date));
  const available    = engineers.filter(e => isWorkingRole(e) && !task.assignedEngineers?.includes(e.id) && isAvailableToday(e));
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
      startDate: task.startDate || '', deadline: task.deadline || '',
      totalCases: task.totalCases || '',
      hoursAnalysis:    task.hoursAnalysis    || '',
      hoursActualize:   task.hoursActualize   || '',
      hoursDevelopment: task.hoursDevelopment || '',
      hoursTesting:     task.hoursTesting     || '',
      dependsOn:  task.dependsOn || '',
      newChildId: '',
    });
    setEditMode(true);
  }

  function saveEdit() {
    const breakdown = {
      hoursAnalysis:    Math.max(0, parseInt(editForm.hoursAnalysis)    || 0),
      hoursActualize:   Math.max(0, parseInt(editForm.hoursActualize)   || 0),
      hoursDevelopment: Math.max(0, parseInt(editForm.hoursDevelopment) || 0),
      hoursTesting:     Math.max(0, parseInt(editForm.hoursTesting)     || 0),
    };
    const totalFromBreakdown = Object.values(breakdown).reduce((s,v) => s+v, 0);

    updateData(prev => {
      // Определяем итоговый dependsOn для текущей задачи.
      // Если привязываем дочернюю задачу и у неё был родитель — вставляемся в цепочку.
      let effectiveDependsOn = editForm.dependsOn || null;
      if (editForm.newChildId && !effectiveDependsOn) {
        const selectedChild = prev.tasks.find(t => t.id === editForm.newChildId);
        if (selectedChild?.dependsOn) {
          effectiveDependsOn = selectedChild.dependsOn; // вставка в цепочку: Y→this→X
        }
      }

      let newTasks = prev.tasks.map(t => {
        if (t.id === taskId) return {
          ...t,
          name: editForm.name, direction: editForm.direction || null,
          estimateHours: totalFromBreakdown > 0 ? totalFromBreakdown : (parseInt(editForm.estimateHours) > 0 ? parseInt(editForm.estimateHours) : null),
          ...breakdown,
          // Дата старта только для независимых задач; дочерние считают от родителя
          startDate: effectiveDependsOn ? null : (editForm.startDate || null),
          deadline: editForm.deadline || null,
          totalCases: editForm.totalCases ? parseInt(editForm.totalCases) : null,
          dependsOn: effectiveDependsOn,
        };
        // Новая дочерняя задача: обновляем её dependsOn
        if (editForm.newChildId && t.id === editForm.newChildId) {
          return { ...t, dependsOn: taskId, startDate: null };
        }
        return t;
      });

      return { ...prev, tasks: newTasks };
    });
    setEditMode(false);
  }

  function unlinkParent() {
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, dependsOn: null, startDate: null } : t),
    }));
  }

  function unlinkChild(childId) {
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === childId ? { ...t, dependsOn: null } : t),
    }));
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

  // Эффективная мощность команды
  const totalCount = assignedEngs.length;

  // Рекурсивный расчёт полной команды задачи (своя + унаследованная от родителей)
  function getEffectiveTeam(t, allTasks, depth = 0) {
    if (!t || depth > 9) return [];
    const own = t.assignedEngineers || [];
    if (!t.dependsOn) return own;
    const parent = allTasks.find(x => x.id === t.dependsOn);
    const parentTeam = getEffectiveTeam(parent, allTasks, depth + 1);
    if (own.length === 0) return parentTeam;
    return [...new Set([...parentTeam, ...own])];
  }

  const parentTask      = task.dependsOn ? tasks.find(t => t.id === task.dependsOn) : null;
  const inheritedEngIds = parentTask ? getEffectiveTeam(parentTask, tasks) : [];
  const inheritedEngs   = inheritedEngIds.map(id => engineers.find(e => e.id === id)).filter(Boolean);
  const inheritedCount  = inheritedEngs.length;

  // Перенос команды на дочернюю задачу при завершении/удалении текущей
  function transferTeamToChild(prev) {
    const child = prev.tasks.find(t => t.dependsOn === taskId && t.status === 'active');
    if (!child) return { tasks: prev.tasks, history: prev.history, childId: null };

    const completedTask = prev.tasks.find(t => t.id === taskId);
    const team = getEffectiveTeam(completedTask, prev.tasks);
    if (team.length === 0) return { tasks: prev.tasks, history: prev.history, childId: null };

    const today = todayStr();
    const merged = [...new Set([...team, ...(child.assignedEngineers || [])])];
    const newHistory = team.map((engId, i) => ({
      id: 'h' + (Date.now() + i),
      date: today,
      engineerId: engId,
      type: 'switch',
      fromTask: taskId,
      toTask: child.id,
      note: 'Автоперевод при завершении задачи',
    }));

    return {
      tasks: prev.tasks.map(t =>
        t.id === child.id ? { ...t, assignedEngineers: merged, startDate: today, dependsOn: null } : t
      ),
      history: [...prev.history, ...newHistory],
      childId: child.id,
    };
  }

  function completeTask(date) {
    updateData(prev => {
      const { tasks: newTasks, history: newHistory, childId } = transferTeamToChild(prev);
      return {
        ...prev,
        tasks: newTasks.map(t => t.id===taskId
          ? { ...t, status:'done', completedDate: date, completedWithChildId: childId || null }
          : t
        ),
        history: newHistory,
      };
    });
    onBack();
  }

  function handleCompleteClick() {
    setCompleteDateMode('today');
    setCompleteCustomDate('');
    setCompleteModal(true);
  }

  function confirmComplete() {
    const date = completeDateMode === 'today' ? todayStr() : completeCustomDate;
    if (!date) return;
    setCompleteModal(false);
    completeTask(date);
  }

  function reopenTask() {
    updateData(prev => {
      const parent = prev.tasks.find(t => t.id === taskId);
      const childId = parent?.completedWithChildId;
      return {
        ...prev,
        tasks: prev.tasks.map(t => {
          if (t.id === taskId)
            return { ...t, status:'active', completedDate:null, completedWithChildId:null };
          if (childId && t.id === childId)
            return { ...t, dependsOn: taskId, startDate: null };
          return t;
        }),
      };
    });
  }

  async function archiveTask() {
    const ok = await confirm(
      `Удалить задачу «${task.name}»?`,
      'Задача будет перемещена в архив. Её можно будет восстановить в разделе «Задачи» → «Архив».',
      { confirmLabel: 'Удалить' }
    );
    if (!ok) return;
    updateData(prev => {
      const { tasks: newTasks, history: newHistory } = transferTeamToChild(prev);
      return {
        ...prev,
        tasks: newTasks.map(t => t.id===taskId ? { ...t, status:'archived', archivedDate:todayStr() } : t),
        history: newHistory,
      };
    });
    onBack();
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {ConfirmEl}
      {completeModal && (
        <Modal title="Завершить задачу" onClose={() => setCompleteModal(false)} width={400}>
          <FormRow label="Дата завершения">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:8, border:`1.5px solid ${completeDateMode==='today' ? 'var(--accent)' : 'var(--border-mid)'}`, background: completeDateMode==='today' ? 'var(--accent-muted,rgba(99,102,241,0.08))' : 'var(--bg-secondary)' }}>
                <input type="radio" name="completeMode" value="today" checked={completeDateMode==='today'} onChange={() => setCompleteDateMode('today')} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                <span style={{ fontSize:14 }}>Завершена сегодня</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:8, border:`1.5px solid ${completeDateMode==='custom' ? 'var(--accent)' : 'var(--border-mid)'}`, background: completeDateMode==='custom' ? 'var(--accent-muted,rgba(99,102,241,0.08))' : 'var(--bg-secondary)' }}>
                <input type="radio" name="completeMode" value="custom" checked={completeDateMode==='custom'} onChange={() => setCompleteDateMode('custom')} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                <span style={{ fontSize:14 }}>Указать дату завершения</span>
              </label>
              {completeDateMode === 'custom' && (
                <div style={{ paddingLeft:2 }}>
                  <DatePicker value={completeCustomDate} onChange={setCompleteCustomDate} placeholder="Выбрать дату" clearable={false}/>
                </div>
              )}
            </div>
          </FormRow>
          <ModalFooter
            onCancel={() => setCompleteModal(false)}
            onSave={confirmComplete}
            saveLabel="✓ Завершить"
          />
        </Modal>
      )}
      <PageTopbar title={editMode ? '✏️ '+task.name : task.name}>
        <BackBtn onClick={onBack} label="Задачи"/>
        {!editMode
          ? <><BtnSecondary onClick={startEdit}>✏️ Редактировать</BtnSecondary>
              {task.status==='active'&&<BtnDanger onClick={handleCompleteClick}>✓ Завершить</BtnDanger>}
              {task.status==='done'&&<BtnSecondary onClick={reopenTask}>↩ Вернуть в работу</BtnSecondary>}
              {task.status!=='archived'&&<BtnDanger onClick={archiveTask} style={{ borderColor:'var(--red)', color:'var(--red)', opacity:0.7 }}>🗑 Удалить</BtnDanger>}</>
          : <><BtnSecondary onClick={()=>setEditMode(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={saveEdit}>💾 Сохранить</BtnPrimary></>
        }
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:16, alignItems:'start' }}>

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
                    {!editForm.dependsOn ? (
                      <FormRow label="Дата старта">
                        <DatePicker value={editForm.startDate} onChange={v => setEditForm(f=>({...f,startDate:v}))} placeholder="Не задана"/>
                      </FormRow>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Дата старта</span>
                        <span style={{ fontSize:13, color:'var(--text-tertiary)', padding:'7px 0' }}>от родительской задачи</span>
                      </div>
                    )}
                    <FormRow label="Дедлайн">
                      <DatePicker value={editForm.deadline} onChange={v => setEditForm(f=>({...f,deadline:v}))} placeholder="Без дедлайна"/>
                    </FormRow>
                  </div>
                  <FormRow label="Кейсов всего" hint="Оставьте пустым для авто-расчёта прогресса">
                    <Input type="number" value={editForm.totalCases} onChange={e=>setEditForm(f=>({...f,totalCases:e.target.value}))} placeholder="например, 500"/>
                  </FormRow>

                  {/* Зависимости */}
                  <div style={{ borderTop:'0.5px solid var(--border-light)', paddingTop:12, marginTop:8 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>Зависимость</div>

                    {/* Родительская задача */}
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:5 }}>Эта задача начнётся после:</div>
                      {editForm.dependsOn ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:13, color:'var(--accent)', fontWeight:500, flex:1 }}>
                            ↳ {tasks.find(t=>t.id===editForm.dependsOn)?.name || editForm.dependsOn}
                          </span>
                          <button type="button" onClick={()=>setEditForm(f=>({...f,dependsOn:''}))}
                            style={{ fontSize:11, color:'var(--red)', border:'1px solid var(--red)', borderRadius:4, padding:'3px 8px', background:'transparent', cursor:'pointer' }}>
                            Убрать
                          </button>
                        </div>
                      ) : (
                        <Select value={editForm.dependsOn||''} onChange={e=>setEditForm(f=>({...f,dependsOn:e.target.value}))}>
                          <option value="">— нет родительской задачи —</option>
                          {activeTasks.filter(t=>t.id!==taskId && t.dependsOn!==taskId).map(t=>(
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                      )}
                    </div>

                    {/* Дочерняя задача */}
                    <div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:5 }}>После этой задачи начнётся:</div>
                      {currentChild ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500, flex:1 }}>
                            → {currentChild.name}
                          </span>
                          <button type="button" onClick={()=>unlinkChild(currentChild.id)}
                            style={{ fontSize:11, color:'var(--red)', border:'1px solid var(--red)', borderRadius:4, padding:'3px 8px', background:'transparent', cursor:'pointer' }}>
                            Убрать
                          </button>
                        </div>
                      ) : (
                        <Select value={editForm.newChildId||''} onChange={e=>setEditForm(f=>({...f,newChildId:e.target.value}))}>
                          <option value="">— нет следующей задачи —</option>
                          {activeTasks.filter(t=>t.id!==taskId && t.dependsOn!==taskId && t.id!==editForm.dependsOn).map(t=>(
                            <option key={t.id} value={t.id}>
                              {t.name}{t.dependsOn?' (сейчас зависит от '+tasks.find(p=>p.id===t.dependsOn)?.name+')':''}
                            </option>
                          ))}
                        </Select>
                      )}
                      {editForm.newChildId && (() => {
                        const sel = tasks.find(t=>t.id===editForm.newChildId);
                        const oldParent = sel?.dependsOn ? tasks.find(t=>t.id===sel.dependsOn) : null;
                        if (!oldParent) return null;
                        const willInherit = !editForm.dependsOn;
                        return (
                          <div style={{ fontSize:12, color:'var(--amber)', marginTop:6, padding:'5px 8px', background:'var(--amber-bg)', borderRadius:5 }}>
                            {willInherit
                              ? `Эта задача встанет в цепочку: «${oldParent.name}» → эта → «${sel.name}»`
                              : `«${sel.name}» перестанет зависеть от «${oldParent.name}»`}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', margin:'12px 0 6px', textTransform:'uppercase', letterSpacing:'0.04em' }}>Оценка по этапам (чч)</div>
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
                  {task.dependsOn && (() => {
                    const parent = tasks.find(t=>t.id===task.dependsOn);
                    return parent ? (
                      <FieldRow label="Зависит от">
                        <span style={{ fontSize:13, color:'var(--accent)', fontWeight:500, cursor:'pointer' }}
                          onClick={()=>navigate('task',parent.id)}>
                          ↳ {parent.name}
                        </span>
                      </FieldRow>
                    ) : null;
                  })()}
                  {currentChild && (
                    <FieldRow label="Следующая задача">
                      <span style={{ fontSize:13, color:'var(--text-secondary)', cursor:'pointer' }}
                        onClick={()=>navigate('task',currentChild.id)}>
                        → {currentChild.name}
                      </span>
                    </FieldRow>
                  )}
                </>
              )}
            </Card>

            {!editMode && (
              <>
                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Прогресс</div>


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
                        ref={progressInputRef}
                        style={{ width:80, padding:'5px 8px', border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:13, background:'var(--bg-secondary)', color:'var(--text-primary)', textAlign:'center' }}
                      />
                      <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>из {task.totalCases}</span>
                      <button onClick={() => {
                        const val = parseInt(progressInputRef.current?.value);
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
                      ['Инженеров на задаче', Math.round(fc?.capacity??0), false],
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
                return (
                  <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                    <Avatar name={eng.name} size={32}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--blue)' }} onClick={()=>navigate('engineer',eng.id)}>{eng.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>
                        {isHome?'домашняя':'переключён'}
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
                  Инженеров: <strong style={{ color:'var(--text-primary)' }}>{totalCount}</strong>
                </div>
              )}
              <div style={{ paddingTop:10, marginTop:4, borderTop:assignedEngs.length>0?'0.5px solid var(--border-light)':'none' }}>
                <BtnSecondary onClick={()=>setShowAddEng(true)} style={{ width:'100%', justifyContent:'center', fontSize:14 }}>+ Добавить инженера</BtnSecondary>
              </div>
            </Card>

            {parentTask && inheritedEngs.length > 0 && (
              <Card style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Переходят с родительской</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12, padding:'8px 10px', background:'var(--bg-secondary)', borderRadius:7 }}>
                  <span style={{ fontSize:12, color:'var(--text-tertiary)' }}>После завершения:</span>
                  <span
                    style={{ fontSize:13, color:'var(--accent)', fontWeight:600, cursor:'pointer', flex:1 }}
                    onClick={() => navigate('task', parentTask.id)}
                    onMouseEnter={e => e.currentTarget.style.textDecoration='underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration='none'}
                  >
                    ↳ {parentTask.name}
                  </span>
                </div>
                {inheritedEngs.map(eng => (
                  <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                    <Avatar name={eng.name} size={30}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--blue)' }} onClick={() => navigate('engineer', eng.id)}>{eng.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>{eng.regularTask||'—'}</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:12, color:'var(--text-tertiary)', paddingTop:8, borderTop:'0.5px solid var(--border-light)', marginTop:4 }}>
                  Инженеров: <strong style={{ color:'var(--text-primary)' }}>{inheritedCount}</strong>
                  {totalCount > 0 && <span style={{ marginLeft:8, color:'var(--accent)', fontWeight:600 }}>+ {totalCount} доп.</span>}
                </div>
              </Card>
            )}

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
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {eng.name}
                        </div>
                        <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1, display:'flex', alignItems:'center', gap:4 }}>
                          {matchDir && <span style={{ fontSize:10, padding:'1px 5px', borderRadius:3, background:'var(--accent-bg)', color:'var(--accent)', fontWeight:600, flexShrink:0 }}>осн.</span>}
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eng.regularTask || '—'}</span>
                          {expStars > 0 && <span style={{ flexShrink:0, marginLeft:2 }}>{'★'.repeat(expStars)}{'☆'.repeat(5-expStars)}</span>}
                        </div>
                      </div>
                      <button onClick={()=>addEngineer(eng.id)} style={{ flexShrink:0, fontSize:12, color:'var(--accent)', border:'1.5px solid var(--accent)', padding:'5px 10px', borderRadius:4, background:'transparent', cursor:'pointer', fontWeight:500, whiteSpace:'nowrap' }}>Добавить ↗</button>
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
              {available.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </FormRow>
          <ModalFooter onCancel={()=>setShowAddEng(false)} onSave={()=>selectedEng&&addEngineer(selectedEng)} saveLabel="Добавить"/>
        </Modal>
      )}
    </div>
  );
}
