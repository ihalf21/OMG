// Тесты на utils/forecast.js — capacity, прогноз сроков, дедлайн-статус.
import {
  HOURS_PER_DAY, roleCoeff,
  currentCapacity, nominalCapacity,
  calcForecast, statusColor, statusLabel,
  fmtHours, engineersNeeded, getDerivedDeadline,
} from './forecast';
import { todayStr, addWorkdays } from './dates';

function eng(overrides = {}) {
  return {
    id: 'e1', name: 'Тест', role: 'engineer',
    status: 'active', regularTask: null,
    vacationFrom: null, vacationTo: null, dayoffDate: null,
    experience: {},
    ...overrides,
  };
}

function task(overrides = {}) {
  return {
    id: 't1', name: 'Задача', status: 'active',
    startDate: null, deadline: null,
    estimateHours: 0, totalCases: null, doneCases: 0,
    assignedEngineers: [],
    ...overrides,
  };
}

describe('HOURS_PER_DAY', () => {
  test('8-часовой рабочий день', () => {
    expect(HOURS_PER_DAY).toBe(8);
  });
});

describe('roleCoeff', () => {
  test('делегирует в availability', () => {
    expect(roleCoeff('engineer')).toBe(1);
    expect(roleCoeff('lead')).toBe(0);
  });
});

describe('currentCapacity', () => {
  test('пустая задача — 0', () => {
    expect(currentCapacity(task(), [])).toBe(0);
  });
  test('один инженер на задаче — 1.0', () => {
    const e = eng({ id: 'e1' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(currentCapacity(t, [e])).toBe(1);
  });
  test('лид не считается', () => {
    const e = eng({ id: 'e1', role: 'lead' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(currentCapacity(t, [e])).toBe(0);
  });
  test('больной не считается', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(currentCapacity(t, [e])).toBe(0);
  });
  test('в дейофе сегодня — не считается', () => {
    const e = eng({ id: 'e1', dayoffDate: todayStr() });
    const t = task({ assignedEngineers: ['e1'] });
    expect(currentCapacity(t, [e])).toBe(0);
  });
  test('запланированный дейоф (будущий) — считается', () => {
    const future = addWorkdays(todayStr(), 5);
    const e = eng({ id: 'e1', dayoffDate: future });
    const t = task({ assignedEngineers: ['e1'] });
    expect(currentCapacity(t, [e])).toBe(1);
  });
  test('несуществующий ID игнорируется', () => {
    const t = task({ assignedEngineers: ['ghost'] });
    expect(currentCapacity(t, [])).toBe(0);
  });
  test('несколько инженеров суммируются', () => {
    const engs = [
      eng({ id: 'e1' }),
      eng({ id: 'e2' }),
      eng({ id: 'e3', role: 'lead' }), // не считается
    ];
    const t = task({ assignedEngineers: ['e1', 'e2', 'e3'] });
    expect(currentCapacity(t, engs)).toBe(2);
  });
});

describe('nominalCapacity', () => {
  test('игнорирует временные отсутствия (больничный, отпуск, дейоф)', () => {
    const engs = [
      eng({ id: 'e1', status: 'sick' }),
      eng({ id: 'e2', dayoffDate: todayStr() }),
      eng({ id: 'e3', status: 'vacation', vacationFrom: '2020-01-01', vacationTo: '2099-12-31' }),
    ];
    const t = task({ assignedEngineers: ['e1', 'e2', 'e3'] });
    // Все трое имеют roleCoeff=1, но в дейофе/больничном/отпуске сейчас.
    // nominalCapacity их всё равно считает — это «номинальная» мощность.
    expect(nominalCapacity(t, engs)).toBe(3);
  });
  test('лиды всё равно 0', () => {
    const e = eng({ id: 'e1', role: 'lead' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(nominalCapacity(t, [e])).toBe(0);
  });
});

describe('calcForecast', () => {
  test('задача без оценки и без команды — daysLeft null', () => {
    const fc = calcForecast(task(), []);
    expect(fc.daysLeft).toBe(null);
    expect(fc.forecastDate).toBe(null);
  });

  test('80 часов на 1 инженера = 10 рабочих дней', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 80, assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.daysLeft).toBe(10);
    expect(fc.capacity).toBe(1);
  });

  test('80 часов на 2 инженеров = 5 рабочих дней', () => {
    const engs = [eng({ id: 'e1' }), eng({ id: 'e2' })];
    const t = task({ estimateHours: 80, assignedEngineers: ['e1', 'e2'] });
    const fc = calcForecast(t, engs);
    expect(fc.daysLeft).toBe(5);
  });

  test('прогресс по кейсам уменьшает оставшиеся часы', () => {
    const e = eng({ id: 'e1' });
    const t = task({
      estimateHours: 80, totalCases: 100, doneCases: 50,
      assignedEngineers: ['e1'],
    });
    const fc = calcForecast(t, [e]);
    expect(fc.progressPct).toBe(50);
    expect(fc.hoursLeft).toBe(40);
  });

  test('forecastDate в будущем относительно startDate', () => {
    const future = addWorkdays(todayStr(), 10);
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 16, startDate: future, assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.forecastDate >= future).toBe(true);
  });

  test('deadlineStatus=ok при отсутствии дедлайна', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 8, assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.deadlineStatus).toBe('ok');
  });

  test('deadlineStatus=overdue если forecastDate > deadline', () => {
    const past = '2020-01-01';
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 80, deadline: past, assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.deadlineStatus).toBe('overdue');
  });

  test('deadlineOverride используется вместо собственного', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 8, deadline: '2099-01-01', assignedEngineers: ['e1'] });
    // Принудительно ставим дедлайн в прошлое
    const fc = calcForecast(t, [e], '2020-01-01');
    expect(fc.deadlineStatus).toBe('overdue');
  });
});

describe('engineersNeeded', () => {
  test('null без дедлайна', () => {
    expect(engineersNeeded(task(), [])).toBe(null);
  });
  test('0 если укладываемся', () => {
    const e = eng({ id: 'e1' });
    const future = addWorkdays(todayStr(), 20);
    const t = task({ estimateHours: 8, deadline: future, assignedEngineers: ['e1'] });
    expect(engineersNeeded(t, [e])).toBe(0);
  });
  test('положительное число при срыве сроков', () => {
    const e = eng({ id: 'e1' });
    const tomorrow = addWorkdays(todayStr(), 1);
    // 800 часов за 1 день — нереально с 1 инженером
    const t = task({ estimateHours: 800, deadline: tomorrow, assignedEngineers: ['e1'] });
    expect(engineersNeeded(t, [e])).toBeGreaterThan(0);
  });
});

describe('getDerivedDeadline', () => {
  test('без зависимостей возвращает собственный', () => {
    const t = task({ id: 't1', deadline: '2026-05-25' });
    expect(getDerivedDeadline(t, [t], [])).toBe('2026-05-25');
  });

  test('null если нет дедлайна и нет цепочки', () => {
    const t = task({ id: 't1' });
    expect(getDerivedDeadline(t, [t], [])).toBe(null);
  });

  test('наследует дедлайн от дочерней через вычитание длительности', () => {
    const e = eng({ id: 'e1' });
    // Родитель без дедлайна, дочь зависит, у неё дедлайн через 10 рабочих дней
    const child = task({ id: 't2', dependsOn: 't1', estimateHours: 16, deadline: '2026-06-15', assignedEngineers: ['e1'] });
    const parent = task({ id: 't1', assignedEngineers: ['e1'] });
    const result = getDerivedDeadline(parent, [parent, child], [e]);
    // Дедлайн родителя = дедлайн дочки - длина дочки. Должен быть раньше 2026-06-15.
    expect(result < '2026-06-15').toBe(true);
  });

  test('защита от бесконечной рекурсии', () => {
    // Циклическая зависимость — depth limit должен остановить
    const t1 = task({ id: 't1', dependsOn: 't2' });
    const t2 = task({ id: 't2', dependsOn: 't1' });
    // Не должно зависать; результат — какой-то null/deadline
    const result = getDerivedDeadline(t1, [t1, t2], []);
    expect(result).toBeDefined();
  });
});

describe('statusColor', () => {
  test('возвращает CSS переменные', () => {
    expect(statusColor('ok')).toContain('success');
    expect(statusColor('overdue')).toBeDefined();
  });
});

describe('statusLabel', () => {
  test('русские лейблы', () => {
    expect(statusLabel('ok')).toBe('Опережение');
    expect(statusLabel('risk')).toBe('Впритык');
    expect(statusLabel('overdue')).toBe('Срыв сроков');
  });
});

describe('fmtHours', () => {
  test('прочерк для null', () => {
    expect(fmtHours(null)).toBe('—');
    expect(fmtHours(undefined)).toBe('—');
  });
  test('меньше дня — в часах', () => {
    expect(fmtHours(4)).toBe('4 чч');
    expect(fmtHours(7)).toBe('7 чч');
  });
  test('ровно один день', () => {
    expect(fmtHours(8)).toBe('1 дн.');
  });
  test('дни + часы', () => {
    expect(fmtHours(20)).toBe('2 дн. 4 чч');
    expect(fmtHours(24)).toBe('3 дн.');
  });
});
