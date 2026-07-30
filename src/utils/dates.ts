// utils/dates.ts — рабочие дни с учётом праздников РФ.

import type { ISODate } from '../domain/types';

export const SUPPORTED_CALENDAR_YEARS = [2025, 2026, 2027] as const;
export type ProductionCalendarStatus = 'official' | 'draft';

const PRODUCTION_CALENDAR_STATUS_BY_YEAR: Record<number, ProductionCalendarStatus> = {
  2025: 'official',
  2026: 'official',
  // На 29.07.2026 календарь 2027 опубликован как проект Минтруда, не как постановление Правительства РФ.
  2027: 'draft',
};

// Нерабочие исключения из обычной пятидневки (YYYY-MM-DD).
const NON_WORKING_DAYS_BY_YEAR: Record<number, Set<string>> = {
  2025: new Set([
    '2025-01-01','2025-01-02','2025-01-03','2025-01-06','2025-01-07','2025-01-08',
    '2025-05-01','2025-05-02','2025-05-08','2025-05-09',
    '2025-06-12','2025-06-13',
    '2025-11-03','2025-11-04',
    '2025-12-31',
  ]),
  2026: new Set([
    '2026-01-01','2026-01-02','2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09',
    '2026-02-23',
    '2026-03-09',
    '2026-05-01','2026-05-04','2026-05-11',
    '2026-06-12',
    '2026-11-04',
    '2026-12-31',
  ]),
  2027: new Set([
    '2027-01-01','2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08',
    '2027-02-22','2027-02-23',
    '2027-03-08',
    '2027-05-03','2027-05-10',
    '2027-06-14',
    '2027-11-04','2027-11-05',
    '2027-12-31',
  ]),
};

// Рабочие выходные исключения из обычной пятидневки (YYYY-MM-DD).
const WORKING_WEEKENDS_BY_YEAR: Record<number, Set<string>> = {
  2025: new Set(['2025-11-01']),
  2026: new Set(),
  2027: new Set(['2027-02-20']),
};

function yearOf(dateStr: ISODate): number {
  return Number(dateStr.slice(0, 4));
}

export function productionCalendarStatus(year: number): ProductionCalendarStatus | null {
  return PRODUCTION_CALENDAR_STATUS_BY_YEAR[year] || null;
}

export function isProductionCalendarSupported(dateOrYear: ISODate | number): boolean {
  const year = typeof dateOrYear === 'number' ? dateOrYear : yearOf(dateOrYear);
  return productionCalendarStatus(year) !== null;
}

export function isProductionCalendarDraft(year: number): boolean {
  return productionCalendarStatus(year) === 'draft';
}

export function productionCalendarNotice(year: number): string | null {
  if (!isProductionCalendarSupported(year)) {
    return `Производственный календарь на ${year} год не задан: расчёты используют обычную пятидневку без праздничных переносов.`;
  }
  if (isProductionCalendarDraft(year)) {
    return `Производственный календарь на ${year} год добавлен по проекту Минтруда; после утверждения переносов его нужно сверить.`;
  }
  return null;
}

// ВАЖНО: используем локальное время пользователя, не UTC
export function toDateStr(d: Date): ISODate {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayStr(): ISODate {
  return toDateStr(new Date());
}

export function isWorkday(dateStr: ISODate): boolean {
  const year = yearOf(dateStr);
  if (WORKING_WEEKENDS_BY_YEAR[year]?.has(dateStr)) return true;
  if (NON_WORKING_DAYS_BY_YEAR[year]?.has(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow  = date.getDay();
  return dow !== 0 && dow !== 6;
}

export function isHoliday(dateStr: ISODate): boolean {
  return NON_WORKING_DAYS_BY_YEAR[yearOf(dateStr)]?.has(dateStr) || false;
}

export function isWeekend(dateStr: ISODate): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getDay() === 0 || date.getDay() === 6;
}

export function isOff(dateStr: ISODate): boolean {
  return !isWorkday(dateStr);
}

// Вычесть N рабочих дней
export function subtractWorkdays(startDateStr: ISODate, days: number): ISODate {
  if (!days || days <= 0) return startDateStr;
  const [y, m, d] = startDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let subtracted = 0;
  while (subtracted < days) {
    date.setDate(date.getDate() - 1);
    if (isWorkday(toDateStr(date))) subtracted++;
  }
  return toDateStr(date);
}

// Добавить N рабочих дней
export function addWorkdays(startDateStr: ISODate, days: number): ISODate {
  if (!days || days <= 0) return startDateStr;
  const [y, m, d] = startDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (isWorkday(toDateStr(date))) added++;
  }
  return toDateStr(date);
}

// Кол-во рабочих дней между двумя датами (включительно)
export function workdaysBetween(fromStr: ISODate, toStr: ISODate): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to   = new Date(ty, tm - 1, td);
  let count  = 0;
  const cur  = new Date(from);
  while (cur <= to) {
    if (isWorkday(toDateStr(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Рабочих дней прошло с даты старта до конца вчерашнего дня.
// Намеренно не включает сегодня — показывает уже завершённую работу,
// а не то, что будет сделано к концу текущего дня.
export function workdaysElapsed(startDateStr: ISODate | null | undefined): number {
  if (!startDateStr) return 0;
  const today = todayStr();
  if (startDateStr >= today) return 0;
  return workdaysBetween(startDateStr, subtractCalendarDay(today));
}

// Следующий календарный день (включая выходные и праздники)
export function addCalendarDay(dateStr: ISODate): ISODate {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return toDateStr(date);
}

// Предыдущий календарный день (включая выходные и праздники)
export function subtractCalendarDay(dateStr: ISODate): ISODate {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return toDateStr(date);
}

// Следующий рабочий день после указанной даты
export function nextWorkday(dateStr: ISODate): ISODate {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  do {
    date.setDate(date.getDate() + 1);
  } while (!isWorkday(toDateStr(date)));
  return toDateStr(date);
}

export function formatDate(dateStr: ISODate | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDateShort(dateStr: ISODate | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short',
  });
}

export interface MonthDay {
  str: ISODate;
  day: number;
  off: boolean;
  holiday: boolean;
  weekend: boolean;
  today: boolean;
}

export function getMonthDays(year: number, month: number): MonthDay[] {
  const days: MonthDay[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  for (let i = 1; i <= daysInMonth; i++) {
    const str = toDateStr(new Date(year, month, i));
    days.push({
      str,
      day: i,
      off:     isOff(str),
      holiday: isHoliday(str),
      weekend: isWeekend(str),
      today:   str === today,
    });
  }
  return days;
}
