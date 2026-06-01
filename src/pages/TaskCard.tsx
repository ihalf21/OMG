import React, { useState } from 'react';
import { calcForecast, calcPhaseInfo, statusColor, statusLabel, statusBadgeStyle, fmtHours, getDerivedDeadline } from '../utils/forecast';
import { isAvailableToday, isWorkingRole } from '../domain/availability';
import {
  getEffectiveTeam,
  addEngineerToTask, removeEngineerFromTask, getEngineerActiveTasks,
  unlinkChild as unlinkChildOp,
  completeTask as completeTaskOp, reopenTask as reopenTaskOp, archiveTask as archiveTaskOp,
} from '../domain/task';
import { formatDate, formatDateShort, todayStr } from '../utils/dates';
import { genId } from '../utils/ids';
import { Avatar, ProgressBar, Card, PageTopbar, BackBtn, BtnSecondary, BtnPrimary, BtnDanger, FieldRow, Modal, Select, ModalFooter, FormRow, Input, DatePicker, useConfirm } from '../components/UI';
import type { Task, ExtraWorkEntry, HistoryType } from '../domain/types';
import type { PageProps } from '../ui-types';

interface Props extends PageProps {
  taskId: string;
  onBack: () => void;
}

interface EditForm {
  name: string;
  direction: string;
  estimateHours: string | number;
  startDate: string;
  deadline: string;
  dependsOn: string;
  newChildId: string;
  link: string;
}

type CompleteMode = 'today' | 'custom';

export default function TaskCard({ data, updateData, navigate, taskId, onBack }: Props) {
  const { engineers, tasks, history } = data;
  const task = tasks.find(t => t.id === taskId);
  const [editMode, setEditMode]     = useState(false);
  const [editForm, setEditForm]     = useState<EditForm | null>(null);
  const [showAddEng, setShowAddEng] = useState(false);
  const [selectedEng, setSelectedEng] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [completeDateMode, setCompleteDateMode] = useState<CompleteMode>('today');
  const [completeCustomDate, setCompleteCustomDate] = useState('');
  const { confirm, ConfirmEl } = useConfirm();
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraForm, setExtraForm] = useState({ title: '', date: todayStr(), note: '' });

  if (!task) return <div style={{ padding:24 }}>Задача не найдена</div>;

  const activeTasks = tasks.filter(t => t.status === 'active');
  const currentChild = tasks.find(t => t.dependsOn === taskId && t.status === 'active');
  const effectiveDl = task.deadline || getDerivedDeadline(task, activeTasks, engineers) || null;
  const fc        = calcForecast(task, engineers, effectiveDl);
  const barColor  = statusColor(fc?.deadlineStatus);
  const bs        = statusBadgeStyle(fc?.deadlineStatus);
  const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
  const taskHistory  = history.filter(h => h.fromTask===taskId||h.toTask===taskId).sort((a,b)=>b.date.localeCompare(a.date));
  const available    = engineers.filter(e => isWorkingRole(e) && !task.assignedEngineers?.includes(e.id) && isAvailableToday(e));
  const recommended = [...available]
    .sort((a, b) => {
      const aM = !!(task.direction && a.regularTask === task.direction);
      const bM = !!(task.direction && b.regularTask === task.direction);
      return (bM ? 1 : 0) - (aM ? 1 : 0);
    })
    .slice(0, 4);

  function startEdit() {
    setEditForm({
      name: task!.name, direction: task!.direction || '',
      estimateHours: task!.estimateHours || '',
      startDate: task!.startDate || '', deadline: task!.deadline || '',
      dependsOn:  task!.dependsOn || '',
      newChildId: '',
      link: task!.link || '',
    });
    setEditMode(true);
  }

  function saveEdit() {
    if (!editForm) return;
    updateData(prev => {
      let effectiveDependsOn: string | null = editForm.dependsOn || null;
      if (editForm.newChildId && !effectiveDependsOn) {
        const selectedChild = prev.tasks.find(t => t.id === editForm.newChildId);
        if (selectedChild?.dependsOn) effectiveDependsOn = selectedChild.dependsOn;
      }

      const newTasks: Task[] = prev.tasks.map(t => {
        if (t.id === taskId) return {
          ...t,
          name: editForm.name, direction: editForm.direction || null,
          estimateHours: parseInt(String(editForm.estimateHours)) > 0 ? parseInt(String(editForm.estimateHours)) : null,
          startDate: effectiveDependsOn ? null : (editForm.startDate || null),
          deadline: editForm.deadline || null,
          dependsOn: effectiveDependsOn,
          link: editForm.link || undefined,
        };
        if (editForm.newChildId && t.id === editForm.newChildId) {
          return { ...t, dependsOn: taskId, startDate: null };
        }
        // Если у нового родителя уже была дочерняя задача — перевязываем её на текущую
        if (
          effectiveDependsOn &&
          t.status === 'active' &&
          t.dependsOn === effectiveDependsOn &&
          t.id !== taskId &&
          t.id !== editForm.newChildId
        ) {
          return { ...t, dependsOn: taskId };
        }
        return t;
      });

      return { ...prev, tasks: newTasks };
    });
    setEditMode(false);
  }

  function unlinkChild(childId: string) { updateData(prev => unlinkChildOp(prev, childId)); }
  async function addEngineer(engId: string) {
    if (!engineers.find(e => e.id === engId)) return;

    const newStart = task!.startDate || todayStr();
    const newFc    = calcForecast(task!, engineers);
    const newEnd   = newFc.forecastDate || task!.deadline || null;

    // Ищем задачи инженера, чьи периоды пересекаются с новой
    const otherTasks = getEngineerActiveTasks(data, engId, taskId);
    const conflicting = otherTasks.filter(ct => {
      const ctFc  = calcForecast(ct, engineers);
      const ctEnd = ctFc.forecastDate || ct.deadline || null;
      if (!ctEnd) return true;                          // задача без конца — всегда конфликт
      if (!newEnd) return ctEnd >= newStart;            // новая без конца
      return ctEnd >= newStart && (ct.startDate || todayStr()) <= newEnd;
    });

    if (conflicting.length === 0) {
      // Периоды не пересекаются — планирование, оставляем на текущих задачах
      updateData(prev => addEngineerToTask(prev, taskId, engId, false));
      setShowAddEng(false);
      return;
    }

    // Есть конфликт — нужно подтверждение и перевод
    const ct       = conflicting[0];
    const ctFc     = calcForecast(ct, engineers);
    const ctEnd    = ctFc.forecastDate || ct.deadline || null;
    const isOverdue = !!(ct.deadline && todayStr() > ct.deadline);

    const title = isOverdue ? 'Задача инженера просрочена' : 'Конфликт планирования';
    const msg   = isOverdue
      ? `«${ct.name}» вышла за рамки дедлайна. Инженер будет переведён — разрешите просроченную задачу вручную.`
      : `Инженер уже задействован на «${ct.name}» (до ${formatDateShort(ctEnd)}). Снять с этой задачи и назначить на текущую?`;

    const ok = await confirm(title, msg, { confirmLabel: 'Перевести', danger: false });
    if (!ok) { setShowAddEng(false); return; }

    updateData(prev => addEngineerToTask(prev, taskId, engId, true)); // перевод со снятием
    setShowAddEng(false);
  }
  function removeEngineer(engId: string) { updateData(prev => removeEngineerFromTask(prev, taskId, engId)); }

  const totalCount = assignedEngs.length;
  const phaseInfo  = calcPhaseInfo(task, engineers);

  const parentTask      = task.dependsOn ? tasks.find(t => t.id === task.dependsOn) : null;
  const inheritedEngIds = parentTask ? getEffectiveTeam(parentTask, tasks) : [];
  const inheritedEngs   = inheritedEngIds.map(id => engineers.find(e => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  const inheritedCount  = inheritedEngs.length;

  function completeTask(date: string) {
    updateData(prev => completeTaskOp(prev, taskId, date));
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
    updateData(prev => reopenTaskOp(prev, taskId));
  }

  function addExtraWork() {
    if (!extraForm.title.trim()) return;
    const entry: ExtraWorkEntry = { id: genId('ew'), date: extraForm.date, title: extraForm.title.trim(), note: extraForm.note.trim() || undefined };
    updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, extraWork: [...(t.extraWork || []), entry] } : t) }));
    setShowExtraForm(false);
    setExtraForm({ title: '', date: todayStr(), note: '' });
  }

  function removeExtraWork(ewId: string) {
    updateData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, extraWork: (t.extraWork || []).filter(e => e.id !== ewId) } : t) }));
  }

  async function archiveTask() {
    const ok = await confirm(
      `Удалить задачу «${task!.name}»?`,
      'Задача будет перемещена в архив. Её можно будет восстановить в разделе «Задачи» → «Архив».',
      { confirmLabel: 'Удалить' }
    );
    if (!ok) return;
    updateData(prev => archiveTaskOp(prev, taskId));
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
              {editMode && editForm ? (
                <>
                  <FormRow label="Название"><Input value={editForm.name} onChange={e=>setEditForm(f=>f?{...f, name:e.target.value}:f)}/></FormRow>
                  <FormRow label="Ссылка"><Input value={editForm.link} onChange={e=>setEditForm(f=>f?{...f, link:e.target.value}:f)} placeholder="https://..."/></FormRow>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <FormRow label="Направление">
                      <Select value={editForm.direction||''} onChange={e=>setEditForm(f=>f?{...f, direction:e.target.value}:f)}>
                        <option value="">— не задано —</option>
                        {(data.directions ?? []).length === 0
                          ? <option value="" disabled>Настройте направления в карточке проекта</option>
                          : (data.directions ?? []).map(t=><option key={t} value={t}>{t}</option>)
                        }
                      </Select>
                    </FormRow>
                    <FormRow label="Оценка (чч)" hint="человеко-часы">
                      <Input type="number" value={editForm.estimateHours} onChange={e=>setEditForm(f=>f?{...f, estimateHours:e.target.value}:f)}/>
                    </FormRow>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {!editForm.dependsOn ? (
                      <FormRow label="Дата старта">
                        <DatePicker value={editForm.startDate} onChange={v => setEditForm(f=>f?{...f, startDate:v}:f)} placeholder="Не задана"/>
                      </FormRow>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Дата старта</span>
                        <span style={{ fontSize:13, color:'var(--text-tertiary)', padding:'7px 0' }}>от родительской задачи</span>
                      </div>
                    )}
                    <FormRow label="Дедлайн">
                      <DatePicker value={editForm.deadline} onChange={v => setEditForm(f=>f?{...f, deadline:v}:f)} placeholder="Без дедлайна"/>
                    </FormRow>
                  </div>
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
                          <button type="button" onClick={()=>setEditForm(f=>f?{...f, dependsOn:''}:f)}
                            style={{ fontSize:11, color:'var(--red)', border:'1px solid var(--red)', borderRadius:4, padding:'3px 8px', background:'transparent', cursor:'pointer' }}>
                            Убрать
                          </button>
                        </div>
                      ) : (
                        <Select value={editForm.dependsOn||''} onChange={e=>setEditForm(f=>f?{...f, dependsOn:e.target.value}:f)}>
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
                        <Select value={editForm.newChildId||''} onChange={e=>setEditForm(f=>f?{...f, newChildId:e.target.value}:f)}>
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
                        if (!oldParent || !sel) return null;
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

                </>
              ) : (
                <>
                  <FieldRow label="Направление"><span style={{ fontSize:13, fontWeight:500, color:'var(--accent)' }}>{task.direction||'—'}</span></FieldRow>
                  {task.link && (
                    <FieldRow label="Ссылка">
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:500, color:'var(--accent)', background:'var(--accent-bg)', border:'1.5px solid var(--accent)', borderRadius:6, padding:'4px 10px', textDecoration:'none', cursor:'pointer' }}
                      >
                        <span>↗</span>
                        <span style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {(() => { try { const p = new URL(task.link).pathname.split('/').filter(Boolean); return p[p.length - 1] || new URL(task.link).hostname; } catch { return task.link; } })()}
                        </span>
                      </a>
                    </FieldRow>
                  )}
                  <FieldRow label="Статус">
                    <span style={{ fontSize:12, padding:'3px 9px', borderRadius:4, fontWeight:500, ...bs }}>
                      {task.status==='done'?'Завершена':statusLabel(fc?.deadlineStatus)}
                    </span>
                  </FieldRow>
                  <FieldRow label="Дата старта">{formatDate(task.startDate)}</FieldRow>
                  <FieldRow label="Дедлайн">{task.deadline?<span style={{ color:'var(--red)', fontWeight:600 }}>{formatDate(task.deadline)}</span>:'—'}</FieldRow>
                  <FieldRow label="Итоговая оценка">
                    {task.estimateForm
                      ? <strong
                          onClick={() => navigate('estimate', task.id)}
                          style={{ color:'var(--accent)', cursor:'pointer', textDecoration:'underline dotted' }}
                          title="Открыть в калькуляторе"
                        >{fmtHours(task.estimateHours)}</strong>
                      : <strong>{fmtHours(task.estimateHours)}</strong>
                    }
                  </FieldRow>
                  {task.dependsOn && (() => {
                    const parent = tasks.find(t=>t.id===task.dependsOn);
                    return parent ? (
                      <FieldRow label="Зависит от">
                        <span style={{ fontSize:13, color:'var(--accent)', fontWeight:500, cursor:'pointer' }}
                          onClick={()=>navigate('task', parent.id)}>
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

                  <ProgressBar pct={phaseInfo ? phaseInfo.overallPct : (fc?.progressPct||0)} color={barColor} height={7}/>
                  <div style={{ fontSize:12, color:'var(--text-tertiary)', display:'flex', justifyContent:'space-between', marginTop:5, marginBottom: phaseInfo ? 14 : 0 }}>
                    <span>Автоматический расчёт</span>
                    <span style={{ fontWeight:600 }}>{phaseInfo ? phaseInfo.overallPct : (fc?.progressPct||0)}%</span>
                  </div>

                  {/* Фазы (только если оценка из калькулятора) */}
                  {phaseInfo && (() => {
                    const curIdx = phaseInfo.phases.findIndex(ph => ph.id === phaseInfo.phase);
                    return (
                      <>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 }}>
                          {phaseInfo.phases.map((ph, i) => {
                            const isPast    = i < curIdx;
                            const isCurrent = ph.id === phaseInfo.phase;
                            return (
                              <div key={ph.id} style={{
                                padding:'4px 10px', borderRadius:6, fontSize:12, fontWeight: isCurrent ? 700 : 500,
                                background: isPast ? 'var(--success-bg)' : isCurrent ? 'var(--accent-bg)' : 'var(--bg-secondary)',
                                color: isPast ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--text-tertiary)',
                                border: `1px solid ${isPast ? 'transparent' : isCurrent ? 'var(--accent)' : 'var(--border-light)'}`,
                                display:'flex', alignItems:'center', gap:4,
                              }}>
                                {isPast && '✓ '}{isCurrent && '▶ '}
                                {ph.label}
                                {isCurrent && ` · ${phaseInfo.phasePct}%`}
                              </div>
                            );
                          })}
                        </div>

                        {phaseInfo.phase === 'test_run' && phaseInfo.expectedTests !== null && (
                          <div style={{ padding:'12px 14px', background:'var(--accent-bg)', borderRadius:8, border:'1px solid var(--accent)', marginBottom:12 }}>
                            <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>По оценке к данному моменту</div>
                            <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                              <span style={{ fontSize:24, fontWeight:700, color:'var(--accent)' }}>{phaseInfo.expectedTests}</span>
                              <span style={{ fontSize:14, color:'var(--text-secondary)' }}>/ {phaseInfo.totalTests} ТК</span>
                            </div>
                            <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:4 }}>Сравни с TMS — если факт меньше, прогноз по срокам оптимистичный</div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div style={{ marginTop: phaseInfo ? 0 : 12, background:'var(--bg-secondary)', borderRadius:8, padding:'12px 14px' }}>
                    {([
                      ['Осталось работы', fmtHours(fc?.hoursLeft), false],
                      ['Рабочих дней до конца', fc?.daysLeft??'—', false],
                      ['Расчётная дата завершения', fc?.forecastDate?formatDateShort(fc.forecastDate):'—', fc?.deadlineStatus==='overdue'],
                      ['Инженеров на задаче', Math.round(fc?.capacity??0), false],
                    ] as const).map(([label,val,warn]) => (
                      <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:14, padding:'4px 0' }}>
                        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontWeight:600, color:warn?'var(--red)':'var(--text-primary)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Дополнительная нагрузка</div>
                  {(task.extraWork || []).length === 0 && !showExtraForm && (
                    <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:10 }}>Нет записей</div>
                  )}
                  {(task.extraWork || []).sort((a,b) => b.date.localeCompare(a.date)).map(ew => (
                    <div key={ew.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'0.5px solid var(--border-light)', alignItems:'flex-start' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>{ew.title}</div>
                        {ew.note && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{ew.note}</div>}
                        <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(ew.date)}</div>
                      </div>
                      <button onClick={() => removeExtraWork(ew.id)} style={{ fontSize:16, lineHeight:1, color:'var(--text-tertiary)', border:'none', background:'transparent', cursor:'pointer', padding:'2px 4px', flexShrink:0 }}>×</button>
                    </div>
                  ))}
                  {showExtraForm ? (
                    <div style={{ marginTop:8, padding:'12px', background:'var(--bg-secondary)', borderRadius:8 }}>
                      <FormRow label="Описание">
                        <Input value={extraForm.title} onChange={e => setExtraForm(f=>({...f, title:e.target.value}))} placeholder="напр. Повторный ретест"/>
                      </FormRow>
                      <FormRow label="Дата">
                        <DatePicker value={extraForm.date} onChange={v => setExtraForm(f=>({...f, date:v}))} clearable={false}/>
                      </FormRow>
                      <FormRow label="Комментарий">
                        <Input value={extraForm.note} onChange={e => setExtraForm(f=>({...f, note:e.target.value}))} placeholder="необязательно"/>
                      </FormRow>
                      <div style={{ display:'flex', gap:8, marginTop:8 }}>
                        <BtnSecondary onClick={() => setShowExtraForm(false)}>Отмена</BtnSecondary>
                        <BtnPrimary onClick={addExtraWork}>Добавить</BtnPrimary>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop:(task.extraWork||[]).length > 0 ? 10 : 0 }}>
                      <BtnSecondary onClick={() => { setExtraForm({ title:'', date:todayStr(), note:'' }); setShowExtraForm(true); }} style={{ width:'100%', justifyContent:'center', fontSize:13 }}>+ Добавить</BtnSecondary>
                    </div>
                  )}
                </Card>

                <Card>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>История изменений</div>
                  {(() => {
                    const dotColors: Record<HistoryType, string> = {
                      switch: 'var(--blue)', return: 'var(--success)', sick: 'var(--red)', vacation: 'var(--amber)', dayoff: 'var(--blue)',
                    };
                    type TLItem =
                      | { kind: 'history'; date: string; key: string }
                      | { kind: 'extra';   date: string; key: string };
                    const timeline: TLItem[] = [
                      ...taskHistory.map(h => ({ kind: 'history' as const, date: h.date, key: h.id })),
                      ...(task.extraWork || []).map(e => ({ kind: 'extra' as const, date: e.date, key: e.id })),
                    ].sort((a, b) => b.date.localeCompare(a.date));

                    if (timeline.length === 0) return <div style={{ fontSize:14, color:'var(--text-tertiary)' }}>Нет событий</div>;

                    return (
                      <div style={{ paddingLeft:20 }}>
                        {timeline.map((item, i) => {
                          const isLast = i === timeline.length - 1;
                          if (item.kind === 'history') {
                            const h = taskHistory.find(x => x.id === item.key)!;
                            const eng = engineers.find(e => e.id === h.engineerId);
                            const ft  = tasks.find(t => t.id === h.fromTask);
                            const tt  = tasks.find(t => t.id === h.toTask);
                            return (
                              <div key={h.id} style={{ position:'relative', paddingBottom: isLast ? 0 : 14 }}>
                                {!isLast && <div style={{ position:'absolute', left:-16, top:8, bottom:-6, width:1, background:'var(--border-light)' }}/>}
                                <div style={{ position:'absolute', left:-20, top:4, width:9, height:9, borderRadius:'50%', background:dotColors[h.type]||'var(--accent)', border:'2px solid var(--bg-primary)' }}/>
                                <div style={{ fontSize:14 }}>
                                  <strong>{eng?.name||'—'}</strong>
                                  {h.type==='switch'&&<> переключён {ft?`с «${ft.name}»`:''}</>}
                                  {h.type==='return'&&<> возвращён {tt?`на «${tt.name}»`:'на домашнюю'}</>}
                                </div>
                                {h.note && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{h.note}</div>}
                                <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(h.date)}</div>
                              </div>
                            );
                          }
                          const ew = (task.extraWork || []).find(x => x.id === item.key)!;
                          return (
                            <div key={ew.id} style={{ position:'relative', paddingBottom: isLast ? 0 : 14 }}>
                              {!isLast && <div style={{ position:'absolute', left:-16, top:8, bottom:-6, width:1, background:'var(--border-light)' }}/>}
                              <div style={{ position:'absolute', left:-20, top:4, width:9, height:9, borderRadius:'50%', background:'var(--violet)', border:'2px solid var(--bg-primary)' }}/>
                              <div style={{ fontSize:14, fontWeight:500 }}>{ew.title}</div>
                              {ew.note && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{ew.note}</div>}
                              <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{formatDate(ew.date)}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Card>
              </>
            )}
          </div>

          {/* RIGHT */}
          <div>
            <Card style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.05em' }}>Команда на задаче</div>
              {assignedEngs.map(eng => (
                <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                  <Avatar name={eng.name} size={32}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--blue)' }} onClick={()=>navigate('engineer',eng.id)}>{eng.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>{eng.regularTask||'—'}</div>
                  </div>
                  <button onClick={()=>removeEngineer(eng.id)} style={{ fontSize:12, color:'var(--accent)', border:'1.5px solid var(--accent)', padding:'4px 10px', borderRadius:4, background:'transparent', cursor:'pointer', fontWeight:500 }}>↩ Снять</button>
                </div>
              ))}
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
                    onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}
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
                  const matchDir = !!(task.direction && eng.regularTask === task.direction);
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
