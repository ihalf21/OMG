import React, { useEffect, useMemo, useState } from 'react';
import { PageTopbar, BtnPrimary, BtnSecondary, Modal, ModalFooter, FormRow, Input, Select } from '../components/UI';
import {
  createAdminUser,
  GLOBAL_ROLE_LABEL,
  loadAdminProjectMembers,
  loadAdminUsers,
  PROJECT_ROLE_LABEL,
  saveAdminProjectMembers,
  updateAdminUser,
  type NewUser,
} from '../utils/storage';
import type { GlobalRole, Project, ProjectMember, ProjectRole, User } from '../domain/types';

interface AdminProps {
  projects: Project[];
  currentUser: User;
}

interface UserFormState {
  login: string;
  displayName: string;
  externalId: string;
  globalRole: GlobalRole;
  active: boolean;
}

interface NewUserFormState extends UserFormState {
  id: string;
}

type ProjectRoleDraft = ProjectRole | '';

const ROLE_OPTIONS: Array<{ value: ProjectRoleDraft; label: string }> = [
  { value: '', label: 'Нет доступа' },
  { value: 'admin', label: PROJECT_ROLE_LABEL.admin },
  { value: 'lead', label: PROJECT_ROLE_LABEL.lead },
];

function userToForm(user: User): UserFormState {
  return {
    login: user.login,
    displayName: user.displayName,
    externalId: user.externalId || '',
    globalRole: user.globalRole,
    active: user.active,
  };
}

function emptyNewUser(): NewUserFormState {
  return {
    id: '',
    login: '',
    displayName: '',
    externalId: '',
    globalRole: 'user',
    active: true,
  };
}

function RoleBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'admin' | 'inactive' }) {
  const style = tone === 'admin'
    ? { background:'var(--accent-bg)', color:'var(--accent)', border:'1px solid var(--accent)' }
    : tone === 'inactive'
      ? { background:'var(--red-bg)', color:'var(--red)', border:'1px solid var(--red)' }
      : { background:'var(--bg-secondary)', color:'var(--text-secondary)', border:'1px solid var(--border-mid)' };

  return (
    <span style={{ display:'inline-flex', alignItems:'center', minHeight:22, padding:'2px 8px', borderRadius:5, fontSize:12, fontWeight:700, whiteSpace:'nowrap', ...style }}>
      {children}
    </span>
  );
}

export default function Admin({ projects, currentUser }: AdminProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userForm, setUserForm] = useState<UserFormState | null>(null);
  const [roleDraft, setRoleDraft] = useState<Record<string, ProjectRoleDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<NewUserFormState>(emptyNewUser);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = users.find(user => user.id === selectedUserId) || null;
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects]);

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!selectedUser && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUser, users]);

  useEffect(() => {
    if (!selectedUser) {
      setUserForm(null);
      setRoleDraft({});
      return;
    }

    setUserForm(userToForm(selectedUser));
    const nextDraft: Record<string, ProjectRoleDraft> = {};
    sortedProjects.forEach(project => {
      nextDraft[project.id] = members.find(member => member.userId === selectedUser.id && member.projectId === project.id)?.role || '';
    });
    setRoleDraft(nextDraft);
  }, [selectedUser, members, sortedProjects]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [loadedUsers, loadedMembers] = await Promise.all([
        loadAdminUsers(),
        loadAdminProjectMembers(),
      ]);
      setUsers(loadedUsers);
      setMembers(loadedMembers);
      setSelectedUserId(prev => prev && loadedUsers.some(user => user.id === prev) ? prev : (loadedUsers[0]?.id || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные администрирования');
    } finally {
      setLoading(false);
    }
  }

  async function saveUser() {
    if (!selectedUser || !userForm) return;
    setSavingUser(true);
    setError(null);
    setMessage(null);
    try {
      const patch = {
        login: userForm.login.trim(),
        displayName: userForm.displayName.trim(),
        externalId: userForm.externalId.trim() || undefined,
        globalRole: userForm.globalRole,
        active: selectedUser.id === currentUser.id ? true : userForm.active,
      };
      const saved = await updateAdminUser(selectedUser.id, patch);
      setUsers(prev => prev.map(user => user.id === saved.id ? saved : user));
      setMessage('Пользователь сохранён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пользователя');
    } finally {
      setSavingUser(false);
    }
  }

  async function addUser() {
    const payload: NewUser = {
      id: newUser.id.trim(),
      login: newUser.login.trim(),
      displayName: newUser.displayName.trim(),
      externalId: newUser.externalId.trim() || undefined,
      globalRole: newUser.globalRole,
      active: newUser.active,
    };
    if (!payload.id || !payload.login || !payload.displayName) return;

    setError(null);
    setMessage(null);
    try {
      const created = await createAdminUser(payload);
      setUsers(prev => [...prev, created].sort((a, b) => a.login.localeCompare(b.login)));
      setSelectedUserId(created.id);
      setShowAddUser(false);
      setNewUser(emptyNewUser());
      setMessage('Пользователь добавлен');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить пользователя');
    }
  }

  async function saveAccess() {
    if (!selectedUser) return;
    setSavingAccess(true);
    setError(null);
    setMessage(null);

    try {
      let nextMembers = members;

      for (const project of sortedProjects) {
        const currentRole = nextMembers.find(member => member.userId === selectedUser.id && member.projectId === project.id)?.role || '';
        const nextRole = roleDraft[project.id] || '';
        if (currentRole === nextRole) continue;

        const projectMembers = nextMembers
          .filter(member => member.projectId === project.id && member.userId !== selectedUser.id)
          .map(member => ({ userId: member.userId, role: member.role }));

        if (nextRole) {
          projectMembers.push({ userId: selectedUser.id, role: nextRole });
        }

        const saved = await saveAdminProjectMembers(project.id, projectMembers);
        nextMembers = [
          ...nextMembers.filter(member => member.projectId !== project.id),
          ...saved,
        ];
      }

      setMembers(nextMembers);
      setMessage('Доступы сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить доступы');
    } finally {
      setSavingAccess(false);
    }
  }

  const accessChanged = selectedUser
    ? sortedProjects.some(project => {
        const currentRole = members.find(member => member.userId === selectedUser.id && member.projectId === project.id)?.role || '';
        return currentRole !== (roleDraft[project.id] || '');
      })
    : false;

  const userChanged = !!(selectedUser && userForm && (
    selectedUser.login !== userForm.login ||
    selectedUser.displayName !== userForm.displayName ||
    (selectedUser.externalId || '') !== userForm.externalId ||
    selectedUser.globalRole !== userForm.globalRole ||
    selectedUser.active !== userForm.active
  ));

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PageTopbar title="Администрирование">
        <BtnSecondary onClick={reload} style={{ fontSize:13, padding:'7px 12px' }}>Обновить</BtnSecondary>
        <BtnPrimary onClick={() => setShowAddUser(true)}>+ Пользователь</BtnPrimary>
      </PageTopbar>

      <div style={{ flex:1, overflow:'hidden', padding:'20px 24px', display:'grid', gridTemplateColumns:'360px minmax(0,1fr)', gap:16 }}>
        <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:8, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
          <div style={{ padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)', fontSize:12, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Пользователи
          </div>
          <div style={{ overflowY:'auto', minHeight:0 }}>
            {loading ? (
              <div style={{ padding:16, fontSize:14, color:'var(--text-tertiary)' }}>Загрузка...</div>
            ) : users.length === 0 ? (
              <div style={{ padding:16, fontSize:14, color:'var(--text-tertiary)' }}>Нет пользователей</div>
            ) : users.map(user => {
              const isActive = user.id === selectedUserId;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  style={{ width:'100%', border:'none', borderBottom:'0.5px solid var(--border-light)', background:isActive ? 'var(--bg-secondary)' : 'transparent', color:'var(--text-primary)', padding:'11px 14px', textAlign:'left', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}
                >
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                      <span style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.displayName}</span>
                      {user.id === currentUser.id && <RoleBadge>Вы</RoleBadge>}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.login}</div>
                  </div>
                  <RoleBadge tone={!user.active ? 'inactive' : user.globalRole === 'admin' ? 'admin' : 'neutral'}>
                    {!user.active ? 'Откл.' : GLOBAL_ROLE_LABEL[user.globalRole]}
                  </RoleBadge>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ minWidth:0, overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          {(error || message) && (
            <div style={{ padding:'10px 12px', borderRadius:8, border:`1px solid ${error ? 'var(--red)' : 'var(--success)'}`, background:error ? 'var(--red-bg)' : 'var(--success-bg)', color:error ? 'var(--red)' : 'var(--success)', fontSize:13, fontWeight:700 }}>
              {error || message}
            </div>
          )}

          {selectedUser && userForm ? (
            <>
              <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:8, padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>Профиль пользователя</div>
                    <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>{selectedUser.id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={saveUser}
                    disabled={!userChanged || savingUser || !userForm.login.trim() || !userForm.displayName.trim()}
                    style={{ padding:'7px 14px', border:'1.5px solid var(--accent)', borderRadius:6, background:userChanged ? 'var(--accent)' : 'var(--bg-secondary)', color:userChanged ? 'var(--accent-contrast)' : 'var(--text-tertiary)', fontSize:13, fontWeight:700, cursor:userChanged ? 'pointer' : 'default', opacity:savingUser ? 0.7 : 1 }}
                  >
                    {savingUser ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
                  <FormRow label="Логин">
                    <Input value={userForm.login} onChange={e => setUserForm(form => form ? { ...form, login:e.target.value } : form)}/>
                  </FormRow>
                  <FormRow label="Имя">
                    <Input value={userForm.displayName} onChange={e => setUserForm(form => form ? { ...form, displayName:e.target.value } : form)}/>
                  </FormRow>
                  <FormRow label="External ID">
                    <Input value={userForm.externalId} onChange={e => setUserForm(form => form ? { ...form, externalId:e.target.value } : form)} placeholder="Keycloak subject"/>
                  </FormRow>
                  <FormRow label="Глобальная роль">
                    <Select value={userForm.globalRole} onChange={e => setUserForm(form => form ? { ...form, globalRole:e.target.value as GlobalRole } : form)}>
                      <option value="user">{GLOBAL_ROLE_LABEL.user}</option>
                      <option value="admin">{GLOBAL_ROLE_LABEL.admin}</option>
                    </Select>
                  </FormRow>
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-secondary)', cursor:selectedUser.id === currentUser.id ? 'default' : 'pointer', userSelect:'none' }}>
                  <input
                    type="checkbox"
                    checked={userForm.active}
                    disabled={selectedUser.id === currentUser.id}
                    onChange={e => setUserForm(form => form ? { ...form, active:e.target.checked } : form)}
                    style={{ accentColor:'var(--accent)', width:16, height:16 }}
                  />
                  Активен
                </label>
              </div>

              <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:8, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderBottom:'0.5px solid var(--border-light)', gap:12 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>Доступы к проектам</div>
                  <button
                    type="button"
                    onClick={saveAccess}
                    disabled={!accessChanged || savingAccess}
                    style={{ padding:'7px 14px', border:'1.5px solid var(--accent)', borderRadius:6, background:accessChanged ? 'var(--accent)' : 'var(--bg-secondary)', color:accessChanged ? 'var(--accent-contrast)' : 'var(--text-tertiary)', fontSize:13, fontWeight:700, cursor:accessChanged ? 'pointer' : 'default', opacity:savingAccess ? 0.7 : 1 }}
                  >
                    {savingAccess ? 'Сохранение...' : 'Сохранить доступы'}
                  </button>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-secondary)' }}>
                      <th style={{ textAlign:'left', padding:'10px 14px', fontSize:12, color:'var(--text-tertiary)', borderBottom:'0.5px solid var(--border-light)' }}>Проект</th>
                      <th style={{ textAlign:'left', padding:'10px 14px', fontSize:12, color:'var(--text-tertiary)', borderBottom:'0.5px solid var(--border-light)', width:180 }}>Роль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map(project => (
                      <tr key={project.id}>
                        <td style={{ padding:'10px 14px', borderBottom:'0.5px solid var(--border-light)', minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.name}</div>
                          {project.archived && <div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:2 }}>Архив</div>}
                        </td>
                        <td style={{ padding:'10px 14px', borderBottom:'0.5px solid var(--border-light)' }}>
                          <Select value={roleDraft[project.id] || ''} onChange={e => setRoleDraft(prev => ({ ...prev, [project.id]: e.target.value as ProjectRoleDraft }))}>
                            {ROLE_OPTIONS.map(option => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
                          </Select>
                        </td>
                      </tr>
                    ))}
                    {sortedProjects.length === 0 && (
                      <tr><td colSpan={2} style={{ padding:16, textAlign:'center', color:'var(--text-tertiary)', fontSize:14 }}>Нет проектов</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ background:'var(--bg-primary)', border:'0.5px solid var(--border-light)', borderRadius:8, padding:20, color:'var(--text-tertiary)', fontSize:14 }}>
              Выберите пользователя
            </div>
          )}
        </div>
      </div>

      {showAddUser && (
        <Modal title="Новый пользователь" onClose={() => setShowAddUser(false)} width={520}>
          <FormRow label="ID">
            <Input value={newUser.id} onChange={e => setNewUser(form => ({ ...form, id:e.target.value }))} placeholder="u-login"/>
          </FormRow>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FormRow label="Логин">
              <Input value={newUser.login} onChange={e => setNewUser(form => ({ ...form, login:e.target.value }))} placeholder="login"/>
            </FormRow>
            <FormRow label="Имя">
              <Input value={newUser.displayName} onChange={e => setNewUser(form => ({ ...form, displayName:e.target.value }))} placeholder="Иванов И.И."/>
            </FormRow>
          </div>
          <FormRow label="External ID" hint="Необязательно">
            <Input value={newUser.externalId} onChange={e => setNewUser(form => ({ ...form, externalId:e.target.value }))} placeholder="Keycloak subject"/>
          </FormRow>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FormRow label="Глобальная роль">
              <Select value={newUser.globalRole} onChange={e => setNewUser(form => ({ ...form, globalRole:e.target.value as GlobalRole }))}>
                <option value="user">{GLOBAL_ROLE_LABEL.user}</option>
                <option value="admin">{GLOBAL_ROLE_LABEL.admin}</option>
              </Select>
            </FormRow>
            <FormRow label="Статус">
              <label style={{ display:'flex', alignItems:'center', gap:8, minHeight:38, fontSize:13, color:'var(--text-secondary)', cursor:'pointer', userSelect:'none' }}>
                <input type="checkbox" checked={newUser.active} onChange={e => setNewUser(form => ({ ...form, active:e.target.checked }))} style={{ accentColor:'var(--accent)', width:16, height:16 }}/>
                Активен
              </label>
            </FormRow>
          </div>
          <ModalFooter onCancel={() => setShowAddUser(false)} onSave={addUser} saveLabel="Добавить"/>
        </Modal>
      )}
    </div>
  );
}
