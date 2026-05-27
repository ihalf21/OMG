// Тесты на domain/gantt.js — алгоритмы диаграммы Ганта.
import {
  computeInheritedTeam,
  computeDynamicStarts,
  getTaskChain,
  getISOWeek,
  segmentByWeek,
} from './gantt';
import { getMonthDays } from '../utils/dates';

// ─── фабрики тестовых данных ─────────────────────────────────────────────────

function task(overrides = {}) {
  return {
    id: 't', name: 'T', status: 'active',
    startDate: null, deadline: null, direction: null,
    estimateHours: 8, totalCases: null, doneCases: 0,
    assignedEngineers: [], dependsOn: null,
    completedDate: null, completedWithChildId: null, archivedDate: null,
    ...overrides,
  };
}

function eng(overrides = {}) {
  return {
    id: 'e', name: 'Eng', role: 'engineer', status: 'active',
    regularTask: null, vacationFrom: null, vacationTo: null,
    dayoffDate: null, experience: {},
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// computeInheritedTeam
// ════════════════════════════════════════════════════════════════════════════

describe('computeInheritedTeam', () => {
  test('пустой массив — пустой объект', () => {
    expect(computeInheritedTeam([])).toEqual({});
  });

  test('задача без зависимостей — своя команда', () => {
    const tasks = [task({ id: 't1', assignedEngineers: ['e1', 'e2'] })];
    expect(computeInheritedTeam(tasks)).toEqual({ t1: ['e1', 'e2'] });
  });

  test('задача без зависимостей и без команды — пустой массив', () => {
    const tasks = [task({ id: 't1' })];
    expect(computeInheritedTeam(tasks)).toEqual({ t1: [] });
  });

  test('зависимая задача без своей команды наследует от родителя', () => {
    const tasks = [
      task({ id: 'parent', assignedEngineers: ['e1', 'e2'] }),
      task({ id: 'child',  dependsOn: 'parent', assignedEngineers: [] }),
    ];
    const result = computeInheritedTeam(tasks);
    expect(result.parent).toEqual(['e1', 'e2']);
    expect(result.child).toEqual(['e1', 'e2']);
  });

  test('зависимая задача с собственными инженерами — объединение без дубликатов', () => {
    const tasks = [
      task({ id: 'parent', assignedEngineers: ['e1', 'e2'] }),
      task({ id: 'child',  dependsOn: 'parent', assignedEngineers: ['e2', 'e3'] }),
    ];
    const result = computeInheritedTeam(tasks);
    // e1, e2 (от родителя) + e3 (своя), без дубликата e2
    expect(result.child).toEqual(expect.arrayContaining(['e1', 'e2', 'e3']));
    expect(result.child).toHaveLength(3);
  });

  test('трёхуровневая цепочка', () => {
    const tasks = [
      task({ id: 'a', assignedEngineers: ['e1'] }),
      task({ id: 'b', dependsOn: 'a',  assignedEngineers: ['e2'] }),
      task({ id: 'c', dependsOn: 'b',  assignedEngineers: [] }),
    ];
    const result = computeInheritedTeam(tasks);
    expect(result.a).toEqual(['e1']);
    expect(result.b).toEqual(expect.arrayContaining(['e1', 'e2']));
    expect(result.c).toEqual(expect.arrayContaining(['e1', 'e2']));
  });

  test('защита от циклов — не зацикливается', () => {
    const tasks = [
      task({ id: 'a', dependsOn: 'b', assignedEngineers: ['e1'] }),
      task({ id: 'b', dependsOn: 'a', assignedEngineers: ['e2'] }),
    ];
    expect(() => computeInheritedTeam(tasks)).not.toThrow();
    const result = computeInheritedTeam(tasks);
    expect(result.a).toBeDefined();
    expect(result.b).toBeDefined();
  });

  test('сирота: dependsOn указывает на несуществующую задачу', () => {
    const tasks = [
      task({ id: 'orphan', dependsOn: 'ghost', assignedEngineers: ['e1'] }),
    ];
    const result = computeInheritedTeam(tasks);
    // Своя команда сохраняется даже если родитель потерян
    expect(result.orphan).toEqual(expect.arrayContaining(['e1']));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeDynamicStarts
// ════════════════════════════════════════════════════════════════════════════

describe('computeDynamicStarts', () => {
  test('независимая задача с startDate — возвращает её startDate', () => {
    const tasks = [task({ id: 't1', startDate: '2026-05-01' })];
    const result = computeDynamicStarts(tasks, [], { t1: [] });
    expect(result.t1).toBe('2026-05-01');
  });

  test('независимая задача без startDate — null', () => {
    const tasks = [task({ id: 't1' })];
    const result = computeDynamicStarts(tasks, [], { t1: [] });
    expect(result.t1).toBe(null);
  });

  test('зависимая задача стартует после родителя', () => {
    const engineers = [eng({ id: 'e1' })];
    const tasks = [
      task({ id: 'parent', startDate: '2026-05-01', estimateHours: 16, assignedEngineers: ['e1'] }),
      task({ id: 'child',  dependsOn: 'parent', estimateHours: 8 }),
    ];
    const inherited = { parent: ['e1'], child: ['e1'] };
    const result = computeDynamicStarts(tasks, engineers, inherited);
    expect(result.parent).toBe('2026-05-01');
    // 16 часов на 1 инженера = 2 рабочих дня. Старт ребёнка — следующий рабочий день.
    expect(result.child).toBeTruthy();
    expect(result.child > '2026-05-01').toBe(true);
  });

  test('зависимая задача без startDate родителя — null', () => {
    const engineers = [eng({ id: 'e1' })];
    const tasks = [
      task({ id: 'parent', assignedEngineers: ['e1'] }),
      task({ id: 'child', dependsOn: 'parent' }),
    ];
    const inherited = { parent: ['e1'], child: ['e1'] };
    const result = computeDynamicStarts(tasks, engineers, inherited);
    expect(result.parent).toBe(null);
    expect(result.child).toBe(null);
  });

  test('сирота — fallback на собственный startDate', () => {
    const tasks = [task({ id: 'orphan', dependsOn: 'ghost', startDate: '2026-05-10' })];
    const result = computeDynamicStarts(tasks, [], { orphan: [] });
    expect(result.orphan).toBe('2026-05-10');
  });

  test('защита от циклов', () => {
    const tasks = [
      task({ id: 'a', dependsOn: 'b' }),
      task({ id: 'b', dependsOn: 'a' }),
    ];
    expect(() => computeDynamicStarts(tasks, [], { a: [], b: [] })).not.toThrow();
  });

  test('fallback на deadline родителя если нет инженеров', () => {
    const tasks = [
      task({ id: 'parent', startDate: '2026-05-01', deadline: '2026-05-15', assignedEngineers: [] }),
      task({ id: 'child',  dependsOn: 'parent' }),
    ];
    // Родитель без инженеров → capacity = 0 → fallback на deadline + 1 рабочий день
    const result = computeDynamicStarts(tasks, [], { parent: [], child: [] });
    expect(result.child).toBeTruthy();
    expect(result.child > '2026-05-15').toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getTaskChain
// ════════════════════════════════════════════════════════════════════════════

describe('getTaskChain', () => {
  test('задача без зависимостей и без дочерних — только она сама', () => {
    const tasks = [task({ id: 't1' })];
    expect(getTaskChain('t1', tasks)).toEqual([tasks[0]]);
  });

  test('несуществующая задача — пустой массив', () => {
    expect(getTaskChain('ghost', [])).toEqual([]);
  });

  test('цепочка из трёх задач, наводимся на среднюю', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: 'a' });
    const c = task({ id: 'c', dependsOn: 'b' });
    const tasks = [a, b, c];
    const chain = getTaskChain('b', tasks);
    expect(chain.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  test('наводимся на корень — вся цепочка вниз', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: 'a' });
    const c = task({ id: 'c', dependsOn: 'b' });
    const chain = getTaskChain('a', [a, b, c]);
    expect(chain.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  test('наводимся на лист — вся цепочка вверх', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: 'a' });
    const c = task({ id: 'c', dependsOn: 'b' });
    const chain = getTaskChain('c', [a, b, c]);
    expect(chain.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  test('защита от глубокой цепочки (>9 уровней)', () => {
    // Цепочка из 15 задач
    const tasks = Array.from({ length: 15 }, (_, i) =>
      task({ id: `t${i}`, dependsOn: i === 0 ? null : `t${i - 1}` })
    );
    const chain = getTaskChain('t0', tasks);
    // Не должно зависнуть; цепочка ограничена MAX_CHAIN_DEPTH=9 вниз
    expect(chain.length).toBeLessThanOrEqual(10); // t0 + до 9 потомков
  });

  test('защита от циклов', () => {
    const a = task({ id: 'a', dependsOn: 'b' });
    const b = task({ id: 'b', dependsOn: 'a' });
    expect(() => getTaskChain('a', [a, b])).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getISOWeek
// ════════════════════════════════════════════════════════════════════════════

describe('getISOWeek', () => {
  test('1 января 2024 (понедельник) — неделя 1', () => {
    // 2024-01-01 — понедельник, начало недели 1 ISO
    expect(getISOWeek('2024-01-01')).toBe(1);
  });

  test('воскресенье 7 января 2024 — всё ещё неделя 1', () => {
    expect(getISOWeek('2024-01-07')).toBe(1);
  });

  test('понедельник 8 января 2024 — неделя 2', () => {
    expect(getISOWeek('2024-01-08')).toBe(2);
  });

  test('1 января 2026 (четверг) — неделя 1', () => {
    // 2026-01-01 — четверг, попадает в неделю 1
    expect(getISOWeek('2026-01-01')).toBe(1);
  });

  test('конец декабря может попасть в неделю 1 следующего года', () => {
    // 30 декабря 2024 (понедельник) — это неделя 1 2025-го года по ISO
    expect(getISOWeek('2024-12-30')).toBe(1);
  });

  test('начало января может попасть в последнюю неделю предыдущего года', () => {
    // 2 января 2022 (воскресенье) — это неделя 52 2021-го года
    expect(getISOWeek('2022-01-02')).toBe(52);
  });

  test('конкретная середина года', () => {
    // Среда 27 мая 2026 — это неделя 22
    expect(getISOWeek('2026-05-27')).toBe(22);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// segmentByWeek
// ════════════════════════════════════════════════════════════════════════════

describe('segmentByWeek', () => {
  test('пустой массив — пустые сегменты', () => {
    expect(segmentByWeek([])).toEqual([]);
  });

  test('один день — один сегмент', () => {
    const days = getMonthDays(2026, 4).slice(0, 1); // 1 мая
    const segs = segmentByWeek(days);
    expect(segs).toHaveLength(1);
    expect(segs[0].count).toBe(1);
    expect(segs[0].start).toBe(0);
  });

  test('май 2026: 31 день, начинается в пятницу — несколько сегментов', () => {
    const days = getMonthDays(2026, 4); // май
    const segs = segmentByWeek(days);
    // Сумма count = всех дней
    expect(segs.reduce((s, x) => s + x.count, 0)).toBe(31);
    // Номера недель уникальные и идут по порядку
    const weeks = segs.map(s => s.week);
    expect(new Set(weeks).size).toBe(weeks.length);
    // Все недели в пределах разумного диапазона
    weeks.forEach(w => expect(w).toBeGreaterThanOrEqual(1));
  });

  test('сегменты идут подряд по индексам без пропусков', () => {
    const days = getMonthDays(2026, 5); // июнь
    const segs = segmentByWeek(days);
    let expectedStart = 0;
    segs.forEach(seg => {
      expect(seg.start).toBe(expectedStart);
      expectedStart += seg.count;
    });
    expect(expectedStart).toBe(days.length);
  });

  test('фильтрованные дни (только рабочие) — недели разрываются по выходным', () => {
    const allDays = getMonthDays(2026, 4); // май
    const workdays = allDays.filter(d => !d.off);
    const segs = segmentByWeek(workdays);
    // Каждая неделя содержит не больше 5 рабочих дней
    segs.forEach(seg => {
      expect(seg.count).toBeLessThanOrEqual(5);
    });
    // Сумма равна количеству рабочих дней
    expect(segs.reduce((s, x) => s + x.count, 0)).toBe(workdays.length);
  });
});
