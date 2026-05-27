// src/domain/engineer.js
// Чистые функции переходов состояния инженера.
//
// Принцип: каждая функция принимает project state {engineers, tasks, history}
// и возвращает новый state. Никаких side-effects, никакого подтверждения у пользователя.
// Подтверждение (useConfirm) и UI-state остаются в страницах — там им место.
//
// Преимущество: бизнес-логика «уход в отпуск» живёт в ОДНОМ месте.
// Раньше она была размазана между EngineerCard.js (форма) и normalizeStatuses (демон).

import { todayStr, formatDateShort } from '../utils/dates';
import { genId } from '../utils/ids';

// ─── helpers ──────────────────────────────────────────────────────────────────

function findCurrentTask(state, engineerId) {
  return state.tasks.find(t => t.assignedEngineers?.includes(engineerId) && t.status === 'active');
}

function removeEngineerFromAllTasks(state, engineerId) {
  return state.tasks.map(t => ({
    ...t,
    assignedEngineers: (t.assignedEngineers || []).filter(id => id !== engineerId),
  }));
}

function appendHistory(state, entry) {
  return [...state.history, { id: genId('h'), ...entry }];
}

function patchEngineer(state, engineerId, patch) {
  return state.engineers.map(e => e.id === engineerId ? { ...e, ...patch } : e);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function addEngineer(state, data) {
  const engineer = {
    id: genId('e'),
    name: data.name,
    role: data.role || 'engineer',
    regularTask: data.regularTask || null,
    status: 'active',
    vacationFrom: null,
    vacationTo: null,
    dayoffDate: null,
    experience: data.experience || {},
  };
  return { ...state, engineers: [...state.engineers, engineer] };
}

export function deleteEngineer(state, engineerId) {
  return {
    ...state,
    engineers: state.engineers.filter(e => e.id !== engineerId),
    tasks: removeEngineerFromAllTasks(state, engineerId),
  };
}

export function updateEngineerProfile(state, engineerId, updates) {
  // Профиль: имя, роль, регулярная задача, experience. НЕ статусы.
  const allowed = ['name', 'role', 'regularTask', 'experience'];
  const patch = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
  return { ...state, engineers: patchEngineer(state, engineerId, patch) };
}

// ─── Sick leave ───────────────────────────────────────────────────────────────

export function setSickLeave(state, engineerId) {
  const currentTask = findCurrentTask(state, engineerId);
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'sick' }),
    tasks: removeEngineerFromAllTasks(state, engineerId),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'sick',
      fromTask: currentTask?.id || null, toTask: null, note: '',
    }),
  };
}

export function clearSickLeave(state, engineerId) {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'active' }),
    history: appendHistory(state, {
      date: todayStr(), engineerId, type: 'return',
      fromTask: null, toTask: null, note: 'Выход с больничного',
    }),
  };
}

// ─── Vacation ─────────────────────────────────────────────────────────────────

export function setVacation(state, engineerId, vacationFrom, vacationTo) {
  const today = todayStr();
  const isPast    = vacationTo < today;
  const isOngoing = vacationFrom <= today && vacationTo >= today;
  const preTask = findCurrentTask(state, engineerId);

  const noteRange = `Отпуск ${formatDateShort(vacationFrom)} — ${formatDateShort(vacationTo)}`;

  if (isPast) {
    // Исторический отпуск: снимаем со всех задач, возвращаем на ту же если она ещё активна
    let updatedTasks = removeEngineerFromAllTasks(state, engineerId);
    const newHistory = [
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
      // Меняем status только если отпуск уже начался
      ...(isOngoing ? { status: 'vacation' } : {}),
      vacationFrom, vacationTo,
    }),
    // Если уже начался — сразу снять с задач
    tasks: isOngoing ? removeEngineerFromAllTasks(state, engineerId) : state.tasks,
    history: appendHistory(state, {
      date: vacationFrom, engineerId, type: 'vacation',
      fromTask: preTask?.id || null, toTask: null, note: noteRange,
    }),
  };
}

export function cancelVacation(state, engineerId) {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { vacationFrom: null, vacationTo: null }),
  };
}

export function endVacationEarly(state, engineerId) {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { status: 'active', vacationFrom: null, vacationTo: null }),
  };
}

// ─── Dayoff ───────────────────────────────────────────────────────────────────

export function setDayoff(state, engineerId, dayoffDate) {
  const today = todayStr();
  const isPast  = dayoffDate < today;
  const isToday = dayoffDate === today;
  const preTask = findCurrentTask(state, engineerId);
  const hist = {
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

export function cancelDayoff(state, engineerId) {
  return {
    ...state,
    engineers: patchEngineer(state, engineerId, { dayoffDate: null }),
  };
}

export function endDayoffEarly(state, engineerId) {
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

export function removeFromTask(state, engineerId) {
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

export function switchToTask(state, engineerId, toTaskId) {
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
