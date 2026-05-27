// utils/dates.js — рабочие дни с учётом праздников РФ

// Праздники РФ 2025 (YYYY-MM-DD)
// Источник: производственный календарь РФ 2025
const RU_HOLIDAYS_2025 = new Set([
  // Январь — Новогодние каникулы + Рождество
  '2025-01-01','2025-01-02','2025-01-03','2025-01-06','2025-01-07','2025-01-08',
  // Февраль — День защитника Отечества (24-е, перенос с 23-го вс)
  '2025-02-24',
  // Март — Международный женский день (10-е, перенос с 8-го сб)
  '2025-03-10',
  // Май — Праздник весны и труда + День Победы
  '2025-05-01','2025-05-02', // Праздник труда + перенос
  '2025-05-08','2025-05-09', // перенос + День Победы
  // Июнь — День России
  '2025-06-12','2025-06-13',
  // Ноябрь — День народного единства
  '2025-11-04',
  // Декабрь — перенос
  '2025-12-31',
]);

// Праздники РФ 2026 (на перспективу)
const RU_HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-01-02','2026-01-07','2026-01-08','2026-01-09',
  '2026-02-23',
  '2026-03-09',
  '2026-05-01','2026-05-04','2026-05-11',
  '2026-06-12',
  '2026-11-04',
]);

const ALL_HOLIDAYS = new Set([...RU_HOLIDAYS_2025, ...RU_HOLIDAYS_2026]);

// ВАЖНО: используем локальное время пользователя, не UTC
// toISOString() возвращает UTC и сдвигает дату при UTC+3 и выше
export function toDateStr(d) {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function isWorkday(dateStr) {
  if (ALL_HOLIDAYS.has(dateStr)) return false;
  // Парсим как локальную дату (без UTC-смещения)
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow  = date.getDay();
  return dow !== 0 && dow !== 6;
}

export function isHoliday(dateStr) {
  return ALL_HOLIDAYS.has(dateStr);
}

export function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getDay() === 0 || date.getDay() === 6;
}

export function isOff(dateStr) {
  return !isWorkday(dateStr);
}

// Вычесть N рабочих дней из даты
export function subtractWorkdays(startDateStr, days) {
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

// Добавить N рабочих дней к дате
export function addWorkdays(startDateStr, days) {
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
export function workdaysBetween(fromStr, toStr) {
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

// Рабочих дней прошло с даты старта до сегодня
export function workdaysElapsed(startDateStr) {
  const today = todayStr();
  if (startDateStr > today) return 0;
  return workdaysBetween(startDateStr, today);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short',
  });
}

// Следующий рабочий день после указанной даты
export function nextWorkday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  do {
    date.setDate(date.getDate() + 1);
  } while (!isWorkday(toDateStr(date)));
  return toDateStr(date);
}

// Получить массив дней месяца для Ганта
export function getMonthDays(year, month) {
  const days = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();
  for (let i = 1; i <= daysInMonth; i++) {
    // Строим дату локально, без UTC-смещения
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
