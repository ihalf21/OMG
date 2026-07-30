// utils/forecast.ts — расчёт прогноза завершения задачи.
// Оценка в человеко-часах. Рабочий день = 8 часов.

import { addWorkdays, addCalendarDay, subtractCalendarDay, isWorkday, subtractWorkdays, workdaysElapsed, todayStr, workdaysBetween } from './dates';
import { roleCoeff, capacityToday, capacityOn } from '../domain/availability';
import { taskEstimateHours } from '../domain/stages';
import { getAbsencePeriods } from './absences';
import type { Engineer, HistoryEntry, ISODate, Task } from '../domain/types';

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

// Номинальная мощность команды — игнорирует плановые отсутствия (отпуск, дейоф),
// но учитывает больничный: пока инженер болеет, его прошлая production неизвестна.
export function nominalCapacity(task: Task, engineers: Engineer[]): number {
  return (task.assignedEngineers || []).reduce((sum, id) => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return sum;
    if (eng.status === 'sick') return sum; // больничный = работа стоит, исключаем
    return sum + roleCoeff(eng.role);
  }, 0);
}

// Максимальное число дней симуляции — 2 года. Защита от бесконечного цикла
// (никто никогда не работает) или неподъёмной задачи.
const MAX_SIM_DAYS = 730;

export interface DailyWork {
  date: ISODate;
  capacity: number;
  hours: number;
  cumulativeHours: number;
}

export function buildTaskWorkSchedule(
  task: Task,
  engineers: Engineer[],
  startDate: ISODate,
  remainingHours: number,
): DailyWork[] {
  if (remainingHours <= 0) return [];

  const assigned = (task.assignedEngineers || [])
    .map(id => engineers.find(e => e.id === id))
    .filter((eng): eng is Engineer => !!eng);
  if (assigned.length === 0) return [];

  const schedule: DailyWork[] = [];
  let cursor = startDate;
  let hoursLeft = remainingHours;
  let cumulativeHours = 0;

  for (let i = 0; i < MAX_SIM_DAYS && hoursLeft > 0; i++) {
    if (isWorkday(cursor)) {
      const dailyCapacity = assigned.reduce((sum, eng) => sum + capacityOn(eng, cursor), 0);
      const availableHours = dailyCapacity * HOURS_PER_DAY;
      const hours = Math.max(0, Math.min(hoursLeft, availableHours));
      cumulativeHours += hours;
      schedule.push({ date: cursor, capacity: dailyCapacity, hours, cumulativeHours });
      hoursLeft -= hours;
    }
    if (hoursLeft <= 0) break;
    cursor = addCalendarDay(cursor);
  }

  return schedule;
}

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

  const schedule = buildTaskWorkSchedule(task, engineers, startDate, remainingHours);
  if (schedule.length === 0) return { forecastDate: null, daysLeft: null };
  const producedHours = schedule[schedule.length - 1].cumulativeHours;
  if (producedHours < remainingHours) return { forecastDate: null, daysLeft: null };
  const forecastDate = schedule[schedule.length - 1].date;
  return { forecastDate, daysLeft: workdaysBetween(startDate, forecastDate) };
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
 * Фактически отработанные человеко-часы на задаче до конца вчерашнего дня.
 *
 * В отличие от формулы «прошедшие_дни × текущая_команда», восстанавливает
 * реальный состав на каждый прошедший рабочий день из истории переключений
 * (switch/return). Поэтому добавление или снятие инженера НЕ пересчитывает
 * задним числом уже сделанную работу — прошлое фиксируется.
 *
 * Две независимые оси:
 *  1) членство в задаче по дням — только реальные назначения (switch/return);
 *  2) доступность инженера по дням — отсутствия (отпуск/больничный/дейоф) через
 *     getAbsencePeriods, привязанные к самому инженеру, а не к задаче. Поэтому
 *     отпуск задним числом корректно вычитается из той задачи, на которой
 *     инженер реально был в тот период, и работает даже если сейчас он снят;
 *  3) дробный день переключения — switch.dayFraction делит день между старой
 *     и новой задачей (старая получает dayFraction, новая 1-dayFraction).
 *     Отсутствие поля = 0 = весь день уходит новой задаче (legacy-поведение).
 */
// Доля рабочего дня в [0..1]; нечисловое/пустое → 0 (legacy: весь день новой задаче).
function clampFraction(v: number | null | undefined): number {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeUsedHours(task: Task, engineers: Engineer[], history: HistoryEntry[]): number {
  if (!task.startDate) return 0;
  const today = todayStr();
  if (task.startDate >= today) return 0;
  const startDate = task.startDate;
  const lastDay = subtractCalendarDay(today); // учитываем до конца вчерашнего дня

  // Кандидаты = текущая команда + все, кто фигурирует в истории по этой задаче.
  // Снятые инженеры выпадают из assignedEngineers, но их прошлый труд учитываем.
  const candidateIds = new Set<string>(task.assignedEngineers || []);
  for (const h of history) {
    if (h.toTask === task.id || h.fromTask === task.id) candidateIds.add(h.engineerId);
  }

  let usedHours = 0;

  candidateIds.forEach(id => {
    const eng = engineers.find(e => e.id === id);
    if (!eng) return;
    const role = roleCoeff(eng.role);
    if (role <= 0) return; // лид и т.п. не дают production

    // Ось 1: членство в задаче. Учитываем только реальные назначения —
    // switch/return. События отсутствий (vacation/sick/dayoff) НЕ означают
    // ухода с задачи, поэтому в реконструкцию членства не входят.
    const isCurrentMember = (task.assignedEngineers || []).includes(id);
    const evs = history
      .filter(h => h.engineerId === id
        && (h.type === 'switch' || h.type === 'return')
        && (h.toTask === task.id || h.fromTask === task.id))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Восстанавливаем интервалы присутствия forward-replay'ем.
    // Начальное состояние: без событий → текущее членство;
    // первое событие — уход (fromTask) → значит был на задаче с самого старта.
    let onTask = evs.length === 0 ? isCurrentMember : (evs[0].fromTask === task.id);
    let curFrom: ISODate | null = onTask ? startDate : null;
    const intervals: Array<{ from: ISODate; to: ISODate }> = [];
    // Дробные граничные дни переключения: доля рабочего дня, пришедшаяся на ЭТУ
    // задачу в день switch (уходящая получает dayFraction, входящая 1-dayFraction).
    const partials: Array<{ date: ISODate; frac: number }> = [];

    for (const h of evs) {
      const isJoin = h.toTask === task.id;
      const oldFrac = h.type === 'switch' ? clampFraction(h.dayFraction) : 0; // доля дня на ПОКИДАЕМУЮ задачу
      if (isJoin && !onTask) {
        onTask = true;
        // День прихода: этой (новой) задаче — 1-oldFrac; полные дни со следующего.
        if (h.date >= startDate) partials.push({ date: h.date, frac: 1 - oldFrac });
        const nextDay = addCalendarDay(h.date);
        curFrom = nextDay > startDate ? nextDay : startDate;
      } else if (!isJoin && onTask) {
        onTask = false;
        // Полные дни до дня ухода; в сам день ухода этой (старой) задаче — oldFrac.
        const end = subtractCalendarDay(h.date);
        if (curFrom && end >= curFrom) intervals.push({ from: curFrom, to: end });
        if (oldFrac > 0 && h.date >= startDate) partials.push({ date: h.date, frac: oldFrac });
        curFrom = null;
      }
    }
    if (onTask && curFrom) intervals.push({ from: curFrom, to: lastDay });

    // Ось 2: доступность. Отсутствия инженера за период — независимо от задачи.
    const absences = getAbsencePeriods(eng, history, today);
    const isAbsentOn = (d: ISODate) => absences.some(p => d >= p.start && d <= p.end);
    const dayCredit = (d: ISODate, frac: number) => {
      if (frac <= 0 || d < startDate || d > lastDay) return;
      if (isWorkday(d) && !isAbsentOn(d)) usedHours += frac * role * HOURS_PER_DAY;
    };

    // Полные рабочие дни внутри интервалов членства + дробные дни переключений.
    for (const iv of intervals) {
      let cursor = iv.from > startDate ? iv.from : startDate;
      const stop = iv.to < lastDay ? iv.to : lastDay;
      while (cursor <= stop) {
        dayCredit(cursor, 1);
        cursor = addCalendarDay(cursor);
      }
    }
    for (const p of partials) dayCredit(p.date, p.frac);
  });

  return usedHours;
}

/**
 * Основной расчёт прогноза.
 * estimateHours — оценка в человеко-часах.
 * history — если передана, прогресс считается посуточно по реальному составу
 * команды (см. computeUsedHours); без неё — fallback по текущей команде.
 */
export function calcForecast(
  task: Task,
  engineers: Engineer[],
  deadlineOverride: ISODate | null = null,
  startOverride: ISODate | null = null,
  history?: HistoryEntry[],
): Forecast {
  const cap = currentCapacity(task, engineers);
  const capFull = nominalCapacity(task, engineers);
  const totalHours = taskEstimateHours(task);

  const usedHours = history
    ? computeUsedHours(task, engineers, history)
    : (task.startDate ? workdaysElapsed(task.startDate) : 0) * capFull * HOURS_PER_DAY;
  const remainingHours = Math.max(0, totalHours - usedHours);
  const progressPct = totalHours > 0
    ? Math.min(100, Math.round((usedHours / totalHours) * 100))
    : 0;

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

// ─── Phase-aware progress (requires estimateForm from calculator) ────────────

const ESTIMATE_PCT_KEYS = new Set([
  'reportingPct', 'commsPct', 'bugPct', 'retestPct',
  'envInstPct', 'inexperiencePct', 'parallelPct', 'reservePct',
]);

function readEstimateM(form: Record<string, unknown>): {
  stage1: number; stage2: number; stage3: number;
  restHours: number; total: number; tcTotalCount: number;
} | null {
  const val = (key: string): number => {
    const rec = form[key] as { m?: string } | undefined;
    const raw = parseFloat(rec?.m ?? '') || 0;
    return ESTIMATE_PCT_KEYS.has(key) ? raw / 100 : raw;
  };
  const stage1      = (val('tasksCount') * val('analysisTimeMin')) / 60;
  const stage2      = (val('tcUpdateCount') * val('tcUpdateTimeMin') + val('tcNewCount') * val('tcNewTimeMin')) / 60;
  const tcTotalCount = val('tcTotalCount');
  const stage3      = (tcTotalCount * val('tcRunTimeMin')) / 60;
  const stage4      = (val('reportingPct') + val('commsPct')) * stage3;
  const stage5      = (tcTotalCount * val('bugPct') * val('defectTimeMin') + tcTotalCount * val('retestPct') * val('tcRunTimeMin') * val('retestCoeff')) / 60;
  const subtotal    = stage1 + stage2 + stage3 + stage4 + stage5;
  const riskCoeff   = 1 + val('envInstPct') + val('inexperiencePct') + val('parallelPct');
  const total       = subtotal * riskCoeff * (1 + val('reservePct'));
  if (total <= 0) return null;
  return { stage1, stage2, stage3, restHours: total - stage1 - stage2 - stage3, total, tcTotalCount };
}

export type EstimatePhase = 'analysis' | 'tc_writing' | 'test_run';

export interface PhaseInfo {
  phase: EstimatePhase;
  phaseName: string;
  phasePct: number;
  overallPct: number;
  expectedTests: number | null;
  totalTests: number | null;
  phases: Array<{ id: EstimatePhase; label: string; widthPct: number }>;
}

/**
 * Текущий этап работы над задачей на основе оценки из калькулятора.
 * Возвращает null если задача не оценивалась в калькуляторе или ещё не стартовала.
 * Дефекты и ретесты идут параллельно с тестированием — отдельной фазой не выделяются.
 */
export function calcPhaseInfo(task: Task, engineers: Engineer[], history?: HistoryEntry[]): PhaseInfo | null {
  if (!task.estimateForm || !task.estimateHours || !task.startDate) return null;
  const est = readEstimateM(task.estimateForm as Record<string, unknown>);
  if (!est) return null;

  const { stage1, stage2, stage3, restHours, total, tcTotalCount } = est;
  const totalHours = taskEstimateHours(task);

  const phases: PhaseInfo['phases'] = [
    { id: 'analysis',   label: 'Анализ',          widthPct: (stage1               / total) * 100 },
    { id: 'tc_writing', label: 'Актуализация ТМ',  widthPct: (stage2               / total) * 100 },
    { id: 'test_run',   label: 'Тестирование',      widthPct: ((stage3 + restHours) / total) * 100 },
  ];

  const bound1 = (stage1              / total) * totalHours;
  const bound2 = ((stage1 + stage2)   / total) * totalHours;
  const bound3 = ((stage1 + stage2 + stage3) / total) * totalHours;

  const usedHours = history
    ? computeUsedHours(task, engineers, history)
    : workdaysElapsed(task.startDate) * nominalCapacity(task, engineers) * HOURS_PER_DAY;
  const overallPct = Math.min(100, totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0);

  const totalTests: number | null = tcTotalCount > 0 ? Math.round(tcTotalCount) : null;

  function pct(used: number, from: number, to: number) {
    const dur = to - from;
    return dur > 0 ? Math.min(100, Math.round(((used - from) / dur) * 100)) : 100;
  }

  if (usedHours < bound1) {
    return { phase:'analysis', phaseName:'Анализ',
      phasePct: bound1 > 0 ? Math.round((usedHours / bound1) * 100) : 0,
      overallPct, expectedTests:null, totalTests, phases };
  }
  if (usedHours < bound2) {
    return { phase:'tc_writing', phaseName:'Актуализация ТМ',
      phasePct: pct(usedHours, bound1, bound2), overallPct, expectedTests:null, totalTests, phases };
  }
  // Начиная с фазы test_run дефекты и ретесты идут параллельно — всё это «Тестирование»
  const dur = bound3 - bound2;
  const inRun = Math.max(0, Math.min(usedHours - bound2, dur));
  const expectedTests = (totalTests && dur > 0)
    ? Math.min(totalTests, Math.round((inRun / dur) * totalTests))
    : null;
  const testPct = usedHours >= bound3 ? 100 : pct(usedHours, bound2, bound3);
  return { phase:'test_run', phaseName:'Тестирование',
    phasePct: testPct, overallPct, expectedTests, totalTests, phases };
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
  const totalHours = taskEstimateHours(parentTask);
  if (totalHours <= 0) return parentDynStart;
  const sim = projectFinish(parentTask, parentEngineers, parentDynStart, totalHours);
  if (!sim.forecastDate) return null;
  return addWorkdays(sim.forecastDate, 1);
}

/**
 * Сколько инженеров нужно добавить чтобы уложиться в дедлайн.
 * Возвращает 0 если уже укладываемся, null если нет дедлайна.
 */
export function engineersNeeded(task: Task, engineers: Engineer[], deadlineOverride: ISODate | null = null, history?: HistoryEntry[]): number | null {
  const effectiveDl = deadlineOverride !== null ? deadlineOverride : (task.deadline || null);
  if (!effectiveDl) return null;
  const fc = calcForecast(task, engineers, deadlineOverride, null, history);
  if (fc.deadlineStatus !== 'overdue') return 0;

  const totalHours = taskEstimateHours(task);
  const today = todayStr();
  if (effectiveDl < today) return null;

  const usedHours = history
    ? computeUsedHours(task, engineers, history)
    : workdaysElapsed(task.startDate) * nominalCapacity(task, engineers) * HOURS_PER_DAY;
  const remainingHours = Math.max(0, totalHours - usedHours);

  // Посуточный подсчёт реально доступных часов — учитывает отпуска/больничные
  const assignedEngs = (task.assignedEngineers || [])
    .map(id => engineers.find(e => e.id === id))
    .filter((e): e is Engineer => !!e);

  let availableHours = 0;
  let workdaysCount = 0;
  let cursor = today;
  while (cursor <= effectiveDl) {
    if (isWorkday(cursor)) {
      workdaysCount++;
      availableHours += assignedEngs.reduce((sum, eng) => sum + capacityOn(eng, cursor), 0) * HOURS_PER_DAY;
    }
    cursor = addCalendarDay(cursor);
  }

  if (availableHours >= remainingHours || workdaysCount === 0) return 0;

  // Дефицит часов → сколько полноценных инженеров нужно добавить
  const shortfall = remainingHours - availableHours;
  const hoursPerEng = workdaysCount * HOURS_PER_DAY;
  return Math.ceil(shortfall / hoursPerEng);
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
  const childTotalHours = taskEstimateHours(child);
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
