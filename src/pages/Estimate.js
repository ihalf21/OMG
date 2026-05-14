// src/pages/Estimate.js — Оценка задач по этапам
import React, { useState } from 'react';
import { PageTopbar, Card, BtnPrimary, BtnSecondary, fmtHours } from '../components/UI';
import { fmtHours as fmt } from '../utils/forecast';

const STAGES = [
  { key:'hoursAnalysis',    label:'Анализ',       hint:'Анализ постановки, задач, документации' },
  { key:'hoursActualize',   label:'Актуализация',  hint:'Актуализация тестовой модели' },
  { key:'hoursDevelopment', label:'Разработка',    hint:'Разработка тестовой модели' },
  { key:'hoursTesting',     label:'Тестирование',  hint:'Непосредственное тестирование' },
];

export default function Estimate({ data, updateData }) {
  const { tasks } = data;
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  const activeTasks = tasks.filter(t => t.status === 'active');

  const task = activeTasks.find(t => t.id === selectedId);

  function selectTask(id) {
    setSelectedId(id);
    setSaved(false);
    const t = activeTasks.find(t => t.id === id);
    if (t) {
      setForm({
        hoursAnalysis:    t.hoursAnalysis    || '',
        hoursActualize:   t.hoursActualize   || '',
        hoursDevelopment: t.hoursDevelopment || '',
        hoursTesting:     t.hoursTesting     || '',
      });
    }
  }

  function saveEstimate() {
    if (!selectedId) return;
    const breakdown = {
      hoursAnalysis:    parseInt(form.hoursAnalysis)    || 0,
      hoursActualize:   parseInt(form.hoursActualize)   || 0,
      hoursDevelopment: parseInt(form.hoursDevelopment) || 0,
      hoursTesting:     parseInt(form.hoursTesting)     || 0,
    };
    const total = Object.values(breakdown).reduce((s,v) => s+v, 0);
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === selectedId
        ? { ...t, ...breakdown, estimateHours: total > 0 ? total : t.estimateHours }
        : t
      ),
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const total = STAGES.reduce((s,st) => s + (parseInt(form[st.key])||0), 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Оценка задач"/>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:20, alignItems:'start' }}>

          {/* Список задач */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-tertiary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Выберите задачу</div>
            <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>
              {activeTasks.length === 0 && (
                <div style={{ padding:'20px 16px', fontSize:13, color:'var(--text-tertiary)', textAlign:'center' }}>Нет активных задач</div>
              )}
              {activeTasks.map(t => {
                const hasEstimate = STAGES.some(s => t[s.key] > 0);
                const isSelected = t.id === selectedId;
                return (
                  <div key={t.id} onClick={() => selectTask(t.id)}
                    style={{
                      padding:'12px 16px', cursor:'pointer',
                      background: isSelected ? 'var(--accent-bg)' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                      borderBottom:'0.5px solid var(--border-light)',
                      transition:'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background='var(--bg-secondary)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background='transparent'; }}
                  >
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <div style={{ fontSize:14, fontWeight:isSelected?600:500, color:isSelected?'var(--accent)':'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {t.name}
                      </div>
                      {hasEstimate
                        ? <span style={{ fontSize:11, color:'var(--accent)', flexShrink:0 }}>✓</span>
                        : <span style={{ fontSize:11, color:'var(--text-tertiary)', flexShrink:0 }}>—</span>
                      }
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3 }}>
                      {t.direction||'—'}
                      {t.estimateHours > 0 && <span style={{ marginLeft:8 }}>{fmt(t.estimateHours)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Форма оценки */}
          <div>
            {!task ? (
              <Card style={{ textAlign:'center', padding:'40px 20px' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:8 }}>Выберите задачу слева</div>
                <div style={{ fontSize:13, color:'var(--text-tertiary)', lineHeight:1.6 }}>
                  Здесь можно внести или обновить оценку трудозатрат по этапам.<br/>
                  Итоговая оценка рассчитывается как сумма всех этапов.
                </div>
              </Card>
            ) : (
              <Card>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)' }}>{task.name}</div>
                    <div style={{ fontSize:13, color:'var(--text-tertiary)', marginTop:4 }}>
                      {task.direction||'—'} · {task.status === 'done' ? '✓ Завершена' : 'В работе'}
                    </div>
                  </div>
                  {saved && (
                    <div style={{ fontSize:13, color:'var(--accent)', fontWeight:600, background:'var(--accent-bg)', padding:'6px 14px', borderRadius:8 }}>
                      ✅ Сохранено
                    </div>
                  )}
                </div>

                <div style={{ marginBottom:20 }}>
                  {STAGES.map(stage => (
                    <div key={stage.key} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 0', borderBottom:'0.5px solid var(--border-light)' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)' }}>{stage.label}</div>
                        <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3 }}>{stage.hint}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <input
                          type="number" min="0"
                          value={form[stage.key] || ''}
                          onChange={e => setForm(f => ({ ...f, [stage.key]: e.target.value }))}
                          placeholder="0"
                          style={{
                            width:90, padding:'8px 10px', textAlign:'center',
                            border:'1.5px solid var(--border-mid)', borderRadius:8,
                            fontSize:15, fontWeight:500,
                            background:'var(--bg-secondary)', color:'var(--text-primary)',
                            outline:'none',
                          }}
                          onFocus={e => e.target.style.borderColor='var(--accent)'}
                          onBlur={e => e.target.style.borderColor='var(--border-mid)'}
                        />
                        <span style={{ fontSize:13, color:'var(--text-tertiary)', width:24 }}>чч</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Итог */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--bg-secondary)', borderRadius:8, marginBottom:20 }}>
                  <span style={{ fontSize:14, color:'var(--text-secondary)', fontWeight:500 }}>Итоговая оценка</span>
                  <span style={{ fontSize:20, fontWeight:700, color: total>0?'var(--text-primary)':'var(--text-tertiary)' }}>
                    {total > 0 ? fmt(total) : '— не задана'}
                  </span>
                </div>

                {/* Сравнение с текущей */}
                {task.estimateHours > 0 && total > 0 && total !== task.estimateHours && (
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', marginBottom:16, padding:'8px 12px', background:'var(--amber-bg)', borderRadius:6 }}>
                    ⚠️ Новая оценка отличается от текущей ({fmt(task.estimateHours)}). При сохранении будет обновлена.
                  </div>
                )}

                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <BtnSecondary onClick={() => selectTask(selectedId)}>Сбросить</BtnSecondary>
                  <BtnPrimary onClick={saveEstimate}>💾 Сохранить оценку</BtnPrimary>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
