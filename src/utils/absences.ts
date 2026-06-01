import type { Engineer, HistoryEntry, ISODate } from '../domain/types';

export interface AbsencePeriod {
  type: 'vacation' | 'sick' | 'dayoff';
  start: ISODate;
  end: ISODate;
}

const FAR_FUTURE = '2099-12-31' as ISODate;

function prevDay(date: ISODate): ISODate {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10) as ISODate;
}

export function getAbsencePeriods(eng: Engineer, history: HistoryEntry[], today: ISODate): AbsencePeriod[] {
  const periods: AbsencePeriod[] = [];

  // 1. Reconstruct completed periods from history pairs (start event → return event)
  const engHistory = history
    .filter(h => h.engineerId === eng.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  let openType: 'vacation' | 'sick' | null = null;
  let openStart: ISODate | null = null;

  for (const h of engHistory) {
    if (h.type === 'dayoff') {
      periods.push({ type: 'dayoff', start: h.date, end: h.date });
    } else if (h.type === 'vacation' || h.type === 'sick') {
      openType = h.type;
      openStart = h.date;
    } else if (h.type === 'return' && openType && openStart) {
      const endDate = prevDay(h.date);
      if (endDate >= openStart) {
        periods.push({ type: openType, start: openStart, end: endDate });
      }
      openType = null;
      openStart = null;
    }
  }

  // 2. Current active absence (from engineer status)
  if (eng.status === 'vacation') {
    const start = (openType === 'vacation' && openStart) ? openStart : (eng.vacationFrom || today);
    const end   = eng.vacationTo || FAR_FUTURE;
    periods.push({ type: 'vacation', start, end });
  } else if (eng.status === 'sick') {
    const end = eng.sickReturnDate ? prevDay(eng.sickReturnDate) : FAR_FUTURE;
    let start: ISODate;
    if (openType === 'sick' && openStart) {
      start = openStart;
    } else {
      // История может быть «закрыта» return-событием в тот же день что и sick
      // (тогда prevDay < openStart → период не записался). Ищем последний sick-entry.
      const lastSick = [...engHistory].reverse().find(h => h.type === 'sick');
      start = (lastSick && lastSick.date <= end) ? lastSick.date : today;
    }
    if (start <= end) {
      periods.push({ type: 'sick', start, end });
    }
  } else if (eng.status === 'dayoff' && eng.dayoffDate) {
    if (!periods.some(p => p.type === 'dayoff' && p.start === eng.dayoffDate)) {
      periods.push({ type: 'dayoff', start: eng.dayoffDate, end: eng.dayoffDate });
    }
  }

  // 3. Future planned vacation (not yet started, vacationFrom set in advance)
  if (eng.status !== 'vacation' && eng.vacationFrom && eng.vacationFrom > today) {
    if (!periods.some(p => p.type === 'vacation' && p.start === eng.vacationFrom)) {
      periods.push({ type: 'vacation', start: eng.vacationFrom, end: eng.vacationTo || eng.vacationFrom });
    }
  }

  return periods;
}
