const express = require('express');
const cors = require('cors');
const {
  DEFAULT_USER_ID,
  getAllData,
  saveAllData,
  getUser,
  findUser,
  listUsers,
  createUser: createUserRecord,
  updateUser,
  listProjectMembers,
  replaceProjectMembers,
  getVisibleWorkspace,
  getProjectForUser,
  createProject,
  updateProject,
  deleteProject,
  isGlobalAdmin,
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:4000'] }));
app.use(express.json({ limit: '5mb' }));

function resolveUser(req, res, next) {
  const identity =
    req.get('x-omg-user-id') ||
    req.get('x-auth-request-user') ||
    req.get('x-auth-request-email') ||
    req.get('x-forwarded-user') ||
    process.env.OMG_DEV_USER_ID ||
    DEFAULT_USER_ID;
  const user = findUser(identity) || getUser(identity);
  if (!user) {
    return res.status(401).json({ error: 'User is not active or does not exist' });
  }
  req.user = user;
  next();
}

function requireGlobalAdmin(req, res, next) {
  if (!isGlobalAdmin(req.user)) {
    return res.status(403).json({ error: 'Only global admin can manage users and access' });
  }
  next();
}

function sendError(res, err) {
  const status = err.status || 500;
  const body = { error: err.message || 'Internal server error' };
  if (status === 409 && err.currentProject) {
    body.currentProject = err.currentProject;
  }
  res.status(status).json(body);
}

function logRouteError(label, err) {
  if ((err.status || 500) >= 500) {
    console.error(label, err);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api', resolveUser);

app.get('/api/me', (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/admin/users', requireGlobalAdmin, (req, res) => {
  try {
    res.json({ users: listUsers() });
  } catch (err) {
    logRouteError('GET /api/admin/users error:', err);
    sendError(res, err);
  }
});

app.post('/api/admin/users', requireGlobalAdmin, (req, res) => {
  try {
    const user = createUserRecord(req.body.user || req.body);
    res.status(201).json({ user });
  } catch (err) {
    logRouteError('POST /api/admin/users error:', err);
    sendError(res, err);
  }
});

app.patch('/api/admin/users/:userId', requireGlobalAdmin, (req, res) => {
  try {
    const user = updateUser(req.params.userId, req.body.user || req.body);
    res.json({ user });
  } catch (err) {
    logRouteError('PATCH /api/admin/users/:userId error:', err);
    sendError(res, err);
  }
});

app.get('/api/admin/project-members', requireGlobalAdmin, (req, res) => {
  try {
    res.json({ projectMembers: listProjectMembers() });
  } catch (err) {
    logRouteError('GET /api/admin/project-members error:', err);
    sendError(res, err);
  }
});

app.get('/api/admin/projects/:projectId/members', requireGlobalAdmin, (req, res) => {
  try {
    const projectMembers = listProjectMembers().filter(member => member.projectId === req.params.projectId);
    res.json({ projectMembers });
  } catch (err) {
    logRouteError('GET /api/admin/projects/:projectId/members error:', err);
    sendError(res, err);
  }
});

app.put('/api/admin/projects/:projectId/members', requireGlobalAdmin, (req, res) => {
  try {
    const projectMembers = replaceProjectMembers(req.params.projectId, req.body.members || req.body.projectMembers || []);
    res.json({ projectMembers });
  } catch (err) {
    logRouteError('PUT /api/admin/projects/:projectId/members error:', err);
    sendError(res, err);
  }
});

app.get('/api/projects', (req, res) => {
  try {
    res.json(getVisibleWorkspace(req.user));
  } catch (err) {
    logRouteError('GET /api/projects error:', err);
    sendError(res, err);
  }
});

app.get('/api/projects/:projectId', (req, res) => {
  try {
    const project = getProjectForUser(req.params.projectId, req.user);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    logRouteError('GET /api/projects/:projectId error:', err);
    sendError(res, err);
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const project = createProject(req.body.project || req.body, req.user);
    res.status(201).json({ project });
  } catch (err) {
    logRouteError('POST /api/projects error:', err);
    sendError(res, err);
  }
});

app.put('/api/projects/:projectId', (req, res) => {
  try {
    const project = updateProject(req.params.projectId, req.body.project || req.body, req.user);
    res.json({ project });
  } catch (err) {
    logRouteError('PUT /api/projects/:projectId error:', err);
    sendError(res, err);
  }
});

app.delete('/api/projects/:projectId', (req, res) => {
  try {
    const deleted = deleteProject(req.params.projectId, req.user);
    res.json({ ok: true, deleted });
  } catch (err) {
    logRouteError('DELETE /api/projects/:projectId error:', err);
    sendError(res, err);
  }
});

app.get('/api/data', (req, res) => {
  try {
    res.json(getVisibleWorkspace(req.user));
  } catch (err) {
    logRouteError('GET /api/data error:', err);
    sendError(res, err);
  }
});

app.post('/api/data', (req, res) => {
  try {
    if (!isGlobalAdmin(req.user)) {
      return res.status(403).json({ error: 'Only global admin can save full workspace' });
    }
    saveAllData(req.body);
    res.json({ ok: true });
  } catch (err) {
    logRouteError('POST /api/data error:', err);
    sendError(res, err);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OMG Server запущен: http://localhost:${PORT}`);
  });
}

module.exports = { app };
