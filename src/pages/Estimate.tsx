// src/pages/Estimate.tsx — Калькулятор трудозатрат (PERT) с шаблонами
import React, { useState, useMemo } from 'react';
import { PageTopbar, Card, BtnPrimary, BtnSecondary, BtnDanger, Modal } from '../components/UI';
import { genId } from '../utils/ids';
import type { EstimateTemplate } from '../domain/types';
import type { PageProps } from '../ui-types';

type Scenario = 'o' | 'm' | 'p';
type ScenarioForm = Record<string, { o: string; m: string; p: string }>;
interface CalcResult {
  stage1: number; tcActualize: number; tcNew: number; stage2: number;
  stage3: number; reporting: number; comms: number; stage4: number;
  defects: number; retests: number; stage5: number;
  subtotal: number; riskCoeff: number; withRisks: number; reserve: number; total: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PCT_KEYS = new Set([
  'reportingPct','commsPct',
  'bugPct','retestPct',
  'envInstPct','inexperiencePct','parallelPct',
  'reservePct',
]);

const SECTIONS = [
  {
    id:'analysis', label:'Анализ задач',
    params:[
      { key:'tasksCount',      label:'Количество задач',             unit:'шт.', hint:'User stories, фичи, задачи релиза' },
      { key:'analysisTimeMin', label:'Время анализа 1 задачи',       unit:'мин', hint:'Чтение требований, оценка влияния' },
    ],
  },
  {
    id:'tcs', label:'Тест-кейсы',
    params:[
      { key:'tcUpdateCount',   label:'ТК к обновлению',              unit:'шт.', hint:'Существующие ТК под новый билд' },
      { key:'tcUpdateTimeMin', label:'Время обновления 1 ТК',        unit:'мин', hint:'Правка шагов, expected result' },
      { key:'tcNewCount',      label:'Новых ТК создать',             unit:'шт.', hint:'На новый функционал' },
      { key:'tcNewTimeMin',    label:'Время написания 1 нового ТК',  unit:'мин', hint:'Анализ + шаги + ревью' },
    ],
  },
  {
    id:'run', label:'Прогон / выполнение',
    params:[
      { key:'tcTotalCount',    label:'Всего ТК в прогоне',           unit:'шт.', hint:'Полный скоуп' },
      { key:'tcRunTimeMin',    label:'Время выполнения 1 ТК',        unit:'мин', hint:'По статистике прошлых прогонов' },
    ],
  },
  {
    id:'overhead', label:'Накладные расходы', subtitle:'% от времени прогона',
    params:[
      { key:'reportingPct',    label:'Анализ результатов / отчёты',  unit:'%', hint:'Обычно 10–15%' },
      { key:'commsPct',        label:'Коммуникации (митинги, синки)', unit:'%', hint:'Обычно 8–15%' },
    ],
  },
  {
    id:'defects', label:'Дефекты и ретесты',
    params:[
      { key:'bugPct',          label:'% ТК, на которых найдут баги', unit:'%',   hint:'Из статистики прошлых прогонов' },
      { key:'defectTimeMin',   label:'Время заведения 1 дефекта',    unit:'мин', hint:'Описание, шаги, скриншоты' },
      { key:'retestPct',       label:'% ТК, требующих ретеста',      unit:'%',   hint:'После исправления' },
      { key:'retestCoeff',     label:'Коэф. времени ретеста',        unit:'×',   hint:'1.0 = столько же, 1.5 = в 1.5 раза дольше', step:'0.1' },
    ],
  },
  {
    id:'risks', label:'Поправочные коэффициенты', subtitle:'прибавляются к итогу',
    params:[
      { key:'envInstPct',      label:'Нестабильность тестовой среды', unit:'%', hint:'Падения, ожидания фиксов среды' },
      { key:'inexperiencePct', label:'Неопытность команды',           unit:'%', hint:'Если есть новички' },
      { key:'parallelPct',     label:'Параллельные активности',       unit:'%', hint:'Делят время с другими задачами' },
    ],
  },
  {
    id:'reserve', label:'Резерв',
    params:[
      { key:'reservePct',      label:'Резерв на непредвиденное',      unit:'%', hint:'Стандартно 15–25%' },
    ],
  },
];

const DEFAULT_FORM = {
  tasksCount:      { o:'10',  m:'15',  p:'25'  },
  analysisTimeMin: { o:'20',  m:'30',  p:'60'  },
  tcUpdateCount:   { o:'20',  m:'40',  p:'80'  },
  tcUpdateTimeMin: { o:'10',  m:'15',  p:'25'  },
  tcNewCount:      { o:'5',   m:'10',  p:'20'  },
  tcNewTimeMin:    { o:'20',  m:'30',  p:'45'  },
  tcTotalCount:    { o:'200', m:'250', p:'320' },
  tcRunTimeMin:    { o:'8',   m:'12',  p:'18'  },
  reportingPct:    { o:'10',  m:'12',  p:'15'  },
  commsPct:        { o:'8',   m:'12',  p:'15'  },
  bugPct:          { o:'5',   m:'10',  p:'18'  },
  defectTimeMin:   { o:'15',  m:'20',  p:'30'  },
  retestPct:       { o:'5',   m:'10',  p:'20'  },
  retestCoeff:     { o:'1.2', m:'1.3', p:'1.5' },
  envInstPct:      { o:'5',   m:'15',  p:'25'  },
  inexperiencePct: { o:'0',   m:'10',  p:'30'  },
  parallelPct:     { o:'0',   m:'10',  p:'20'  },
  reservePct:      { o:'10',  m:'15',  p:'25'  },
};

const SCENARIO_META = [
  { s:'o', label:'Оптимист.',  color:'#22c55e', bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.3)'  },
  { s:'m', label:'Реалист.',   color:'var(--accent)', bg:'var(--accent-bg)', border:'rgba(59,130,246,0.3)' },
  { s:'p', label:'Пессимист.', color:'#f97316', bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.3)' },
];
const FOCUS_CLR = { o:'#22c55e', m:'var(--accent)', p:'#f97316' };

// ─── UTILS ────────────────────────────────────────────────────────────────────

const gid = () => genId('tpl');

function calcScenario(form: ScenarioForm, s: Scenario): CalcResult {
  const raw = (key: string) => parseFloat(form[key]?.[s]) || 0;
  const v   = (key: string) => PCT_KEYS.has(key) ? raw(key) / 100 : raw(key);

  const stage1      = (v('tasksCount') * v('analysisTimeMin')) / 60;
  const tcActualize = (v('tcUpdateCount') * v('tcUpdateTimeMin')) / 60;
  const tcNew       = (v('tcNewCount')    * v('tcNewTimeMin'))    / 60;
  const stage2      = tcActualize + tcNew;
  const stage3      = (v('tcTotalCount') * v('tcRunTimeMin')) / 60;
  const reporting   = v('reportingPct') * stage3;
  const comms       = v('commsPct')     * stage3;
  const stage4      = reporting + comms;
  const defects     = (v('tcTotalCount') * v('bugPct')    * v('defectTimeMin'))                    / 60;
  const retests     = (v('tcTotalCount') * v('retestPct') * v('tcRunTimeMin') * v('retestCoeff'))  / 60;
  const stage5      = defects + retests;
  const subtotal    = stage1 + stage2 + stage3 + stage4 + stage5;
  const riskCoeff   = 1 + v('envInstPct') + v('inexperiencePct') + v('parallelPct');
  const withRisks   = subtotal * riskCoeff;
  const reserve     = withRisks * v('reservePct');
  const total       = withRisks + reserve;
  return { stage1, tcActualize, tcNew, stage2, stage3, reporting, comms, stage4, defects, retests, stage5, subtotal, riskCoeff, withRisks, reserve, total };
}

function fmtH(h: number): string {
  if (!h || h <= 0) return '0 ч';
  if (h < 0.5) return `${Math.round(h * 60)} мин`;
  return `${h.toFixed(1)} ч`;
}
function fmtHInt(h: number): string { return `${Math.round(h)} ч`; }

// ─── SHARED PARAMETER FORM ────────────────────────────────────────────────────

interface ParamFormProps { form: ScenarioForm; onChange: (form: ScenarioForm) => void }
function ParameterForm({ form, onChange }: ParamFormProps) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTIONS.map(s => [s.id, true])));

  function setVal(key: string, s: Scenario, val: string) {
    onChange({ ...form, [key]: { ...form[key], [s]: val } });
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 28px', gap:6, padding:'4px 14px 8px', borderBottom:'0.5px solid var(--border-light)' }}>
        <div style={{ fontSize:12, color:'var(--text-tertiary)' }}>Параметр</div>
        {SCENARIO_META.map(sc => (
          <div key={sc.s} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:sc.color }}>{sc.label}</div>
        ))}
        <div/>
      </div>

      {SECTIONS.map(section => (
        <div key={section.id} style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>
          <div
            onClick={() => setOpen(o => ({ ...o, [section.id]: !o[section.id] }))}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', cursor:'pointer', background:'var(--bg-secondary)', userSelect:'none' }}
          >
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{section.label}</span>
              {section.subtitle && <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>{section.subtitle}</span>}
            </div>
            <span style={{ fontSize:11, color:'var(--text-tertiary)', display:'inline-block', transition:'transform 0.15s', transform: open[section.id] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
          </div>

          {open[section.id] && section.params.map((param, i) => (
            <div key={param.key} style={{
              display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 28px',
              gap:6, alignItems:'center', padding:'8px 14px',
              borderTop: i === 0 ? 'none' : '0.5px solid var(--border-light)',
            }}>
              <div>
                <div style={{ fontSize:13, color:'var(--text-primary)' }}>{param.label}</div>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:1 }}>{param.hint}</div>
              </div>
              {(['o','m','p'] as const).map(s => (
                <input
                  key={s} type="number" min="0" step={('step' in param ? param.step : undefined) || '1'}
                  value={form[param.key]?.[s] ?? ''}
                  onChange={e => setVal(param.key, s, e.target.value)}
                  style={{
                    width:'100%', padding:'5px 4px', textAlign:'center',
                    border:'1.5px solid var(--border-mid)', borderRadius:6,
                    fontSize:13, fontWeight:500, boxSizing:'border-box',
                    background:'var(--bg-secondary)', color:'var(--text-primary)', outline:'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = FOCUS_CLR[s as Scenario]; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--border-mid)'; }}
                />
              ))}
              <div style={{ fontSize:11, color:'var(--text-tertiary)', textAlign:'center' }}>{param.unit}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── TEMPLATE CARD (list item) ────────────────────────────────────────────────

interface TemplateCardProps {
  tpl: EstimateTemplate;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}
function TemplateCard({ tpl, onEdit, onArchive, onRestore, onDelete }: TemplateCardProps) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg-secondary)', border:'0.5px solid var(--border-light)', borderRadius:8 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{tpl.name}</div>
        {tpl.description && (
          <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tpl.description}</div>
        )}
        <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:3 }}>
          {tpl.archived ? `В архиве с ${tpl.archivedAt || '—'}` : `Создан ${tpl.createdAt || '—'}`}
        </div>
      </div>
      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        {tpl.archived ? (
          <>
            <BtnSecondary onClick={onRestore} style={{ padding:'5px 12px', fontSize:12 }}>Восстановить</BtnSecondary>
            <BtnDanger onClick={onDelete} style={{ padding:'5px 12px', fontSize:12 }}>Удалить навсегда</BtnDanger>
          </>
        ) : (
          <>
            <BtnSecondary onClick={onEdit}    style={{ padding:'5px 12px', fontSize:12 }}>Изменить</BtnSecondary>
            <BtnSecondary onClick={onArchive} style={{ padding:'5px 12px', fontSize:12, color:'var(--text-tertiary)' }}>В архив</BtnSecondary>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TEMPLATE MANAGER MODAL ───────────────────────────────────────────────────

interface TemplateManagerProps {
  templates: EstimateTemplate[];
  updateTemplates: (templates: EstimateTemplate[]) => void;
  onClose: () => void;
}
function TemplateManager({ templates, updateTemplates, onClose }: TemplateManagerProps) {
  const [tab,            setTab]            = useState<'active'|'archive'>('active');
  const [mode,           setMode]           = useState<'list'|'edit'>('list');
  const [editId,         setEditId]         = useState<string | null>(null);
  const [editName,       setEditName]       = useState('');
  const [editDesc,       setEditDesc]       = useState('');
  const [editForm,       setEditForm]       = useState<ScenarioForm>(DEFAULT_FORM);
  const [confirmDeleteId, setConfirmDelete] = useState<string | null>(null);

  const active   = templates.filter(t => !t.archived);
  const archived = templates.filter(t =>  t.archived);

  function startNew() {
    setEditId(null); setEditName(''); setEditDesc(''); setEditForm(DEFAULT_FORM); setMode('edit');
  }
  function startEdit(tpl: EstimateTemplate) {
    setEditId(tpl.id); setEditName(tpl.name); setEditDesc(tpl.description || '');
    setEditForm({ ...DEFAULT_FORM, ...tpl.form });
    setMode('edit');
  }
  function goBack() { setMode('list'); }

  function saveTemplate() {
    if (!editName.trim()) return;
    const now = new Date().toISOString().slice(0, 10);
    if (editId) {
      updateTemplates(templates.map(t =>
        t.id === editId ? { ...t, name: editName.trim(), description: editDesc.trim(), form: editForm } : t
      ));
    } else {
      updateTemplates([...templates, {
        id: gid(), name: editName.trim(), description: editDesc.trim(),
        form: editForm, archived: false, createdAt: now,
      }]);
    }
    setMode('list');
  }

  function archiveTemplate(id: string) {
    const now = new Date().toISOString().slice(0, 10);
    updateTemplates(templates.map(t => t.id === id ? { ...t, archived: true, archivedAt: now } : t));
  }
  function restoreTemplate(id: string) {
    updateTemplates(templates.map(t => t.id === id ? { ...t, archived: false, archivedAt: null } : t));
  }
  function deleteTemplate(id: string) {
    updateTemplates(templates.filter(t => t.id !== id));
    setConfirmDelete(null);
  }

  const canSave = editName.trim().length > 0;

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:'var(--bg-primary)', borderRadius:14, width:'min(920px,96vw)', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.28)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'0.5px solid var(--border-light)', flexShrink:0 }}>
          {mode === 'edit' ? (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button onClick={goBack} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', fontSize:13, padding:'4px 8px', borderRadius:6 }}>
                ← Назад
              </button>
              <span style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>
                {editId ? 'Редактировать шаблон' : 'Новый шаблон'}
              </span>
            </div>
          ) : (
            <span style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>Шаблоны</span>
          )}
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text-tertiary)', lineHeight:1, padding:'2px 8px', borderRadius:6 }}>✕</button>
        </div>

        {/* Content */}
        {mode === 'list' ? (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {/* Tabs + new button */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', gap:4, flex:1 }}>
                {([
                  { key:'active' as const,  label:`Активные (${active.length})`  },
                  { key:'archive' as const, label:`Архив (${archived.length})`   },
                ]).map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    padding:'6px 16px', border:'none', borderRadius:6, cursor:'pointer',
                    fontSize:13, fontWeight:600, transition:'all 0.15s',
                    background: tab === t.key ? 'var(--accent)' : 'var(--bg-secondary)',
                    color:      tab === t.key ? '#fff'          : 'var(--text-secondary)',
                  }}>{t.label}</button>
                ))}
              </div>
              {tab === 'active' && (
                <BtnPrimary onClick={startNew}>+ Новый шаблон</BtnPrimary>
              )}
            </div>

            {tab === 'active' ? (
              active.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-tertiary)', fontSize:14 }}>
                  Шаблонов пока нет. Нажмите «+ Новый шаблон» чтобы создать первый.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {active.map(tpl => (
                    <TemplateCard key={tpl.id} tpl={tpl}
                      onEdit={()    => startEdit(tpl)}
                      onArchive={()  => archiveTemplate(tpl.id)}
                    />
                  ))}
                </div>
              )
            ) : (
              archived.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-tertiary)', fontSize:14 }}>
                  Архив пуст.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {archived.map(tpl => (
                    <div key={tpl.id}>
                      <TemplateCard tpl={tpl}
                        onRestore={() => restoreTemplate(tpl.id)}
                        onDelete={()  => setConfirmDelete(tpl.id)}
                      />
                      {confirmDeleteId === tpl.id && (
                        <div style={{ background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:8, padding:'12px 14px', marginTop:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                          <span style={{ fontSize:13, color:'var(--red)' }}>Удалить «{tpl.name}» безвозвратно?</span>
                          <div style={{ display:'flex', gap:8 }}>
                            <BtnSecondary onClick={() => setConfirmDelete(null)} style={{ padding:'4px 12px', fontSize:12 }}>Отмена</BtnSecondary>
                            <BtnDanger    onClick={() => deleteTemplate(tpl.id)} style={{ padding:'4px 12px', fontSize:12 }}>Удалить</BtnDanger>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        ) : (
          /* Editor */
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:5 }}>Название *</div>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Название шаблона"
                  style={{
                    width:'100%', padding:'8px 10px', borderRadius:7, boxSizing:'border-box',
                    border: editName.trim() ? '1.5px solid var(--border-mid)' : '1.5px solid var(--red)',
                    background:'var(--bg-secondary)', color:'var(--text-primary)', fontSize:14, outline:'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
                  onBlur={e  => { e.target.style.borderColor = editName.trim() ? 'var(--border-mid)' : 'var(--red)'; }}
                />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:5 }}>Описание</div>
                <input
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Краткое описание (необязательно)"
                  style={{
                    width:'100%', padding:'8px 10px', borderRadius:7, boxSizing:'border-box',
                    border:'1.5px solid var(--border-mid)',
                    background:'var(--bg-secondary)', color:'var(--text-primary)', fontSize:14, outline:'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--border-mid)'; }}
                />
              </div>
            </div>

            <ParameterForm form={editForm} onChange={setEditForm} />
          </div>
        )}

        {/* Footer (editor only) */}
        {mode === 'edit' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'12px 20px', borderTop:'0.5px solid var(--border-light)', flexShrink:0, background:'var(--bg-secondary)' }}>
            <BtnSecondary onClick={goBack}>Отмена</BtnSecondary>
            <BtnPrimary
              onClick={saveTemplate}
              style={{ opacity: canSave ? 1 : 0.45, pointerEvents: canSave ? 'auto' : 'none' }}
            >
              💾 {editId ? 'Сохранить изменения' : 'Создать шаблон'}
            </BtnPrimary>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

interface EstimateProps extends PageProps { initialTaskId?: string; }

export default function Estimate({ data, updateData, initialTaskId }: EstimateProps) {
  const allTasks  = data.tasks || [];
  const templates: EstimateTemplate[] = data.estimateTemplates || [];

  // Tasks visible in the selector: только активные задачи.
  // Архивные/завершённые не показываем, даже если у них сохранена оценка.
  const displayTasks = allTasks.filter(t => t.status === 'active');
  const withEstimate  = displayTasks.filter(t =>  t.estimateForm);
  const withoutEst    = displayTasks.filter(t => !t.estimateForm);

  const [form, setForm] = useState<ScenarioForm>(() => {
    if (initialTaskId) {
      const t = allTasks.find(t => t.id === initialTaskId);
      if (t?.estimateForm) return { ...DEFAULT_FORM, ...(t.estimateForm as ScenarioForm) };
    }
    return DEFAULT_FORM;
  });
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || '');
  const [activeTplId,    setActiveTplId] = useState('');
  const [showManager,    setShowManager] = useState(false);
  const [showPertInfo,   setShowPertInfo] = useState(false);
  const [saved,          setSaved]       = useState(false);
  const [confirmSave,    setConfirmSave] = useState(false);

  const O = useMemo(() => calcScenario(form, 'o'), [form]);
  const M = useMemo(() => calcScenario(form, 'm'), [form]);
  const P = useMemo(() => calcScenario(form, 'p'), [form]);

  const pert  = (O.total + 4 * M.total + P.total) / 6;
  const sigma = (P.total - O.total) / 6;

  const activeTemplates = templates.filter(t => !t.archived);
  const selectedTask    = allTasks.find(t => t.id === selectedTaskId) || null;

  // Load task estimate into the form
  function selectTask(id: string) {
    setSelectedTaskId(id);
    setSaved(false);
    setConfirmSave(false);
    setActiveTplId('');
    if (!id) return;
    const task = allTasks.find(t => t.id === id);
    if (task?.estimateForm) {
      setForm({ ...DEFAULT_FORM, ...task.estimateForm });
    }
  }

  function applyTemplate(id: string) {
    setActiveTplId(id);
    if (!id) { setForm(DEFAULT_FORM); return; }
    const tpl = templates.find(t => t.id === id);
    if (tpl) setForm({ ...DEFAULT_FORM, ...tpl.form });
  }

  function updateTemplates(newTemplates: EstimateTemplate[]) {
    updateData(prev => ({ ...prev, estimateTemplates: newTemplates }));
  }

  // Save both the full form and the computed PERT hours to the task
  function saveToTask() {
    if (!selectedTaskId) return;
    updateData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t =>
        t.id === selectedTaskId
          ? { ...t, estimateHours: Math.round(pert), estimateForm: form }
          : t
      ),
    }));
    setConfirmSave(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleSaveClick() {
    if (selectedTask?.estimateForm) {
      setConfirmSave(true);
    } else {
      saveToTask();
    }
  }

  const breakdown = [
    { label:'Анализ задач',          val: M.stage1 },
    { label:'Работа с тест-кейсами', val: M.stage2 },
    { label:'Прогон',                val: M.stage3 },
    { label:'Накладные расходы',     val: M.stage4 },
    { label:'Дефекты и ретесты',     val: M.stage5 },
  ];

  // Shared select style
  const selStyle = {
    padding:'6px 10px', borderRadius:7, border:'1.5px solid var(--border-mid)',
    background:'var(--bg-secondary)', color:'var(--text-primary)',
    fontSize:13, outline:'none', cursor:'pointer',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Оценка трудозатрат">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>

          {/* Task selector */}
          <select
            value={selectedTaskId}
            onChange={e => selectTask(e.target.value)}
            style={{ ...selStyle, maxWidth:220, borderColor: selectedTaskId ? 'var(--accent)' : 'var(--border-mid)' }}
          >
            <option value="">— Задача не выбрана —</option>
            {withEstimate.length > 0 && (
              <optgroup label="С сохранённой оценкой">
                {withEstimate.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
            {withoutEst.length > 0 && (
              <optgroup label="Активные (без оценки)">
                {withoutEst.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>

          {/* Template selector */}
          {activeTemplates.length > 0 && (
            <select value={activeTplId} onChange={e => applyTemplate(e.target.value)} style={{ ...selStyle, maxWidth:200 }}>
              <option value="">— Шаблон —</option>
              {activeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <BtnSecondary onClick={() => setShowManager(true)}>Шаблоны</BtnSecondary>
        </div>
      </PageTopbar>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20, alignItems:'start' }}>

          {/* LEFT: parameter form */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <ParameterForm form={form} onChange={f => { setForm(f); setSaved(false); setConfirmSave(false); }} />
            <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:4 }}>
              <button
                onClick={() => { setForm(DEFAULT_FORM); setActiveTplId(''); setSaved(false); }}
                style={{ fontSize:12, color:'var(--text-tertiary)', background:'none', border:'none', cursor:'pointer', padding:'4px 0' }}
              >
                ↺ Сбросить к значениям по умолчанию
              </button>
            </div>
          </div>

          {/* RIGHT: results (sticky) */}
          <div style={{ position:'sticky', top:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* Task context banner */}
            {selectedTask && (
              <div style={{ background:'var(--accent-bg)', border:'1px solid rgba(59,130,246,0.25)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:2 }}>ЗАДАЧА</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{selectedTask.name}</div>
                  {selectedTask.estimateHours != null && selectedTask.estimateHours > 0 && (
                    <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>
                      Сохранено: {selectedTask.estimateHours} ч
                      {selectedTask.estimateForm && ' · полная форма'}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => selectTask('')}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', fontSize:16, lineHeight:1, flexShrink:0, padding:'2px 4px' }}
                  title="Снять задачу"
                >✕</button>
              </div>
            )}

            {/* 3 scenario cards */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {SCENARIO_META.map(sc => {
                const res = sc.s==='o' ? O : sc.s==='m' ? M : P;
                return (
                  <div key={sc.s} style={{ background:sc.bg, border:`1px solid ${sc.border}`, borderRadius:10, padding:'12px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:sc.color, marginBottom:5 }}>{sc.label}</div>
                    <div style={{ fontSize:19, fontWeight:700, color:sc.color }}>{fmtHInt(res.total)}</div>
                  </div>
                );
              })}
            </div>

            {/* PERT */}
            <div style={{ background:'var(--bg-primary)', border:'2px solid var(--accent)', borderRadius:12, padding:'18px 16px', textAlign:'center', position:'relative' }}>
              <button
                onClick={() => setShowPertInfo(true)}
                title="Как работает PERT?"
                style={{
                  position:'absolute', top:8, right:8,
                  width:20, height:20, borderRadius:'50%',
                  border:'1.5px solid var(--border-mid)',
                  background:'var(--bg-secondary)',
                  color:'var(--text-tertiary)',
                  fontSize:11, fontWeight:700, lineHeight:1,
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  padding:0,
                }}
              >?</button>
              <div style={{ fontSize:11, color:'var(--text-tertiary)', marginBottom:2 }}>
                PERT-оценка &nbsp;·&nbsp; <span style={{ fontFamily:'monospace' }}>(O + 4M + P) / 6</span>
              </div>
              <div style={{ fontSize:40, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-1px', lineHeight:1.1 }}>
                {fmtHInt(pert)}
              </div>
              <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:4 }}>σ = {fmtH(sigma)}</div>
            </div>

            {/* Confidence intervals */}
            <Card>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:10 }}>Доверительные интервалы</div>
              {[
                { label:'68%  (E ± σ)',  lo: pert - sigma,    hi: pert + sigma    },
                { label:'95%  (E ± 2σ)', lo: pert - 2*sigma, hi: pert + 2*sigma  },
              ].map(ci => (
                <div key={ci.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, marginBottom:6 }}>
                  <span style={{ color:'var(--text-tertiary)', fontFamily:'monospace', fontSize:12 }}>{ci.label}</span>
                  <span style={{ color:'var(--text-primary)', fontWeight:600 }}>
                    {fmtHInt(Math.max(0, ci.lo))} – {fmtHInt(ci.hi)}
                  </span>
                </div>
              ))}
            </Card>

            {/* Stage breakdown */}
            <Card>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:10 }}>Структура (реалистичный сценарий)</div>
              {breakdown.map(row => {
                const share = M.subtotal > 0 ? row.val / M.subtotal : 0;
                return (
                  <div key={row.label} style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                      <span style={{ color:'var(--text-secondary)' }}>{row.label}</span>
                      <span style={{ color:'var(--text-primary)', fontWeight:500 }}>
                        {fmtH(row.val)}&nbsp;<span style={{ color:'var(--text-tertiary)' }}>({Math.round(share*100)}%)</span>
                      </span>
                    </div>
                    <div style={{ height:3, background:'var(--bg-secondary)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${share*100}%`, background:'var(--accent)', borderRadius:2 }}/>
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop:'0.5px solid var(--border-light)', marginTop:8, paddingTop:8, fontSize:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', color:'var(--text-tertiary)', marginBottom:4 }}>
                  <span>+ Риски (×{M.riskCoeff.toFixed(2)})</span>
                  <span>+{fmtH(M.withRisks - M.subtotal)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', color:'var(--text-tertiary)', marginBottom:8 }}>
                  <span>+ Резерв</span>
                  <span>+{fmtH(M.reserve)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>
                  <span>Итого (реалист.)</span>
                  <span>{fmtH(M.total)}</span>
                </div>
              </div>
            </Card>

            {/* Save / task picker */}
            <Card>
              {selectedTask ? (
                /* Task already selected */
                saved ? (
                  <div style={{ textAlign:'center', fontSize:13, color:'var(--accent)', fontWeight:600, padding:'8px', background:'var(--accent-bg)', borderRadius:7 }}>
                    ✅ Сохранено — {fmtHInt(pert)}
                  </div>
                ) : confirmSave ? (
                  /* Confirmation dialog (only shown when task already has an estimate) */
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Заменить сохранённую оценку?</div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-tertiary)' }}>
                      <span>Текущая</span>
                      <span style={{ fontWeight:600, color:'var(--text-secondary)' }}>{selectedTask.estimateHours} ч</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-tertiary)' }}>
                      <span>Новая</span>
                      <span style={{ fontWeight:700, color:'var(--accent)' }}>{fmtHInt(pert)}</span>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <BtnSecondary onClick={() => setConfirmSave(false)} style={{ flex:1, justifyContent:'center' }}>Отмена</BtnSecondary>
                      <BtnPrimary   onClick={saveToTask}                  style={{ flex:1, justifyContent:'center' }}>Заменить</BtnPrimary>
                    </div>
                  </div>
                ) : (
                  <BtnPrimary onClick={handleSaveClick} style={{ width:'100%', justifyContent:'center' }}>
                    💾 Сохранить {fmtHInt(pert)} → «{selectedTask.name}»
                  </BtnPrimary>
                )
              ) : (
                /* No task selected — show inline picker */
                <>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>Сохранить PERT в задачу</div>
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) selectTask(e.target.value); }}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:7, boxSizing:'border-box', border:'1.5px solid var(--border-mid)', background:'var(--bg-secondary)', color:'var(--text-primary)', fontSize:13, marginBottom:10, outline:'none' }}
                  >
                    <option value="">— выберите задачу —</option>
                    {withEstimate.length > 0 && (
                      <optgroup label="С сохранённой оценкой">
                        {withEstimate.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )}
                    {withoutEst.length > 0 && (
                      <optgroup label="Активные (без оценки)">
                        {withoutEst.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <div style={{ fontSize:12, color:'var(--text-tertiary)', textAlign:'center' }}>
                    Выберите задачу выше — оценка загрузится автоматически
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      {showManager && (
        <TemplateManager
          templates={templates}
          updateTemplates={updateTemplates}
          onClose={() => setShowManager(false)}
        />
      )}

      {showPertInfo && (
        <Modal title="Метод PERT: как считается оценка" onClose={() => setShowPertInfo(false)} width={540}>
          <div style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.7 }}>

            <p style={{ marginTop:0 }}>
              <strong>PERT</strong> (Program Evaluation and Review Technique) — метод взвешенной оценки, который учитывает неопределённость через три сценария.
            </p>

            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontFamily:'monospace', fontSize:13, textAlign:'center' }}>
              E = (O + 4 × M + P) / 6
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {[
                { label:'O — Оптимистичный', color:'#22c55e', desc:'Лучший случай: всё идёт идеально, без задержек и неожиданностей.' },
                { label:'M — Реалистичный', color:'var(--accent)', desc:'Наиболее вероятный исход при нормальном ходе работ.' },
                { label:'P — Пессимистичный', color:'#f97316', desc:'Худший случай: задержки, ошибки, нестабильная среда.' },
              ].map(({ label, color, desc }) => (
                <div key={label} style={{ display:'flex', gap:10 }}>
                  <div style={{ width:3, borderRadius:2, background:color, flexShrink:0 }}/>
                  <div>
                    <div style={{ fontWeight:600, color, fontSize:13 }}>{label}</div>
                    <div style={{ fontSize:13, color:'var(--text-tertiary)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <p>
              Реалистичный сценарий имеет вес <strong>4</strong>, поэтому PERT-оценка близка к M, но сдвинута в сторону пессимиста пропорционально разбросу. Чем больше разница между P и M — тем выше PERT относительно реалиста.
            </p>

            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>Стандартное отклонение (σ)</div>
              <div style={{ fontFamily:'monospace', fontSize:13, textAlign:'center', marginBottom:6 }}>σ = (P − O) / 6</div>
              <div style={{ fontSize:13, color:'var(--text-tertiary)' }}>
                Показывает «разброс» оценки. Используется для доверительных интервалов:<br/>
                <strong>68%</strong> вероятность укладывания в E ± σ<br/>
                <strong>95%</strong> вероятность укладывания в E ± 2σ
              </div>
            </div>

            <p style={{ marginBottom:0, color:'var(--text-tertiary)', fontSize:13 }}>
              В задачу сохраняется PERT-оценка (E), а не реалистичный сценарий — она точнее отражает риски и служит основой для планирования сроков.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
