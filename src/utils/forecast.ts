// utils/forecast.ts — расчёт прогноза завершения задачи.
// Оценка в человеко-часах. Рабочий день = 8 часов.

import { addWorkdays, addCalendarDay, isWorkday, subtractWorkdays, workdaysElapsed, todayStr, workdaysBetween } from './dates';
import { roleCoeff, capacityToday, capacityOn } from '../domain/availability';
import type { Engineer, ISODate, Task } from '../domain/types';

export const HOURS_PER_DAY = 8;
export { roleCoeff };

// Текущая мощность команды задачи — учитывает кто сегодня в отпуске/больничном/дейофе.
// «Реальная» capacity, на которую можно положиться при расчёте сроков.
export function currentCapacity(task: Task, engineers: Engineer[]): number {
  return (task.assignedEngineers || []).reduce((sum, id) => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return sum;
    return sum + capacityToday(eng);
  }, 0);
}

// Номинальная мощность команды — игнорирует временные отсутствия.
// Используется при elapsed-based прогрессе.
export function nominalCapacity(task: Task, engineers: Engineer[]): number {
  return (task.assignedEngineers || []).reduce((sum, id) => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return sum;
    return sum + roleCoeff(eng.role);
  }, 0);
}

// Максимальное число дней симуляции — 2 года. Защита от бесконечного цикла
// (никто никогда не работает) или неподъёмной задачи.
const MAX_SIM_DAYS = 730;

/**
 * Симулирует выполнение задачи день за днём от startDate.
 * Учитывает запланированные на будущее отпуска и дейофы инженеров —
 * это даёт более точный прогноз, чем формула «часы / текущая_capacity».
 *
 * Возвращает дату последнего рабочего дня (когда часы добиты) и количество
 * рабочих дней с момента старта до этого дня включительно.
 */
export function projectFinish(
  task: Task,
  engineers: Engineer[],
  startDate: ISODate,
  remainingHours: number,
): { forecastDate: ISODate | null; daysLeft: number | null } {
  if (remainingHours <= 0) return { forecastDate: startDate, daysLeft: 0 };

  const assignedIds = task.assignedEngineers || [];
  const assigned: Engineer[] = [];
  for (const id of assignedIds) {
    const eng = engineers.find(e => e.id === id);
    if (eng) assigned.push(eng);
  }
  if (assigned.length === 0) return { forecastDate: null, daysLeft: null };

  let cursor = startDate;
  let hoursLeft = remainingHours;
  let lastWorkday: ISODate | null = null;

  for (let i = 0; i < MAX_SIM_DAYS && hoursLeft > 0; i++) {
    if (isWorkday(cursor)) {
      const dailyCap = assigned.reduce((sum, eng) => sum + capacityOn(eng, cursor), 0);
      if (dailyCap > 0) {
        hoursLeft -= dailyCap * HOURS_PER_DAY;
        lastWorkday = cursor;
      }
    }
    if (hoursLeft <= 0) break;
    cursor = addCalendarDay(cursor);
  }

  if (!lastWorkday) return { forecastDate: null, daysLeft: null };
  return { forecastDate: lastWorkday, daysLeft: workdaysBetween(startDate, lastWorkday) };
}

export type DeadlineStatus = 'ok' | 'risk' | 'overdue';

export interface Forecast {
  progressPct: number;
  hoursLeft: number | null;
  daysLeft: number | null;
  forecastDate: ISODate | null;
  deadlineStatus: DeadlineStatus | null;
  capacity: number;
  effectiveDeadline: ISODate | null;
}

/**
 * Основной расчёт прогноза.
 * estimateHours — оценка в человеко-часах.
 */
export function calcForecast(
  task: Task,
  engineers: Engineer[],
  deadlineOverride: ISODate | null = null,
  startOverride: ISODate | null = null,
): Forecast {
  const cap = currentCapacity(task, engineers);
  const capFull = nominalCapacity(task, engineers);
  const totalHours = task.estimateHours || 0;

  let progressPct = 0;
  let remainingHours = totalHours;

  if (task.totalCases && task.totalCases > 0 && (task.doneCases || 0) > 0) {
    progressPct = Math.min(100, Math.round((task.doneCases / task.totalCases) * 100));
    remainingHours = totalHours * (1 - progressPct / 100);
  } else {
    const elapsed = task.startDate ? workdaysElapsed(task.startDate) : 0;
    const usedHours = elapsed * capFull * HOURS_PER_DAY;
    remainingHours = Math.max(0, totalHours - usedHours);
    progressPct = totalHours > 0
      ? Math.min(100, Math.round((usedHours / totalHours) * 100))
      : 0;
  }

  let forecastDate: ISODate | null = null;
  let daysLeft: number | null = null;
  if (totalHours > 0 && remainingHours > 0) {
    const today = todayStr();
    let baseDate: ISODate;
    if (startOverride) {
      baseDate = startOverride > today ? startOverride : today;
    } else {
      baseDate = task.startDate && task.startDate > today ? task.startDate : today;
    }
    // День-за-днём симуляция: учитывает запланированные отпуска/дейофы
    // которые ещё не наступили, но повлияют на длительность задачи.
    const sim = projectFinish(task, engineers, baseDate, remainingHours);
    forecastDate = sim.forecastDate;
    daysLeft = sim.daysLeft;
  }

  const effectiveDl = deadlineOverride !== null ? deadlineOverride : (task.deadline || null);

  let deadlineStatus: DeadlineStatus | null = null;
  if (!effectiveDl) {
    deadlineStatus = 'ok';
  } else if (forecastDate) {
    if (forecastDate > effectiveDl) {
      deadlineStatus = 'overdue';
    } else {
      const daysToDeadline = workdaysBetween(todayStr(), effectiveDl);
      const buffer = daysToDeadline > 0
        ? (daysToDeadline - (daysLeft || 0)) / daysToDeadline
        : 0;
      deadlineStatus = buffer > 0.15 ? 'ok' : 'risk';
    }
  }

  return {
    progressPct,
    hoursLeft: totalHours > 0 ? remainingHours : null,
    daysLeft,
    forecastDate,
    deadlineStatus,
    capacity: cap,
    effectiveDeadline: effectiveDl,
  };
}

export function statusColor(status: DeadlineStatus | null | undefined): string {
  switch (status) {
    case 'ok':      return 'var(--success)';
    case 'risk':    return '#EF9F27';
    case 'overdue': return '#E24B4A';
    default:        return '#A8A6A0';
  }
}

export function statusLabel(status: DeadlineStatus | null | undefined): string {
  switch (status) {
    case 'ok':      return 'Опережение';
    case 'risk':    return 'Впритык';
    case 'overdue': return 'Срыв сроков';
    default:        return 'В работе';
  }
}

export interface BadgeStyle {
  bg: string;
  color: string;
}

export function statusBadgeStyle(status: DeadlineStatus | null | undefined): BadgeStyle {
  switch (status) {
    case 'ok':      return { bg: 'var(--success-bg)',   color: 'var(--success)' };
    case 'risk':    return { bg: 'var(--amber-bg)',     color: 'var(--amber)' };
    case 'overdue': return { bg: 'var(--red-bg)',       color: 'var(--red)' };
    default:        return { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
  }
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  const rounded = Math.round(h);
  if (rounded < HOURS_PER_DAY) return `${rounded} чч`;
  const days = Math.floor(rounded / HOURS_PER_DAY);
  const hrs  = rounded % HOURS_PER_DAY;
  return hrs > 0 ? `${days} дн. ${hrs} чч` : `${days} дн.`;
}

export interface DependentStart {
  date: ISODate | null;
  halfDay: boolean;
}

/**
 * Дата старта зависимой задачи, родитель уже начат.
 */
export function calcDependentStart(parentTask: Task, parentEngineers: Engineer[]): DependentStart {
  const fc = calcForecast(parentTask, parentEngineers);
  if (!fc.forecastDate) return { date: null, halfDay: false };
  return { date: addWorkdays(fc.forecastDate, 1), halfDay: false };
}

/**
 * Schedule-forward: вычислить когда закончится родитель если он стартует в parentDynStart.
 * Возвращает дату старта дочерней задачи (= следующий рабочий день после конца родителя).
 *
 * Использует посуточную симуляцию — учитывает запланированные отпуска/дейофы
 * на период работы родителя.
 */
export function calcScheduledChildStart(parentTask: Task, parentEngineers: Engineer[], parentDynStart: ISODate | null): ISODate | null {
  if (!parentDynStart) return null;
  const totalHours = parentTask.estimateHours || 0;
  if (totalHours <= 0) return parentDynStart;
  const sim = projectFinish(parentTask, parentEngineers, parentDynStart, totalHours);
  if (!sim.forecastDate) return null;
  return addWorkdays(sim.forecastDate, 1);
}

/**
 * Сколько инженеров нужно добавить чтобы уложиться в дедлайн.
 * Возвращает 0 если уже укладываемся, null если нет дедлайна.
 */
export function engineersNeeded(task: Task, engineers: Engineer[], deadlineOverride: ISODate | null = null): number | null {
  const effectiveDl = deadlineOverride !== null ? deadlineOverride : (task.deadline || null);
  if (!effectiveDl) return null;
  const fc = calcForecast(task, engineers, deadlineOverride);
  if (fc.deadlineStatus !== 'overdue') return 0;

  const totalHours = task.estimateHours || 0;
  const cap = currentCapacity(task, engineers);

  const daysToDeadline = workdaysBetween(todayStr(), effectiveDl);
  if (daysToDeadline <= 0) return null;

  let remainingHours = totalHours;
  if (task.totalCases && task.totalCases > 0 && (task.doneCases || 0) > 0) {
    const pct = Math.min(1, (task.doneCases || 0) / task.totalCases);
    remainingHours = totalHours * (1 - pct);
  } else {
    const capFull = nominalCapacity(task, engineers);
    const elapsed = workdaysElapsed(task.startDate);
    const usedHours = elapsed * capFull * HOURS_PER_DAY;
    remainingHours = Math.max(0, totalHours - usedHours);
  }

  const neededCap = remainingHours / (daysToDeadline * HOURS_PER_DAY);
  const extraCap  = neededCap - cap;
  return extraCap > 0 ? Math.ceil(extraCap) : 0;
}

/**
 * Обратный расчёт дедлайна по цепочке зависимостей.
 */
export function getDerivedDeadline(task: Task, allTasks: Task[], engineers: Engineer[], _depth: number = 0): ISODate | null {
  if (_depth > 20) return task.deadline || null;

  const child = allTasks.find(t => t.dependsOn === task.id);
  if (!child) return task.deadline || null;

  const childDl = getDerivedDeadline(child, allTasks, engineers, _depth + 1);
  if (!childDl) return task.deadline || null;

  const childCap = currentCapacity(child, engineers);
  const childTotalHours = child.estimateHours || 0;
  const childDays = childCap > 0
    ? Math.max(1, Math.ceil(childTotalHours / (childCap * HOURS_PER_DAY)))
    : (() => {
        const parentCap = currentCapacity(task, engineers);
        const estimateCap = parentCap > 0 ? parentCap : 1;
        return Math.max(1, Math.ceil(childTotalHours / (estimateCap * HOURS_PER_DAY)));
      })();

  const derived = childDays > 0 ? subtractWorkdays(childDl, childDays) : childDl;

  if (!task.deadline) return derived;
  return task.deadline < derived ? task.deadline : derived;
}

/**
 * Эффективные дедлайны для всех активных задач с учётом цепочки.
 * inheritedEngIds — унаследованные команды из computeInheritedTeam (domain/gantt).
 * Без него дочерние задачи без инженеров оцениваются с capacity=1 вместо команды родителя.
 */
export function computeEffectiveDls(
  allActiveTasks: Task[],
  engineers: Engineer[],
  inheritedEngIds: Record<string, string[]> = {},
): Record<string, ISODate> {
  const result: Record<string, ISODate> = {};

  const leafIds = new Set(
    allActiveTasks.filter(t => !allActiveTasks.some(c => c.dependsOn === t.id)).map(t => t.id)
  );

  function chainMaxDl(taskId: string, depth: number): ISODate | null {
    if (depth > 9) return null;
    const task = allActiveTasks.find(t => t.id === taskId);
    if (!task) return null;
    const child = allActiveTasks.find(t => t.dependsOn === taskId);
    const childMax = child ? chainMaxDl(child.id, depth + 1) : null;
    if (!task.deadline && !childMax) return null;
    if (!task.deadline) return childMax;
    if (!childMax) return task.deadline;
    return task.deadline > childMax ? task.deadline : childMax;
  }

  // Шаг 1: листовые задачи получают максимальный дедлайн цепочки
  allActiveTasks.forEach(t => {
    if (!leafIds.has(t.id)) return;
    let cur: Task = t;
    for (let i = 0; i < 9; i++) {
      if (!cur.dependsOn) break;
      const p = allActiveTasks.find(x => x.id === cur.dependsOn);
      if (!p) break;
      cur = p;
    }
    const dl = chainMaxDl(cur.id, 0);
    if (dl) result[t.id] = dl;
  });

  // Шаг 2: для родительских задач вычитаем длины потомков назад.
  // Используем унаследованные команды: дочерние задачи без своих инженеров
  // получают команду родителя — именно с такой мощностью они и будут работать.
  const tasksForDl: Task[] = allActiveTasks.map(t => ({
    ...t,
    assignedEngineers: inheritedEngIds[t.id] ?? t.assignedEngineers ?? [],
    deadline: leafIds.has(t.id) ? (result[t.id] || null) : null,
  }));
  allActiveTasks.forEach(t => {
    if (leafIds.has(t.id)) return;
    const derived = getDerivedDeadline(
      { ...t, assignedEngineers: inheritedEngIds[t.id] ?? t.assignedEngineers ?? [], deadline: null },
      tasksForDl,
      engineers,
    );
    if (derived) result[t.id] = derived;
  });

  return result;
}
