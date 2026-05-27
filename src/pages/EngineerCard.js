import React, { useState } from 'react';
import { Avatar, RoleBadge, StatusBadge, StarRating, FieldRow, Card, PageTopbar, BackBtn, BtnPrimary, BtnSecondary, Modal, ModalFooter, FormRow, Input, DateRangePicker, DatePicker, useConfirm } from '../components/UI';
import { formatDate, formatDateShort, todayStr, nextWorkday } from '../utils/dates';

const selectStyle = { fontSize:13, border:'1.5px solid var(--border-mid)', borderRadius:4, padding:'4px 8px', background:'var(--bg-secondary)', color:'var(--text-primary)', width:'100%' };

// Справочник регулярных задач
export const REGULAR_TASKS = [
  'Релиз', 'Регресс', 'Смоук', 'Синхронизация', 'Сверка', 'Приёмка', 'Спецзадачи',
];

export default function EngineerCard({ data, updateData, navigate, engineerId, onBack }) {
  const { engineers, tasks, history } = data;
  const eng = engineers.find(e => e.id === engineerId);
  const [editMode, setEditMode]   = useState(false);
  const [editForm, setEditForm]   = useState(null);
  const [showVacation, setShowVacation] = useState(false);
  const [vacFrom, setVacFrom] = useState('');
  const [vacTo, setVacTo]     = useState('');
  const [showDayoff, setShowDayoff]   = useState(false);
  const [dayoffDate, setDayoffDate]   = useState('');
  const [showSwitchTask, setShowSwitchTask] = useState(false);
  const { confirm, ConfirmEl } = useConfirm();

  if (!eng) return <div style={{ padding:24 }}>Инженер не найден</div>;

  const currentTask = tasks.find(t => t.assignedEngineers?.includes(eng.id) && t.status === 'active');
  const engHistory  = history.filter(h => h.engineerId === eng.id).sort((a,b) => b.date.localeCompare(a.date));
  const switchCount = history.filter(h => h.engineerId === eng.id && h.type === 'switch').length;

  // experience теперь хранится по именам регулярных задач
  const experience = editMode ? (editForm?.experience || {}) : (eng.experience || {});

  function startEdit() {
    setEditForm({
      name: eng.name,
      role: eng.role,
      regularTask: eng.regularTask || '',
      experience: { ...(eng.experience || {}) },
    });
    setEditMode(true);
  }

  function saveEdit() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id === engineerId
        ? { ...e, name: editForm.name, role: editForm.role, regularTask: editForm.regularTask || null, experience: editForm.experience }
        : e
      ),
    }));
    setEditMode(false);
  }

  function updateExp(taskName, stars) {
    if (!editMode) return;
    setEditForm(f => ({ ...f, experience: { ...f.experience, [taskName]: stars } }));
  }

  function openSick() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id===engineerId ? { ...e, status:'sick' } : e),
      tasks: prev.tasks.map(t => ({
        ...t,
        assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engineerId),
      })),
      history: [...prev.history, { id:'h'+Date.now(), date:todayStr(), engineerId, type:'sick', fromTask:currentTask?.id||null, toTask:null, note:'' }],
    }));
  }

  function closeSick() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id===engineerId ? { ...e, status:'active' } : e),
      history: [...prev.history, { id:'h'+Date.now(), date:todayStr(), engineerId, type:'return', fromTask:null, toTask:null, note:'Выход с больничного' }],
    }));
  }

  async function addVacation() {
    if (!vacFrom || !vacTo || vacTo < vacFrom) return;
    const today = todayStr();
    const isPast    = vacTo < today;
    const isOngoing = vacFrom <= today && vacTo >= today;

    if (isPast) {
      const ok = await confirm(
        'Отпуск уже завершился',
        'Период отпуска в прошлом. Вы уверены, что хотите добавить его?',
        { confirmLabel: 'Добавить', danger: false }
      );
      if (!ok) return;
    }

    updateData(prev => {
      const preVacTask = prev.tasks.find(t => t.assignedEngineers?.includes(engineerId) && t.status === 'active');
      const newHistory = [
        ...prev.history,
        { id:'h'+Date.now(), date:vacFrom, engineerId, type:'vacation', fromTask:preVacTask?.id||null, toTask:null, note:`Отпуск ${formatDateShort(vacFrom)} — ${formatDateShort(vacTo)}` },
      ];

      if (isPast) {
        // Снять со всех задач, вернуть на задачу до отпуска если она ещё активна
        let updatedTasks = prev.tasks.map(t => ({
          ...t,
          assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engineerId),
        }));
        if (preVacTask && updatedTasks.find(t => t.id === preVacTask.id)?.status === 'active') {
          updatedTasks = updatedTasks.map(t => t.id === preVacTask.id
            ? { ...t, assignedEngineers: [...(t.assignedEngineers||[]), engineerId] }
            : t
          );
          newHistory.push({ id:'h'+(Date.now()+1), date:vacTo, engineerId, type:'switch', fromTask:null, toTask:preVacTask.id, note:'Вернулся из отпуска' });
        }
        return {
          ...prev,
          engineers: prev.engineers.map(e => e.id===engineerId
            ? { ...e, status:'active', vacationFrom:null, vacationTo:null }
            : e
          ),
          tasks: updatedTasks,
          history: newHistory,
        };
      }

      // Текущий или будущий отпуск
      return {
        ...prev,
        engineers: prev.engineers.map(e => e.id===engineerId
          ? { ...e, status: isOngoing ? 'vacation' : e.status, vacationFrom:vacFrom, vacationTo:vacTo }
          : e
        ),
        // При текущем отпуске сразу снимаем с задачи
        tasks: isOngoing ? prev.tasks.map(t => ({
          ...t,
          assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engineerId),
        })) : prev.tasks,
        history: newHistory,
      };
    });
    setShowVacation(false);
  }

  function cancelVacation() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id===engineerId ? { ...e, vacationFrom:null, vacationTo:null } : e),
    }));
  }

  function returnFromVacation() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id===engineerId ? { ...e, status:'active', vacationFrom:null, vacationTo:null } : e),
    }));
  }

  async function addDayoff() {
    if (!dayoffDate) return;
    const today = todayStr();
    const isPast  = dayoffDate < today;
    const isToday = dayoffDate === today;

    if (isPast) {
      const ok = await confirm(
        'Дейоф уже прошёл',
        'Выбранный день уже в прошлом. Добавить как исторический факт?',
        { confirmLabel: 'Добавить', danger: false }
      );
      if (!ok) return;
    }

    updateData(prev => {
      const preTask = prev.tasks.find(t => t.assignedEngineers?.includes(engineerId) && t.status === 'active');
      const histEntry = {
        id: 'h' + Date.now(), date: dayoffDate, engineerId,
        type: 'dayoff', fromTask: preTask?.id || null, toTask: null,
        note: `Дейоф ${formatDateShort(dayoffDate)}`,
      };

      if (isToday) {
        return {
          ...prev,
          engineers: prev.engineers.map(e => e.id === engineerId ? { ...e, status: 'dayoff', dayoffDate } : e),
          tasks: prev.tasks.map(t => ({ ...t, assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId) })),
          history: [...prev.history, histEntry],
        };
      }
      if (isPast) {
        return {
          ...prev,
          engineers: prev.engineers.map(e => e.id === engineerId ? { ...e, dayoffDate: null } : e),
          history: [...prev.history, histEntry],
        };
      }
      // Будущий дейоф
      return {
        ...prev,
        engineers: prev.engineers.map(e => e.id === engineerId ? { ...e, dayoffDate } : e),
        history: [...prev.history, histEntry],
      };
    });
    setShowDayoff(false);
  }

  function cancelDayoff() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id === engineerId ? { ...e, dayoffDate: null } : e),
    }));
  }

  function returnFromDayoff() {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.map(e => e.id === engineerId ? { ...e, status: 'active', dayoffDate: null } : e),
      history: [...prev.history, { id: 'h' + Date.now(), date: todayStr(), engineerId, type: 'return', fromTask: null, toTask: null, note: 'Вернулся с дейофа' }],
    }));
  }

  function returnHome() {
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => ({
        ...t,
        assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engineerId),
      })),
      history: [...prev.history, { id:'h'+Date.now(), date:todayStr(), engineerId, type:'return', fromTask:currentTask?.id||null, toTask:null, note:'Снят с задачи' }],
    }));
  }

  function switchTask(toTaskId) {
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (currentTask && t.id === currentTask.id)
          return { ...t, assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engineerId) };
        if (t.id === toTaskId)
          return { ...t, assignedEngineers: [...(t.assignedEngineers||[]), engineerId] };
        return t;
      }),
      history: [...prev.history, { id:'h'+Date.now(), date:todayStr(), engineerId, type:'switch', fromTask:currentTask?.id||null, toTask:toTaskId, note:'' }],
    }));
    setShowSwitchTask(false);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {ConfirmEl}
      <PageTopbar title={eng.name}>
        <BackBtn onClick={onBack} label="Команда"/>
        {!editMode
          ? <BtnSecondary onClick={startEdit}>✏️ Редактировать</BtnSecondary>
          : <>
              <BtnSecondary onClick={()=>setEditMode(false)}>Отмена</BtnSecondary>
              <BtnPrimary onClick={saveEdit}>💾 Сохранить</BtnPrimary>
            </>
        }
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

          {/* LEFT */}
          <div>
            <Card style={{ marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
                <Avatar name={eng.name} size={56}/>
                <div style={{ flex:1 }}>
                  {editMode
                    ? <Input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} style={{ fontSize:17, fontWeight:600, marginBottom:8 }}/>
                    : <div style={{ fontSize:18, fontWeight:600 }}>{eng.name}</div>
                  }
                  <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                    {editMode
                      ? <select value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))} style={{ ...selectStyle, width:'auto' }}>
                          <option value="lead">Лид</option>
                          <option value="responsible">Ответственный</option>
                          <option value="engineer">Инженер</option>
                          <option value="intern">Стажёр</option>
                        </select>
                      : <RoleBadge role={eng.role}/>
                    }
                    <StatusBadge status={eng.status}/>
                    {currentTask && <span style={{ fontSize:12, padding:'3px 9px', borderRadius:4, background:'var(--blue-bg)', color:'var(--blue)', fontWeight:500 }}>На задаче</span>}
                  </div>
                </div>
              </div>

              {(editMode ? editForm.role : eng.role) !== 'lead' && (
              <FieldRow label="Регулярная задача">
                {editMode
                  ? <select value={editForm.regularTask||''} onChange={e=>setEditForm(f=>({...f,regularTask:e.target.value}))} style={{ ...selectStyle, width:'auto' }}>
                      <option value="">— не задана —</option>
                      {REGULAR_TASKS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  : <span style={{ color: eng.regularTask ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {eng.regularTask || '—'}
                    </span>
                }
              </FieldRow>
              )}

              <FieldRow label="Текущая задача">
                <span style={{ color:currentTask?'var(--blue)':'var(--text-tertiary)', cursor:currentTask?'pointer':'default' }}
                  onClick={()=>currentTask&&navigate('task',currentTask.id)}>
                  {currentTask?.name||'—'}
                </span>
              </FieldRow>

              {eng.vacationFrom && (
                <FieldRow label={eng.vacationFrom > todayStr() ? "Запланированный отпуск" : "Отпуск"}>
                  {formatDateShort(eng.vacationFrom)} — {formatDateShort(eng.vacationTo)}
                </FieldRow>
              )}
              {eng.dayoffDate && (
                <FieldRow label={eng.dayoffDate > todayStr() ? "Запланированный дейоф" : "Дейоф"}>
                  {formatDateShort(eng.dayoffDate)}
                </FieldRow>
              )}

              {!editMode && (
                <div style={{ borderTop:'0.5px solid var(--border-light)', paddingTop:14, marginTop:6 }}>
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:8, fontWeight:500 }}>Действия</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {currentTask && <BtnSecondary onClick={()=>setShowSwitchTask(true)} style={{ fontSize:13, padding:'6px 12px' }}>⇄ Переключить задачу</BtnSecondary>}
                    {currentTask && <BtnSecondary onClick={returnHome} style={{ fontSize:13, padding:'6px 12px' }}>↩ Снять с задачи</BtnSecondary>}
                    {eng.status==='active'   && <BtnSecondary onClick={openSick} style={{ fontSize:13, padding:'6px 12px', color:'var(--red)', borderColor:'var(--red)' }}>🤒 Больничный</BtnSecondary>}
                    {eng.status==='sick'     && <BtnSecondary onClick={closeSick} style={{ fontSize:13, padding:'6px 12px', color:'var(--success)', borderColor:'var(--success)' }}>✓ Закрыть больничный</BtnSecondary>}
                    {eng.status==='active' && !eng.vacationFrom && <BtnSecondary onClick={()=>{ setVacFrom(''); setVacTo(''); setShowVacation(true); }} style={{ fontSize:13, padding:'6px 12px', color:'var(--amber)', borderColor:'var(--amber)' }}>✈️ Отпуск</BtnSecondary>}
                    {(eng.status==='active'||eng.status==='sick') && eng.vacationFrom && <BtnSecondary onClick={cancelVacation} style={{ fontSize:13, padding:'6px 12px', color:'var(--amber)', borderColor:'var(--amber)' }}>✖ Отменить отпуск</BtnSecondary>}
                    {eng.status==='vacation' && <BtnSecondary onClick={returnFromVacation} style={{ fontSize:13, padding:'6px 12px', color:'var(--success)', borderColor:'var(--success)' }}>✓ Вернуть из отпуска</BtnSecondary>}
                    {eng.status==='active' && !eng.dayoffDate && <BtnSecondary onClick={()=>{ setDayoffDate(''); setShowDayoff(true); }} style={{ fontSize:13, padding:'6px 12px', color:'var(--blue)', borderColor:'var(--blue)' }}>🏖️ Дейоф</BtnSecondary>}
                    {eng.status==='active' && eng.dayoffDate && <BtnSecondary onClick={cancelDayoff} style={{ fontSize:13, padding:'6px 12px', color:'var(--blue)', borderColor:'var(--blue)' }}>✖ Отменить дейоф</BtnSecondary>}
                    {eng.status==='dayoff' && <BtnSecondary onClick={returnFromDayoff} style={{ fontSize:13, padding:'6px 12px', color:'var(--success)', borderColor:'var(--success)' }}>✓ Вернуть с дейофа</BtnSecondary>}
                  </div>
                </div>
              )}
            </Card>

            {/* History */}
            <Card>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>История занятости</div>
              {engHistory.length===0 && <div style={{ fontSize:14, color:'var(--text-tertiary)' }}>Нет событий</div>}
              <div style={{ paddingLeft:20 }}>
                {engHistory.map((h,i) => {
                  const fromTask = tasks.find(t=>t.id===h.fromTask);
                  const toTask   = tasks.find(t=>t.id===h.toTask);
                  const dotColors = { switch:'var(--blue)', return:'var(--success)', sick:'var(--red)', vacation:'var(--amber)', dayoff:'var(--blue)' };
                  return (
                    <div key={h.id} style={{ position:'relative', paddingBottom:i<engHistory.length-1?16:0 }}>
                      {i<engHistory.length-1&&<div style={{ position:'absolute', left:-16, top:8, bottom:-8, width:1, background:'var(--border-light)' }}/>}
                      <div style={{ position:'absolute', left:-20, top:4, width:9, height:9, borderRadius:'50%', background:dotColors[h.type]||'var(--accent)', border:'2px solid var(--bg-primary)' }}/>
                      <div style={{ fontSize:14, color:'var(--text-primary)' }}>
                        {h.type==='switch'   &&<>Переключён {fromTask?`с «${fromTask.name}» `:''}{toTask?`→ «${toTask.name}»`:''}</>}
                        {h.type==='return'   &&<>Снят с задачи {fromTask?`«${fromTask.name}»`:''}</>}
                        {h.type==='sick'     &&<>Открыт больничный</>}
                        {h.type==='vacation' &&<>Отпуск</>}
                        {h.type==='dayoff'   &&<>Дейоф</>}
                      </div>
                      {h.note&&<div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{h.note}</div>}
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(h.date)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div>
            {(editMode ? editForm?.role : eng.role) !== 'lead' && (
              <Card style={{ marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text-tertiary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Матрица опыта</div>
                {!editMode && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:12 }}>Нажмите «Редактировать» для изменения</div>}
                {editMode  && <div style={{ fontSize:12, color:'var(--accent)', marginBottom:12, fontWeight:500 }}>✏️ Кликайте по звёздам</div>}
                {REGULAR_TASKS.map(taskName => {
                  const val = experience[taskName] || 0;
                  return (
                    <div key={taskName} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderBottom:'0.5px solid var(--border-light)', gap:8 }}>
                      <div style={{ flex:1, fontSize:14, color:'var(--text-primary)', fontWeight: eng.regularTask===taskName ? 600 : 400 }}>
                        {taskName}
                        {eng.regularTask===taskName && <span style={{ fontSize:11, marginLeft:6, color:'var(--accent)' }}>● основная</span>}
                      </div>
                      <StarRating value={val} max={5} readonly={!editMode} onChange={stars=>updateExp(taskName, stars)}/>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Статистика</div>
              <FieldRow label="Переключений">{switchCount}</FieldRow>
              <FieldRow label="Статус"><StatusBadge status={eng.status}/></FieldRow>
              <FieldRow label="Роль"><RoleBadge role={eng.role}/></FieldRow>
            </Card>
          </div>
        </div>
      </div>

      {showSwitchTask && (() => {
        const availTasks = tasks.filter(t => t.status === 'active' && t.id !== currentTask?.id);
        return (
          <Modal title="Переключить на задачу" onClose={()=>setShowSwitchTask(false)} width={460}>
            {availTasks.length === 0
              ? <div style={{ fontSize:14, color:'var(--text-tertiary)', padding:'8px 0' }}>Нет других активных задач</div>
              : <div>
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:12 }}>
                    {currentTask ? <>Текущая задача: <strong style={{ color:'var(--text-primary)' }}>{currentTask.name}</strong></> : 'Инженер не назначен ни на одну задачу'}
                  </div>
                  {availTasks.map(t => (
                    <div key={t.id} onClick={()=>switchTask(t.id)}
                      style={{ padding:'12px 14px', marginBottom:8, borderRadius:8, border:'1.5px solid var(--border-light)', cursor:'pointer', transition:'all 0.12s' }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.background='var(--accent-bg)'; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border-light)'; e.currentTarget.style.background=''; }}
                    >
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{t.name}</div>
                      {t.direction && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{t.direction}</div>}
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>
                        {(t.assignedEngineers||[]).length} инж.
                        {t.deadline ? ` · до ${formatDateShort(t.deadline)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
            }
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
              <BtnSecondary onClick={()=>setShowSwitchTask(false)}>Отмена</BtnSecondary>
            </div>
          </Modal>
        );
      })()}

      {showDayoff && (
        <Modal title="Дейоф" onClose={()=>setShowDayoff(false)} width={400}>
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14, lineHeight:1.6 }}>
            Оплачиваемый выходной на один день. Инженер будет недоступен в выбранный день и автоматически вернётся на следующий рабочий день.
          </div>
          <FormRow label="День дейофа">
            <DatePicker value={dayoffDate} onChange={setDayoffDate} placeholder="Выбрать день" clearable={false}/>
          </FormRow>
          {dayoffDate && (
            <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:4 }}>
              Возврат: {formatDateShort(nextWorkday(dayoffDate))}
            </div>
          )}
          {dayoffDate && dayoffDate < todayStr() && (
            <div style={{ fontSize:13, color:'var(--amber)', marginTop:8 }}>
              Дейоф уже прошёл — будет зафиксирован как исторический факт
            </div>
          )}
          <ModalFooter onCancel={()=>setShowDayoff(false)} onSave={addDayoff} saveLabel="Сохранить"/>
        </Modal>
      )}

      {showVacation && (
        <Modal title="Отпуск" onClose={()=>setShowVacation(false)} width={520}>
          <DateRangePicker
            from={vacFrom} to={vacTo}
            onChange={(f, t) => { setVacFrom(f); setVacTo(t); }}
          />
          {vacFrom && vacTo && vacTo < todayStr() && (
            <div style={{ fontSize:13, color:'var(--amber)', marginTop:10 }}>
              Отпуск уже завершился — будет зафиксирован как исторический факт
            </div>
          )}
          <ModalFooter onCancel={()=>setShowVacation(false)} onSave={addVacation} saveLabel="Сохранить"/>
        </Modal>
      )}
    </div>
  );
}
