const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_PATH = process.env.OMG_DATA_PATH || path.join(__dirname, 'data.json');
const SQLITE_PATH = process.env.OMG_SQLITE_PATH || path.join(__dirname, 'omg.sqlite');
const DEFAULT_USER_ID = 'u-admin';

const DEFAULT_USER = {
  id: DEFAULT_USER_ID,
  login: 'admin',
  displayName: 'Администратор',
  globalRole: 'admin',
  active: true,
};

const GLOBAL_ROLES = new Set(['admin', 'user']);
const PROJECT_ROLES = new Set(['admin', 'lead']);
const ENGINEER_ROLES = new Set(['lead', 'responsible', 'engineer']);

const SEED_DATA = {
  currentProjectId: 'p1',
  users: [DEFAULT_USER],
  projectMembers: [{ projectId: 'p1', userId: DEFAULT_USER_ID, role: 'admin' }],
  projects: [
    {
      id: 'p1',
      name: 'Проект 1',
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: DEFAULT_USER_ID,
      engineers: [],
      tasks: [],
      history: [],
      directions: [],
    },
  ],
};

let db = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function getDb() {
  if (db) return db;
  db = new DatabaseSync(SQLITE_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  initSchema();
  importJsonIfEmpty();
  return db;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      global_role TEXT NOT NULL CHECK (global_role IN ('admin', 'user')),
      external_id TEXT,
      active INTEGER NOT NULL CHECK (active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      archived INTEGER NOT NULL CHECK (archived IN (0, 1)),
      archived_at TEXT,
      data_json TEXT NOT NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'lead')),
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
  `);
}

function normalizeProject(project, fallbackUserId = DEFAULT_USER_ID) {
  const normalized = { ...project };
  if (!Number.isInteger(normalized.revision) || normalized.revision < 1) normalized.revision = 1;
  if (!normalized.updatedAt) normalized.updatedAt = nowIso();
  if (!normalized.updatedBy) normalized.updatedBy = fallbackUserId;
  normalized.engineers = Array.isArray(normalized.engineers)
    ? normalized.engineers.map(engineer => ({
        ...engineer,
        role: ENGINEER_ROLES.has(engineer?.role) ? engineer.role : 'engineer',
      }))
    : [];
  if (!Array.isArray(normalized.tasks)) normalized.tasks = [];
  if (!Array.isArray(normalized.history)) normalized.history = [];
  return normalized;
}

function migrateFlatData(data) {
  if (!data.projects) {
    return {
      currentProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Проект 1',
          engineers: data.engineers || [],
          tasks: data.tasks || [],
          history: data.history || [],
        },
      ],
    };
  }
  return data;
}

function ensureSecurityModel(rawData) {
  const migrated = migrateFlatData(rawData || {});
  const projects = Array.isArray(migrated.projects)
    ? migrated.projects.map(project => normalizeProject(project))
    : [];

  const users = Array.isArray(migrated.users) ? migrated.users.filter(Boolean) : [];
  if (!users.some(user => user.id === DEFAULT_USER_ID)) {
    users.unshift(DEFAULT_USER);
  }

  const projectMembers = Array.isArray(migrated.projectMembers)
    ? migrated.projectMembers.filter(member => member && member.projectId && member.userId)
    : [];

  projects.forEach(project => {
    const hasMember = projectMembers.some(member => member.projectId === project.id);
    if (!hasMember) {
      projectMembers.push({ projectId: project.id, userId: DEFAULT_USER_ID, role: 'admin' });
    }
  });

  const currentProjectExists = projects.some(project => project.id === migrated.currentProjectId);

  return {
    currentProjectId: currentProjectExists ? migrated.currentProjectId : (projects[0]?.id || ''),
    users,
    projectMembers,
    projects,
  };
}

function readJsonSeed() {
  if (!fs.existsSync(DATA_PATH)) return clone(SEED_DATA);

  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error('Ошибка чтения data.json:', err.message);
    return clone(SEED_DATA);
  }
}

function importJsonIfEmpty() {
  const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
  if (projectCount > 0) return;

  const workspace = ensureSecurityModel(readJsonSeed());
  writeWorkspace(workspace);
}

function rowToUser(row) {
  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name,
    globalRole: row.global_role,
    externalId: row.external_id || undefined,
    active: row.active === 1,
  };
}

function rowToProject(row) {
  const project = JSON.parse(row.data_json);
  return normalizeProject({
    ...project,
    id: row.id,
    name: row.name,
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || undefined,
    archived: row.archived === 1,
    archivedAt: row.archived_at || null,
  }, row.updated_by || DEFAULT_USER_ID);
}

function getUsers() {
  return getDb().prepare(`
    SELECT id, login, display_name, global_role, external_id, active
    FROM users
    ORDER BY login
  `).all().map(rowToUser);
}

function getProjectMembers() {
  return getDb().prepare(`
    SELECT project_id AS projectId, user_id AS userId, role
    FROM project_members
    ORDER BY project_id, user_id
  `).all().map(row => ({
    projectId: row.projectId,
    userId: row.userId,
    role: row.role,
  }));
}

function getProjects() {
  return getDb().prepare(`
    SELECT id, name, revision, updated_at, updated_by, archived, archived_at, data_json
    FROM projects
    ORDER BY rowid
  `).all().map(rowToProject);
}

function getCurrentProjectId() {
  const row = getDb().prepare("SELECT value FROM app_state WHERE key = 'currentProjectId'").get();
  return row?.value || '';
}

function setCurrentProjectId(projectId) {
  getDb().prepare(`
    INSERT INTO app_state (key, value)
    VALUES ('currentProjectId', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(projectId || '');
}

function upsertUser(user) {
  if (!user?.id || !user?.login || !user?.displayName) {
    const err = new Error('User id, login and displayName are required');
    err.status = 400;
    throw err;
  }
  if (!GLOBAL_ROLES.has(user.globalRole)) {
    const err = new Error('Invalid global role');
    err.status = 400;
    throw err;
  }

  getDb().prepare(`
    INSERT INTO users (id, login, display_name, global_role, external_id, active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      login = excluded.login,
      display_name = excluded.display_name,
      global_role = excluded.global_role,
      external_id = excluded.external_id,
      active = excluded.active
  `).run(
    user.id,
    user.login,
    user.displayName,
    user.globalRole,
    user.externalId || null,
    user.active ? 1 : 0
  );
}

function projectDataJson(project) {
  return JSON.stringify(project);
}

function upsertProject(project) {
  const normalized = normalizeProject(project);
  getDb().prepare(`
    INSERT INTO projects (id, name, revision, updated_at, updated_by, archived, archived_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      archived = excluded.archived,
      archived_at = excluded.archived_at,
      data_json = excluded.data_json
  `).run(
    normalized.id,
    normalized.name,
    normalized.revision,
    normalized.updatedAt,
    normalized.updatedBy || null,
    normalized.archived ? 1 : 0,
    normalized.archivedAt || null,
    projectDataJson(normalized)
  );
  return normalized;
}

function insertProjectMember(member) {
  if (!member?.projectId || !member?.userId) {
    const err = new Error('Project member requires projectId and userId');
    err.status = 400;
    throw err;
  }
  if (!PROJECT_ROLES.has(member.role)) {
    const err = new Error('Invalid project role');
    err.status = 400;
    throw err;
  }

  getDb().prepare(`
    INSERT OR REPLACE INTO project_members (project_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(member.projectId, member.userId, member.role);
}

function writeWorkspace(workspace) {
  const normalized = ensureSecurityModel(workspace);
  const database = getDb();

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('DELETE FROM project_members').run();
    database.prepare('DELETE FROM projects').run();
    database.prepare('DELETE FROM users').run();

    normalized.users.forEach(upsertUser);
    normalized.projects.forEach(upsertProject);
    normalized.projectMembers.forEach(insertProjectMember);
    setCurrentProjectId(normalized.currentProjectId);

    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  return normalized;
}

function getAllData() {
  const projects = getProjects();
  const currentProjectId = projects.some(project => project.id === getCurrentProjectId())
    ? getCurrentProjectId()
    : (projects[0]?.id || '');

  return {
    currentProjectId,
    users: getUsers(),
    projectMembers: getProjectMembers(),
    projects,
  };
}

function saveAllData(data) {
  return writeWorkspace(data);
}

function getUser(userId) {
  const row = getDb().prepare(`
    SELECT id, login, display_name, global_role, external_id, active
    FROM users
    WHERE id = ? AND active = 1
  `).get(userId);
  return row ? rowToUser(row) : null;
}

function findUser(identity) {
  if (!identity) return null;
  const row = getDb().prepare(`
    SELECT id, login, display_name, global_role, external_id, active
    FROM users
    WHERE active = 1 AND (id = ? OR login = ? OR external_id = ?)
  `).get(identity, identity, identity);
  return row ? rowToUser(row) : null;
}

function listUsers() {
  return getUsers();
}

function createUser(user) {
  const prepared = {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    globalRole: user.globalRole || 'user',
    externalId: user.externalId || undefined,
    active: user.active !== false,
  };

  const existing = getDb().prepare('SELECT id FROM users WHERE id = ? OR login = ?').get(prepared.id, prepared.login);
  if (existing) {
    const err = new Error('User already exists');
    err.status = 409;
    throw err;
  }

  upsertUser(prepared);
  return prepared;
}

function updateUser(userId, patch) {
  const current = getAllData().users.find(user => user.id === userId);
  if (!current) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const updated = {
    ...current,
    ...patch,
    id: userId,
    active: patch.active == null ? current.active : !!patch.active,
  };

  if (updated.login !== current.login) {
    const duplicate = getDb().prepare('SELECT id FROM users WHERE login = ? AND id <> ?').get(updated.login, userId);
    if (duplicate) {
      const err = new Error('User login already exists');
      err.status = 409;
      throw err;
    }
  }

  upsertUser(updated);
  return getAllData().users.find(user => user.id === userId);
}

function listProjectMembers() {
  return getProjectMembers();
}

function replaceProjectMembers(projectId, members) {
  const data = getAllData();
  const project = data.projects.find(item => item.id === projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const userIds = new Set(data.users.map(user => user.id));
  const prepared = (members || []).map(member => ({
    projectId,
    userId: member.userId,
    role: member.role,
  }));

  prepared.forEach(member => {
    if (!userIds.has(member.userId)) {
      const err = new Error(`User not found: ${member.userId}`);
      err.status = 400;
      throw err;
    }
    if (!PROJECT_ROLES.has(member.role)) {
      const err = new Error('Invalid project role');
      err.status = 400;
      throw err;
    }
  });

  const database = getDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
    prepared.forEach(insertProjectMember);
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  return getProjectMembers().filter(member => member.projectId === projectId);
}

function getProjectMember(data, userId, projectId) {
  return data.projectMembers.find(member => member.userId === userId && member.projectId === projectId) || null;
}

function isGlobalAdmin(user) {
  return user?.globalRole === 'admin';
}

function canReadProject(data, user, projectId) {
  return isGlobalAdmin(user) || !!getProjectMember(data, user.id, projectId);
}

function canWriteProject(data, user, projectId) {
  if (isGlobalAdmin(user)) return true;
  const member = getProjectMember(data, user.id, projectId);
  return member?.role === 'admin' || member?.role === 'lead';
}

function getVisibleWorkspace(user) {
  const data = getAllData();
  const projects = isGlobalAdmin(user)
    ? data.projects
    : data.projects.filter(project => canReadProject(data, user, project.id));

  const currentProjectId = projects.some(project => project.id === data.currentProjectId)
    ? data.currentProjectId
    : (projects[0]?.id || '');

  return {
    currentProjectId,
    projects,
    users: isGlobalAdmin(user) ? data.users : undefined,
    projectMembers: isGlobalAdmin(user)
      ? data.projectMembers
      : data.projectMembers.filter(member => member.userId === user.id && canReadProject(data, user, member.projectId)),
  };
}

function getProjectForUser(projectId, user) {
  const data = getAllData();
  if (!canReadProject(data, user, projectId)) return null;
  return data.projects.find(project => project.id === projectId) || null;
}

function createProject(project, user) {
  if (!isGlobalAdmin(user)) {
    const err = new Error('Only global admin can create projects');
    err.status = 403;
    throw err;
  }

  const data = getAllData();
  if (data.projects.some(existing => existing.id === project.id)) {
    const err = new Error('Project already exists');
    err.status = 409;
    throw err;
  }

  const prepared = normalizeProject({
    ...project,
    revision: 1,
    updatedAt: nowIso(),
    updatedBy: user.id,
  }, user.id);

  const database = getDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    upsertProject(prepared);
    insertProjectMember({ projectId: prepared.id, userId: user.id, role: 'admin' });
    if (!data.currentProjectId) setCurrentProjectId(prepared.id);
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  return prepared;
}

function updateProject(projectId, project, user) {
  const data = getAllData();
  if (!canWriteProject(data, user, projectId)) {
    const err = new Error('No write access to project');
    err.status = 403;
    throw err;
  }

  const current = data.projects.find(existing => existing.id === projectId);
  if (!current) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }

  const expectedRevision = Number(project.revision || 0);
  if (expectedRevision !== current.revision) {
    const err = new Error('Project revision conflict');
    err.status = 409;
    err.currentProject = current;
    throw err;
  }

  const updated = normalizeProject({
    ...project,
    id: projectId,
    revision: current.revision + 1,
    updatedAt: nowIso(),
    updatedBy: user.id,
  }, user.id);

  upsertProject(updated);
  return updated;
}

function deleteProject(projectId, user) {
  if (!isGlobalAdmin(user)) {
    const err = new Error('Only global admin can delete projects');
    err.status = 403;
    throw err;
  }

  const data = getAllData();
  const exists = data.projects.some(project => project.id === projectId);
  if (!exists) return false;

  const database = getDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    if (data.currentProjectId === projectId) {
      const nextProject = data.projects.find(project => project.id !== projectId);
      setCurrentProjectId(nextProject?.id || '');
    }
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  return true;
}

module.exports = {
  DEFAULT_USER_ID,
  SQLITE_PATH,
  closeDb,
  getAllData,
  saveAllData,
  getUser,
  findUser,
  listUsers,
  createUser,
  updateUser,
  listProjectMembers,
  replaceProjectMembers,
  getVisibleWorkspace,
  getProjectForUser,
  createProject,
  updateProject,
  deleteProject,
  canReadProject,
  canWriteProject,
  isGlobalAdmin,
};
