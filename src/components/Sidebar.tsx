import React, { useState } from 'react';
import { Modal, ModalFooter, BtnSecondary, BtnDanger } from './UI';
import CHANGELOG from '../changelog.json';
import type { Project, ProjectRole } from '../domain/types';
import type { NavTarget } from '../ui-types';

interface IconProps { active: boolean }

function IconDashboard({ active }: IconProps) {
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

function IconTasks({ active }: IconProps) {
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

function IconTeam({ active }: IconProps) {
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

function IconGantt({ active }: IconProps) {
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

function IconReports({ active }: IconProps) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 3.5C3 2.67 3.67 2 4.5 2h6.17L14 5.83V14.5c0 .83-.67 1.5-1.5 1.5h-8C3.67 16 3 15.33 3 14.5v-11z" stroke={c} strokeWidth="1.5"/>
      <path d="M10.5 2v4H14" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5.5" y1="9" x2="10" y2="9" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="5.5" y1="11.5" x2="10.5" y2="11.5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconNotes({ active }: IconProps) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 2.5C3 1.67 3.67 1 4.5 1h6.17L14 4.83V15.5c0 .83-.67 1.5-1.5 1.5h-8C3.67 17 3 16.33 3 15.5v-13z" stroke={c} strokeWidth="1.5"/>
      <path d="M10.5 1v4H14" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5.5" y1="8"  x2="12.5" y2="8"  stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="5.5" y1="11" x2="12.5" y2="11" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="5.5" y1="14" x2="9"    y2="14" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconAdmin({ active }: IconProps) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="5.5" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M3.5 16c0-3 2.4-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 2.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5.5-1z" fill={c}/>
    </svg>
  );
}

function IconAbsences({ active }: IconProps) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="13" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="2" y1="7" x2="16" y2="7" stroke={c} strokeWidth="1.3"/>
      <line x1="6" y1="1.5" x2="6" y2="4.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="1.5" x2="12" y2="4.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="9.5" width="5.5" height="1.5" rx="0.75" fill={c}/>
      <rect x="6.5" y="12" width="6" height="1.5" rx="0.75" fill={c} opacity="0.65"/>
    </svg>
  );
}

function IconEstimate({ active }: IconProps) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
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

interface NavItem { id: NavTarget; label: string; Icon: React.FC<IconProps> }

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Дашборд',   Icon: IconDashboard },
  { id: 'tasks',     label: 'Задачи',    Icon: IconTasks },
  { id: 'estimate',  label: 'Оценка',    Icon: IconEstimate },
  { id: 'team',      label: 'Команда',   Icon: IconTeam },
  { id: 'absences',  label: 'Отсутствия', Icon: IconAbsences },
  { id: 'gantt',     label: 'Диаграмма', Icon: IconGantt },
  { id: 'reports',   label: 'Отчёты',    Icon: IconReports },
];

const ADMIN_NAV: NavItem = { id: 'admin', label: 'Администрирование', Icon: IconAdmin };

type ProjectModalState = null | { mode: 'add' } | { mode: 'edit'; project: Project };

interface SidebarProps {
  activePage: NavTarget;
  onNavigate: (target: NavTarget) => void;
  projects?: Project[];
  archivedProjects?: Project[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onAddProject: (name: string) => void;
  onEditProject: (id: string, patch: {
    name: string;
    lead: string;
    jiraUrl: string;
    directions: string[];
    plannedEngineers: number | null;
    leadIncluded: boolean;
  }) => void;
  onArchiveProject: (id: string) => void;
  onRestoreProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  isGlobalAdmin?: boolean;
  currentProjectRole?: ProjectRole | null;
}

export default function Sidebar({
  activePage,
  onNavigate,
  projects = [],
  archivedProjects = [],
  currentProjectId,
  onSelectProject,
  onAddProject,
  onEditProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  isGlobalAdmin = false,
  currentProjectRole = null,
}: SidebarProps) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [projectModal, setProjectModal] = useState<ProjectModalState>(null);
  const [projectName, setProjectName] = useState('');
  const [projectLead, setProjectLead] = useState('');
  const [projectJiraUrl, setProjectJiraUrl] = useState('');
  const [projectDirections, setProjectDirections] = useState<string[]>([]);
  const [projectPlannedEngineers, setProjectPlannedEngineers] = useState('');
  const [projectLeadIncluded, setProjectLeadIncluded] = useState(false);
  const [newDirection, setNewDirection] = useState('');
  const [addTab, setAddTab] = useState<'new' | 'archive'>('new');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const active: NavTarget = activePage === 'task' ? 'tasks' : activePage === 'engineer' ? 'team' : activePage;
  const currentVersion = CHANGELOG[0].version;
  const visibleNav = NAV.filter(item => item.id !== 'reports' || isGlobalAdmin || currentProjectRole === 'admin');
  const navItems = isGlobalAdmin ? [...visibleNav, ADMIN_NAV] : visibleNav;

  function openAdd() {
    setProjectName('');
    setAddTab('new');
    setConfirmDeleteId(null);
    setProjectModal({ mode: 'add' });
  }

  function openEdit(project: Project) {
    setProjectName(project.name);
    setProjectLead(project.lead || '');
    setProjectJiraUrl(project.jiraUrl || '');
    setProjectDirections(project.directions || []);
    setProjectPlannedEngineers(project.plannedEngineers != null ? String(project.plannedEngineers) : '');
    setProjectLeadIncluded(project.leadIncluded ?? false);
    setNewDirection('');
    setConfirmArchive(false);
    setProjectModal({ mode: 'edit', project });
  }

  function closeModal() {
    setProjectModal(null);
  }

  function addDirection() {
    const dir = newDirection.trim();
    if (!dir || projectDirections.includes(dir)) return;
    setProjectDirections(d => [...d, dir]);
    setNewDirection('');
  }

  function handleProjectSave() {
    const name = projectName.trim();
    if (!name || !projectModal) return;
    if (projectModal.mode === 'add') {
      onAddProject(name);
    } else {
      onEditProject(projectModal.project.id, {
        name,
        lead: projectLead.trim(),
        jiraUrl: projectJiraUrl.trim(),
        directions: projectDirections,
        plannedEngineers: projectPlannedEngineers.trim() ? (parseInt(projectPlannedEngineers.trim()) || null) : null,
        leadIncluded: projectLeadIncluded,
      });
    }
    closeModal();
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
                width: 28, height: 28, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
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
                  background: isActive ? 'var(--bg-secondary)' : isHovered ? 'rgba(240,160,48,0.08)' : 'transparent',
                  borderLeft: `2.5px solid ${isActive || isHovered ? 'var(--accent)' : 'transparent'}`,
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
                    color: 'var(--text-tertiary)', fontSize: 13,
                    width: 28, height: 28, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, flexShrink: 0, lineHeight: 1,
                    opacity: isActive || isHovered ? 1 : 0,
                    transition: 'opacity 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
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
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--accent)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)')}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
            <span>Добавить проект</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 0', flex: 1 }}>
          {navItems.map(({ id, label, Icon }) => {
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
              onMouseEnter={e => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(240,160,48,0.08)'; el.style.borderLeftColor = 'var(--accent)'; } }}
              onMouseLeave={e => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderLeftColor = 'transparent'; } }}
              >
                <Icon active={isActive} />
                {label}
              </div>
            );
          })}
        </nav>

        {/* Notes (временный раздел) */}
        {isGlobalAdmin && <div style={{ borderTop: '0.5px solid var(--border-light)' }}>
          {(() => {
            const isActive = active === 'notes';
            return (
              <div onClick={() => onNavigate('notes')} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', fontSize: 14,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                borderLeft: `2.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(240,160,48,0.08)'; el.style.borderLeftColor = 'var(--accent)'; } }}
              onMouseLeave={e => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderLeftColor = 'transparent'; } }}
              >
                <IconNotes active={isActive}/>
                Заметки
              </div>
            );
          })()}
        </div>}

        {/* Version history */}
        <div style={{ borderTop: '0.5px solid var(--border-light)', padding: '12px 20px' }}>
          <div
            onClick={() => setShowChangelog(true)}
            style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--accent)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)')}
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

      {/* Project add modal (с вкладкой Архив) */}
      {projectModal?.mode === 'add' && (
        <Modal title="Проекты" onClose={closeModal} width={460}>
          {/* Tab bar */}
          <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1.5px solid var(--border-light)' }}>
            {(['new', 'archive'] as const).map(tab => {
              const isActive = addTab === tab;
              const label = tab === 'new'
                ? 'Новый проект'
                : `Архив${archivedProjects.length > 0 ? ` (${archivedProjects.length})` : ''}`;
              return (
                <button
                  key={tab}
                  onClick={() => { setAddTab(tab); setConfirmDeleteId(null); }}
                  style={{
                    padding: '8px 16px',
                    background: 'none', border: 'none',
                    borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    marginBottom: '-1.5px',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 14, cursor: 'pointer',
                    transition: 'color 0.15s',
                  }}
                >{label}</button>
              );
            })}
          </div>

          {/* Вкладка: Новый проект */}
          {addTab === 'new' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                  Название проекта
                </div>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleProjectSave(); if (e.key === 'Escape') closeModal(); }}
                  placeholder="Например: Релиз 4.5"
                  autoFocus
                  style={{
                    width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                    border: '1.5px solid var(--border-mid)', borderRadius: 6,
                    fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
                />
              </div>
              <ModalFooter onCancel={closeModal} onSave={handleProjectSave} saveLabel="Создать" />
            </>
          )}

          {/* Вкладка: Архив */}
          {addTab === 'archive' && (
            archivedProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>
                Архив пуст
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {archivedProjects.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 8,
                      border: '0.5px solid var(--border-light)',
                      minHeight: 44,
                    }}
                  >
                    {confirmDeleteId === p.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--red)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Удалить «{p.name}» навсегда?
                        </span>
                        <BtnSecondary
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ padding: '5px 11px', fontSize: 13 }}
                        >Отмена</BtnSecondary>
                        <BtnDanger
                          onClick={() => { onDeleteProject(p.id); setConfirmDeleteId(null); }}
                          style={{ padding: '5px 11px', fontSize: 13 }}
                        >Удалить</BtnDanger>
                      </div>
                    ) : (
                      <>
                        <span style={{
                          flex: 1, fontSize: 14, color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.name}</span>
                        <button
                          onClick={() => { onRestoreProject(p.id); onSelectProject(p.id); closeModal(); }}
                          title="Восстановить проект"
                          style={{
                            padding: '5px 10px', fontSize: 13, whiteSpace: 'nowrap',
                            background: 'transparent',
                            border: '1.5px solid var(--border-mid)',
                            borderRadius: 5, cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >↩ Восстановить</button>
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          title="Удалить навсегда"
                          style={{
                            padding: '5px 8px', fontSize: 16, lineHeight: 1,
                            background: 'transparent', border: 'none',
                            borderRadius: 5, cursor: 'pointer',
                            color: 'var(--text-tertiary)',
                            display: 'flex', alignItems: 'center',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-bg)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
                        >×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </Modal>
      )}

      {/* Project edit modal */}
      {projectModal?.mode === 'edit' && (
        <Modal title="Редактировать проект" onClose={closeModal} width={480}>
          {/* Название */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>Название проекта</div>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') closeModal(); }}
              placeholder="Например: Релиз 4.5"
              autoFocus
              style={{
                width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                border: '1.5px solid var(--border-mid)', borderRadius: 6,
                fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
            />
          </div>

          {/* Лид и Ссылка на Jira */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>Лид проекта</div>
              <input
                value={projectLead}
                onChange={e => setProjectLead(e.target.value)}
                placeholder="Иванов Иван"
                style={{
                  width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                  border: '1.5px solid var(--border-mid)', borderRadius: 6,
                  fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>Плановый состав</div>
              <input
                value={projectPlannedEngineers}
                onChange={e => setProjectPlannedEngineers(e.target.value.replace(/\D/g, ''))}
                placeholder="10"
                style={{
                  width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                  border: '1.5px solid var(--border-mid)', borderRadius: 6,
                  fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
              />
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={projectLeadIncluded}
                  onChange={e => setProjectLeadIncluded(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
                Лид включён
              </label>
            </div>
          </div>

          {/* Jira */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>Ссылка на Jira</div>
            <input
              value={projectJiraUrl}
              onChange={e => setProjectJiraUrl(e.target.value)}
              placeholder="https://jira.example.com/projects/ABC"
              style={{
                width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                border: '1.5px solid var(--border-mid)', borderRadius: 6,
                fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
            />
          </div>

          {/* Направления */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>Регулярные задачи / направления</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {projectDirections.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', lineHeight: '26px' }}>
                  Список пуст — инженеры и задачи не смогут выбрать направление
                </span>
              )}
              {projectDirections.map(dir => (
                <span key={dir} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px 3px 10px',
                  borderRadius: 4,
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  fontSize: 13, fontWeight: 500,
                }}>
                  {dir}
                  <button
                    onClick={() => setProjectDirections(d => d.filter(x => x !== dir))}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'inherit', fontSize: 15, padding: '0 1px', lineHeight: 1,
                      display: 'flex', alignItems: 'center', opacity: 0.7,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                  >×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newDirection}
                onChange={e => setNewDirection(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDirection(); } }}
                placeholder="Добавить направление..."
                style={{
                  flex: 1, padding: '7px 10px', boxSizing: 'border-box',
                  border: '1.5px solid var(--border-mid)', borderRadius: 6,
                  fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  outline: 'none', transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-mid)')}
              />
              <button
                onClick={addDirection}
                style={{
                  padding: '7px 13px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
              >+ Добавить</button>
            </div>
          </div>

          <ModalFooter onCancel={closeModal} onSave={handleProjectSave} saveLabel="Сохранить" />

          {/* Архивирование */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid var(--border-light)' }}>
            {confirmArchive ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                  Проект будет перемещён в архив. Все данные сохранятся, восстановить его можно через вкладку «Архив» при добавлении проекта.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <BtnSecondary onClick={() => setConfirmArchive(false)} style={{ padding: '6px 13px', fontSize: 13 }}>Отмена</BtnSecondary>
                  <BtnDanger
                    onClick={() => { onArchiveProject(projectModal.project.id); closeModal(); }}
                    style={{ padding: '6px 13px', fontSize: 13 }}
                  >Архивировать</BtnDanger>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  {projects.length <= 1 ? 'Единственный проект — нельзя архивировать' : 'Переместить проект в архив'}
                </span>
                <button
                  onClick={() => setConfirmArchive(true)}
                  disabled={projects.length <= 1}
                  style={{
                    padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap',
                    background: 'transparent',
                    color: projects.length <= 1 ? 'var(--text-tertiary)' : 'var(--red)',
                    border: `1.5px solid ${projects.length <= 1 ? 'var(--border-mid)' : 'var(--red)'}`,
                    borderRadius: 5,
                    cursor: projects.length <= 1 ? 'default' : 'pointer',
                    opacity: projects.length <= 1 ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (projects.length > 1) e.currentTarget.style.background = 'var(--red-bg)'; }}
                  onMouseLeave={e => { if (projects.length > 1) e.currentTarget.style.background = 'transparent'; }}
                >В архив</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
