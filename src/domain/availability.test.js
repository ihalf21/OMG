// Тесты на domain/availability.js — предикаты доступности инженера.
import {
  isWorkingRole, roleCoeff,
  isAvailableOn, isAvailableToday,
  capacityOn, capacityToday,
  leaveTypeOn, leaveTypeToday,
} from './availability';
import { todayStr, addWorkdays, subtractWorkdays } from '../utils/dates';

// Хелпер для конструирования engineer-объектов
function eng(overrides = {}) {
  return {
    id: 'e1', name: 'Тест', role: 'engineer',
    status: 'active', regularTask: null,
    vacationFrom: null, vacationTo: null, dayoffDate: null,
    experience: {},
    ...overrides,
  };
}

describe('isWorkingRole', () => {
  test('лид — не работает в задачах', () => {
    expect(isWorkingRole(eng({ role: 'lead' }))).toBe(false);
  });
  test('engineer, responsible, intern — работают', () => {
    expect(isWorkingRole(eng({ role: 'engineer' }))).toBe(true);
    expect(isWorkingRole(eng({ role: 'responsible' }))).toBe(true);
    expect(isWorkingRole(eng({ role: 'intern' }))).toBe(true);
  });
});

describe('roleCoeff', () => {
  test('лид — 0', () => {
    expect(roleCoeff('lead')).toBe(0);
  });
  test('остальные — 1', () => {
    expect(roleCoeff('engineer')).toBe(1);
    expect(roleCoeff('responsible')).toBe(1);
    expect(roleCoeff('intern')).toBe(1);
  });
});

describe('isAvailableOn', () => {
  const date = '2026-05-25';

  test('обычный инженер — доступен', () => {
    expect(isAvailableOn(eng(), date)).toBe(true);
  });

  test('лид — никогда не доступен', () => {
    expect(isAvailableOn(eng({ role: 'lead' }), date)).toBe(false);
  });

  test('больничный — не доступен', () => {
    expect(isAvailableOn(eng({ status: 'sick' }), date)).toBe(false);
  });

  test('отпуск в этот день — не доступен', () => {
    const e = eng({ status: 'vacation', vacationFrom: '2026-05-20', vacationTo: '2026-05-30' });
    expect(isAvailableOn(e, date)).toBe(false);
  });

  test('запланированный отпуск (будущий) — доступен', () => {
    const e = eng({ vacationFrom: '2026-06-01', vacationTo: '2026-06-10' });
    expect(isAvailableOn(e, date)).toBe(true);
  });

  test('отпуск завершился — доступен', () => {
    const e = eng({ vacationFrom: '2026-05-10', vacationTo: '2026-05-20' });
    expect(isAvailableOn(e, date)).toBe(true);
  });

  test('граница отпуска включительно', () => {
    const e = eng({ status: 'vacation', vacationFrom: '2026-05-25', vacationTo: '2026-05-28' });
    expect(isAvailableOn(e, '2026-05-25')).toBe(false); // первый день
    expect(isAvailableOn(e, '2026-05-28')).toBe(false); // последний день
    expect(isAvailableOn(e, '2026-05-29')).toBe(true);  // после
  });

  test('дейоф в этот день — не доступен', () => {
    expect(isAvailableOn(eng({ dayoffDate: date }), date)).toBe(false);
  });

  test('дейоф в другой день — доступен', () => {
    expect(isAvailableOn(eng({ dayoffDate: '2026-05-26' }), date)).toBe(true);
  });

  test('статус dayoff — не доступен', () => {
    expect(isAvailableOn(eng({ status: 'dayoff', dayoffDate: date }), date)).toBe(false);
  });

  test('legacy: статус vacation без диапазона — не доступен', () => {
    expect(isAvailableOn(eng({ status: 'vacation' }), date)).toBe(false);
  });
});

describe('isAvailableToday', () => {
  test('обычный инженер — доступен сегодня', () => {
    expect(isAvailableToday(eng())).toBe(true);
  });
  test('дейоф на сегодня — не доступен', () => {
    expect(isAvailableToday(eng({ dayoffDate: todayStr() }))).toBe(false);
  });
  test('дейоф в будущем — доступен сегодня', () => {
    const future = addWorkdays(todayStr(), 5);
    expect(isAvailableToday(eng({ dayoffDate: future }))).toBe(true);
  });
});

describe('capacityOn', () => {
  const date = '2026-05-25';

  test('доступный инженер — 1.0', () => {
    expect(capacityOn(eng(), date)).toBe(1.0);
  });
  test('лид — 0 даже если "доступен"', () => {
    expect(capacityOn(eng({ role: 'lead' }), date)).toBe(0);
  });
  test('больной — 0', () => {
    expect(capacityOn(eng({ status: 'sick' }), date)).toBe(0);
  });
  test('в отпуске — 0', () => {
    expect(capacityOn(eng({ status: 'vacation', vacationFrom: '2026-05-20', vacationTo: '2026-05-30' }), date)).toBe(0);
  });
  test('в дейофе — 0', () => {
    expect(capacityOn(eng({ dayoffDate: date }), date)).toBe(0);
  });
});

describe('leaveTypeOn', () => {
  const date = '2026-05-25';

  test('доступный инженер — null', () => {
    expect(leaveTypeOn(eng(), date)).toBe(null);
  });
  test('больничный — sick', () => {
    expect(leaveTypeOn(eng({ status: 'sick' }), date)).toBe('sick');
  });
  test('отпуск в диапазоне — vacation', () => {
    expect(leaveTypeOn(eng({ vacationFrom: '2026-05-20', vacationTo: '2026-05-30' }), date)).toBe('vacation');
  });
  test('дейоф на эту дату — dayoff', () => {
    expect(leaveTypeOn(eng({ dayoffDate: date }), date)).toBe('dayoff');
  });
  test('sick важнее dayoff', () => {
    // больной с запланированным дейофом — sick (приоритет)
    expect(leaveTypeOn(eng({ status: 'sick', dayoffDate: date }), date)).toBe('sick');
  });
});

describe('leaveTypeToday', () => {
  test('дейоф сегодня', () => {
    expect(leaveTypeToday(eng({ dayoffDate: todayStr() }))).toBe('dayoff');
  });
  test('доступен — null', () => {
    expect(leaveTypeToday(eng())).toBe(null);
  });
});
