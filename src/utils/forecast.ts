// utils/forecast.ts — расчёт прогноза завершения задачи.
// Оценка в человеко-часах. Рабочий день = 8 часов.

import { addWorkdays, subtractWorkdays, workdaysElapsed, todayStr, workdaysBetween } from './dates';
import { roleCoeff, capacityToday } from '../domain/availability';
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

  const hoursPerDay = cap * HOURS_PER_DAY;
  const daysLeft = (hoursPerDay > 0 && totalHours > 0) ? Math.max(1, Math.round(remainingHours / hoursPerDay)) : null;

  let forecastDate: ISODate | null = null;
  if (daysLeft !== null) {
    const today = todayStr();
    let baseDate: ISODate;
    if (startOverride) {
      baseDate = startOverride > today ? startOverride : today;
    } else {
      baseDate = task.startDate && task.startDate > today ? task.startDate : today;
    }
    forecastDate = addWorkdays(baseDate, Math.max(0, daysLeft - 1));
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
 * Возвращает дату старта дочерней задачи.
 */
export function calcScheduledChildStart(parentTask: Task, parentEngineers: Engineer[], parentDynStart: ISODate | null): ISODate | null {
  const cap = currentCapacity(parentTask, parentEngineers);
  if (!cap || !parentDynStart) return null;
  const totalHours = parentTask.estimateHours || 0;
  const hoursPerDay = cap * HOURS_PER_DAY;
  const exactDays = totalHours > 0 ? totalHours / hoursPerDay : 0;
  const daysTotal = Math.max(1, Math.round(exactDays));
  return addWorkdays(parentDynStart, daysTotal);
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
 */
export function computeEffectiveDls(allActiveTasks: Task[], engineers: Engineer[]): Record<string, ISODate> {
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

  // Шаг 2: для родительских задач вычитаем длины потомков назад
  const tasksForDl: Task[] = allActiveTasks.map(t => ({
    ...t,
    deadline: leafIds.has(t.id) ? (result[t.id] || null) : null,
  }));
  allActiveTasks.forEach(t => {
    if (leafIds.has(t.id)) return;
    const derived = getDerivedDeadline({ ...t, deadline: null }, tasksForDl, engineers);
    if (derived) result[t.id] = derived;
  });

  return result;
}
