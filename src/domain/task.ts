// src/domain/task.ts
// Чистые функции переходов состояния задачи.

import { todayStr } from '../utils/dates';
import { genId } from '../utils/ids';
import type { HistoryEntry, ISODate, ProjectState, Task } from './types';

function appendHistory(state: ProjectState, entry: Omit<HistoryEntry, 'id'>): HistoryEntry[] {
  return [...state.history, { id: genId('h'), ...entry }];
}

function patchTask(state: ProjectState, taskId: string, patch: Partial<Task>): Task[] {
  return state.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
}

// Рекурсивный расчёт полной команды задачи (своя + унаследованная от родителей)
export function getEffectiveTeam(task: Task | undefined, allTasks: Task[], depth: number = 0): string[] {
  if (!task || depth > 9) return [];
  const own = task.assignedEngineers || [];
  if (!task.dependsOn) return own;
  const parent = allTasks.find(x => x.id === task.dependsOn);
  const parentTeam = getEffectiveTeam(parent, allTasks, depth + 1);
  if (own.length === 0) return parentTeam;
  return [...new Set([...parentTeam, ...own])];
}

// ─── Назначение инженеров ─────────────────────────────────────────────────────

// Возвращает активную задачу инженера, кроме указанной (для проверки конфликтов)
export function getEngineerCurrentTask(
  state: ProjectState,
  engineerId: string,
  excludeTaskId?: string,
): Task | null {
  return state.tasks.find(t =>
    t.status === 'active' &&
    t.id !== excludeTaskId &&
    (t.assignedEngineers || []).includes(engineerId)
  ) ?? null;
}

// Возвращает ВСЕ активные задачи инженера, кроме указанной
export function getEngineerActiveTasks(
  state: ProjectState,
  engineerId: string,
  excludeTaskId?: string,
): Task[] {
  return state.tasks.filter(t =>
    t.status === 'active' &&
    t.id !== excludeTaskId &&
    (t.assignedEngineers || []).includes(engineerId)
  );
}

export function addEngineerToTask(
  state: ProjectState,
  taskId: string,
  engineerId: string,
  transfer = false,   // true = снять со всех активных задач; false = только добавить (планирование)
  dayFraction = 0,    // доля сегодняшнего дня на покидаемой задаче (только при transfer)
): ProjectState {
  const prevTask = transfer
    ? state.tasks.find(t => t.id !== taskId && t.status === 'active' && (t.assignedEngineers || []).includes(engineerId))
    : null;
  return {
    ...state,
    tasks: state.tasks.map(t => {
      if (t.id === taskId) return { ...t, assignedEngineers: [...(t.assignedEngineers || []), engineerId] };
      if (transfer && t.status === 'active' && t.id !== taskId && (t.assignedEngineers || []).includes(engineerId))
        return { ...t, assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId) };
      return t;
    }),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'switch',
      fromTask: prevTask?.id || null, toTask: taskId,
      note: transfer
        ? (prevTask ? `Переключён с «${prevTask.name}»` : 'Добавлен на задачу')
        : 'Запланирован на задачу',
      dayFraction: prevTask ? dayFraction : 0,
    }),
  };
}

export function removeEngineerFromTask(state: ProjectState, taskId: string, engineerId: string): ProjectState {
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

export function unlinkParent(state: ProjectState, taskId: string): ProjectState {
  return {
    ...state,
    tasks: patchTask(state, taskId, { dependsOn: null, startDate: null }),
  };
}

export function unlinkChild(state: ProjectState, childId: string): ProjectState {
  return {
    ...state,
    tasks: patchTask(state, childId, { dependsOn: null }),
  };
}

// ─── Статусы задачи ───────────────────────────────────────────────────────────

interface TeamTransferResult {
  tasks: Task[];
  history: HistoryEntry[];
  childId: string | null;
}

function transferTeamToChild(state: ProjectState, taskId: string): TeamTransferResult {
  const child = state.tasks.find(t => t.dependsOn === taskId && t.status === 'active');
  if (!child) return { tasks: state.tasks, history: state.history, childId: null };

  const completedTask = state.tasks.find(t => t.id === taskId);
  const team = getEffectiveTeam(completedTask, state.tasks);
  if (team.length === 0) return { tasks: state.tasks, history: state.history, childId: null };

  const today = todayStr();
  const merged = [...new Set([...team, ...(child.assignedEngineers || [])])];
  const newHistory: HistoryEntry[] = team.map(engId => ({
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

export function completeTask(state: ProjectState, taskId: string, completionDate: ISODate): ProjectState {
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

export function reopenTask(state: ProjectState, taskId: string): ProjectState {
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

export function archiveTask(state: ProjectState, taskId: string): ProjectState {
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

export function restoreFromArchive(state: ProjectState, taskId: string): ProjectState {
  return {
    ...state,
    tasks: patchTask(state, taskId, { status: 'active', archivedDate: null }),
  };
}

