const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omg-db-test-'));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadDb(tempDir, seedData) {
  const sqlitePath = path.join(tempDir, 'test.sqlite');
  const dataPath = path.join(tempDir, 'data.json');
  writeJson(dataPath, seedData);

  process.env.OMG_SQLITE_PATH = sqlitePath;
  process.env.OMG_DATA_PATH = dataPath;
  delete require.cache[require.resolve('./db')];

  return require('./db');
}

function cleanupDb(db, tempDir) {
  db.closeDb();
  delete require.cache[require.resolve('./db')];
  delete process.env.OMG_SQLITE_PATH;
  delete process.env.OMG_DATA_PATH;
  removeTempDir(tempDir);
}

function project(id, name) {
  return {
    id,
    name,
    engineers: [],
    tasks: [],
    history: [],
    directions: [],
  };
}

test('imports JSON workspace into SQLite and normalizes security metadata', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p2',
    projects: [project('p1', 'One'), project('p2', 'Two')],
  });

  try {
    const data = db.getAllData();

    assert.equal(data.currentProjectId, 'p2');
    assert.equal(data.projects.length, 2);
    assert.equal(data.users.length, 1);
    assert.equal(data.users[0].id, 'u-admin');
    assert.equal(data.projectMembers.length, 2);
    assert.deepEqual(data.projectMembers.map(member => member.projectId).sort(), ['p1', 'p2']);
    assert.equal(data.projects[0].revision, 1);
    assert.ok(data.projects[0].updatedAt);
    assert.equal(data.projects[0].updatedBy, 'u-admin');
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('filters visible workspace for regular project member', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    users: [
      { id: 'u-lead', login: 'lead', displayName: 'Lead', globalRole: 'user', active: true },
    ],
    projectMembers: [
      { projectId: 'p2', userId: 'u-lead', role: 'lead' },
    ],
    projects: [project('p1', 'Hidden'), project('p2', 'Visible')],
  });

  try {
    const user = db.getUser('u-lead');
    const workspace = db.getVisibleWorkspace(user);

    assert.equal(workspace.projects.length, 1);
    assert.equal(workspace.projects[0].id, 'p2');
    assert.equal(workspace.currentProjectId, 'p2');
    assert.equal(workspace.users, undefined);
    assert.equal(workspace.projectMembers, undefined);
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('increments project revision on successful update and rejects stale revision', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    projects: [project('p1', 'Pilot')],
  });

  try {
    const admin = db.getUser('u-admin');
    const initial = db.getProjectForUser('p1', admin);
    const updated = db.updateProject('p1', { ...initial, name: 'Pilot updated' }, admin);

    assert.equal(updated.revision, initial.revision + 1);
    assert.equal(updated.name, 'Pilot updated');
    assert.equal(updated.updatedBy, 'u-admin');

    assert.throws(
      () => db.updateProject('p1', initial, admin),
      err => err.status === 409 && err.currentProject.revision === updated.revision
    );
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('project lead can write assigned project but cannot create projects', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    users: [
      { id: 'u-lead', login: 'lead', displayName: 'Lead', globalRole: 'user', active: true },
    ],
    projectMembers: [
      { projectId: 'p1', userId: 'u-lead', role: 'lead' },
    ],
    projects: [project('p1', 'Writable')],
  });

  try {
    const lead = db.getUser('u-lead');
    const initial = db.getProjectForUser('p1', lead);
    const updated = db.updateProject('p1', { ...initial, name: 'Writable by lead' }, lead);

    assert.equal(updated.name, 'Writable by lead');
    assert.throws(
      () => db.createProject(project('p2', 'Forbidden'), lead),
      err => err.status === 403
    );
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('global admin delete removes project and its memberships', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    users: [
      { id: 'u-lead', login: 'lead', displayName: 'Lead', globalRole: 'user', active: true },
    ],
    projectMembers: [
      { projectId: 'p1', userId: 'u-lead', role: 'lead' },
    ],
    projects: [project('p1', 'Delete me'), project('p2', 'Keep me')],
  });

  try {
    const admin = db.getUser('u-admin');
    assert.equal(db.deleteProject('p1', admin), true);

    const data = db.getAllData();
    assert.deepEqual(data.projects.map(item => item.id), ['p2']);
    assert.equal(data.projectMembers.some(member => member.projectId === 'p1'), false);
    assert.equal(data.currentProjectId, 'p2');
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('creates and updates users and replaces project members', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    projects: [project('p1', 'Access')],
  });

  try {
    const created = db.createUser({
      id: 'u-test',
      login: 'tester',
      displayName: 'Tester',
      globalRole: 'user',
      externalId: 'keycloak-123',
      active: true,
    });
    assert.equal(created.login, 'tester');
    assert.equal(db.findUser('tester').id, 'u-test');
    assert.equal(db.findUser('keycloak-123').id, 'u-test');

    const updated = db.updateUser('u-test', { displayName: 'Tester Renamed', active: false });
    assert.equal(updated.displayName, 'Tester Renamed');
    assert.equal(updated.active, false);
    assert.equal(db.findUser('tester'), null);

    db.updateUser('u-test', { active: true });
    const members = db.replaceProjectMembers('p1', [{ userId: 'u-test', role: 'lead' }]);
    assert.deepEqual(members, [{ projectId: 'p1', userId: 'u-test', role: 'lead' }]);
  } finally {
    cleanupDb(db, tempDir);
  }
});

test('rejects invalid project member user and role', () => {
  const tempDir = tempWorkspace();
  const db = loadDb(tempDir, {
    currentProjectId: 'p1',
    projects: [project('p1', 'Access')],
  });

  try {
    assert.throws(
      () => db.replaceProjectMembers('p1', [{ userId: 'missing', role: 'lead' }]),
      err => err.status === 400
    );
    assert.throws(
      () => db.replaceProjectMembers('p1', [{ userId: 'u-admin', role: 'viewer' }]),
      err => err.status === 400
    );
  } finally {
    cleanupDb(db, tempDir);
  }
});
