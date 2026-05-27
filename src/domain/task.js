// src/domain/task.js
// Чистые функции переходов состояния задачи.
// Принимают project state {engineers, tasks, history} → возвращают новый state.

import { todayStr } from '../utils/dates';

function genId(prefix) {
  return prefix + Date.now() + Math.floor(Math.random() * 1000);
}

function appendHistory(state, entry) {
  return [...state.history, { id: genId('h'), ...entry }];
}

function patchTask(state, taskId, patch) {
  return state.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
}

// Рекурсивный расчёт полной команды задачи (своя + унаследованная от родителей)
export function getEffectiveTeam(task, allTasks, depth = 0) {
  if (!task || depth > 9) return [];
  const own = task.assignedEngineers || [];
  if (!task.dependsOn) return own;
  const parent = allTasks.find(x => x.id === task.dependsOn);
  const parentTeam = getEffectiveTeam(parent, allTasks, depth + 1);
  if (own.length === 0) return parentTeam;
  return [...new Set([...parentTeam, ...own])];
}

// ─── Назначение инженеров ─────────────────────────────────────────────────────

export function addEngineerToTask(state, taskId, engineerId) {
  return {
    ...state,
    tasks: state.tasks.map(t => t.id === taskId
      ? { ...t, assignedEngineers: [...(t.assignedEngineers || []), engineerId] }
      : t),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'switch',
      fromTask: null, toTask: taskId, note: 'Добавлен на задачу',
    }),
  };
}

export function removeEngineerFromTask(state, taskId, engineerId) {
  return {
    ...state,
    tasks: state.tasks.map(t => t.id === taskId
      ? { ...t, assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId) }
      : t),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'return',
      fromTask: taskId, toTask: null, note: 'Снят с задачи',
    }),
  };
}

// ─── Зависимости ──────────────────────────────────────────────────────────────

// Отвязать текущую задачу от родителя
export function unlinkParent(state, taskId) {
  return {
    ...state,
    tasks: patchTask(state, taskId, { dependsOn: null, startDate: null }),
  };
}

// Отвязать дочернюю задачу
export function unlinkChild(state, childId) {
  return {
    ...state,
    tasks: patchTask(state, childId, { dependsOn: null }),
  };
}

// ─── Статусы задачи ───────────────────────────────────────────────────────────

// Передать команду дочерней задаче перед завершением/архивацией.
// Возвращает { tasks, history, childId } — childId нужен для completedWithChildId.
function transferTeamToChild(state, taskId) {
  const child = state.tasks.find(t => t.dependsOn === taskId && t.status === 'active');
  if (!child) return { tasks: state.tasks, history: state.history, childId: null };

  const completedTask = state.tasks.find(t => t.id === taskId);
  const team = getEffectiveTeam(completedTask, state.tasks);
  if (team.length === 0) return { tasks: state.tasks, history: state.history, childId: null };

  const today = todayStr();
  const merged = [...new Set([...team, ...(child.assignedEngineers || [])])];
  const newHistory = team.map(engId => ({
    id: genId('h'), date: today, engineerId: engId, type: 'switch',
    fromTask: taskId, toTask: child.id, note: 'Автоперевод при завершении задачи',
  }));

  return {
    tasks: state.tasks.map(t =>
      t.id === child.id ? { ...t, assignedEngineers: merged, startDate: today, dependsOn: null } : t
    ),
    history: [...state.history, ...newHistory],
    childId: child.id,
  };
}

export function completeTask(state, taskId, completionDate) {
  const transfer = transferTeamToChild(state, taskId);
  return {
    ...state,
    tasks: transfer.tasks.map(t => t.id === taskId
      ? { ...t, status: 'done', completedDate: completionDate, completedWithChildId: transfer.childId || null }
      : t
    ),
    history: transfer.history,
  };
}

export function reopenTask(state, taskId) {
  const parent = state.tasks.find(t => t.id === taskId);
  const childId = parent?.completedWithChildId;
  return {
    ...state,
    tasks: state.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: 'active', completedDate: null, completedWithChildId: null };
      }
      if (childId && t.id === childId) {
        return { ...t, dependsOn: taskId, startDate: null };
      }
      return t;
    }),
  };
}

export function archiveTask(state, taskId) {
  const transfer = transferTeamToChild(state, taskId);
  return {
    ...state,
    tasks: transfer.tasks.map(t => t.id === taskId
      ? { ...t, status: 'archived', archivedDate: todayStr() }
      : t
    ),
    history: transfer.history,
  };
}

export function restoreFromArchive(state, taskId) {
  return {
    ...state,
    tasks: patchTask(state, taskId, { status: 'active', archivedDate: null }),
  };
}

// ─── Прогресс ─────────────────────────────────────────────────────────────────

export function updateTaskProgress(state, taskId, doneCases) {
  return {
    ...state,
    tasks: state.tasks.map(t => {
      if (t.id !== taskId) return t;
      const capped = t.totalCases ? Math.min(doneCases, t.totalCases) : doneCases;
      return { ...t, doneCases: capped };
    }),
  };
}
