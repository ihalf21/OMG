import React, { useState } from 'react';
import { Modal, ModalFooter } from './UI';
import CHANGELOG from '../changelog.json';


function IconDashboard({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  );
}

function IconTasks({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke={c} strokeWidth="1.5"/>
      <line x1="5" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="9" x2="13" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="10" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconTeam({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M1.5 16c0-3 2.5-4.5 5.5-4.5S12.5 13 12.5 16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13.5" cy="6.5" r="2" stroke={c} strokeWidth="1.3"/>
      <path d="M16.5 16c0-2.5-1.3-3.8-3-4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconGantt({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="3" y1="2.5" x2="3" y2="14.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3" y1="14.5" x2="15.5" y2="14.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="5" y="4" width="7" height="2.5" rx="1" fill={c}/>
      <rect x="7" y="7.5" width="5.5" height="2.5" rx="1" fill={c} opacity="0.75"/>
      <rect x="5" y="11" width="3.5" height="2.5" rx="1" fill={c} opacity="0.45"/>
    </svg>
  );
}

function IconEstimate({ active }) {
  const c = active ? '#1D9E75' : '#8C8B87';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke={c} strokeWidth="1.5"/>
      <line x1="5" y1="6" x2="8" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="9" x2="8" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="9" x2="13" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="8" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="11" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Дашборд',   Icon: IconDashboard },
  { id: 'tasks',     label: 'Задачи',    Icon: IconTasks },
  { id: 'estimate',  label: 'Оценка',    Icon: IconEstimate },
  { id: 'team',      label: 'Команда',   Icon: IconTeam },
  { id: 'gantt',     label: 'Диаграмма', Icon: IconGantt },
];

export default function Sidebar({
  activePage,
  onNavigate,
  projects = [],
  currentProjectId,
  onSelectProject,
  onAddProject,
  onEditProject,
}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [hoveredProject, setHoveredProject] = useState(null);
  const [projectModal, setProjectModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', project }
  const [projectName, setProjectName] = useState('');

  const active = activePage === 'task' ? 'tasks' : activePage === 'engineer' ? 'team' : activePage;
  const currentVersion = CHANGELOG[0].version;

  function openAdd() {
    setProjectName('');
    setProjectModal({ mode: 'add' });
  }

  function openEdit(project) {
    setProjectName(project.name);
    setProjectModal({ mode: 'edit', project });
  }

  function handleProjectSave() {
    const name = projectName.trim();
    if (!name) return;
    if (projectModal.mode === 'add') {
      onAddProject(name);
    } else {
      onEditProject(projectModal.project.id, name);
    }
    setProjectModal(null);
  }

  return (
    <>
      <div style={{
        width: 224, minWidth: 224,
        background: 'var(--bg-primary)',
        borderRight: '0.5px solid var(--border-light)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '0.5px solid var(--border-light)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>OMG</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Oh My Gantt</div>
        </div>

        {/* Projects */}
        <div style={{ borderBottom: '0.5px solid var(--border-light)', paddingBottom: 8 }}>
          <div style={{
            padding: '10px 20px 6px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--text-tertiary)', textTransform: 'uppercase',
            }}>Проекты</div>
            <button
              onClick={openAdd}
              title="Добавить проект"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1,
                padding: '0 2px', display: 'flex', alignItems: 'center',
                borderRadius: 4, transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >+</button>
          </div>

          {projects.map(p => {
            const isActive = p.id === currentProjectId;
            const isHovered = hoveredProject === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                onMouseEnter={() => setHoveredProject(p.id)}
                onMouseLeave={() => setHoveredProject(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px 7px 16px', cursor: 'pointer',
                  background: isActive ? 'var(--bg-secondary)' : isHovered ? 'var(--bg-secondary)' : 'transparent',
                  borderLeft: `2.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? 'var(--accent)' : 'var(--border-mid)',
                  transition: 'background 0.15s',
                }}/>
                <span style={{
                  flex: 1, fontSize: 13,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</span>
                <button
                  onClick={e => { e.stopPropagation(); openEdit(p); }}
                  title="Переименовать"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px',
                    borderRadius: 4, flexShrink: 0, lineHeight: 1,
                    opacity: isActive || isHovered ? 1 : 0,
                    transition: 'opacity 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                >✎</button>
              </div>
            );
          })}

          <div
            onClick={openAdd}
            style={{
              padding: '5px 20px', fontSize: 12,
              color: 'var(--text-tertiary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
            <span>Добавить проект</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 0', flex: 1 }}>
          {NAV.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <div key={id} onClick={() => onNavigate(id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', fontSize: 14,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                borderLeft: `2.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon active={isActive} />
                {label}
              </div>
            );
          })}
        </nav>

        {/* Version history */}
        <div style={{ borderTop: '0.5px solid var(--border-light)', padding: '12px 20px' }}>
          <div
            onClick={() => setShowChangelog(true)}
            style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span>📋</span>
            <span>История версий v{currentVersion}</span>
          </div>
        </div>
      </div>

      {/* Changelog modal */}
      {showChangelog && (
        <Modal title="История версий" onClose={() => setShowChangelog(false)} width={520}>
          <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
            {CHANGELOG.map((ver, vi) => (
              <div key={ver.version} style={{ marginBottom: vi < CHANGELOG.length - 1 ? 24 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>v{ver.version}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{ver.date}</div>
                  {vi === 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 600 }}>текущая</span>}
                </div>
                <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ver.changes.map((c, i) => (
                    <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowChangelog(false)} style={{
              padding: '8px 24px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Закрыть</button>
          </div>
        </Modal>
      )}

      {/* Project add/edit modal */}
      {projectModal && (
        <Modal
          title={projectModal.mode === 'add' ? 'Новый проект' : 'Переименовать проект'}
          onClose={() => setProjectModal(null)}
          width={380}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
              Название проекта
            </div>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleProjectSave(); if (e.key === 'Escape') setProjectModal(null); }}
              placeholder="Например: Релиз 4.5"
              autoFocus
              style={{
                width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                border: '1.5px solid var(--border-mid)', borderRadius: 6,
                fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-mid)'}
            />
          </div>
          <ModalFooter
            onCancel={() => setProjectModal(null)}
            onSave={handleProjectSave}
            saveLabel={projectModal.mode === 'add' ? 'Создать' : 'Сохранить'}
          />
        </Modal>
      )}
    </>
  );
}
