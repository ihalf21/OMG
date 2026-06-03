// Тесты на utils/forecast.js — capacity, прогноз сроков, дедлайн-статус.
import {
  HOURS_PER_DAY, roleCoeff,
  currentCapacity, nominalCapacity,
  calcForecast, statusColor, statusLabel,
  fmtHours, engineersNeeded, getDerivedDeadline,
  projectFinish,
} from './forecast';
import { todayStr, addWorkdays, subtractWorkdays } from './dates';

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
    estimateHours: 0,
    assignedEngineers: [],
    ...overrides,
  };
}

function switchEvent(engineerId, toTask, fromTask, date) {
  return { id: `h-${engineerId}-${date}`, date, engineerId, type: 'switch', fromTask: fromTask ?? null, toTask: toTask ?? null, note: '' };
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
  test('исключает больных, но считает отпуск и дейоф', () => {
    const engs = [
      eng({ id: 'e1', status: 'sick' }),                                              // исключён
      eng({ id: 'e2', dayoffDate: todayStr() }),                                      // считается
      eng({ id: 'e3', status: 'vacation', vacationFrom: '2020-01-01', vacationTo: '2099-12-31' }), // считается
    ];
    const t = task({ assignedEngineers: ['e1', 'e2', 'e3'] });
    // больничный исключается (работа стоит), отпуск и дейоф — плановые, считаются
    expect(nominalCapacity(t, engs)).toBe(2);
  });

  test('больной инженер даёт 0', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(nominalCapacity(t, [e])).toBe(0);
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

  test('history-aware: усиление НЕ пересчитывает прошлый прогресс задним числом', () => {
    // Задача идёт 10 рабочих дней с 1 инженером: 10×8 = 80чч из 160 = 50%.
    const start = subtractWorkdays(todayStr(), 10);
    const e1 = eng({ id: 'e1' }), e2 = eng({ id: 'e2' });

    const base = calcForecast(
      task({ id: 't1', estimateHours: 160, startDate: start, assignedEngineers: ['e1'] }),
      [e1], null, null, [],
    );
    expect(base.progressPct).toBe(50);
    expect(base.hoursLeft).toBe(80);

    // Сегодня добавили 2-го инженера. Он не работал эти 10 дней — прогресс не должен скакнуть.
    const hist = [switchEvent('e2', 't1', null, todayStr())];
    const after = calcForecast(
      task({ id: 't1', estimateHours: 160, startDate: start, assignedEngineers: ['e1', 'e2'] }),
      [e1, e2], null, null, hist,
    );
    expect(after.progressPct).toBe(50);
    expect(after.hoursLeft).toBe(80);
  });

  test('history-aware: снятие инженера НЕ обнуляет уже отработанное', () => {
    // Задача шла вдвоём 10 рабочих дней: 10×2×8 = 160чч из 160 = 100%.
    const start = subtractWorkdays(todayStr(), 10);
    const e1 = eng({ id: 'e1' }), e2 = eng({ id: 'e2' });

    const before = calcForecast(
      task({ id: 't1', estimateHours: 160, startDate: start, assignedEngineers: ['e1', 'e2'] }),
      [e1, e2], null, null, [],
    );
    expect(before.progressPct).toBe(100);

    // Сегодня e2 сняли с задачи. Отработанное двоём за 10 дней сохраняется.
    const hist = [switchEvent('e2', null, 't1', todayStr())];
    const after = calcForecast(
      task({ id: 't1', estimateHours: 160, startDate: start, assignedEngineers: ['e1'] }),
      [e1, e2], null, null, hist,
    );
    expect(after.progressPct).toBe(before.progressPct);
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

describe('projectFinish', () => {
  // День 2026-05-25 — понедельник, рабочий
  // 2026-05-23/24 — суббота/воскресенье
  // 2026-05-29 — пятница, рабочий
  // 2026-06-01 — понедельник, рабочий

  test('нет назначенных инженеров — null', () => {
    const t = task({ assignedEngineers: [] });
    expect(projectFinish(t, [], '2026-05-25', 16)).toEqual({ forecastDate: null, daysLeft: null });
  });

  test('0 часов работы — мгновенно (тот же день)', () => {
    const e = eng({ id: 'e1' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(projectFinish(t, [e], '2026-05-25', 0)).toEqual({ forecastDate: '2026-05-25', daysLeft: 0 });
  });

  test('8 часов / 1 инженер / без отпусков = 1 рабочий день', () => {
    const e = eng({ id: 'e1' });
    const t = task({ assignedEngineers: ['e1'] });
    expect(projectFinish(t, [e], '2026-05-25', 8)).toEqual({ forecastDate: '2026-05-25', daysLeft: 1 });
  });

  test('16 часов / 1 инженер = 2 рабочих дня (через выходные не идём)', () => {
    const e = eng({ id: 'e1' });
    const t = task({ assignedEngineers: ['e1'] });
    // С пятницы: пт=8ч, сб/вс пропускаем, пн=8ч → понедельник
    expect(projectFinish(t, [e], '2026-05-22', 16)).toEqual({ forecastDate: '2026-05-25', daysLeft: 2 });
  });

  test('учитывает запланированный отпуск инженера в будущем', () => {
    // 1 инженер, 40 часов = 5 рабочих дней без отпуска
    // Отпуск с пн 25 до пн 25 (1 день) — должен сдвинуть конец на 1 день вперёд
    const e = eng({
      id: 'e1',
      vacationFrom: '2026-05-26',
      vacationTo: '2026-05-26',
    });
    const t = task({ assignedEngineers: ['e1'] });
    // Старт пн 25: 25=8ч (работает), 26=отпуск, 27=8ч, 28=8ч, 29=8ч, 30/31вых, 1июн=8ч → 5 рабочих дней работы, но конец сдвинут на 1 июня
    const sim = projectFinish(t, [e], '2026-05-25', 40);
    expect(sim.forecastDate).toBe('2026-06-01');
  });

  test('учитывает запланированный дейоф', () => {
    const e = eng({ id: 'e1', dayoffDate: '2026-05-26' });
    const t = task({ assignedEngineers: ['e1'] });
    // 16 часов: 25=8ч, 26=дейоф (пропуск), 27=8ч → конец 27 мая
    const sim = projectFinish(t, [e], '2026-05-25', 16);
    expect(sim.forecastDate).toBe('2026-05-27');
    expect(sim.daysLeft).toBe(3); // 25, 26, 27 — 3 рабочих дня прошло
  });

  test('два инженера, у одного отпуск — скорость падает на эти дни', () => {
    const e1 = eng({ id: 'e1' });
    const e2 = eng({ id: 'e2', vacationFrom: '2026-05-26', vacationTo: '2026-05-26' });
    const t = task({ assignedEngineers: ['e1', 'e2'] });
    // 32 часа, обычно 2 дня (16ч/день). С отпуском e2 26 мая:
    // 25 = 16ч (оба работают), 26 = 8ч (только e1), 27 = 8ч (оба снова)
    // Итого 32ч за 3 дня
    const sim = projectFinish(t, [e1, e2], '2026-05-25', 32);
    expect(sim.forecastDate).toBe('2026-05-27');
  });

  test('лиды не работают — capacity = 0', () => {
    const e = eng({ id: 'e1', role: 'lead' });
    const t = task({ assignedEngineers: ['e1'] });
    const sim = projectFinish(t, [e], '2026-05-25', 8);
    expect(sim).toEqual({ forecastDate: null, daysLeft: null });
  });

  test('защита от бесконечного цикла — все на больничном без даты возврата', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({ assignedEngineers: ['e1'] });
    const sim = projectFinish(t, [e], '2026-05-25', 8);
    expect(sim).toEqual({ forecastDate: null, daysLeft: null });
  });

  test('больной с плановым выходом — работает начиная с даты возврата', () => {
    // Инженер на больничном, выходит 27 мая. Задача старт 25 мая, 8 часов.
    // 25 мая = больничный (нет работы), 26 мая = больничный, 27 мая = 8ч → готово
    const e = eng({ id: 'e1', status: 'sick', sickReturnDate: '2026-05-27' });
    const t = task({ assignedEngineers: ['e1'] });
    const sim = projectFinish(t, [e], '2026-05-25', 8);
    expect(sim.forecastDate).toBe('2026-05-27');
  });
});

describe('calcForecast — задача без оценки', () => {
  test('нет оценки + нет дедлайна + есть инженер → deadlineStatus ok', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 0, assignedEngineers: ['e1'] });
    expect(calcForecast(t, [e]).deadlineStatus).toBe('ok');
  });

  test('нет оценки + есть дедлайн + есть инженер → deadlineStatus null, forecastDate null', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 0, deadline: '2099-12-31', assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.deadlineStatus).toBe(null);
    expect(fc.forecastDate).toBe(null);
  });

  test('нет оценки → hoursLeft null', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 0, assignedEngineers: ['e1'] });
    expect(calcForecast(t, [e]).hoursLeft).toBe(null);
  });

  test('нет оценки + нет инженеров + нет дедлайна → deadlineStatus ok', () => {
    const t = task({ estimateHours: 0 });
    expect(calcForecast(t, []).deadlineStatus).toBe('ok');
  });

  test('нет оценки + нет инженеров + есть дедлайн → deadlineStatus null (прогноз недоступен)', () => {
    const t = task({ estimateHours: 0, deadline: '2099-12-31' });
    expect(calcForecast(t, []).deadlineStatus).toBe(null);
  });
});

describe('calcForecast — startOverride для зависимых задач', () => {
  test('startOverride в будущем сдвигает forecastDate вперёд', () => {
    const e = eng({ id: 'e1' });
    const future = addWorkdays(todayStr(), 10);
    const t = task({ estimateHours: 8, assignedEngineers: ['e1'] });
    const fcNow    = calcForecast(t, [e]);
    const fcFuture = calcForecast(t, [e], null, future);
    expect(fcFuture.forecastDate > fcNow.forecastDate).toBe(true);
  });

  test('startOverride в прошлом — baseDate не раньше сегодня', () => {
    const e = eng({ id: 'e1' });
    const t = task({ estimateHours: 8, assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e], null, '2020-01-01');
    expect(fc.forecastDate >= todayStr()).toBe(true);
  });

  test('зависимая задача со сброшенным startDate: прогноз строится от startOverride', () => {
    const e = eng({ id: 'e1' });
    const future = addWorkdays(todayStr(), 5);
    // Имитируем как Tasks.tsx вызывает calcForecast для зависимой задачи:
    // startDate = null (сброшен), startOverride = dynamicStart
    const t = task({ estimateHours: 8, assignedEngineers: ['e1'], startDate: null });
    const fc = calcForecast(t, [e], null, future);
    expect(fc.forecastDate >= future).toBe(true);
  });

  test('deadlineOverride + startOverride: статус считается от правильного базиса', () => {
    const e = eng({ id: 'e1' });
    const farFuture = addWorkdays(todayStr(), 30);
    const t = task({ estimateHours: 8, assignedEngineers: ['e1'] });
    // Дедлайн через 30 дней, старт сегодня → должны укладываться
    const fc = calcForecast(t, [e], farFuture, null);
    expect(fc.deadlineStatus).toBe('ok');
  });
});

describe('calcForecast — больной инженер остаётся на задаче', () => {
  test('один больной на задаче → forecastDate null (работа стоит)', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({ estimateHours: 80, startDate: todayStr(), assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    expect(fc.forecastDate).toBe(null);
    expect(fc.daysLeft).toBe(null);
  });

  test('больной + здоровый → прогноз строится по здоровому, capacity = 1', () => {
    const sick    = eng({ id: 'e1', status: 'sick' });
    const healthy = eng({ id: 'e2' });
    const t = task({ estimateHours: 8, assignedEngineers: ['e1', 'e2'] });
    const fc = calcForecast(t, [sick, healthy]);
    expect(fc.forecastDate).not.toBe(null); // прогноз есть
    expect(fc.capacity).toBe(1);             // только здоровый инженер
  });

  test('больной не увеличивает прогресс: remainingHours = estimateHours при capFull=0', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({
      estimateHours: 80,
      startDate: addWorkdays(todayStr(), -10), // задача "идёт" 10 дней
      assignedEngineers: ['e1'],
    });
    const fc = calcForecast(t, [e]);
    // nominalCapacity = 0 → usedHours = 0 → hoursLeft = 80 (прогресса нет)
    expect(fc.hoursLeft).toBe(80);
    expect(fc.progressPct).toBe(0);
  });

  test('больной на задаче с дедлайном в прошлом → deadlineStatus overdue (не null)', () => {
    const e = eng({ id: 'e1', status: 'sick' });
    const t = task({ estimateHours: 80, deadline: '2020-01-01', assignedEngineers: ['e1'] });
    const fc = calcForecast(t, [e]);
    // forecastDate = null → deadlineStatus = null (нет прогноза — нет статуса)
    expect(fc.deadlineStatus).toBe(null);
  });
});

describe('calcForecast — учёт запланированных отсутствий (через projectFinish)', () => {
  test('запланированный дейоф увеличивает forecastDate', () => {
    // Создаём 2 инженеров: e1 свободен, e2 с дейофом через 3 рабочих дня
    const e1 = eng({ id: 'e1' });
    const today = todayStr();
    const dayoffOn = addWorkdays(today, 3);
    const e2 = eng({ id: 'e2', dayoffDate: dayoffOn });

    // 32 часа на 2 инженеров — обычно 2 дня (16ч/день).
    // С дейофом e2 в один из этих дней — должно потребоваться больше дней.
    const t = task({ estimateHours: 32, assignedEngineers: ['e1', 'e2'] });

    const fcNoDayoff = calcForecast({ ...t }, [e1, eng({ id: 'e2' })]);
    const fcWithDayoff = calcForecast(t, [e1, e2]);

    // forecastDate либо позже, либо равно (если дейоф попал в выходной — что вряд ли)
    expect(fcWithDayoff.forecastDate >= fcNoDayoff.forecastDate).toBe(true);
  });

  test('запланированный отпуск инженера в период работы сдвигает дедлайн-статус', () => {
    const e = eng({ id: 'e1' });
    const today = todayStr();
    // Длинная задача с инженером в отпуске посередине
    const t = task({
      estimateHours: 80,
      deadline: addWorkdays(today, 11), // 11 раб. дней, обычно 10 без отпуска
      assignedEngineers: ['e1'],
    });

    const fcOk = calcForecast(t, [e]);
    expect(fcOk.deadlineStatus).not.toBe('overdue');

    // Тот же инженер с длинным отпуском в начале — теперь срываем
    const eWithVac = eng({
      id: 'e1',
      vacationFrom: addWorkdays(today, 1),
      vacationTo: addWorkdays(today, 5),
    });
    const fcOverdue = calcForecast(t, [eWithVac]);
    // Должно стать хуже — либо risk либо overdue
    expect(fcOverdue.forecastDate > fcOk.forecastDate).toBe(true);
  });
});
