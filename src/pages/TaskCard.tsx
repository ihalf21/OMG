import React, { useState } from 'react';
import { calcForecast, calcPhaseInfo, computeUsedHours, statusColor, statusLabel, statusBadgeStyle, fmtHours, getDerivedDeadline } from '../utils/forecast';
import { isAvailableToday, isWorkingRole } from '../domain/availability';
import {
  getEffectiveTeam,
  getAvailableTeamMembers,
  addEngineerToTask, removeEngineerFromTask, getEngineerActiveTasks,
  unlinkChild as unlinkChildOp,
  completeTask as completeTaskOp, reopenTask as reopenTaskOp, archiveTask as archiveTaskOp,
} from '../domain/task';
import { formatDate, formatDateShort, todayStr } from '../utils/dates';
import { genId } from '../utils/ids';
import { computeTaskStageProgress, normalizeTaskStages, taskEstimateHours, taskStagesTotal } from '../domain/stages';
import { Avatar, ProgressBar, Card, PageTopbar, BackBtn, BtnSecondary, BtnPrimary, BtnDanger, FieldRow, Modal, Select, ModalFooter, FormRow, Input, DatePicker, useConfirm, useDaySplit, DaySplitButtons, hoursToFraction } from '../components/UI';
import type { Task, TaskStage, ExtraWorkEntry, HistoryType } from '../domain/types';
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
  testOpsUrl: string;
  workDocUrl: string;
  stages: TaskStage[];
}

type CompleteMode = 'today' | 'custom';

function externalLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || parsed.hostname;
  } catch {
    return url;
  }
}

function TaskExternalLink({ label, url, showValue = true }: { label: string; url?: string; showValue?: boolean }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontWeight:500, color:'var(--accent)', background:'var(--accent-bg)', border:'1.5px solid var(--accent)', borderRadius:6, padding:'4px 8px', textDecoration:'none', cursor:'pointer', maxWidth:'100%', flexShrink:0, whiteSpace:'nowrap' }}
      title={url}
    >
      <span>↗</span>
      <span style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {showValue ? `${label} ${externalLinkLabel(url)}` : label}
      </span>
    </a>
  );
}

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
  const [completeHours, setCompleteHours] = useState(0); // часов сегодня на завершаемой задаче (для дробного дня)
  const { confirm, ConfirmEl } = useConfirm();
  const { askDaySplit, DaySplitEl } = useDaySplit();
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraForm, setExtraForm] = useState({ title: '', date: todayStr(), note: '' });

  if (!task) return <div style={{ padding:24 }}>Задача не найдена</div>;

  const activeTasks = tasks.filter(t => t.status === 'active');
  const currentChild = tasks.find(t => t.dependsOn === taskId && t.status === 'active');
  const effectiveDl = task.deadline || getDerivedDeadline(task, activeTasks, engineers) || null;
  const fc        = calcForecast(task, engineers, effectiveDl, null, history);
  const barColor  = statusColor(fc?.deadlineStatus);
  const bs        = statusBadgeStyle(fc?.deadlineStatus);
  const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
  const availableAssignedEngs = getAvailableTeamMembers(task.assignedEngineers || [], engineers, todayStr());
  const taskHistory  = history.filter(h => h.fromTask===taskId||h.toTask===taskId).sort((a,b)=>b.date.localeCompare(a.date));
  const available    = engineers.filter(e => isWorkingRole(e) && !task.assignedEngineers?.includes(e.id) && isAvailableToday(e));
  const isEngFree = (eng: typeof engineers[number]) =>
    isAvailableToday(eng) && !tasks.some(t => t.status === 'active' && t.id !== taskId && (t.assignedEngineers || []).includes(eng.id));
  const recommended = engineers
    .filter(e => isWorkingRole(e) && !task.assignedEngineers?.includes(e.id))
    .sort((a, b) => {
      const aFree  = isEngFree(a);
      const bFree  = isEngFree(b);
      const aMatch = !!(task.direction && a.regularTask === task.direction);
      const bMatch = !!(task.direction && b.regularTask === task.direction);
      const aPrio  = aFree ? (aMatch ? 0 : 1) : (aMatch ? 2 : 3);
      const bPrio  = bFree ? (bMatch ? 0 : 1) : (bMatch ? 2 : 3);
      return aPrio - bPrio;
    })
    .slice(0, 5);

  function startEdit() {
    setEditForm({
      name: task!.name, direction: task!.direction || '',
      estimateHours: taskEstimateHours(task!) || '',
      startDate: task!.startDate || '', deadline: task!.deadline || '',
      dependsOn:  task!.dependsOn || '',
      newChildId: '',
      link: task!.link || '',
      testOpsUrl: task!.testOpsUrl || '',
      workDocUrl: task!.workDocUrl || '',
      stages: normalizeTaskStages(task!.stages),
    });
    setEditMode(true);
  }

  function saveEdit() {
    if (!editForm) return;
    if (editForm.stages.some(stage => !stage.name.trim() || stage.estimateHours <= 0)) return;
    updateData(prev => {
      let effectiveDependsOn: string | null = editForm.dependsOn || null;
      if (editForm.newChildId && !effectiveDependsOn) {
        const selectedChild = prev.tasks.find(t => t.id === editForm.newChildId);
        if (selectedChild?.dependsOn) effectiveDependsOn = selectedChild.dependsOn;
      }

      const newTasks: Task[] = prev.tasks.map(t => {
        if (t.id === taskId) {
          const stages = normalizeTaskStages(editForm.stages);
          return {
            ...t,
            name: editForm.name, direction: editForm.direction || null,
            estimateHours: stages.length > 0
              ? taskStagesTotal(stages)
              : (parseInt(String(editForm.estimateHours)) > 0 ? parseInt(String(editForm.estimateHours)) : null),
            stages: stages.length > 0 ? stages : undefined,
            startDate: effectiveDependsOn ? null : (editForm.startDate || null),
            deadline: editForm.deadline || null,
            dependsOn: effectiveDependsOn,
            link: editForm.link.trim() || undefined,
            testOpsUrl: editForm.testOpsUrl.trim() || undefined,
            workDocUrl: editForm.workDocUrl.trim() || undefined,
          };
        }
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
    const newFc    = calcForecast(task!, engineers, null, null, history);
    const newEnd   = newFc.forecastDate || task!.deadline || null;

    // Ищем задачи инженера, чьи периоды пересекаются с новой
    const otherTasks = getEngineerActiveTasks(data, engId, taskId);
    const conflicting = otherTasks.filter(ct => {
      const ctFc  = calcForecast(ct, engineers, null, null, history);
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
    const ctFc     = calcForecast(ct, engineers, null, null, history);
    const ctEnd    = ctFc.forecastDate || ct.deadline || null;
    const isOverdue = !!(ct.deadline && todayStr() > ct.deadline);

    const title = isOverdue ? 'Задача инженера просрочена' : 'Конфликт планирования';
    const msg   = isOverdue
      ? `«${ct.name}» вышла за рамки дедлайна. Инженер будет переведён — разрешите просроченную задачу вручную.`
      : `Инженер уже задействован на «${ct.name}» (до ${formatDateShort(ctEnd)}). Снять с этой задачи и назначить на текущую?`;

    const { confirmed, fraction } = await askDaySplit(title, msg, ct.name);
    if (!confirmed) { setShowAddEng(false); return; }

    updateData(prev => addEngineerToTask(prev, taskId, engId, true, fraction)); // перевод со снятием
    setShowAddEng(false);
  }
  function removeEngineer(engId: string) { updateData(prev => removeEngineerFromTask(prev, taskId, engId)); }

  function addStage() {
    setEditForm(form => form ? {
      ...form,
      stages: [...form.stages, {
        id: genId('stage'),
        name: '',
        estimateHours: 8,
        sortOrder: form.stages.length,
      }],
    } : form);
  }

  function updateStage(stageId: string, patch: Partial<TaskStage>) {
    setEditForm(form => form ? {
      ...form,
      stages: form.stages.map(stage => stage.id === stageId ? { ...stage, ...patch } : stage),
    } : form);
  }

  function removeStage(stageId: string) {
    setEditForm(form => form ? {
      ...form,
      stages: form.stages.filter(stage => stage.id !== stageId)
        .map((stage, sortOrder) => ({ ...stage, sortOrder })),
    } : form);
  }

  function moveStage(stageId: string, delta: -1 | 1) {
    setEditForm(form => {
      if (!form) return form;
      const stages = [...form.stages].sort((a, b) => a.sortOrder - b.sortOrder);
      const from = stages.findIndex(stage => stage.id === stageId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= stages.length) return form;
      [stages[from], stages[to]] = [stages[to], stages[from]];
      return { ...form, stages: stages.map((stage, sortOrder) => ({ ...stage, sortOrder })) };
    });
  }

  const totalCount = assignedEngs.length;
  const activeCount = availableAssignedEngs.length;
  const usedHours  = computeUsedHours(task, engineers, history);
  const stageInfo  = computeTaskStageProgress(task, usedHours);
  const phaseInfo  = stageInfo.length > 0 ? null : calcPhaseInfo(task, engineers, history);

  const parentTask      = task.dependsOn ? tasks.find(t => t.id === task.dependsOn) : null;
  const inheritedEngIds = parentTask ? getEffectiveTeam(parentTask, tasks) : [];
  const inheritedEngs   = inheritedEngIds.map(id => engineers.find(e => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  const inheritedCount  = inheritedEngs.length;

  function completeTask(date: string, dayFraction = 0) {
    updateData(prev => completeTaskOp(prev, taskId, date, dayFraction));
    onBack();
  }

  function handleCompleteClick() {
    setCompleteDateMode('today');
    setCompleteCustomDate('');
    setCompleteHours(0);
    setCompleteModal(true);
  }

  function confirmComplete() {
    const date = completeDateMode === 'today' ? todayStr() : completeCustomDate;
    if (!date) return;
    setCompleteModal(false);
    completeTask(date, currentChild ? hoursToFraction(completeHours) : 0);
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
      {DaySplitEl}
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
          {currentChild && (
            <FormRow label="Учёт времени за сегодня">
              <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:10 }}>
                Команда автоматически перейдёт на «{currentChild.name}». Укажите, сколько сегодня ушло на текущую задачу — остаток дня зачтётся следующей.
              </div>
              <DaySplitButtons fromTaskName={task.name} hours={completeHours} onChange={setCompleteHours}/>
            </FormRow>
          )}
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
                  <FormRow label="Ссылка на Jira"><Input value={editForm.link} onChange={e=>setEditForm(f=>f?{...f, link:e.target.value}:f)} placeholder="https://jira.example.com/browse/ABC-123"/></FormRow>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
                    <FormRow label="Прогон в ТестОпс"><Input value={editForm.testOpsUrl} onChange={e=>setEditForm(f=>f?{...f, testOpsUrl:e.target.value}:f)} placeholder="https://testops.mos.ru/launch/11019"/></FormRow>
                    <FormRow label="Рабочий ГД"><Input value={editForm.workDocUrl} onChange={e=>setEditForm(f=>f?{...f, workDocUrl:e.target.value}:f)} placeholder="https://docs.google.com/spreadsheets/d/..."/></FormRow>
                  </div>
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
                      {editForm.stages.length > 0 ? (
                        <div style={{ padding:'9px 11px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-tertiary)', color:'var(--text-secondary)', fontSize:14, fontWeight:600 }}>
                          {taskStagesTotal(editForm.stages)} чч · сумма этапов
                        </div>
                      ) : (
                        <Input type="number" value={editForm.estimateHours} onChange={e=>setEditForm(f=>f?{...f, estimateHours:e.target.value}:f)}/>
                      )}
                    </FormRow>
                  </div>

                  <div style={{ borderTop:'0.5px solid var(--border-light)', paddingTop:12, marginTop:2, marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Этапы задачи</div>
                        <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3 }}>Выполняются последовательно общей командой задачи</div>
                      </div>
                      <BtnSecondary onClick={addStage} style={{ fontSize:12, padding:'6px 10px' }}>+ Этап</BtnSecondary>
                    </div>
                    {editForm.stages.length === 0 ? (
                      <div style={{ padding:'10px 12px', borderRadius:7, background:'var(--bg-secondary)', color:'var(--text-tertiary)', fontSize:12 }}>
                        Этапы не заданы — задача планируется одной полосой.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {[...editForm.stages].sort((a,b)=>a.sortOrder-b.sortOrder).map((stage, index, stages) => (
                          <div key={stage.id} style={{ display:'grid', gridTemplateColumns:'28px minmax(160px,1fr) 100px auto', gap:8, alignItems:'center', padding:'8px', border:'1px solid var(--border-light)', borderRadius:7, background:'var(--bg-secondary)' }}>
                            <div style={{ width:24, height:24, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--accent-bg)', color:'var(--accent)', fontSize:12, fontWeight:700 }}>{index+1}</div>
                            <Input value={stage.name} onChange={e=>updateStage(stage.id,{name:e.target.value})} placeholder="Название этапа" style={{ background:'var(--bg-primary)' }}/>
                            <Input type="number" value={stage.estimateHours} onChange={e=>updateStage(stage.id,{estimateHours:Math.max(0,parseInt(e.target.value)||0)})} style={{ background:'var(--bg-primary)' }}/>
                            <div style={{ display:'flex', gap:3 }}>
                              <button type="button" onClick={()=>moveStage(stage.id,-1)} disabled={index===0} title="Выше" style={{ border:'1px solid var(--border-mid)', background:'var(--bg-primary)', color:'var(--text-secondary)', borderRadius:5, width:27, height:27, cursor:index===0?'default':'pointer', opacity:index===0?0.35:1 }}>↑</button>
                              <button type="button" onClick={()=>moveStage(stage.id,1)} disabled={index===stages.length-1} title="Ниже" style={{ border:'1px solid var(--border-mid)', background:'var(--bg-primary)', color:'var(--text-secondary)', borderRadius:5, width:27, height:27, cursor:index===stages.length-1?'default':'pointer', opacity:index===stages.length-1?0.35:1 }}>↓</button>
                              <button type="button" onClick={()=>removeStage(stage.id)} title="Удалить этап" style={{ border:'1px solid var(--red)', background:'transparent', color:'var(--red)', borderRadius:5, width:27, height:27, cursor:'pointer' }}>×</button>
                            </div>
                          </div>
                        ))}
                        {editForm.stages.some(stage => !stage.name.trim() || stage.estimateHours <= 0) && (
                          <div style={{ color:'var(--red)', fontSize:12 }}>У каждого этапа должно быть название и положительная оценка.</div>
                        )}
                      </div>
                    )}
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
                  {(task.link || task.testOpsUrl || task.workDocUrl) && (
                  <FieldRow label="Ссылки">
                      <span style={{ display:'flex', justifyContent:'flex-end', flexWrap:'nowrap', gap:6, maxWidth:'100%', overflow:'hidden' }}>
                        <TaskExternalLink label="Jira" url={task.link}/>
                        <TaskExternalLink label="ТестОпс" url={task.testOpsUrl}/>
                        <TaskExternalLink label="ГД" url={task.workDocUrl} showValue={false}/>
                      </span>
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
                    {taskEstimateHours(task) > 0 ? (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                        <strong
                          onClick={task.stages?.length ? undefined : () => navigate('estimate', task.id)}
                          style={{ color: task.stages?.length ? 'var(--text-primary)' : task.estimateForm ? 'var(--accent)' : 'var(--blue)', cursor:task.stages?.length?'default':'pointer', textDecoration:task.stages?.length?'none':'underline dotted' }}
                          title={task.stages?.length ? 'Оценка рассчитана как сумма этапов' : task.estimateForm ? 'Открыть в калькуляторе' : 'Уточнить оценку'}
                        >{fmtHours(taskEstimateHours(task))}</strong>
                        {task.stages?.length ? (
                          <span style={{ fontSize:11, color:'var(--accent)', background:'var(--accent-bg)', borderRadius:10, padding:'1px 7px', fontWeight:700 }}>{task.stages.length} этапа</span>
                        ) : !task.estimateForm && (
                          <span style={{ fontSize:11, color:'var(--blue)', background:'var(--blue-bg)', borderRadius:10, padding:'1px 7px', fontWeight:700 }}>экспресс</span>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate('estimate', task.id)}
                        style={{ padding:'4px 10px', border:'1.5px solid var(--blue)', borderRadius:6, background:'var(--blue-bg)', color:'var(--blue)', fontSize:12, fontWeight:700, cursor:'pointer' }}
                      >
                        Оценить быстро
                      </button>
                    )}
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

                  {stageInfo.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:7, margin:'14px 0 12px' }}>
                      {stageInfo.map((stage, index) => (
                        <div key={stage.id} style={{ display:'grid', gridTemplateColumns:'24px minmax(120px,1fr) 90px 48px', gap:8, alignItems:'center' }}>
                          <div style={{ width:22, height:22, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, background:stage.state==='completed'?'var(--success-bg)':stage.state==='current'?'var(--accent-bg)':'var(--bg-secondary)', color:stage.state==='completed'?'var(--success)':stage.state==='current'?'var(--accent)':'var(--text-tertiary)' }}>
                            {stage.state==='completed'?'✓':stage.state==='current'?'▶':index+1}
                          </div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:stage.state==='current'?700:500, color:stage.state==='planned'?'var(--text-tertiary)':'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{stage.name}</div>
                            <ProgressBar pct={stage.progressPct} color={stage.state==='completed'?'var(--success)':'var(--accent)'} height={4}/>
                          </div>
                          <div style={{ fontSize:12, color:'var(--text-tertiary)', textAlign:'right' }}>{fmtHours(stage.estimateHours)}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:stage.state==='current'?'var(--accent)':'var(--text-tertiary)', textAlign:'right' }}>{stage.progressPct}%</div>
                        </div>
                      ))}
                    </div>
                  )}

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

                  <div style={{ marginTop: phaseInfo || stageInfo.length > 0 ? 0 : 12, background:'var(--bg-secondary)', borderRadius:8, padding:'12px 14px' }}>
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
              {assignedEngs.map(eng => {
                const isAvailable = isAvailableToday(eng);
                return (
                  <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)', opacity:isAvailable ? 1 : 0.62 }}>
                    <Avatar name={eng.name} size={32}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, cursor:'pointer', color:'var(--blue)' }} onClick={()=>navigate('engineer',eng.id)}>{eng.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:1 }}>
                        {eng.regularTask||'—'}
                        {!isAvailable && <span style={{ marginLeft:6, color:'var(--amber)', fontWeight:600 }}>не учитывается</span>}
                      </div>
                    </div>
                    <button onClick={()=>removeEngineer(eng.id)} style={{ fontSize:12, color:'var(--accent)', border:'1.5px solid var(--accent)', padding:'4px 10px', borderRadius:4, background:'transparent', cursor:'pointer', fontWeight:500 }}>↩ Снять</button>
                  </div>
                );
              })}
              {assignedEngs.length > 0 && (
                <div style={{ fontSize:12, color:'var(--text-tertiary)', paddingTop:8, borderTop:'0.5px solid var(--border-light)', marginTop:4 }}>
                  Учитывается: <strong style={{ color:'var(--text-primary)' }}>{activeCount}</strong>
                  {totalCount !== activeCount && <span> из {totalCount}</span>}
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
                  {activeCount > 0 && <span style={{ marginLeft:8, color:'var(--accent)', fontWeight:600 }}>+ {activeCount} доп.</span>}
                </div>
              </Card>
            )}

            {recommended.length>0 && (
              <Card>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Рекомендованные</div>
                <div style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:10 }}>
                  {task.direction ? <>По направлению <strong style={{ color:'var(--accent)' }}>{task.direction}</strong></> : 'Все инженеры команды'}
                </div>
                {recommended.map(eng => {
                  const matchDir = !!(task.direction && eng.regularTask === task.direction);
                  const isFree   = isEngFree(eng);
                  return (
                    <div key={eng.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                      <Avatar name={eng.name} size={30}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eng.name}</span>
                          <span style={{ fontSize:10, padding:'1px 5px', borderRadius:3, fontWeight:600, flexShrink:0, background: isFree ? 'var(--success-bg)' : 'var(--amber-bg)', color: isFree ? 'var(--success)' : 'var(--amber)' }}>
                            {isFree ? 'свободен' : 'занят'}
                          </span>
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
