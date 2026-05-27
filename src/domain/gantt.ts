// src/domain/gantt.ts
// Чистые алгоритмы для диаграммы Ганта — выделены из UI для тестирования.

import { addWorkdays } from '../utils/dates';
import { HOURS_PER_DAY, calcDependentStart, calcScheduledChildStart } from '../utils/forecast';
import type { Engineer, ISODate, Task } from './types';
import type { MonthDay } from '../utils/dates';

// Максимальная глубина цепочки зависимостей. Защита от циклов.
export const MAX_CHAIN_DEPTH = 9;

// ─── Inherited team ───────────────────────────────────────────────────────────

/**
 * Для каждой задачи возвращает эффективную команду:
 * - своя команда, если задача не зависит ни от чего;
 * - команда родителя, если своих инженеров нет;
 * - объединение, если есть и те и другие (без дубликатов).
 *
 * Защита от циклов через MAX_CHAIN_DEPTH.
 */
export function computeInheritedTeam(tasks: Task[]): Record<string, string[]> {
  const cache: Record<string, string[]> = {};

  function get(taskId: string, depth: number): string[] {
    if (depth > MAX_CHAIN_DEPTH || cache[taskId] !== undefined) return cache[taskId] || [];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { cache[taskId] = []; return []; }
    const own = task.assignedEngineers || [];
    if (!task.dependsOn) { cache[taskId] = own; return own; }
    const parentIds = get(task.dependsOn, depth + 1);
    if (own.length === 0) { cache[taskId] = parentIds; return parentIds; }
    const merged = [...new Set([...parentIds, ...own])];
    cache[taskId] = merged;
    return merged;
  }

  tasks.forEach(t => get(t.id, 0));
  return cache;
}

// ─── Dynamic starts ───────────────────────────────────────────────────────────

/**
 * Для каждой задачи возвращает фактическую дату старта:
 * - независимая задача: её собственный startDate;
 * - зависимая: рассчитывается от родителя через calcDependentStart
 *   (если родитель уже начат) или calcScheduledChildStart (forward-планирование).
 *
 * Если capacity родителя = 0 (нет инженеров), используется дедлайн родителя
 * или его оценка в часах как fallback.
 */
export function computeDynamicStarts(
  tasks: Task[],
  engineers: Engineer[],
  inheritedTeam: Record<string, string[]>,
): Record<string, ISODate | null> {
  const cache: Record<string, ISODate | null> = {};

  function getDynStart(taskId: string, depth: number): ISODate | null {
    if (depth > MAX_CHAIN_DEPTH) return null;
    if (cache[taskId] !== undefined) return cache[taskId];
    const task = tasks.find(t => t.id === taskId);
    if (!task) { cache[taskId] = null; return null; }
    if (!task.dependsOn) { cache[taskId] = task.startDate || null; return cache[taskId]; }
    const parent = tasks.find(t => t.id === task.dependsOn);
    if (!parent) { cache[taskId] = task.startDate || null; return cache[taskId]; }
    const parentDynStart = getDynStart(parent.id, depth + 1);
    const parentEff: Task = { ...parent, assignedEngineers: inheritedTeam[parent.id] || [] };

    let date: ISODate | null = null;
    if (!parent.dependsOn && parent.startDate) {
      const { date: d } = calcDependentStart(parentEff, engineers);
      if (d) {
        date = d;
      } else if (parent.deadline) {
        date = addWorkdays(parent.deadline, 1);
      } else {
        const hrs = parent.estimateHours || HOURS_PER_DAY;
        date = addWorkdays(parent.startDate, Math.round(hrs / HOURS_PER_DAY));
      }
    } else {
      if (!parentDynStart) { cache[taskId] = null; return null; }
      const d = calcScheduledChildStart(parentEff, engineers, parentDynStart);
      if (d) {
        date = d;
      } else if (parent.deadline) {
        date = addWorkdays(parent.deadline, 1);
      } else {
        const hrs = parent.estimateHours || HOURS_PER_DAY;
        date = addWorkdays(parentDynStart, Math.round(hrs / HOURS_PER_DAY));
      }
    }

    cache[taskId] = date;
    return date;
  }

  tasks.forEach(t => getDynStart(t.id, 0));
  return cache;
}

// ─── Task chain ───────────────────────────────────────────────────────────────

/**
 * Цепочка задач, связанная с указанной (вверх к корню + вниз к листу).
 * Используется для подсветки и стрелок зависимостей при наведении.
 */
export function getTaskChain(taskId: string, allTasks: Task[]): Task[] {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return [];

  const chain: Task[] = [task];

  // Вверх — к корню
  let cur: Task = task;
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    if (!cur.dependsOn) break;
    const parent = allTasks.find(t => t.id === cur.dependsOn);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }

  // Вниз — к листу
  cur = task;
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    const child = allTasks.find(t => t.dependsOn === cur.id);
    if (!child) break;
    chain.push(child);
    cur = child;
  }

  return chain;
}

// ─── ISO 8601 week ────────────────────────────────────────────────────────────

/**
 * Номер недели по ISO 8601: неделя 1 — та, что содержит 4 января.
 * Понедельник — первый день недели.
 */
export function getISOWeek(dateStr: ISODate): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const tmp = new Date(Date.UTC(y, m - 1, d));
  // Сдвигаем на четверг той же недели — он всегда в одном году с неделей.
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

// ─── Dependency arrow anchor ──────────────────────────────────────────────────

/**
 * Точка крепления стрелки зависимости на правом крае родительского бара.
 * - Для широких баров — фиксированный отступ от правого края (rightPadding px).
 * - Для узких баров (ширина < 2*rightPadding) — центр бара, иначе стрелка вылезает
 *   за бар или лепится впритык к правому краю (для 1-дневных задач это особенно
 *   заметно — узкая полоска и стрелка почти на самом краю).
 *
 * Возвращает смещение в пикселях от ЛЕВОГО края бара.
 */
export function arrowAnchorOffset(barWidth: number, rightPadding: number = 12): number {
  if (barWidth >= 2 * rightPadding) return barWidth - rightPadding;
  return barWidth / 2;
}

// ─── Week segmentation ────────────────────────────────────────────────────────

export interface WeekSegment {
  week: number;
  start: number; // индекс первого дня в массиве days
  count: number; // сколько дней в этой неделе попало в массив
}

/**
 * Группирует массив дней по неделям. Используется для строки «нед. NN» в шапке Ганта.
 */
export function segmentByWeek(days: MonthDay[]): WeekSegment[] {
  const segments: WeekSegment[] = [];
  days.forEach((d, i) => {
    const wk = getISOWeek(d.str);
    const last = segments[segments.length - 1];
    if (!last || last.week !== wk) {
      segments.push({ week: wk, start: i, count: 1 });
    } else {
      last.count++;
    }
  });
  return segments;
}
