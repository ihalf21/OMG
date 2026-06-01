import React, { useState } from 'react';
import { Avatar, RoleBadge, StatusBadge, FieldRow, Card, PageTopbar, BackBtn, BtnPrimary, BtnSecondary, BtnDanger, Modal, ModalFooter, FormRow, Input, DateRangePicker, DatePicker, useConfirm } from '../components/UI';
import { formatDate, formatDateShort, todayStr, nextWorkday } from '../utils/dates';
import { REGULAR_TASKS } from '../domain/tasks';
import {
  updateEngineerProfile,
  setSickLeave, setSickLeaveFrom as setSickLeaveFromOp, clearSickLeave, setSickReturn as setSickReturnOp, cancelScheduledSickReturn as cancelSickReturnOp,
  setVacation as setVacationOp, cancelVacation as cancelVacationOp, endVacationEarly,
  setDayoff as setDayoffOp, cancelDayoff as cancelDayoffOp, endDayoffEarly,
  removeFromTask, switchToTask,
  deleteEngineer as deleteEngineerOp,
} from '../domain/engineer';
import type { EngineerRole, HistoryType } from '../domain/types';
import type { PageProps } from '../ui-types';

interface Props extends PageProps {
  engineerId: string;
  onBack: () => void;
}

interface EditForm {
  name: string;
  role: EngineerRole;
  regularTask: string;
}

const selectStyle: React.CSSProperties = { fontSize:13, border:'1.5px solid var(--border-mid)', borderRadius:4, padding:'4px 8px', background:'var(--bg-secondary)', color:'var(--text-primary)', width:'100%' };

export default function EngineerCard({ data, updateData, navigate, engineerId, onBack }: Props) {
  const { engineers, tasks, history } = data;
  const eng = engineers.find(e => e.id === engineerId);
  const [editMode, setEditMode]   = useState(false);
  const [editForm, setEditForm]   = useState<EditForm | null>(null);
  const [showVacation, setShowVacation] = useState(false);
  const [vacFrom, setVacFrom] = useState('');
  const [vacTo, setVacTo]     = useState('');
  const [showDayoff, setShowDayoff]   = useState(false);
  const [dayoffDate, setDayoffDate]   = useState('');
  const [showSwitchTask, setShowSwitchTask] = useState(false);
  const [showSickStart, setShowSickStart] = useState(false);
  const [sickStartDateInput, setSickStartDateInput] = useState('');
  const [showSickReturn, setShowSickReturn] = useState(false);
  const [sickReturnDateInput, setSickReturnDateInput] = useState('');
  const { confirm, ConfirmEl } = useConfirm();

  if (!eng) return <div style={{ padding:24 }}>Инженер не найден</div>;

  const currentTask = tasks.find(t => t.assignedEngineers?.includes(eng.id) && t.status === 'active');
  const engHistory  = history.filter(h => h.engineerId === eng.id).sort((a,b) => b.date.localeCompare(a.date));
  const switchCount = history.filter(h => h.engineerId === eng.id && h.type === 'switch').length;

  function startEdit() {
    setEditForm({
      name: eng!.name,
      role: eng!.role,
      regularTask: eng!.regularTask || '',
    });
    setEditMode(true);
  }

  function saveEdit() {
    if (!editForm) return;
    updateData(prev => updateEngineerProfile(prev, engineerId, {
      name: editForm.name,
      role: editForm.role,
      regularTask: editForm.regularTask || null,
    }));
    setEditMode(false);
  }

  function openSick()  { updateData(prev => setSickLeave(prev, engineerId)); }
  function closeSick() { updateData(prev => clearSickLeave(prev, engineerId)); }

  function handleSickStart() {
    const date = sickStartDateInput || todayStr();
    if (date > todayStr()) return;
    updateData(prev => setSickLeaveFromOp(prev, engineerId, date));
    setShowSickStart(false);
    setSickStartDateInput('');
  }

  function handleSickReturn() {
    const date = sickReturnDateInput || todayStr();
    updateData(prev => setSickReturnOp(prev, engineerId, date));
    setShowSickReturn(false);
    setSickReturnDateInput('');
  }

  function cancelSickReturn() {
    updateData(prev => cancelSickReturnOp(prev, engineerId));
  }

  async function addVacation() {
    if (!vacFrom || !vacTo || vacTo < vacFrom) return;
    if (vacTo < todayStr()) {
      const ok = await confirm(
        'Отпуск уже завершился',
        'Период отпуска в прошлом. Вы уверены, что хотите добавить его?',
        { confirmLabel: 'Добавить', danger: false }
      );
      if (!ok) return;
    }
    updateData(prev => setVacationOp(prev, engineerId, vacFrom, vacTo));
    setShowVacation(false);
  }

  function cancelVacation()     { updateData(prev => cancelVacationOp(prev, engineerId)); }
  function returnFromVacation() { updateData(prev => endVacationEarly(prev, engineerId)); }

  async function addDayoff() {
    if (!dayoffDate) return;
    if (dayoffDate < todayStr()) {
      const ok = await confirm(
        'Дейоф уже прошёл',
        'Выбранный день уже в прошлом. Добавить как исторический факт?',
        { confirmLabel: 'Добавить', danger: false }
      );
      if (!ok) return;
    }
    updateData(prev => setDayoffOp(prev, engineerId, dayoffDate));
    setShowDayoff(false);
  }

  function cancelDayoff()     { updateData(prev => cancelDayoffOp(prev, engineerId)); }
  function returnFromDayoff() { updateData(prev => endDayoffEarly(prev, engineerId)); }

  function returnHome() {
    updateData(prev => removeFromTask(prev, engineerId));
  }

  async function deleteEngineer() {
    const ok = await confirm(
      `Удалить ${eng!.name}?`,
      'Инженер будет удалён из системы и снят со всех задач. Это действие нельзя отменить.',
      { confirmLabel: 'Удалить', danger: true },
    );
    if (!ok) return;
    updateData(prev => deleteEngineerOp(prev, engineerId));
    onBack();
  }

  function switchTask(toTaskId: string) {
    updateData(prev => switchToTask(prev, engineerId, toTaskId));
    setShowSwitchTask(false);
  }

  const dotColors: Record<HistoryType, string> = {
    switch:'var(--blue)', return:'var(--success)', sick:'var(--red)', vacation:'var(--amber)', dayoff:'var(--blue)',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {ConfirmEl}
      <PageTopbar title={eng.name}>
        <BackBtn onClick={onBack} label="Команда"/>
        {!editMode ? (
          <>
            <BtnSecondary onClick={startEdit}>✏️ Редактировать</BtnSecondary>
            {eng.role !== 'lead' && <BtnDanger onClick={deleteEngineer}>Удалить</BtnDanger>}
          </>
        ) : (
          <>
            <BtnSecondary onClick={()=>setEditMode(false)}>Отмена</BtnSecondary>
            <BtnPrimary onClick={saveEdit}>💾 Сохранить</BtnPrimary>
          </>
        )}
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

          {/* LEFT */}
          <div>
            <Card style={{ marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
                <Avatar name={eng.name} size={56}/>
                <div style={{ flex:1 }}>
                  {editMode && editForm
                    ? <Input value={editForm.name} onChange={e=>setEditForm(f=>f?{...f, name:e.target.value}:f)} style={{ fontSize:17, fontWeight:600, marginBottom:8 }}/>
                    : <div style={{ fontSize:18, fontWeight:600 }}>{eng.name}</div>
                  }
                  <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                    {editMode && editForm
                      ? <select value={editForm.role} onChange={e=>setEditForm(f=>f?{...f, role: e.target.value as EngineerRole}:f)} style={{ ...selectStyle, width:'auto' }}>
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

              {(editMode && editForm ? editForm.role : eng.role) !== 'lead' && (
              <FieldRow label="Регулярная задача">
                {editMode && editForm
                  ? <select value={editForm.regularTask || ''} onChange={e=>setEditForm(f=>f?{...f, regularTask: e.target.value}:f)} style={{ ...selectStyle, width:'auto' }}>
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

              {eng.status === 'sick' && eng.sickReturnDate && eng.sickReturnDate > todayStr() && (
                <FieldRow label="Плановый выход">
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {formatDateShort(eng.sickReturnDate)}
                    <span
                      onClick={cancelSickReturn}
                      style={{ fontSize:11, color:'var(--text-tertiary)', cursor:'pointer', padding:'1px 5px', borderRadius:3, background:'var(--bg-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >× отменить</span>
                  </span>
                </FieldRow>
              )}
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
                    {eng.status==='active'   && <BtnSecondary onClick={() => { setSickStartDateInput(''); setShowSickStart(true); }} style={{ fontSize:13, padding:'6px 12px', color:'var(--red)', borderColor:'var(--red)' }}>🤒 Больничный</BtnSecondary>}
                    {eng.status==='sick'     && <BtnSecondary onClick={() => { setSickReturnDateInput(''); setShowSickReturn(true); }} style={{ fontSize:13, padding:'6px 12px', color:'var(--success)', borderColor:'var(--success)' }}>✓ Закрыть больничный</BtnSecondary>}
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
                  return (
                    <div key={h.id} style={{ position:'relative', paddingBottom:i<engHistory.length-1?16:0 }}>
                      {i<engHistory.length-1&&<div style={{ position:'absolute', left:-16, top:8, bottom:-8, width:1, background:'var(--border-light)' }}/>}
                      <div style={{ position:'absolute', left:-20, top:4, width:9, height:9, borderRadius:'50%', background:dotColors[h.type]||'var(--accent)', border:'2px solid var(--bg-primary)' }}/>
                      <div style={{ fontSize:14, color:'var(--text-primary)' }}>
                        {h.type==='switch'   &&<>Переключён {fromTask?`с «${fromTask.name}» `:''}{toTask?`→ «${toTask.name}»`:''}</>}
                        {h.type==='return'   &&(fromTask?<>Снят с задачи «{fromTask.name}»</>:<>{h.note||'Вышел на работу'}</>)}
                        {h.type==='sick'     &&<>Открыт больничный</>}
                        {h.type==='vacation' &&<>Отпуск</>}
                        {h.type==='dayoff'   &&<>Дейоф</>}
                      </div>
                      {h.note && !(h.type==='return' && !h.fromTask) && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{h.note}</div>}
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(h.date)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div>
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

      {showSickStart && (
        <Modal title="Открыть больничный" onClose={() => { setShowSickStart(false); setSickStartDateInput(''); }} width={400}>
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16, lineHeight:1.6 }}>
            По умолчанию — сегодня. Если инженер заболел раньше — выберите фактическую дату.
          </div>
          <FormRow label="Дата начала больничного">
            <DatePicker value={sickStartDateInput || todayStr()} onChange={setSickStartDateInput} placeholder="Выбрать дату" clearable={false}/>
          </FormRow>
          {(sickStartDateInput || todayStr()) < todayStr() && (
            <div style={{ fontSize:12, color:'var(--amber)', marginTop:-6, marginBottom:10 }}>
              Дата в прошлом — больничный будет учтён с {formatDateShort(sickStartDateInput || todayStr())}
            </div>
          )}
          {(sickStartDateInput || todayStr()) > todayStr() && (
            <div style={{ fontSize:12, color:'var(--red)', marginTop:-6, marginBottom:10 }}>
              Нельзя открыть больничный в будущем
            </div>
          )}
          <ModalFooter
            onCancel={() => { setShowSickStart(false); setSickStartDateInput(''); }}
            onSave={handleSickStart}
            saveLabel="Открыть больничный"
          />
        </Modal>
      )}

      {showSickReturn && (
        <Modal title="Выход с больничного" onClose={() => { setShowSickReturn(false); setSickReturnDateInput(''); }} width={400}>
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16, lineHeight:1.6 }}>
            По умолчанию — сегодня. Если инженер вышел раньше — выберите фактическую дату. Будущая дата учтётся в Ганте.
          </div>
          <FormRow label="Дата выхода">
            <DatePicker value={sickReturnDateInput || todayStr()} onChange={setSickReturnDateInput} placeholder="Выбрать дату" clearable={false}/>
          </FormRow>
          {(sickReturnDateInput || todayStr()) < todayStr() && (
            <div style={{ fontSize:12, color:'var(--amber)', marginTop:-6, marginBottom:10 }}>
              Дата в прошлом — больничный закроется задним числом
            </div>
          )}
          {(sickReturnDateInput || todayStr()) > todayStr() && (
            <div style={{ fontSize:12, color:'var(--accent)', marginTop:-6, marginBottom:10 }}>
              Плановый выход — инженер появится в планировании с {formatDateShort(sickReturnDateInput || todayStr())}
            </div>
          )}
          <ModalFooter
            onCancel={() => { setShowSickReturn(false); setSickReturnDateInput(''); }}
            onSave={handleSickReturn}
            saveLabel={(sickReturnDateInput || todayStr()) > todayStr() ? 'Запланировать' : 'Закрыть больничный'}
          />
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
