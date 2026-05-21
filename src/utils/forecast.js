// utils/forecast.js — расчёт прогноза завершения задачи
// Оценка в человеко-часах (чч). Рабочий день = 8 часов.
// Коэффициенты: engineer=1.0, intern=0.5, responsible=0.5, lead=0

import { addWorkdays, subtractWorkdays, workdaysElapsed, todayStr, workdaysBetween } from './dates';

export const HOURS_PER_DAY = 8;

// Коэффициент производительности по роли
export function roleCoeff(role) {
  switch (role) {
    case 'intern':       return 0.5;
    case 'responsible':  return 0.5;
    case 'lead':         return 0;
    default:             return 1.0; // engineer
  }
}

// Суммарная эффективная мощность команды на задаче (в единицах инженеро-дней/день)
// с учётом коэффициентов и исключением недоступных
export function effectiveCapacity(task, engineers) {
  return (task.assignedEngineers || []).reduce((sum, id) => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return sum;
    if (eng.status === 'sick') return sum;
    if (eng.status === 'vacation') {
      const today = todayStr();
      if (eng.vacationFrom && eng.vacationTo) {
        if (today >= eng.vacationFrom && today <= eng.vacationTo) return sum;
      } else {
        return sum;
      }
    }
    return sum + roleCoeff(eng.role);
  }, 0);
}

// Суммарная эффективная мощность с начала задачи (для авто-прогресса)
// Упрощённо: считаем текущий состав как постоянный
export function effectiveCapacityFull(task, engineers) {
  return (task.assignedEngineers || []).reduce((sum, id) => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return sum;
    return sum + roleCoeff(eng.role);
  }, 0);
}

/**
 * Основной расчёт прогноза.
 * estimateHours — оценка в человеко-часах.
 *
 * Возвращает:
 *   progressPct      — % выполнения (0–100)
 *   hoursLeft        — часов работы осталось
 *   daysLeft         — рабочих дней до завершения (с текущей командой)
 *   forecastDate     — расчётная дата завершения
 *   deadlineStatus   — 'ok' | 'risk' | 'overdue' | null
 *   capacity         — текущая эффективная мощность (ед/день)
 */
export function calcForecast(task, engineers, deadlineOverride = null, startOverride = null) {
  const cap = effectiveCapacity(task, engineers);         // эфф. мощность сегодня
  const capFull = effectiveCapacityFull(task, engineers); // полная (для авто-прогресса)
  const totalHours = task.estimateHours || 0;

  let progressPct = 0;
  let remainingHours = totalHours;

  if (task.totalCases && task.totalCases > 0 && (task.doneCases || 0) > 0) {
    // Ручной прогресс по кейсам (только если хоть что-то введено)
    progressPct = Math.min(100, Math.round((task.doneCases / task.totalCases) * 100));
    remainingHours = totalHours * (1 - progressPct / 100);
  } else {
    // Авто: прошло рабочих дней × эфф. мощность × часов в дне
    // Используется и когда totalCases не задан, и когда doneCases ещё не вводили
    const elapsed = task.startDate ? workdaysElapsed(task.startDate) : 0;
    const usedHours = elapsed * capFull * HOURS_PER_DAY;
    remainingHours = Math.max(0, totalHours - usedHours);
    progressPct = totalHours > 0
      ? Math.min(100, Math.round((usedHours / totalHours) * 100))
      : 0;
  }

  // Рабочих дней до завершения
  // cap * HOURS_PER_DAY = часов в день от текущей команды
  const hoursPerDay = cap * HOURS_PER_DAY;
  const daysLeft = (hoursPerDay > 0 && totalHours > 0) ? Math.max(1, Math.round(remainingHours / hoursPerDay)) : null;

  let forecastDate = null;
  if (daysLeft !== null) {
    const today = todayStr();
    let baseDate;
    if (startOverride) {
      baseDate = startOverride > today ? startOverride : today;
    } else {
      baseDate = task.startDate && task.startDate > today ? task.startDate : today;
    }
    // daysLeft — количество занятых рабочих дней, последний день = start + (daysLeft-1)
    forecastDate = addWorkdays(baseDate, Math.max(0, daysLeft - 1));
  }

  // Эффективный дедлайн: переданный override имеет приоритет над собственным
  const effectiveDl = deadlineOverride !== null ? deadlineOverride : (task.deadline || null);

  // Статус дедлайна
  let deadlineStatus = null;
  if (!effectiveDl) {
    // Нет дедлайна — всегда зелёный
    deadlineStatus = 'ok';
  } else if (forecastDate) {
    if (forecastDate > effectiveDl) {
      // Выходим за дедлайн — срыв
      deadlineStatus = 'overdue';
    } else {
      // Укладываемся — проверяем запас
      const daysToDeadline = workdaysBetween(todayStr(), effectiveDl);
      const buffer = daysToDeadline > 0
        ? (daysToDeadline - (daysLeft || 0)) / daysToDeadline
        : 0;
      // Опережение если запас > 15%, иначе впритык
      deadlineStatus = buffer > 0.15 ? 'ok' : 'risk';
    }
  }

  return { progressPct, hoursLeft: totalHours > 0 ? remainingHours : null, daysLeft, forecastDate, deadlineStatus, capacity: cap, effectiveDeadline: effectiveDl };
}

export function statusColor(status) {
  switch (status) {
    case 'ok':      return 'var(--success)';
    case 'risk':    return '#EF9F27';
    case 'overdue': return '#E24B4A';
    default:        return '#A8A6A0';
  }
}

export function statusLabel(status) {
  switch (status) {
    case 'ok':      return 'Опережение';
    case 'risk':    return 'Впритык';
    case 'overdue': return 'Срыв сроков';
    default:        return 'В работе';
  }
}

export function statusBadgeStyle(status) {
  switch (status) {
    case 'ok':      return { bg: 'var(--success-bg)',   color: 'var(--success)' };
    case 'risk':    return { bg: 'var(--amber-bg)',     color: 'var(--amber)' };
    case 'overdue': return { bg: 'var(--red-bg)',       color: 'var(--red)' };
    default:        return { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
  }
}

// Форматирование часов для отображения
export function fmtHours(h) {
  if (h === null || h === undefined) return '—';
  const rounded = Math.round(h);
  if (rounded < HOURS_PER_DAY) return `${rounded} чч`;
  const days = Math.floor(rounded / HOURS_PER_DAY);
  const hrs  = rounded % HOURS_PER_DAY;
  return hrs > 0 ? `${days} дн. ${hrs} чч` : `${days} дн.`;
}

/**
 * Вычислить дату старта зависимой задачи с учётом полудня.
 * Использует фактический прогресс родителя (elapsed-based).
 * Применяется когда родитель уже НАЧАТ (task.startDate установлен).
 */
export function calcDependentStart(parentTask, parentEngineers) {
  const fc = calcForecast(parentTask, parentEngineers);
  if (!fc.forecastDate) return { date: null, halfDay: false };
  // Дочерняя задача всегда стартует на следующий рабочий день после конца бара родителя.
  // Math.round в calcForecast определяет длину бара; +1 даёт старт дочерней.
  return { date: addWorkdays(fc.forecastDate, 1), halfDay: false };
}

/**
 * Schedule-forward: вычислить когда закончится родитель, если он стартует в parentDynStart.
 * НЕ считает elapsed. Используется для цепочки ещё не начатых задач.
 * Возвращает дату старта дочерней задачи.
 */
export function calcScheduledChildStart(parentTask, parentEngineers, parentDynStart) {
  const cap = effectiveCapacity(parentTask, parentEngineers);
  if (!cap || !parentDynStart) return null;
  const totalHours = parentTask.estimateHours || 0;
  const hoursPerDay = cap * HOURS_PER_DAY;
  const exactDays = totalHours > 0 ? totalHours / hoursPerDay : 0;
  const daysTotal = Math.max(1, Math.round(exactDays));
  // addWorkdays(start, n) = первый свободный день после n рабочих дней задачи = старт дочерней
  return addWorkdays(parentDynStart, daysTotal);
}

/**
 * Сколько инженеров (с коэфф. 1.0) нужно добавить чтобы уложиться в дедлайн.
 * Возвращает 0 если уже укладываемся, null если нет дедлайна.
 */
export function engineersNeeded(task, engineers, deadlineOverride = null) {
  const effectiveDl = deadlineOverride !== null ? deadlineOverride : (task.deadline || null);
  if (!effectiveDl) return null;
  const fc = calcForecast(task, engineers, deadlineOverride);
  if (fc.deadlineStatus !== 'overdue') return 0;

  const totalHours = task.estimateHours || 0;
  const cap = effectiveCapacity(task, engineers);

  // Рабочих дней до дедлайна
  const daysToDeadline = workdaysBetween(todayStr(), effectiveDl);
  if (daysToDeadline <= 0) return null;

  // Сколько часов осталось
  let remainingHours = totalHours;
  if (task.totalCases && task.totalCases > 0 && (task.doneCases || 0) > 0) {
    const pct = Math.min(1, (task.doneCases || 0) / task.totalCases);
    remainingHours = totalHours * (1 - pct);
  } else {
    const capFull = effectiveCapacityFull(task, engineers);
    const elapsed = workdaysElapsed(task.startDate);
    const usedHours = elapsed * capFull * HOURS_PER_DAY;
    remainingHours = Math.max(0, totalHours - usedHours);
  }

  // Нужная мощность = remainingHours / (daysToDeadline * HOURS_PER_DAY)
  const neededCap = remainingHours / (daysToDeadline * HOURS_PER_DAY);
  const extraCap  = neededCap - cap;
  return extraCap > 0 ? Math.ceil(extraCap) : 0;
}

/**
 * Обратный расчёт дедлайна по цепочке зависимостей.
 * Если у задачи нет своего дедлайна, но у дочерней задачи он есть —
 * вычитаем длительность дочерней задачи из её дедлайна, и так рекурсивно.
 * allTasks должен содержать только активные задачи.
 */
export function getDerivedDeadline(task, allTasks, engineers, _depth = 0) {
  if (_depth > 20) return task.deadline || null;

  const child = allTasks.find(t => t.dependsOn === task.id);
  if (!child) return task.deadline || null;

  const childDl = getDerivedDeadline(child, allTasks, engineers, _depth + 1);
  if (!childDl) return task.deadline || null;

  // Для обратного планирования используем полную оценку (estimateHours),
  // а не hoursLeft — иначе устаревший startDate занижает длительность.
  const childCap = effectiveCapacity(child, engineers);
  const childTotalHours = child.estimateHours || 0;
  const childDays = childCap > 0
    ? Math.max(1, Math.ceil(childTotalHours / (childCap * HOURS_PER_DAY)))
    : (() => {
        const parentCap = effectiveCapacity(task, engineers);
        const estimateCap = parentCap > 0 ? parentCap : 1;
        return Math.max(1, Math.ceil(childTotalHours / (estimateCap * HOURS_PER_DAY)));
      })();

  const derived = childDays > 0 ? subtractWorkdays(childDl, childDays) : childDl;

  if (!task.deadline) return derived;
  return task.deadline < derived ? task.deadline : derived;
}
