// Тесты на utils/dates.js — рабочие дни, праздники РФ, форматирование.
import {
  toDateStr, todayStr, isWorkday, isHoliday, isWeekend, isOff,
  addWorkdays, addCalendarDay, subtractWorkdays, workdaysBetween, workdaysElapsed,
  nextWorkday, formatDate, formatDateShort, getMonthDays,
} from './dates';

describe('toDateStr', () => {
  test('форматирует локальную дату как YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  test('добавляет ведущие нули', () => {
    expect(toDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toDateStr(new Date(2026, 8, 9))).toBe('2026-09-09');
  });
});

describe('todayStr', () => {
  test('возвращает строку формата YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isWorkday', () => {
  test('понедельник — рабочий', () => {
    expect(isWorkday('2026-05-25')).toBe(true); // Пн
  });
  test('суббота и воскресенье — не рабочие', () => {
    expect(isWorkday('2026-05-23')).toBe(false); // Сб
    expect(isWorkday('2026-05-24')).toBe(false); // Вс
  });
  test('праздники РФ — не рабочие', () => {
    expect(isWorkday('2026-01-01')).toBe(false); // Новый год
    expect(isWorkday('2026-05-01')).toBe(false); // Праздник весны
    expect(isWorkday('2026-05-11')).toBe(false); // Перенос с 9 мая
    expect(isWorkday('2026-06-12')).toBe(false); // День России
  });
});

describe('isHoliday', () => {
  test('праздники РФ — true', () => {
    expect(isHoliday('2026-01-01')).toBe(true);
    expect(isHoliday('2026-05-01')).toBe(true);
  });
  test('обычные дни — false', () => {
    expect(isHoliday('2026-05-25')).toBe(false); // Пн без праздника
    expect(isHoliday('2026-05-23')).toBe(false); // Сб — выходной, но не праздник
  });
});

describe('isWeekend', () => {
  test('суббота и воскресенье', () => {
    expect(isWeekend('2026-05-23')).toBe(true);
    expect(isWeekend('2026-05-24')).toBe(true);
  });
  test('будни', () => {
    expect(isWeekend('2026-05-25')).toBe(false);
  });
});

describe('isOff', () => {
  test('инверсия от isWorkday', () => {
    expect(isOff('2026-05-25')).toBe(false); // рабочий
    expect(isOff('2026-05-23')).toBe(true);  // суббота
    expect(isOff('2026-01-01')).toBe(true);  // праздник
  });
});

describe('addWorkdays', () => {
  test('добавляет 0 — возвращает ту же дату', () => {
    expect(addWorkdays('2026-05-25', 0)).toBe('2026-05-25');
  });
  test('пропускает выходные', () => {
    // Пт + 1 рабочий день = Пн
    expect(addWorkdays('2026-05-22', 1)).toBe('2026-05-25');
  });
  test('пропускает праздники', () => {
    // 30 апр (Чт) + 1 рабочий день: 1 мая праздник, 2-3 мая выходные → 4 мая (Пн)
    expect(addWorkdays('2026-04-30', 1)).toBe('2026-05-05'); // 4 мая — праздник (перенос)
  });
  test('добавляет несколько рабочих дней', () => {
    // Пн + 5 рабочих = след. Пн
    expect(addWorkdays('2026-05-25', 5)).toBe('2026-06-01');
  });
});

describe('subtractWorkdays', () => {
  test('вычитает 0', () => {
    expect(subtractWorkdays('2026-05-25', 0)).toBe('2026-05-25');
  });
  test('пропускает выходные обратно', () => {
    // Пн - 1 рабочий = Пт
    expect(subtractWorkdays('2026-05-25', 1)).toBe('2026-05-22');
  });
  test('зеркально к addWorkdays', () => {
    const start = '2026-05-25';
    const added = addWorkdays(start, 7);
    expect(subtractWorkdays(added, 7)).toBe(start);
  });
});

describe('workdaysBetween', () => {
  test('один день — 1 если рабочий, 0 если нет', () => {
    expect(workdaysBetween('2026-05-25', '2026-05-25')).toBe(1);
    expect(workdaysBetween('2026-05-23', '2026-05-23')).toBe(0);
  });
  test('полная рабочая неделя — 5', () => {
    expect(workdaysBetween('2026-05-25', '2026-05-29')).toBe(5);
  });
  test('включая выходные', () => {
    // Пн-Вс одной недели = 5 рабочих
    expect(workdaysBetween('2026-05-25', '2026-05-31')).toBe(5);
  });
  test('праздничная неделя — меньше 5', () => {
    // 27 апр (Пн) - 8 мая (Пт): праздники 1 и 4 мая = 8 рабочих дней
    expect(workdaysBetween('2026-04-27', '2026-05-08')).toBe(8);
  });
});

describe('workdaysElapsed', () => {
  test('будущая дата — 0', () => {
    const future = addWorkdays(todayStr(), 30);
    expect(workdaysElapsed(future)).toBe(0);
  });
});

describe('addCalendarDay', () => {
  test('обычный день — +1 день', () => {
    expect(addCalendarDay('2026-05-25')).toBe('2026-05-26');
  });
  test('конец месяца — переход в новый', () => {
    expect(addCalendarDay('2026-05-31')).toBe('2026-06-01');
  });
  test('конец года — переход в новый', () => {
    expect(addCalendarDay('2026-12-31')).toBe('2027-01-01');
  });
  test('пятница → суббота (не пропускает выходные)', () => {
    // 2026-05-22 — пятница
    expect(addCalendarDay('2026-05-22')).toBe('2026-05-23');
  });
});

describe('nextWorkday', () => {
  test('Пт → Пн', () => {
    expect(nextWorkday('2026-05-22')).toBe('2026-05-25');
  });
  test('Пн → Вт', () => {
    expect(nextWorkday('2026-05-25')).toBe('2026-05-26');
  });
  test('перед длинными выходными — после', () => {
    // 30 апр (Чт) перед майскими: 1 мая (Пт) праздник, 2-3 (Сб-Вс), 4 мая (Пн) перенос → 5 мая (Вт)
    expect(nextWorkday('2026-04-30')).toBe('2026-05-05');
  });
});

describe('formatDate', () => {
  test('возвращает прочерк для пустого', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });
  test('форматирует на русском', () => {
    expect(formatDate('2026-05-25')).toMatch(/25\s+мая\s+2026/);
  });
});

describe('formatDateShort', () => {
  test('возвращает прочерк для пустого', () => {
    expect(formatDateShort(null)).toBe('—');
  });
  test('форматирует кратко', () => {
    expect(formatDateShort('2026-05-25')).toMatch(/25\s+мая/);
  });
});

describe('getMonthDays', () => {
  test('возвращает все дни месяца', () => {
    const days = getMonthDays(2026, 4); // май
    expect(days).toHaveLength(31);
    expect(days[0].day).toBe(1);
    expect(days[30].day).toBe(31);
  });
  test('размечает выходные и праздники', () => {
    const days = getMonthDays(2026, 4); // май
    const may1 = days.find(d => d.day === 1);
    expect(may1.holiday).toBe(true);
    expect(may1.off).toBe(true);
    const may25 = days.find(d => d.day === 25);
    expect(may25.weekend).toBe(false);
    expect(may25.off).toBe(false);
  });
});
