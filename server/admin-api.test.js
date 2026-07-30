const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omg-admin-api-test-'));
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadApp(tempDir, seedData) {
  process.env.OMG_SQLITE_PATH = path.join(tempDir, 'test.sqlite');
  process.env.OMG_DATA_PATH = path.join(tempDir, 'data.json');
  writeJson(process.env.OMG_DATA_PATH, seedData);

  delete require.cache[require.resolve('./db')];
  delete require.cache[require.resolve('./index')];

  const db = require('./db');
  const { app } = require('./index');
  return { app, db };
}

async function request(baseUrl, method, url, body, headers = {}) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function withServer(seedData, fn) {
  const tempDir = tempWorkspace();
  const { app, db } = loadApp(tempDir, seedData);
  const server = app.listen(0);
  const port = server.address().port;

  try {
    await fn(`http://127.0.0.1:${port}`, db);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.closeDb();
    delete require.cache[require.resolve('./db')];
    delete require.cache[require.resolve('./index')];
    delete process.env.OMG_SQLITE_PATH;
    delete process.env.OMG_DATA_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('global admin manages users and project members through API', async () => {
  await withServer({
    currentProjectId: 'p1',
    projects: [project('p1', 'Pilot')],
  }, async baseUrl => {
    const created = await request(baseUrl, 'POST', '/api/admin/users', {
      user: {
        id: 'u-lead',
        login: 'lead',
        displayName: 'Lead',
        globalRole: 'user',
        externalId: 'kc-lead',
        active: true,
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.id, 'u-lead');

    const patched = await request(baseUrl, 'PATCH', '/api/admin/users/u-lead', {
      displayName: 'Lead Renamed',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.data.user.displayName, 'Lead Renamed');

    const members = await request(baseUrl, 'PUT', '/api/admin/projects/p1/members', {
      members: [{ userId: 'u-lead', role: 'lead' }],
    });
    assert.equal(members.status, 200);
    assert.deepEqual(members.data.projectMembers, [{ projectId: 'p1', userId: 'u-lead', role: 'lead' }]);

    const visible = await request(baseUrl, 'GET', '/api/projects', null, {
      'x-auth-request-user': 'lead',
    });
    assert.equal(visible.status, 200);
    assert.deepEqual(visible.data.projects.map(item => item.id), ['p1']);
    assert.equal(visible.data.users, undefined);
    assert.deepEqual(visible.data.projectMembers, [
      { projectId: 'p1', userId: 'u-lead', role: 'lead' },
    ]);
  });
});

test('regular user cannot call admin API', async () => {
  await withServer({
    currentProjectId: 'p1',
    users: [
      { id: 'u-lead', login: 'lead', displayName: 'Lead', globalRole: 'user', active: true },
    ],
    projectMembers: [
      { projectId: 'p1', userId: 'u-lead', role: 'lead' },
    ],
    projects: [project('p1', 'Pilot')],
  }, async baseUrl => {
    const denied = await request(baseUrl, 'GET', '/api/admin/users', null, {
      'x-omg-user-id': 'u-lead',
    });
    assert.equal(denied.status, 403);
  });
});

test('admin API validates project member payload', async () => {
  await withServer({
    currentProjectId: 'p1',
    projects: [project('p1', 'Pilot')],
  }, async baseUrl => {
    const invalidUser = await request(baseUrl, 'PUT', '/api/admin/projects/p1/members', {
      members: [{ userId: 'missing', role: 'lead' }],
    });
    assert.equal(invalidUser.status, 400);

    const invalidRole = await request(baseUrl, 'PUT', '/api/admin/projects/p1/members', {
      members: [{ userId: 'u-admin', role: 'viewer' }],
    });
    assert.equal(invalidRole.status, 400);
  });
});
