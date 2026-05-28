// src/domain/engineer.ts
// Чистые функции переходов состояния инженера. (state, ...args) -> newState.

import { todayStr, formatDateShort } from '../utils/dates';
import { genId } from '../utils/ids';
import type {
  Engineer, EngineerRole, ExperienceMap, HistoryEntry, ISODate,
  ProjectState, Task,
} from './types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function findCurrentTask(state: ProjectState, engineerId: string): Task | undefined {
  return state.tasks.find(t => t.assignedEngineers?.includes(engineerId) && t.status === 'active');
}

function removeEngineerFromAllTasks(state: ProjectState, engineerId: string): Task[] {
  return state.tasks.map(t => ({
    ...t,
    assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId),
  }));
}

function appendHistory(state: ProjectState, entry: Omit<HistoryEntry, 'id'>): HistoryEntry[] {
  return [...state.history, { id: genId('h'), ...entry }];
}

function patchEngineer(state: ProjectState, engineerId: string, patch: Partial<Engineer>): Engineer[] {
  return state.engineers.map(e => e.id === engineerId ? { ...e, ...patch } : e);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface NewEngineerData {
  name: string;
  role?: EngineerRole;
  regularTask?: string | null;
  experience?: ExperienceMap;
}

export function addEngineer(state: ProjectState, data: NewEngineerData): ProjectState {
  const engineer: Engineer = {
    id: genId('e'),
    name: data.name,
    role: data.role || 'engineer',
    regularTask: data.regularTask || null,
    status: 'active',
    vacationFrom: null,
    vacationTo: null,
    dayoffDate: null,
    sickReturnDate: null,
    experience: data.experience || {},
  };
  return { ...state, engineers: [...state.engineers, engineer] };
}

export function deleteEngineer(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: state.engineers.filter(e => e.id !== engineerId),
    tasks: removeEngineerFromAllTasks(state, engineerId),
  };
}

export interface EngineerProfileUpdate {
  name?: string;
  role?: EngineerRole;
  regularTask?: string | null;
  experience?: ExperienceMap;
}

export function updateEngineerProfile(state: ProjectState, engineerId: string, updates: EngineerProfileUpdate): ProjectState {
  // Профиль: имя, роль, регулярная задача, experience. НЕ статусы.
  const allowed: (keyof EngineerProfileUpdate)[] = ['name', 'role', 'regularTask', 'experience'];
  const patch: Partial<Engineer> = {};
  for (const key of allowed) {
    if (key in updates) {
      (patch as Record<string, unknown>)[key] = updates[key];
    }
  }
  return { ...state, engineers: patchEngineer(state, engineerId, patch) };
}

// ─── Sick leave ───────────────────────────────────────────────────────────────

/**
 * Отправить инженера на больничный начиная с указанной даты.
 * Инженер остаётся назначен на задачу — снимается только вручную.
 */
export function setSickLeaveFrom(state: ProjectState, engineerId: string, fromDate: ISODate): ProjectState {
  const currentTask = findCurrentTask(state, engineerId);
  const today = todayStr();
  const note = fromDate < today ? `Больничный с ${formatDateShort(fromDate)}` : '';
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'sick', sickReturnDate: null }),
    history: appendHistory(state, {
      date: fromDate, engineerId, type: 'sick',
      fromTask: currentTask?.id || null, toTask: null, note,
    }),
  };
}

export function setSickLeave(state: ProjectState, engineerId: string): ProjectState {
  return setSickLeaveFrom(state, engineerId, todayStr());
}

export function clearSickLeave(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'active', sickReturnDate: null }),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'return',
      fromTask: null, toTask: null, note: 'Выход с больничного',
    }),
  };
}

/**
 * Установить дату возврата с больничного.
 * - Прошлая дата / сегодня → закрыть больничный (статус active, sickReturnDate = null).
 * - Будущая дата → запланировать выход (статус остаётся sick, sickReturnDate задаётся).
 *   isAvailableOn и leaveTypeOn учтут эту дату в расчётах Ганта и прогнозов.
 */
export function setSickReturn(state: ProjectState, engineerId: string, returnDate: ISODate): ProjectState {
  const today = todayStr();
  if (returnDate <= today) {
    const suffix = returnDate < today ? ` (${formatDateShort(returnDate)})` : '';
    return {
      ...state,
      engineers: patchEngineer(state, engineerId, { status: 'active', sickReturnDate: null }),
      history: appendHistory(state, {
        date: returnDate, engineerId, type: 'return',
        fromTask: null, toTask: null, note: `Выход с больничного${suffix}`,
      }),
    };
  }
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { sickReturnDate: returnDate }),
    history: appendHistory(state, {
      date: today, engineerId, type: 'return',
      fromTask: null, toTask: null, note: `Плановый выход: ${formatDateShort(returnDate)}`,
    }),
  };
}

/** Отменить запланированный выход с больничного (без закрытия больничного). */
export function cancelScheduledSickReturn(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { sickReturnDate: null }),
  };
}

// ─── Vacation ─────────────────────────────────────────────────────────────────

export function setVacation(state: ProjectState, engineerId: string, vacationFrom: ISODate, vacationTo: ISODate): ProjectState {
  const today = todayStr();
  const isPast    = vacationTo < today;
  const isOngoing = vacationFrom <= today && vacationTo >= today;
  const preTask = findCurrentTask(state, engineerId);

  const noteRange = `Отпуск ${formatDateShort(vacationFrom)} — ${formatDateShort(vacationTo)}`;

  if (isPast) {
    // Исторический отпуск: снимаем со всех задач, возвращаем на ту же если она ещё активна
    let updatedTasks = removeEngineerFromAllTasks(state, engineerId);
    const newHistory: HistoryEntry[] = [
      ...state.history,
      { id: genId('h'), date: vacationFrom, engineerId, type: 'vacation', fromTask: preTask?.id || null, toTask: null, note: noteRange },
    ];
    if (preTask && updatedTasks.find(t => t.id === preTask.id)?.status === 'active') {
      updatedTasks = updatedTasks.map(t => t.id === preTask.id
        ? { ...t, assignedEngineers: [...(t.assignedEngineers || []), engineerId] }
        : t);
      newHistory.push({ id: genId('h'), date: vacationTo, engineerId, type: 'switch', fromTask: null, toTask: preTask.id, note: 'Вернулся из отпуска' });
    }
    return {
      ...state,
      engineers: patchEngineer(state, engineerId, { status: 'active', vacationFrom: null, vacationTo: null }),
      tasks: updatedTasks,
      history: newHistory,
    };
  }

  // Текущий или будущий отпуск
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, {
      ...(isOngoing ? { status: 'vacation' as const } : {}),
      vacationFrom, vacationTo,
    }),
    tasks: isOngoing ? removeEngineerFromAllTasks(state, engineerId) : state.tasks,
    history: appendHistory(state, {
      date: vacationFrom, engineerId, type: 'vacation',
      fromTask: preTask?.id || null, toTask: null, note: noteRange,
    }),
  };
}

export function cancelVacation(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { vacationFrom: null, vacationTo: null }),
  };
}

export function endVacationEarly(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'active', vacationFrom: null, vacationTo: null }),
  };
}

// ─── Dayoff ───────────────────────────────────────────────────────────────────

export function setDayoff(state: ProjectState, engineerId: string, dayoffDate: ISODate): ProjectState {
  const today = todayStr();
  const isPast  = dayoffDate < today;
  const isToday = dayoffDate === today;
  const preTask = findCurrentTask(state, engineerId);
  const hist: Omit<HistoryEntry, 'id'> = {
    date: dayoffDate, engineerId, type: 'dayoff',
    fromTask: preTask?.id || null, toTask: null,
    note: `Дейоф ${formatDateShort(dayoffDate)}`,
  };

  if (isToday) {
    return {
      ...state,
      engineers: patchEngineer(state, engineerId, { status: 'dayoff', dayoffDate }),
      tasks: removeEngineerFromAllTasks(state, engineerId),
      history: appendHistory(state, hist),
    };
  }
  if (isPast) {
    return {
      ...state,
      engineers: patchEngineer(state, engineerId, { dayoffDate: null }),
      history: appendHistory(state, hist),
    };
  }
  // Будущий
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { dayoffDate }),
    history: appendHistory(state, hist),
  };
}

export function cancelDayoff(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { dayoffDate: null }),
  };
}

export function endDayoffEarly(state: ProjectState, engineerId: string): ProjectState {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'active', dayoffDate: null }),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'return',
      fromTask: null, toTask: null, note: 'Вернулся с дейофа',
    }),
  };
}

// ─── Task assignment ──────────────────────────────────────────────────────────

export function removeFromTask(state: ProjectState, engineerId: string): ProjectState {
  const currentTask = findCurrentTask(state, engineerId);
  return {
    ...state,
    tasks: removeEngineerFromAllTasks(state, engineerId),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'return',
      fromTask: currentTask?.id || null, toTask: null, note: 'Снят с задачи',
    }),
  };
}

export function switchToTask(state: ProjectState, engineerId: string, toTaskId: string): ProjectState {
  const currentTask = findCurrentTask(state, engineerId);
  return {
    ...state,
    tasks: state.tasks.map(t => {
      if (currentTask && t.id === currentTask.id) {
        return { ...t, assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId) };
      }
      if (t.id === toTaskId) {
        return { ...t, assignedEngineers: [...(t.assignedEngineers || []), engineerId] };
      }
      return t;
    }),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'switch',
      fromTask: currentTask?.id || null, toTask: toTaskId, note: '',
    }),
  };
}
