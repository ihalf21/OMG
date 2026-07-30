// src/domain/engineer.ts
// Чистые функции переходов состояния инженера. (state, ...args) -> newState.

import { todayStr, formatDateShort, addCalendarDay } from '../utils/dates';
import { genId } from '../utils/ids';
import type {
  Engineer, EngineerRole, HistoryEntry, ISODate,
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
}

export function updateEngineerProfile(state: ProjectState, engineerId: string, updates: EngineerProfileUpdate): ProjectState {
  const allowed: (keyof EngineerProfileUpdate)[] = ['name', 'role', 'regularTask'];
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
    // Исторический отпуск: инженер уже вернулся, состав задач не меняем.
    // Пишем чистую пару vacation → return (return на день после конца отпуска,
    // чтобы getAbsencePeriods восстановил период [from, to] включительно).
    // Период привязан к инженеру, а не к задаче — корректно учитывается там,
    // где инженер реально был, и в «Отсутствиях», и в расчёте прогресса.
    return {
      ...state,
      engineers: patchEngineer(state, engineerId, { status: 'active', vacationFrom: null, vacationTo: null }),
      history: [
        ...state.history,
        { id: genId('h'), date: vacationFrom, engineerId, type: 'vacation', fromTask: preTask?.id || null, toTask: null, note: noteRange },
        { id: genId('h'), date: addCalendarDay(vacationTo), engineerId, type: 'return', fromTask: null, toTask: null, note: 'Вернулся из отпуска' },
      ],
    };
  }

  // Текущий или будущий отпуск
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, {
      ...(isOngoing ? { status: 'vacation' as const } : {}),
      vacationFrom, vacationTo,
    }),
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

// dayFraction — доля сегодняшнего дня, отработанная на покидаемой задаче (0..1).
export function switchToTask(state: ProjectState, engineerId: string, toTaskId: string, dayFraction = 0): ProjectState {
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
      dayFraction: currentTask ? dayFraction : 0,
    }),
  };
}
