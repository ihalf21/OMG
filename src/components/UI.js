import React from 'react';

export function Badge({ children, bg, color, style = {} }) {
  return (
    <span style={{ display:'inline-block', fontSize:12, padding:'3px 9px', borderRadius:4, background:bg, color, whiteSpace:'nowrap', fontWeight:500, ...style }}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }) {
  const map = {
    lead:        { bg:'#EEEDFE', color:'#3C3489', label:'Лид' },
    responsible: { bg:'var(--amber-bg)', color:'var(--amber)', label:'Ответственный' },
    engineer:    { bg:'var(--bg-secondary)', color:'var(--text-secondary)', label:'Инженер' },
    intern:      { bg:'var(--blue-bg)', color:'var(--blue)', label:'Стажёр' },
  };
  const s = map[role] || map.engineer;
  return <Badge bg={s.bg} color={s.color}>{s.label}</Badge>;
}

export function StatusBadge({ status }) {
  const map = {
    active:   { bg:'var(--success-bg)', color:'var(--success)', label:'Доступен' },
    vacation: { bg:'var(--amber-bg)', color:'var(--amber)', label:'Отпуск' },
    sick:     { bg:'var(--red-bg)', color:'var(--red)', label:'Больничный' },
    dayoff:   { bg:'var(--blue-bg)', color:'var(--blue)', label:'Дейоф' },
  };
  const s = map[status] || map.active;
  return <Badge bg={s.bg} color={s.color}>{s.label}</Badge>;
}

export function TypeBadge({ type }) {
  return type === 'regular'
    ? <Badge bg="var(--bg-secondary)" color="var(--text-secondary)">Регулярная</Badge>
    : <Badge bg="var(--blue-bg)" color="var(--blue)">Нерегулярная</Badge>;
}

// Star rating component
export function StarRating({ value = 0, max = 5, onChange, readonly = true }) {
  return (
    <div style={{ display:'flex', gap:3 }}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value;
        return (
          <span
            key={i}
            onClick={() => !readonly && onChange && onChange(i + 1 === value ? i : i + 1)}
            style={{
              fontSize: 16,
              color: filled ? '#F0A030' : 'var(--border-mid)',
              cursor: readonly ? 'default' : 'pointer',
              transition: 'color 0.15s, transform 0.1s',
              display: 'inline-block',
              lineHeight: 1,
            }}
            onMouseEnter={e => { if (!readonly) e.currentTarget.style.transform = 'scale(1.2)'; }}
            onMouseLeave={e => { if (!readonly) e.currentTarget.style.transform = 'scale(1)'; }}
          >★</span>
        );
      })}
    </div>
  );
}

export function Avatar({ name, size = 28, style = {} }) {
  const colors = [
    { bg:'#9FE1CB', color:'#085041' },
    { bg:'#B5D4F4', color:'#0C447C' },
    { bg:'#CECBF6', color:'#3C3489' },
    { bg:'#F5C4B3', color:'#712B13' },
    { bg:'#FAC775', color:'#633806' },
    { bg:'#C0DD97', color:'#27500A' },
    { bg:'#D3D1C7', color:'#444441' },
  ];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  const { bg, color } = colors[idx];
  const initials = name ? name.split(' ').slice(0,2).map(p=>p[0]).join('') : '??';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:size, height:size, borderRadius:'50%',
      background:bg, color, fontSize:size*0.35, fontWeight:700, flexShrink:0, ...style,
    }}>{initials}</span>
  );
}

export function ProgressBar({ pct, color='var(--accent)', height=5 }) {
  return (
    <div style={{ height, background:'var(--border-light)', borderRadius:height/2, overflow:'hidden' }}>
      <div style={{ width:`${Math.min(100,pct)}%`, height:'100%', background:color, borderRadius:height/2, transition:'width 0.3s' }}/>
    </div>
  );
}

export function Card({ children, style={}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:'var(--bg-primary)', border:'0.5px solid var(--border-light)',
      borderRadius:10, padding:'14px 16px', ...style,
      cursor:onClick?'pointer':undefined, transition:'border-color 0.15s',
    }}
    onMouseEnter={onClick?e=>e.currentTarget.style.borderColor='var(--border-mid)':undefined}
    onMouseLeave={onClick?e=>e.currentTarget.style.borderColor='var(--border-light)':undefined}
    >{children}</div>
  );
}

export function PageTopbar({ title, children }) {
  return (
    <div style={{
      background:'var(--bg-primary)', borderBottom:'0.5px solid var(--border-light)',
      padding:'13px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0,
    }}>
      <div style={{ fontSize:17, fontWeight:600, flex:1 }}>{title}</div>
      {children}
    </div>
  );
}

export function BtnPrimary({ children, onClick, style={} }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6,
      padding:'8px 18px', background:'var(--accent)', color:'#fff',
      border:'none', borderRadius:6, fontSize:14, fontWeight:600,
      cursor:'pointer', transition:'background 0.15s', ...style,
    }}
    onMouseEnter={e=>e.currentTarget.style.background='var(--accent-hover)'}
    onMouseLeave={e=>e.currentTarget.style.background='var(--accent)'}
    >{children}</button>
  );
}

export function BtnSecondary({ children, onClick, style={} }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6,
      padding:'8px 16px', background:'var(--bg-secondary)', color:'var(--text-primary)',
      border:'1.5px solid var(--border-mid)', borderRadius:6, fontSize:14, fontWeight:500,
      cursor:'pointer', transition:'all 0.15s', ...style,
    }}
    onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-tertiary)';e.currentTarget.style.borderColor='var(--border-mid)';}}
    onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-secondary)';e.currentTarget.style.borderColor='var(--border-mid)';}}
    >{children}</button>
  );
}

export function BtnDanger({ children, onClick, style={} }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6,
      padding:'8px 16px', background:'transparent', color:'var(--red)',
      border:'1.5px solid var(--red)', borderRadius:6, fontSize:14, fontWeight:500,
      cursor:'pointer', transition:'all 0.15s', ...style,
    }}
    onMouseEnter={e=>e.currentTarget.style.background='var(--red-bg)'}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
    >{children}</button>
  );
}

export function BackBtn({ onClick, label='Назад' }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, fontSize:14,
      color:'var(--text-secondary)', padding:'8px 14px',
      border:'1.5px solid var(--border-mid)', borderRadius:6,
      background:'var(--bg-secondary)', cursor:'pointer', fontWeight:500,
    }}
    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-tertiary)'}
    onMouseLeave={e=>e.currentTarget.style.background='var(--bg-secondary)'}
    >← {label}</button>
  );
}

export function FieldRow({ label, children }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'9px 0', borderBottom:'0.5px solid var(--border-light)', fontSize:14,
    }}>
      <span style={{ color:'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color:'var(--text-primary)', fontWeight:500, textAlign:'right' }}>{children}</span>
    </div>
  );
}

export function SectionTitle({ children, action, onAction }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)' }}>{children}</div>
      {action && <span onClick={onAction} style={{ fontSize:14, color:'var(--accent)', cursor:'pointer', fontWeight:500 }}>{action}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, width=480 }) {
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
    }} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{
        background:'var(--bg-primary)', borderRadius:12,
        border:'0.5px solid var(--border-light)', padding:24,
        width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 8px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontSize:17, fontWeight:600, marginBottom:20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export function FormRow({ label, children, hint }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:5, fontWeight:500 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:4 }}>{hint}</div>}
    </div>
  );
}

export function Input({ value, onChange, placeholder, type='text', style={} }) {
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} type={type} style={{
      width:'100%', padding:'9px 11px',
      border:'1.5px solid var(--border-mid)', borderRadius:6,
      fontSize:14, background:'var(--bg-secondary)', color:'var(--text-primary)',
      outline:'none', transition:'border-color 0.15s', ...style,
    }}
    onFocus={e=>e.target.style.borderColor='var(--accent)'}
    onBlur={e=>e.target.style.borderColor='var(--border-mid)'}
    />
  );
}

export function Select({ value, onChange, children, style={} }) {
  return (
    <select value={value} onChange={onChange} style={{
      width:'100%', padding:'9px 11px',
      border:'1.5px solid var(--border-mid)', borderRadius:6,
      fontSize:14, background:'var(--bg-secondary)', color:'var(--text-primary)',
      outline:'none', ...style,
    }}>{children}</select>
  );
}

export function ModalFooter({ onCancel, onSave, saveLabel='Сохранить' }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
      <BtnSecondary onClick={onCancel}>Отмена</BtnSecondary>
      <BtnPrimary onClick={onSave}>{saveLabel}</BtnPrimary>
    </div>
  );
}

// Resizable columns hook — persists widths to localStorage
export function useResizableColumns(storageKey, initialWidths) {
  const [widths, setWidths] = React.useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(stored) && stored.length === initialWidths.length ? stored : initialWidths;
    } catch { return initialWidths; }
  });
  const dragging = React.useRef(null);

  function startResize(colIdx, e) {
    e.preventDefault();
    dragging.current = { colIdx, startX: e.clientX, startWidth: widths[colIdx] };

    function onMouseMove(e) {
      if (!dragging.current) return;
      const newWidth = Math.max(50, dragging.current.startWidth + e.clientX - dragging.current.startX);
      setWidths(prev => {
        const next = [...prev];
        next[dragging.current.colIdx] = newWidth;
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
        return next;
      });
    }

    function onMouseUp() {
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return { widths, startResize };
}

export function ResizeHandle({ onMouseDown }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseDown={e => { e.stopPropagation(); onMouseDown(e); }}
      onClick={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position:'absolute', right:0, top:0, bottom:0, width:5,
        cursor:'col-resize', zIndex:1, userSelect:'none',
        background: hovered ? 'var(--accent)' : 'transparent',
        opacity: 0.4, transition:'background 0.15s',
      }}
    />
  );
}

// ── ConfirmDialog + useConfirm ────────────────────────────────────────────────

export function ConfirmDialog({ open, title, message, confirmLabel='Подтвердить', danger=true, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background:'var(--bg-primary)', borderRadius:12, border:'0.5px solid var(--border-light)', padding:28, width:420, maxWidth:'95vw', boxShadow:'0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:10, color:'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:24, whiteSpace:'pre-line' }}>{message}</div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <BtnSecondary onClick={onCancel}>Отмена</BtnSecondary>
          {danger
            ? <BtnDanger onClick={onConfirm}>{confirmLabel}</BtnDanger>
            : <BtnPrimary onClick={onConfirm}>{confirmLabel}</BtnPrimary>}
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = React.useState({ open:false, title:'', message:'', confirmLabel:'Подтвердить', danger:true, resolve:null });

  const confirm = React.useCallback((title, message, opts = {}) => {
    return new Promise(resolve => {
      setState({ open:true, title, message, confirmLabel:opts.confirmLabel||'Подтвердить', danger:opts.danger!==false, resolve });
    });
  }, []);

  function handleConfirm() {
    state.resolve?.(true);
    setState(s => ({ ...s, open:false, resolve:null }));
  }

  function handleCancel() {
    state.resolve?.(false);
    setState(s => ({ ...s, open:false, resolve:null }));
  }

  const ConfirmEl = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, ConfirmEl };
}

// ── DateRangePicker / DatePicker ──────────────────────────────────────────────
const CAL_MONTHS  = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const CAL_DAYS    = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const CAL_NAV_BTN = { background:'none', border:'none', cursor:'pointer', fontSize:20, lineHeight:1, color:'var(--text-secondary)', padding:'2px 12px', borderRadius:6 };

function buildCells(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const last     = new Date(year, month + 1, 0).getDate();
  const cells    = Array(offset).fill(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  return cells;
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function fmtRu(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${CAL_MONTHS[parseInt(m)-1].slice(0,3).toLowerCase()}. ${y}`;
}

export function DateRangePicker({ from, to, onChange }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const init     = from ? new Date(from + 'T00:00:00') : new Date();

  const [vy, setVy] = React.useState(init.getFullYear());
  const [vm, setVm] = React.useState(init.getMonth());
  const [hov, setHov] = React.useState(null);

  const selecting = !!from && !to;

  function prevMonth() { if (vm === 0) { setVm(11); setVy(y => y-1); } else setVm(m => m-1); }
  function nextMonth() { if (vm === 11) { setVm(0); setVy(y => y+1); } else setVm(m => m+1); }

  function handleClick(d) {
    const s = toISO(vy, vm, d);
    if (!from || (from && to)) { onChange(s, ''); return; }
    const [lo, hi] = s < from ? [s, from] : [from, s];
    onChange(lo, hi);
  }

  // Effective range including hover preview
  const effTo = selecting && hov ? hov : to;
  const lo = from && effTo ? (from <= effTo ? from : effTo) : from || null;
  const hi = from && effTo ? (from <= effTo ? effTo : from) : from || null;

  const cells = buildCells(vy, vm);

  return (
    <div>
      {/* Selected dates */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {[['НАЧАЛО', from, 'Первый нерабочий день'], ['КОНЕЦ', to, 'Последний день отпуска']].map(([lbl, val]) => (
          <div key={lbl} style={{
            flex:1, padding:'9px 12px', background:'var(--bg-secondary)', borderRadius:6,
            border:`1.5px solid ${val ? 'var(--accent)' : 'var(--border-mid)'}`,
          }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.07em', color:'var(--text-tertiary)', marginBottom:2 }}>{lbl}</div>
            <div style={{ fontSize:13, fontWeight: val ? 500 : 400, color: val ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{fmtRu(val)}</div>
          </div>
        ))}
      </div>

      {selecting && (
        <div style={{ fontSize:12, color:'var(--accent)', textAlign:'center', marginBottom:8, fontWeight:500 }}>
          Нажмите на дату окончания
        </div>
      )}

      {/* Calendar card */}
      <div style={{ background:'var(--bg-secondary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>

        {/* Month navigation */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 4px', borderBottom:'0.5px solid var(--border-light)' }}>
          <button style={CAL_NAV_BTN} onClick={prevMonth}>‹</button>
          <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>
            {CAL_MONTHS[vm]} {vy}
          </span>
          <button style={CAL_NAV_BTN} onClick={nextMonth}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'10px 10px 2px' }}>
          {CAL_DAYS.map((d, i) => (
            <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:600, paddingBottom:4,
              color: i >= 5 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'2px 10px 12px', gap:2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const s     = toISO(vy, vm, d);
            const isLo  = s === lo;
            const isHi  = s === hi && hi !== lo;
            const isBth = s === lo && lo === hi;
            const isEnd = isLo || isHi || isBth;
            const inRng = lo && hi && s > lo && s < hi;
            const isTod = s === todayISO;
            const wkend = (i % 7) >= 5;

            return (
              <div
                key={i}
                onClick={() => handleClick(d)}
                onMouseEnter={() => selecting && setHov(s)}
                onMouseLeave={() => selecting && setHov(null)}
                style={{
                  textAlign:'center', padding:'7px 0', borderRadius:6,
                  cursor:'pointer', fontSize:13, userSelect:'none',
                  fontWeight: isEnd ? 700 : 400,
                  background: isEnd ? 'var(--accent)' : inRng ? 'var(--accent-bg)' : 'transparent',
                  color: isEnd ? '#fff' : wkend ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  outline: isTod && !isEnd ? '1.5px solid var(--accent)' : 'none',
                  outlineOffset: '-2px',
                  transition: 'background 0.1s',
                }}
              >
                {d}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginTop:8, fontSize:11, color:'var(--text-tertiary)' }}>
        <span>Начало — первый нерабочий день</span>
        <span>·</span>
        <span>Конец — последний день отпуска</span>
      </div>
    </div>
  );
}

// ── DatePicker (single date) ──────────────────────────────────────────────────
export function DatePicker({ value, onChange, placeholder = 'Выбрать дату', clearable = true }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const init = value ? new Date(value + 'T00:00:00') : new Date();

  const [open, setOpen] = React.useState(false);
  const [vy, setVy] = React.useState(init.getFullYear());
  const [vm, setVm] = React.useState(init.getMonth());

  function prevMonth() { if (vm === 0) { setVm(11); setVy(y => y-1); } else setVm(m => m-1); }
  function nextMonth() { if (vm === 11) { setVm(0); setVy(y => y+1); } else setVm(m => m+1); }

  function handleDayClick(d) {
    onChange(toISO(vy, vm, d));
    setOpen(false);
  }

  const cells = buildCells(vy, vm);

  return (
    <div>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width:'100%', padding:'9px 11px', textAlign:'left',
          border:`1.5px solid ${open ? 'var(--accent)' : 'var(--border-mid)'}`,
          borderRadius:6, fontSize:14,
          background:'var(--bg-secondary)',
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between',
          transition:'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
      >
        <span>{value ? fmtRu(value) : placeholder}</span>
        <span style={{ fontSize:13, opacity:0.5, flexShrink:0 }}>▾</span>
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div style={{ marginTop:6, background:'var(--bg-secondary)', border:'0.5px solid var(--border-light)', borderRadius:10, overflow:'hidden' }}>

          {/* Month navigation */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 4px', borderBottom:'0.5px solid var(--border-light)' }}>
            <button type="button" style={CAL_NAV_BTN} onClick={prevMonth}>‹</button>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{CAL_MONTHS[vm]} {vy}</span>
            <button type="button" style={CAL_NAV_BTN} onClick={nextMonth}>›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'10px 10px 2px' }}>
            {CAL_DAYS.map((d, i) => (
              <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:600, paddingBottom:4,
                color: i >= 5 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'2px 10px 12px', gap:2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i}/>;
              const s = toISO(vy, vm, d);
              const isSel  = s === value;
              const isTod  = s === todayISO;
              const wkend  = (i % 7) >= 5;
              return (
                <div
                  key={i}
                  onClick={() => handleDayClick(d)}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--accent-bg)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? 'var(--accent)' : 'transparent'; }}
                  style={{
                    textAlign:'center', padding:'7px 0', borderRadius:6,
                    cursor:'pointer', fontSize:13, userSelect:'none',
                    fontWeight: isSel ? 700 : 400,
                    background: isSel ? 'var(--accent)' : 'transparent',
                    color: isSel ? '#fff' : wkend ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    outline: isTod && !isSel ? '1.5px solid var(--accent)' : 'none',
                    outlineOffset: '-2px',
                    transition: 'background 0.1s',
                  }}
                >
                  {d}
                </div>
              );
            })}
          </div>

          {/* Clear / Today row */}
          <div style={{ padding:'6px 10px 10px', borderTop:'0.5px solid var(--border-light)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button
              type="button"
              onClick={() => { onChange(todayISO); setOpen(false); }}
              style={{ fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:4, fontWeight:500 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >Сегодня</button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                style={{ fontSize:12, color:'var(--text-tertiary)', background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:4 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'none'; }}
              >× Очистить</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tooltip hook
export function useTooltip() {
  const [tooltip, setTooltip] = React.useState({ visible:false, x:0, y:0, title:'', rows:[] });

  const show = React.useCallback((e, title, rows) => {
    setTooltip({ visible:true, x:e.clientX+14, y:e.clientY-10, title, rows });
  }, []);

  const move = React.useCallback((e) => {
    setTooltip(t => t.visible ? { ...t, x:e.clientX+14, y:e.clientY-10 } : t);
  }, []);

  const hide = React.useCallback(() => {
    setTooltip(t => ({ ...t, visible:false }));
  }, []);

  const TooltipEl = (
    <div className={`omg-tooltip${tooltip.visible?' visible':''}`} style={{ left:tooltip.x, top:tooltip.y }}>
      {tooltip.title && <div className="omg-tooltip-title">{tooltip.title}</div>}
      {tooltip.rows.map((r,i) => <div key={i} className="omg-tooltip-row">{r}</div>)}
    </div>
  );

  return { show, move, hide, TooltipEl };
}
