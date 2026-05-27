import React, { useState } from 'react';
import { Avatar, RoleBadge, StatusBadge, StarRating, Card, PageTopbar, BtnPrimary, BtnDanger, Modal, FormRow, Input, Select, ModalFooter, useResizableColumns, ResizeHandle } from '../components/UI';
import { REGULAR_TASKS } from './EngineerCard';
import { isAvailableToday, isWorkingRole } from '../domain/availability';

export default function Team({ data, updateData, navigate }) {
  const { engineers, tasks } = data;
  const [filterRole,   setFilterRole]   = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:'', role:'engineer', regularTask:'' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isOnTask = e => tasks.some(t => t.status === 'active' && t.assignedEngineers?.includes(e.id));
  const isAvail  = e => isWorkingRole(e) && isAvailableToday(e);
  const metrics = {
    total:       engineers.filter(isWorkingRole).length,
    active:      engineers.filter(isAvail).length,
    unavailable: engineers.filter(e => isWorkingRole(e) && !isAvailableToday(e)).length,
    switched:    engineers.filter(e => isAvail(e) && isOnTask(e)).length,
    free:        engineers.filter(e => isAvail(e) && !isOnTask(e)).length,
  };

  const filtered = engineers.filter(e => {
    if (filterRole !== 'all' && e.role !== filterRole) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const { widths: colWidths, startResize } = useResizableColumns('omg_team_cols', [200, 130, 110, 210, 110, 110]);
  const [sortBy, setSortBy] = useState('name'); // name | role | status | task
  const [sortDir, setSortDir] = useState('asc');

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }) {
    if (sortBy !== col) return <span style={{ opacity:0.3, marginLeft:4 }}>↕</span>;
    return <span style={{ marginLeft:4, color:'var(--accent)' }}>{sortDir==='asc'?'↑':'↓'}</span>;
  }

  const ROLE_ORDER = { lead:0, responsible:1, engineer:2, intern:3 };
  const STATUS_ORDER = { active:0, dayoff:1, sick:2, vacation:3 };

  const filteredAndSorted = engineers.filter(e => {
    if (filterRole !== 'all' && e.role !== filterRole) return false;
    if (filterStatus === 'switched') {
      if (!isAvail(e) || !isOnTask(e)) return false;
    } else if (filterStatus === 'free') {
      if (!isAvail(e) || isOnTask(e)) return false;
    } else if (filterStatus === 'unavail') {
      if (isAvailableToday(e)) return false;
    } else if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    let va, vb;
    if (sortBy === 'name')   { va = a.name; vb = b.name; }
    else if (sortBy === 'role')   { va = ROLE_ORDER[a.role]??9; vb = ROLE_ORDER[b.role]??9; return sortDir==='asc'?va-vb:vb-va; }
    else if (sortBy === 'status') { va = STATUS_ORDER[a.status]??9; vb = STATUS_ORDER[b.status]??9; return sortDir==='asc'?va-vb:vb-va; }
    else if (sortBy === 'task')   {
      const ta = tasks.find(t=>t.assignedEngineers?.includes(a.id)&&t.status==='active');
      const tb = tasks.find(t=>t.assignedEngineers?.includes(b.id)&&t.status==='active');
      va = ta?.name||''; vb = tb?.name||'';
    }
    return sortDir==='asc' ? va.localeCompare(vb,'ru') : vb.localeCompare(va,'ru');
  });
  function FilterBtn({ val, cur, set, children }) {
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

  function getCurrentTask(eng) {
    return tasks.find(t => t.assignedEngineers?.includes(eng.id) && t.status === 'active');
  }

  function addEngineer() {
    if (!form.name.trim()) return;
    updateData(prev => ({
      ...prev,
      engineers: [...prev.engineers, {
        id:'e'+Date.now(), name:form.name, role:form.role,
        regularTask:form.regularTask||null, status:'active',
        vacationFrom:null, vacationTo:null, experience:{},
      }],
    }));
    setShowModal(false);
    setForm({ name:'', role:'engineer', regularTask:'' });
  }

  function deleteEngineer(engId) {
    updateData(prev => ({
      ...prev,
      engineers: prev.engineers.filter(e => e.id !== engId),
      tasks: prev.tasks.map(t => ({
        ...t,
        assignedEngineers: (t.assignedEngineers||[]).filter(id => id !== engId),
      })),
    }));
    setConfirmDelete(null);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Команда">
        <BtnPrimary onClick={() => setShowModal(true)}>+ Добавить инженера</BtnPrimary>
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {/* Metrics — кликабельные */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16 }}>
          {[
            { label:'Всего в команде', value:metrics.total,       color:'var(--text-primary)', fs:'all'      },
            { label:'Доступны',        value:metrics.active,      color:'var(--success)',       fs:'active'   },
            { label:'Недоступны',      value:metrics.unavailable, color:'var(--red)',           fs:'unavail'  },
            { label:'На задаче',       value:metrics.switched,    color:'var(--blue)',          fs:'switched' },
            { label:'Не заняты',       value:metrics.free,        color:'var(--amber)',         fs:'free'     },
          ].map((m,i) => {
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
          <div style={{ width:1, height:24, background:'var(--border-light)' }}/>
          <div style={{ display:'flex', gap:4 }}>
            <FilterBtn val="all"         cur={filterRole} set={setFilterRole}>Все роли</FilterBtn>
            <FilterBtn val="responsible" cur={filterRole} set={setFilterRole}>Ответственные</FilterBtn>
            <FilterBtn val="engineer"    cur={filterRole} set={setFilterRole}>Инженеры</FilterBtn>
            <FilterBtn val="intern"      cur={filterRole} set={setFilterRole}>Стажёры</FilterBtn>
          </div>
        </div>

        {/* Table */}
        <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ background:'var(--bg-secondary)' }}>
                {[
                  { label:'Инженер',       col:'name'   },
                  { label:'Роль',          col:'role'   },
                  { label:'Статус',        col:'status' },
                  { label:'Текущая задача',col:'task'   },
                  { label:'Опыт (avg)',    col:null     },
                  { label:'',              col:null     },
                ].map((h,i) => (
                  <th key={i}
                    onClick={h.col ? () => toggleSort(h.col) : undefined}
                    style={{ fontSize:13, color:'var(--text-tertiary)', fontWeight:600, textAlign:'left', padding:'10px 14px', borderBottom:'1px solid var(--border-light)', cursor:h.col?'pointer':'default', userSelect:'none', whiteSpace:'nowrap', position:'relative', width:colWidths[i] }}>
                    {h.label}{h.col && <SortIcon col={h.col}/>}
                    {i < 5 && <ResizeHandle onMouseDown={e => startResize(i, e)}/>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map(eng => {
                const currentTask = getCurrentTask(eng);
                const isSwitched  = !!currentTask;
                const expVals = Object.values(eng.experience||{});
                const avgExp = expVals.length > 0 ? Math.round(expVals.reduce((a,b)=>a+b,0)/expVals.length) : 0;
                return (
                  <tr key={eng.id} style={{ cursor:'pointer' }}
                    onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background='var(--bg-secondary)')}
                    onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(td=>td.style.background='')}
                  >
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar name={eng.name} size={32}/>
                        <span style={{ fontSize:14, fontWeight:600 }}>{eng.name}</span>
                      </div>
                    </td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}><RoleBadge role={eng.role}/></td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}><StatusBadge status={eng.status}/></td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      {eng.role==='lead' ? <span style={{ fontSize:13, color:'var(--text-tertiary)', fontStyle:'italic' }}>не учитывается</span>
                        : eng.status!=='active' ? <div><div style={{ fontSize:13, color:'var(--text-tertiary)' }}>—</div><div style={{ fontSize:12, color:'var(--text-tertiary)' }}>рег.: {eng.regularTask||'—'}</div></div>
                        : <div><div style={{ fontSize:14, color:'var(--text-primary)', fontWeight:500 }}>{currentTask?.name||'—'}</div><div style={{ fontSize:12, color:'var(--text-tertiary)' }}>рег.: {eng.regularTask||'—'}</div></div>
                      }
                    </td>
                    <td onClick={()=>navigate('engineer',eng.id)} style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <StarRating value={avgExp} max={5} readonly/>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={e=>{e.stopPropagation();navigate('engineer',eng.id);}} style={{ padding:'5px 12px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:13, fontWeight:500, color:'var(--text-primary)', cursor:'pointer' }}>Открыть</button>
                        {eng.role !== 'lead' && (
                          <button onClick={e=>{e.stopPropagation();setConfirmDelete(eng);}} style={{ padding:'5px 10px', border:'1.5px solid var(--red)', borderRadius:6, background:'transparent', fontSize:13, color:'var(--red)', cursor:'pointer' }}>✕</button>
                        )}
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
          <FormRow label="Полное имя"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Иванов Иван Иванович"/></FormRow>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <FormRow label="Роль">
              <Select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="lead">Лид</option>
                <option value="responsible">Ответственный</option>
                <option value="engineer">Инженер</option>
                <option value="intern">Стажёр</option>
              </Select>
            </FormRow>
            <FormRow label="Регулярная задача">
              <Select value={form.regularTask} onChange={e=>setForm(f=>({...f,regularTask:e.target.value}))}>
                <option value="">— не задана —</option>
                {REGULAR_TASKS.map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </FormRow>
          </div>
          <ModalFooter onCancel={()=>setShowModal(false)} onSave={addEngineer} saveLabel="Добавить"/>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Удалить инженера?" onClose={()=>setConfirmDelete(null)} width={400}>
          <p style={{ fontSize:14, color:'var(--text-secondary)', marginBottom:20 }}>
            Инженер <strong>{confirmDelete.name}</strong> будет удалён из системы и снят со всех задач. Это действие нельзя отменить.
          </p>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={()=>setConfirmDelete(null)} style={{ padding:'8px 18px', border:'1.5px solid var(--border-mid)', borderRadius:6, background:'var(--bg-secondary)', fontSize:14, cursor:'pointer' }}>Отмена</button>
            <BtnDanger onClick={()=>deleteEngineer(confirmDelete.id)}>Удалить</BtnDanger>
          </div>
        </Modal>
      )}
    </div>
  );
}
