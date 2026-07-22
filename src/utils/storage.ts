import type { GlobalRole, Project, ProjectMember, ProjectRole, User, Workspace } from '../domain/types';

const API = '/api';

type SavedProjectMeta = Pick<Project, 'id' | 'revision' | 'updatedAt' | 'updatedBy'>;

export interface SaveConflict {
  projectId: string;
  projectName: string;
  currentRevision?: number;
}

export interface SaveResult {
  savedProjects: SavedProjectMeta[];
  deletedProjectIds: string[];
  conflict?: SaveConflict;
}

export type UserPatch = Partial<Pick<User, 'login' | 'displayName' | 'globalRole' | 'externalId' | 'active'>>;
export type NewUser = Pick<User, 'id' | 'login' | 'displayName' | 'globalRole' | 'active'> & {
  externalId?: string;
};

const savedProjectJson = new Map<string, string>();

function projectSnapshot(project: Project): string {
  return JSON.stringify(project);
}

function rememberWorkspace(workspace: Workspace) {
  savedProjectJson.clear();
  workspace.projects.forEach(project => {
    savedProjectJson.set(project.id, projectSnapshot(project));
  });
}

function rememberProject(project: Project) {
  savedProjectJson.set(project.id, projectSnapshot(project));
}

export async function loadData(): Promise<Workspace> {
  try {
    const res = await fetch(`${API}/projects`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const workspace = await res.json() as Workspace;
    rememberWorkspace(workspace);
    return workspace;
  } catch (err) {
    console.error('Ошибка загрузки данных:', err);
    return { currentProjectId: '', projects: [] };
  }
}

export async function loadMe(): Promise<User | null> {
  try {
    const res = await fetch(`${API}/me`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { user: User };
    return data.user;
  } catch (err) {
    console.error('Ошибка загрузки текущего пользователя:', err);
    return null;
  }
}

async function parseAdminResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return await res.json() as T;
}

export async function loadAdminUsers(): Promise<User[]> {
  const res = await fetch(`${API}/admin/users`);
  const data = await parseAdminResponse<{ users: User[] }>(res);
  return data.users;
}

export async function createAdminUser(user: NewUser): Promise<User> {
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
  const data = await parseAdminResponse<{ user: User }>(res);
  return data.user;
}

export async function updateAdminUser(userId: string, patch: UserPatch): Promise<User> {
  const res = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseAdminResponse<{ user: User }>(res);
  return data.user;
}

export async function loadAdminProjectMembers(): Promise<ProjectMember[]> {
  const res = await fetch(`${API}/admin/project-members`);
  const data = await parseAdminResponse<{ projectMembers: ProjectMember[] }>(res);
  return data.projectMembers;
}

export async function saveAdminProjectMembers(
  projectId: string,
  members: Array<{ userId: string; role: ProjectRole }>,
): Promise<ProjectMember[]> {
  const res = await fetch(`${API}/admin/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ members }),
  });
  const data = await parseAdminResponse<{ projectMembers: ProjectMember[] }>(res);
  return data.projectMembers;
}

export const GLOBAL_ROLE_LABEL: Record<GlobalRole, string> = {
  admin: 'Админ',
  user: 'Юзер',
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  admin: 'Админ',
  lead: 'Лид',
};

async function createProject(project: Project): Promise<Project> {
  const res = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { project: Project };
  rememberProject(data.project);
  return data.project;
}

async function updateProject(project: Project): Promise<Project | SaveConflict> {
  const res = await fetch(`${API}/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });

  if (res.status === 409) {
    const data = await res.json() as { currentProject?: Project };
    return {
      projectId: project.id,
      projectName: project.name,
      currentRevision: data.currentProject?.revision,
    };
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { project: Project };
  rememberProject(data.project);
  return data.project;
}

async function deleteProject(projectId: string): Promise<void> {
  const res = await fetch(`${API}/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  savedProjectJson.delete(projectId);
}

export async function saveData(data: Workspace): Promise<SaveResult> {
  const result: SaveResult = { savedProjects: [], deletedProjectIds: [] };
  const currentProjectIds = new Set(data.projects.map(project => project.id));

  for (const knownProjectId of Array.from(savedProjectJson.keys())) {
    if (!currentProjectIds.has(knownProjectId)) {
      await deleteProject(knownProjectId);
      result.deletedProjectIds.push(knownProjectId);
    }
  }

  for (const project of data.projects) {
    const snapshot = projectSnapshot(project);
    const previousSnapshot = savedProjectJson.get(project.id);
    if (previousSnapshot === snapshot) continue;

    const saved = previousSnapshot
      ? await updateProject(project)
      : await createProject(project);

    if ('projectId' in saved) {
      result.conflict = saved;
      return result;
    }

    result.savedProjects.push({
      id: saved.id,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    });
  }

  return result;
}

export async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
