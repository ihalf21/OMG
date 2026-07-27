import React, { useState } from 'react';
import { Avatar, RoleBadge, StatusBadge, PageTopbar, BtnPrimary, BtnSecondary, Modal, FormRow, Input, Select, ModalFooter, useResizableColumns, ResizeHandle } from '../components/UI';
import { isAvailableToday, isWorkingRole, effectiveStatus } from '../domain/availability';
import { addEngineer as addEngineerOp } from '../domain/engineer';
import type { Engineer, EngineerRole, EngineerStatus, Task } from '../domain/types';
import type { PageProps } from '../ui-types';

type RoleFilter = 'all' | EngineerRole;
type StatusFilter = 'all' | EngineerStatus | 'switched' | 'free' | 'unavail';
type SortCol = 'name' | 'role' | 'status' | 'task' | 'group';
type SortDir = 'asc' | 'desc';
const NO_DIRECTION_FILTER = '__no_direction__';

interface NewEngineerForm {
  name: string;
  role: EngineerRole;
  regularTask: string;
}

export default function Team({ data, updateData, navigate }: PageProps) {
  const { engineers, tasks } = data;
  const [filterRole,   setFilterRole]   = useState<RoleFilter>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewEngineerForm>({ name:'', role:'engineer', regularTask:'' });


  const isOnTask = (e: Engineer) => tasks.some(t => t.status === 'active' && t.assignedEngineers?.includes(e.id));
  const isAvail  = (e: Engineer) => isWorkingRole(e) && isAvailableToday(e);
  const metrics = {
    total:       engineers.filter(isWorkingRole).length,
    active:      engineers.filter(isAvail).length,
    unavailable: engineers.filter(e => isWorkingRole(e) && !isAvailableToday(e)).length,
    switched:    engineers.filter(e => isAvail(e) && isOnTask(e)).length,
    free:        engineers.filter(e => isAvail(e) && !isOnTask(e)).length,
  };

  const { widths: colWidths, startResize } = useResizableColumns('omg_team_cols', [220, 130, 110, 260, 56]);
  const [sortBy, setSortBy] = useState<SortCol>('group');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortBy !== col) return <span style={{ opacity:0.3, marginLeft:4 }}>↕</span>;
    return <span style={{ marginLeft:4, color:'var(--accent)' }}>{sortDir==='asc'?'↑':'↓'}</span>;
  }

  const ROLE_ORDER: Record<EngineerRole, number> = { lead:0, responsible:1, engineer:2, intern:3 };
  const STATUS_ORDER: Record<EngineerStatus, number> = { active:0, dayoff:1, sick:2, vacation:3 };
  const TASK_ORDER: Record<string, number> = Object.fromEntries((data.directions ?? []).map((t, i) => [t, i]));
  const directionOptions = React.useMemo(() =>
    Array.from(new Set(
      (data.directions ?? [])
        .map(dir => dir.trim())
        .filter(Boolean)
    )),
  [data.directions]);

  const hasDirectionlessEngineers = React.useMemo(
    () => engineers.some(e => isWorkingRole(e) && !e.regularTask?.trim()),
    [engineers],
  );

  React.useEffect(() => {
    if (
      directionFilter !== 'all' &&
      directionFilter !== NO_DIRECTION_FILTER &&
      !directionOptions.includes(directionFilter)
    ) {
      setDirectionFilter('all');
    }
    if (directionFilter === NO_DIRECTION_FILTER && !hasDirectionlessEngineers) {
      setDirectionFilter('all');
    }
  }, [directionFilter, directionOptions, hasDirectionlessEngineers]);

  const filteredAndSorted = engineers.filter(e => {
    if (e.role === 'lead') return false;
    if (filterRole !== 'all' && e.role !== filterRole) return false;
    const engDirection = e.regularTask?.trim() || '';
    if (directionFilter === NO_DIRECTION_FILTER) {
      if (engDirection) return false;
    } else if (directionFilter !== 'all' && engDirection !== directionFilter) return false;
    if (filterStatus === 'switched') {
      if (!isAvail(e) || !isOnTask(e)) return false;
    } else if (filterStatus === 'free') {
      if (!isAvail(e) || isOnTask(e)) return false;
    } else if (filterStatus === 'unavail') {
      if (isAvailableToday(e)) return false;
    } else if (filterStatus !== 'all' && effectiveStatus(e) !== filterStatus) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'group') {
      const ta = TASK_ORDER[a.regularTask ?? ''] ?? 99;
      const tb = TASK_ORDER[b.regularTask ?? ''] ?? 99;
      if (ta !== tb) return ta - tb;
      return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    }
    let va: string | number = '';
    let vb: string | number = '';
    if (sortBy === 'name')   { va = a.name; vb = b.name; }
    else if (sortBy === 'role')   { va = ROLE_ORDER[a.role] ?? 9; vb = ROLE_ORDER[b.role] ?? 9; return sortDir==='asc' ? (va as number) - (vb as number) : (vb as number) - (va as number); }
    else if (sortBy === 'status') { va = STATUS_ORDER[a.status] ?? 9; vb = STATUS_ORDER[b.status] ?? 9; return sortDir==='asc' ? (va as number) - (vb as number) : (vb as number) - (va as number); }
    else if (sortBy === 'task')   {
      const ta = tasks.find(t => t.assignedEngineers?.includes(a.id) && t.status === 'active');
      const tb = tasks.find(t => t.assignedEngineers?.includes(b.id) && t.status === 'active');
      va = ta?.name || ''; vb = tb?.name || '';
    }
    return sortDir === 'asc' ? (va as string).localeCompare(vb as string, 'ru') : (vb as string).localeCompare(va as string, 'ru');
  });

  function FilterBtn<T extends string>({ val, cur, set, children }: { val: T; cur: T; set: (v: T) => void; children: React.ReactNode }) {
    const active = cur === val;
    return (
      <button onClick={() => set(val)} style={{
        padding:'7px 14px', fontSize:13, cursor:'pointer',
        border:`1.5px solid ${active?'var(--accent)':'var(--border-mid)'}`,
        borderRadius:6, background:active?'var(--accent-bg)':'var(--bg-secondary)',
        color:active?'var(--accent)':'var(--text-secondary)',
        fontWeight:active?600:400, transition:'all 0.15s',
      }}>{children}</button>
    );
  }

  function getCurrentTask(eng: Engineer): Task | undefined {
    return tasks.find(t => t.assignedEngineers?.includes(eng.id) && t.status === 'active');
  }

  function addEngineer() {
    if (!form.name.trim()) return;
    updateData(prev => addEngineerOp(prev, {
      name: form.name, role: form.role, regularTask: form.regularTask || null,
    }));
    setShowModal(false);
    setForm({ name:'', role:'engineer', regularTask:'' });
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Команда">
        <BtnSecondary onClick={() => navigate('absences')}>График отсутствий</BtnSecondary>
        <BtnPrimary onClick={() => setShowModal(true)}>+ Добавить инженера</BtnPrimary>
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {/* Metrics — кликабельные */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16 }}>
          {([
            { label:'Всего в команде', value:metrics.total,       color:'var(--text-primary)', fs:'all' as StatusFilter },
            { label:'Доступны',        value:metrics.active,      color:'var(--success)',       fs:'active' as StatusFilter },
            { label:'Недоступны',      value:metrics.unavailable, color:'var(--red)',           fs:'unavail' as StatusFilter },
            { label:'На задаче',       value:metrics.switched,    color:'var(--blue)',          fs:'switched' as StatusFilter },
            { label:'Не заняты',       value:metrics.free,        color:'var(--amber)',         fs:'free' as StatusFilter },
          ]).map((m, i) => {
            const isAct = filterStatus === m.fs;
            return (
              <div key={i} onClick={() => setFilterStatus(isAct ? 'all' : m.fs)}
                style={{ background:isAct?'var(--accent-bg)':'var(--bg-primary)', border:`1.5px solid ${isAct?'var(--accent)':'var(--border-light)'}`, borderRadius:10, padding:'14px 16px', cursor:'pointer', boxShadow:'var(--shadow-sm)', transition:'all 0.15s' }}>
                <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:6, fontWeight:500 }}>{m.label}</div>
                <div style={{ fontSize:24, fontWeight:700, color:m.color }}>{m.value}</div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск по имени..." style={{
            padding:'8px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6,
            fontSize:14, background:'var(--bg-secondary)', color:'var(--text-primary)', width:220, outline:'none',
          }}/>
          <Select
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value)}
            style={{ width:220, padding:'7px 34px 7px 11px', fontSize:13 }}
          >
            <option value="all">Все направления</option>
            {directionOptions.map(dir => <option key={dir} value={dir}>{dir}</option>)}
            {hasDirectionlessEngineers && <option value={NO_DIRECTION_FILTER}>Без направления</option>}
          </Select>
          <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
          <div style={{ display:'flex', gap:4 }}>
            <FilterBtn<RoleFilter> val="all"         cur={filterRole} set={setFilterRole}>Все роли</FilterBtn>
            <FilterBtn<RoleFilter> val="responsible" cur={filterRole} set={setFilterRole}>Ответственные</FilterBtn>
            <FilterBtn<RoleFilter> val="engineer"    cur={filterRole} set={setFilterRole}>Инженеры</FilterBtn>
            <FilterBtn<RoleFilter> val="intern"      cur={filterRole} set={setFilterRole}>Стажёры</FilterBtn>
          </div>
        </div>

        {/* Table */}
        <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ background:'var(--bg-secondary)' }}>
                {([
                  { label:'Инженер',       col: 'name' as SortCol | null },
                  { label:'Роль',          col: 'role' as SortCol | null },
                  { label:'Статус',        col: 'status' as SortCol | null },
                  { label:'Текущая задача',col: 'task' as SortCol | null },
                  { label:'',              col: null },
                ]).map((h, i) => (
                  <th key={i}
                    onClick={h.col ? () => toggleSort(h.col!) : undefined}
                    style={{ fontSize:13, color:'var(--text-tertiary)', fontWeight:600, textAlign:'left', padding:'10px 14px', borderBottom:'1px solid var(--border-light)', cursor:h.col?'pointer':'default', userSelect:'none', whiteSpace:'nowrap', position:'relative', width:colWidths[i] }}>
                    {h.label}{h.col && <SortIcon col={h.col}/>}
                    {i < 4 && <ResizeHandle onMouseDown={e => startResize(i, e)}/>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map(eng => {
                const currentTask = getCurrentTask(eng);
                return (
                  <tr key={eng.id} style={{ cursor:'pointer' }}
                    onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>(td as HTMLElement).style.background='var(--bg-secondary)')}
                    onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>(td as HTMLElement).style.background='')}
                  >
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar name={eng.name} size={32}/>
                        <span style={{ fontSize:14, fontWeight:600 }}>{eng.name}</span>
                      </div>
                    </td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}><RoleBadge role={eng.role}/></td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}><StatusBadge status={effectiveStatus(eng)}/></td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      {effectiveStatus(eng)!=='active'
                        ? <div><div style={{ fontSize:13, color:'var(--text-tertiary)' }}>—</div><div style={{ fontSize:12, color:'var(--text-tertiary)' }}>рег.: {eng.regularTask||'—'}</div></div>
                        : <div><div style={{ fontSize:14, color:'var(--text-primary)', fontWeight:500 }}>{currentTask?.name||'—'}</div><div style={{ fontSize:12, color:'var(--text-tertiary)' }}>рег.: {eng.regularTask||'—'}</div></div>
                      }
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)', textAlign:'right' }}>
                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <button
                          aria-label={`Открыть карточку: ${eng.name}`}
                          title="Открыть карточку"
                          onClick={e=>{e.stopPropagation();navigate('engineer',eng.id);}}
                          style={{ width:28, height:28, border:'1.5px solid transparent', borderRadius:6, background:'transparent', fontSize:20, lineHeight:1, fontWeight:700, color:'var(--text-tertiary)', cursor:'pointer' }}
                        >›</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="Добавить инженера" onClose={()=>setShowModal(false)}>
          <FormRow label="Полное имя"><Input value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} placeholder="Иванов Иван Иванович"/></FormRow>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <FormRow label="Роль">
              <Select value={form.role} onChange={e=>setForm(f=>({...f, role: e.target.value as EngineerRole}))}>
                <option value="lead">Лид</option>
                <option value="responsible">Ответственный</option>
                <option value="engineer">Инженер</option>
                <option value="intern">Стажёр</option>
              </Select>
            </FormRow>
            <FormRow label="Регулярная задача">
              <Select value={form.regularTask} onChange={e=>setForm(f=>({...f, regularTask: e.target.value}))}>
                <option value="">— не задана —</option>
                {(data.directions ?? []).map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </FormRow>
          </div>
          <ModalFooter onCancel={()=>setShowModal(false)} onSave={addEngineer} saveLabel="Добавить"/>
        </Modal>
      )}


    </div>
  );
}
