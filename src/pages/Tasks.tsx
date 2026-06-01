import React, { useState } from 'react';
import { calcForecast, statusColor, statusLabel, statusBadgeStyle, computeEffectiveDls, type Forecast } from '../utils/forecast';
import { computeInheritedTeam, computeDynamicStarts } from '../domain/gantt';
import { REGULAR_TASKS } from '../domain/tasks';
import { genId } from '../utils/ids';
import { formatDateShort, todayStr } from '../utils/dates';
import { restoreFromArchive } from '../domain/task';
import { Avatar, Card, PageTopbar, BtnPrimary, BtnSecondary, Modal, FormRow, Input, Select, ModalFooter, ProgressBar, DatePicker, useTooltip, useResizableColumns, ResizeHandle, useConfirm } from '../components/UI';
import type { Task } from '../domain/types';
import type { PageProps } from '../ui-types';

interface NewTaskForm {
  name: string;
  direction: string;
  startDate: string;
  deadline: string;
  totalCases: string;
  dependsOn: string | null;
  hoursAnalysis: string;
  hoursActualize: string;
  hoursDevelopment: string;
  hoursTesting: string;
  link: string;
}

const emptyForm = (): NewTaskForm => ({ name:'', direction:'', startDate: todayStr(), deadline:'', totalCases:'', dependsOn:null, hoursAnalysis:'', hoursActualize:'', hoursDevelopment:'', hoursTesting:'', link:'' });

type StatusFilter = 'all' | 'active' | 'done';

function FilterBtn<T extends string>({ val, cur, set, children }: { val: T; cur: T; set: (v: T) => void; children: React.ReactNode }) {
  const active = cur === val;
  return (
    <button onClick={() => set(val)} style={{
      padding:'7px 14px', fontSize:13, cursor:'pointer',
      border:`1.5px solid ${active?'var(--accent)':'var(--border-mid)'}`,
      borderRadius:6,
      background:active?'var(--accent-bg)':'var(--bg-secondary)',
      color:active?'var(--accent)':'var(--text-secondary)',
      fontWeight:active?600:400, transition:'all 0.15s',
    }}>{children}</button>
  );
}

function DoneIcon({ task }: { task: Task }) {
  if (task.status !== 'done') return null;
  const onTime = !task.deadline || !task.completedDate || task.completedDate <= task.deadline;
  return <span title={onTime?'Завершено вовремя':'Завершено с опозданием'} style={{ fontSize:18 }}>{onTime?'👍':'👎'}</span>;
}

export default function Tasks({ data, updateData, navigate }: PageProps) {
  const { engineers, tasks } = data;
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('active');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(emptyForm);
  const [showArchive, setShowArchive] = useState(false);
  const { move, TooltipEl } = useTooltip();
  const { confirm, ConfirmEl } = useConfirm();
  const { widths: colWidths, startResize } = useResizableColumns('omg_tasks_cols', [280, 130, 110, 140, 110, 170]);

  const activeTasks = tasks.filter(t => t.status === 'active');
  const inheritedEngIds = computeInheritedTeam(activeTasks);
  const dynamicStarts   = computeDynamicStarts(activeTasks, engineers, inheritedEngIds);
  const effectiveDls    = computeEffectiveDls(activeTasks, engineers, inheritedEngIds);

  const forecasts: Record<string, Forecast> = {};
  tasks.forEach(t => {
    const engIds = inheritedEngIds[t.id] || t.assignedEngineers || [];
    const dynStart = dynamicStarts[t.id];
    const taskForFc = t.dependsOn
      ? { ...t, assignedEngineers: engIds, startDate: null as null }
      : { ...t, assignedEngineers: engIds };
    const startOverride = t.dependsOn && dynStart ? dynStart : null;
    forecasts[t.id] = calcForecast(taskForFc, engineers, effectiveDls[t.id] || null, startOverride);
  });

  const archivedTasks = tasks.filter(t => t.status === 'archived')
    .sort((a,b) => (b.archivedDate||'').localeCompare(a.archivedDate||''));

  const filtered = tasks.filter(t => {
    if (t.status === 'archived') return false;
    if (filterStatus === 'active' && t.status !== 'active') return false;
    if (filterStatus === 'done'   && t.status !== 'done')   return false;
    return true;
  });

  function restoreTask(taskId: string) {
    updateData(prev => restoreFromArchive(prev, taskId));
  }

  async function deleteForever(taskId: string) {
    const ok = await confirm(
      'Удалить навсегда?',
      'Задача будет удалена безвозвратно. Это действие нельзя отменить.',
      { confirmLabel: 'Удалить навсегда' }
    );
    if (!ok) return;
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId),
    }));
  }

  function createTask(skipHours = false) {
    if (!form.name.trim()) return;
    const hoursBreakdown = skipHours ? {} : {
      hoursAnalysis:    Math.max(0, parseInt(form.hoursAnalysis)    || 0),
      hoursActualize:   Math.max(0, parseInt(form.hoursActualize)   || 0),
      hoursDevelopment: Math.max(0, parseInt(form.hoursDevelopment) || 0),
      hoursTesting:     Math.max(0, parseInt(form.hoursTesting)     || 0),
    };
    const totalFromBreakdown = Object.values(hoursBreakdown).reduce((s,v) => s+v, 0);

    let startDate = form.dependsOn ? null : (form.startDate || null);
    let assignedEngineers: string[] = [];
    if (form.dependsOn) {
      const parent = tasks.find(t => t.id === form.dependsOn);
      if (parent?.assignedEngineers?.length) assignedEngineers = [...parent.assignedEngineers];
    }

    const id = genId('t');
    const newTask: Task = {
      id,
      name:        form.name,
      direction:   form.direction || null,
      status:      'active',
      startDate,
      deadline:    form.deadline  || null,
      dependsOn:   form.dependsOn || null,
      estimateHours: totalFromBreakdown > 0 ? totalFromBreakdown : null,
      ...hoursBreakdown,
      totalCases:  form.totalCases ? parseInt(form.totalCases) : null,
      doneCases:   0,
      assignedEngineers,
      completedDate: null,
      completedWithChildId: null,
      archivedDate: null,
      link: form.link || undefined,
    };
    updateData(prev => {
      const parentId = newTask.dependsOn;

      if (!parentId) {
        return {
          ...prev,
          tasks: [...prev.tasks, { ...newTask, sortOrder: prev.tasks.length }],
        };
      }

      // Если у выбранного родителя A уже есть дочерняя задача B — перевязываем B на новую C
      const existingChild = prev.tasks.find(t =>
        t.status === 'active' && t.dependsOn === parentId
      );

      const parentTask = prev.tasks.find(t => t.id === parentId);
      const parentSortOrder = parentTask?.sortOrder ?? (prev.tasks.length - 1);

      // Сдвигаем sortOrder всех задач после родителя, чтобы вставить C на нужную позицию
      const updatedTasks = prev.tasks.map(t => {
        let result = t;
        if (existingChild && t.id === existingChild.id) {
          result = { ...result, dependsOn: newTask.id };
        }
        if ((t.sortOrder ?? 999) > parentSortOrder) {
          result = { ...result, sortOrder: (t.sortOrder ?? 999) + 1 };
        }
        return result;
      });

      return {
        ...prev,
        tasks: [...updatedTasks, { ...newTask, sortOrder: parentSortOrder + 1 }],
      };
    });
    setShowModal(false);
    setForm(emptyForm());
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {TooltipEl}
      {ConfirmEl}
      <PageTopbar title="Задачи">
        <BtnSecondary onClick={() => setShowArchive(true)} style={{ position:'relative' }}>
          🗄 Архив
          {archivedTasks.length > 0 && (
            <span style={{ marginLeft:6, fontSize:11, background:'var(--red)', color:'#fff', borderRadius:10, padding:'1px 6px', fontWeight:600 }}>
              {archivedTasks.length}
            </span>
          )}
        </BtnSecondary>
        <BtnPrimary onClick={() => setShowModal(true)}>+ Новая задача</BtnPrimary>
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', gap:4 }}>
            <FilterBtn<StatusFilter> val="all"    cur={filterStatus} set={setFilterStatus}>Все</FilterBtn>
            <FilterBtn<StatusFilter> val="active" cur={filterStatus} set={setFilterStatus}>В работе</FilterBtn>
            <FilterBtn<StatusFilter> val="done"   cur={filterStatus} set={setFilterStatus}>Завершены</FilterBtn>
          </div>
        </div>

        <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ background:'var(--bg-secondary)' }}>
                {['Задача','Направление','Статус','Прогресс','Команда','Дедлайн / расчёт'].map((h,i) => (
                  <th key={i} style={{ fontSize:13, color:'var(--text-tertiary)', fontWeight:600, textAlign:'left', padding:'10px 14px', borderBottom:'1px solid var(--border-light)', position:'relative', width:colWidths[i] }}>
                    {h}
                    {i < 5 && <ResizeHandle onMouseDown={e => startResize(i, e)}/>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const fc = forecasts[task.id];
                const isQueued = !!(task.dependsOn && tasks.find(t => t.id === task.dependsOn)?.status === 'active')
                  || !!(task.startDate && task.startDate > todayStr());
                const barColor = isQueued ? 'var(--text-tertiary)' : statusColor(fc?.deadlineStatus);
                const bs = isQueued
                  ? { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
                  : statusBadgeStyle(fc?.deadlineStatus);
                const assignedEngs = engineers.filter(e => task.assignedEngineers?.includes(e.id));
                return (
                  <tr key={task.id} onClick={() => navigate('task', task.id)}
                    style={{ cursor:'pointer' }}
                    onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(td => (td as HTMLElement).style.background='var(--bg-secondary)')}
                    onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(td => (td as HTMLElement).style.background='')}
                    onMouseMove={move}
                  >
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:barColor, flexShrink:0 }}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
                          <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>старт {formatDateShort(task.startDate)}{task.estimateHours ? ` · ${task.estimateHours} чч` : ''}{task.direction ? ` · ${task.direction}` : ''}</div>
                        </div>
                        <DoneIcon task={task}/>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}><span style={{ fontSize:13, fontWeight:500, color:'var(--accent)' }}>{task.direction||'—'}</span></td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <span style={{ fontSize:12, padding:'3px 9px', borderRadius:4, fontWeight:500, ...bs }}>
                        {task.status==='done' ? 'Завершена'
                          : isQueued ? 'В очереди'
                          : task.deadline ? statusLabel(fc?.deadlineStatus) : 'В работе'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <ProgressBar pct={fc?.progressPct||0} color={barColor} height={5}/>
                      <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:3 }}>
                        {task.totalCases?`${task.doneCases} / ${task.totalCases}`:`авто · ${fc?.progressPct||0}%`}
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ display:'flex', alignItems:'center' }}>
                        {assignedEngs.slice(0,3).map((e,i) => <Avatar key={e.id} name={e.name} size={26} style={{ marginLeft:i>0?-6:0, border:'2px solid var(--bg-primary)' }}/>)}
                        {assignedEngs.length>3 && <span style={{ fontSize:12, color:'var(--text-tertiary)', marginLeft:6 }}>+{assignedEngs.length-3}</span>}
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)', textAlign:'right' }}>
                      {task.deadline
                        ? <><div style={{ fontSize:13, fontWeight:500 }}>{formatDateShort(task.deadline)}</div><div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>расчёт: {fc?.forecastDate?formatDateShort(fc.forecastDate):'—'}</div></>
                        : <><div style={{ fontSize:12, color:'var(--text-tertiary)' }}>без дедлайна</div><div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>расчёт: {fc?.forecastDate?formatDateShort(fc.forecastDate):'—'}</div></>
                      }
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding:'24px 14px', textAlign:'center', color:'var(--text-tertiary)', fontSize:14 }}>Нет задач по выбранным фильтрам</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="Новая задача" onClose={() => setShowModal(false)}>
          <FormRow label="Название"><Input value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} placeholder="Введите название задачи"/></FormRow>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <FormRow label="Направление">
              <Select value={form.direction} onChange={e=>setForm(f=>({...f, direction:e.target.value}))}>
                <option value="">— не задано —</option>
                {REGULAR_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </FormRow>
            <FormRow label="Дата старта">
              <DatePicker value={form.startDate} onChange={v => setForm(f=>({...f, startDate:v}))} placeholder="Выбрать дату"/>
            </FormRow>
          </div>
          <FormRow label="Зависит от задачи" hint="Стартует после завершения выбранной, инженеры переносятся автоматически">
            <Select value={form.dependsOn||''} onChange={e=>setForm(f=>({...f, dependsOn: e.target.value || null}))}>
              <option value="">— независимая задача —</option>
              {tasks.filter(t=>t.status==='active').map(t=>(
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </FormRow>
          <FormRow label="Дедлайн (опционально)">
            <DatePicker value={form.deadline} onChange={v => setForm(f=>({...f, deadline:v}))} placeholder="Без дедлайна"/>
          </FormRow>
          <FormRow label="Ссылка" hint="Необязательно">
            <Input value={form.link} onChange={e=>setForm(f=>({...f, link:e.target.value}))} placeholder="https://..."/>
          </FormRow>
          <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:4, padding:'8px 12px', background:'var(--bg-secondary)', borderRadius:6 }}>
            💡 Оценку трудозатрат можно добавить в разделе <strong>Оценка</strong> после создания задачи
          </div>
          <ModalFooter onCancel={()=>setShowModal(false)} onSave={()=>createTask(true)} saveLabel="Создать задачу"/>
        </Modal>
      )}

      {/* Архив задач */}
      {showArchive && (
        <Modal title={`🗄 Архив задач (${archivedTasks.length})`} onClose={() => setShowArchive(false)} width={600}>
          {archivedTasks.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-tertiary)', fontSize:14 }}>
              Архив пуст — удалённые задачи будут появляться здесь
            </div>
          ) : (
            <>
              <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:16, lineHeight:1.5 }}>
                Удалённые задачи хранятся здесь. Их можно восстановить или удалить навсегда.
              </div>
              {archivedTasks.map(task => (
                <div key={task.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{task.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3, display:'flex', gap:8 }}>
                      {task.direction && <span>{task.direction}</span>}
                      {task.archivedDate && <span>удалена {formatDateShort(task.archivedDate)}</span>}
                      {task.estimateHours && <span>{task.estimateHours} чч</span>}
                    </div>
                  </div>
                  <BtnSecondary onClick={() => restoreTask(task.id)} style={{ fontSize:12, padding:'5px 12px', whiteSpace:'nowrap' }}>
                    ↩ Восстановить
                  </BtnSecondary>
                  <BtnSecondary onClick={() => deleteForever(task.id)} style={{ fontSize:12, padding:'5px 12px', color:'var(--red)', borderColor:'var(--red)', whiteSpace:'nowrap' }}>
                    ✕ Навсегда
                  </BtnSecondary>
                </div>
              ))}
            </>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:20 }}>
            <BtnSecondary onClick={() => setShowArchive(false)}>Закрыть</BtnSecondary>
          </div>
        </Modal>
      )}
    </div>
  );
}
