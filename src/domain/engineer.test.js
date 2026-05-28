// Тесты на domain/engineer.js — переходы состояния инженера.
import {
  addEngineer, deleteEngineer, updateEngineerProfile,
  setSickLeave, clearSickLeave, setSickReturn, cancelScheduledSickReturn,
  setVacation, cancelVacation, endVacationEarly,
  setDayoff, cancelDayoff, endDayoffEarly,
  removeFromTask, switchToTask,
} from './engineer';
import { todayStr, addWorkdays, subtractWorkdays } from '../utils/dates';

// Базовое состояние
function baseState() {
  return {
    engineers: [
      { id: 'e1', name: 'Иванов', role: 'engineer', status: 'active', regularTask: null, vacationFrom: null, vacationTo: null, dayoffDate: null, experience: {} },
      { id: 'e2', name: 'Петрова', role: 'engineer', status: 'active', regularTask: null, vacationFrom: null, vacationTo: null, dayoffDate: null, experience: {} },
    ],
    tasks: [
      { id: 't1', name: 'Задача 1', status: 'active', assignedEngineers: ['e1'] },
      { id: 't2', name: 'Задача 2', status: 'active', assignedEngineers: ['e2'] },
    ],
    history: [],
  };
}

describe('addEngineer', () => {
  test('добавляет инженера со статусом active', () => {
    const s = addEngineer(baseState(), { name: 'Новый', role: 'engineer' });
    expect(s.engineers).toHaveLength(3);
    const newEng = s.engineers[2];
    expect(newEng.name).toBe('Новый');
    expect(newEng.status).toBe('active');
    expect(newEng.id).toMatch(/^e/);
  });
  test('default роль = engineer', () => {
    const s = addEngineer(baseState(), { name: 'X' });
    expect(s.engineers[2].role).toBe('engineer');
  });
});

describe('deleteEngineer', () => {
  test('удаляет из массива', () => {
    const s = deleteEngineer(baseState(), 'e1');
    expect(s.engineers).toHaveLength(1);
    expect(s.engineers.find(e => e.id === 'e1')).toBeUndefined();
  });
  test('снимает со всех задач', () => {
    const s = deleteEngineer(baseState(), 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toEqual([]);
  });
});

describe('updateEngineerProfile', () => {
  test('обновляет имя и роль', () => {
    const s = updateEngineerProfile(baseState(), 'e1', { name: 'Сидоров', role: 'responsible' });
    const e = s.engineers.find(e => e.id === 'e1');
    expect(e.name).toBe('Сидоров');
    expect(e.role).toBe('responsible');
  });
  test('игнорирует попытку поменять статус', () => {
    const s = updateEngineerProfile(baseState(), 'e1', { status: 'sick' });
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('active');
  });
});

describe('setSickLeave', () => {
  test('меняет статус на sick', () => {
    const s = setSickLeave(baseState(), 'e1');
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('sick');
  });
  test('остаётся на задаче (снимается только вручную)', () => {
    const s = setSickLeave(baseState(), 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });
  test('добавляет history entry с типом sick', () => {
    const s = setSickLeave(baseState(), 'e1');
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ type: 'sick', engineerId: 'e1', fromTask: 't1' });
  });
  test('инженер без текущей задачи — fromTask null в истории', () => {
    const state = {
      ...baseState(),
      tasks: baseState().tasks.map(t =>
        t.id === 't1' ? { ...t, assignedEngineers: [] } : t
      ),
    };
    const s = setSickLeave(state, 'e1');
    expect(s.history[0].fromTask).toBe(null);
  });
  test('другие инженеры на задаче не затронуты', () => {
    // e1 и e2 оба на t1; e1 уходит на больничный — e2 остаётся
    const state = {
      ...baseState(),
      tasks: [{ id: 't1', name: 'Задача 1', status: 'active', assignedEngineers: ['e1', 'e2'] }],
    };
    const s = setSickLeave(state, 'e1');
    const assigned = s.tasks.find(t => t.id === 't1').assignedEngineers;
    expect(assigned).toContain('e1');
    expect(assigned).toContain('e2');
  });
});

describe('clearSickLeave', () => {
  test('меняет статус на active', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const cleared = clearSickLeave(sick, 'e1');
    expect(cleared.engineers.find(e => e.id === 'e1').status).toBe('active');
  });
  test('добавляет return history', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const cleared = clearSickLeave(sick, 'e1');
    expect(cleared.history.find(h => h.type === 'return' && h.note.includes('больничного'))).toBeDefined();
  });
  test('инженер остаётся на задаче после закрытия больничного', () => {
    // setSickLeave не снимает с задачи, clearSickLeave тоже — инженер должен быть на месте
    const sick    = setSickLeave(baseState(), 'e1');
    const cleared = clearSickLeave(sick, 'e1');
    expect(cleared.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });
});

describe('setSickReturn', () => {
  const future = addWorkdays(todayStr(), 5);
  const past   = subtractWorkdays(todayStr(), 3);

  test('будущая дата — устанавливает sickReturnDate, статус остаётся sick', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const s = setSickReturn(sick, 'e1', future);
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('sick');
    expect(s.engineers.find(e => e.id === 'e1').sickReturnDate).toBe(future);
  });

  test('будущая дата — добавляет history entry с типом return и плановым note', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const s = setSickReturn(sick, 'e1', future);
    const entry = s.history.find(h => h.type === 'return');
    expect(entry).toBeDefined();
    expect(entry.note).toMatch(/Плановый/);
  });

  test('сегодняшняя дата — закрывает больничный (статус active)', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const s = setSickReturn(sick, 'e1', todayStr());
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(s.engineers.find(e => e.id === 'e1').sickReturnDate).toBe(null);
  });

  test('прошлая дата — закрывает больничный задним числом', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const s = setSickReturn(sick, 'e1', past);
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(s.engineers.find(e => e.id === 'e1').sickReturnDate).toBe(null);
    const entry = s.history.find(h => h.type === 'return');
    // Дата записи = прошлая дата
    expect(entry.date).toBe(past);
  });

  test('прошлая дата — note содержит дату закрытия', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const s = setSickReturn(sick, 'e1', past);
    const entry = s.history.find(h => h.type === 'return');
    expect(entry.note).toContain('больничного');
    expect(entry.note).toMatch(/\d/); // дата есть в note
  });

  test('инженер остаётся на задаче при любом варианте', () => {
    const sick = setSickLeave(baseState(), 'e1');
    const sFuture = setSickReturn(sick, 'e1', future);
    const sPast   = setSickReturn(sick, 'e1', past);
    expect(sFuture.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
    expect(sPast.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });
});

describe('cancelScheduledSickReturn', () => {
  test('очищает sickReturnDate, статус не трогает', () => {
    const future = addWorkdays(todayStr(), 5);
    const sick = setSickLeave(baseState(), 'e1');
    const withReturn = setSickReturn(sick, 'e1', future);
    const cancelled = cancelScheduledSickReturn(withReturn, 'e1');
    expect(cancelled.engineers.find(e => e.id === 'e1').sickReturnDate).toBe(null);
    expect(cancelled.engineers.find(e => e.id === 'e1').status).toBe('sick');
  });
});

describe('setVacation', () => {
  test('будущий отпуск — оставляет active, сохраняет даты', () => {
    const from = addWorkdays(todayStr(), 5);
    const to   = addWorkdays(todayStr(), 10);
    const s = setVacation(baseState(), 'e1', from, to);
    const e = s.engineers.find(e => e.id === 'e1');
    expect(e.status).toBe('active');
    expect(e.vacationFrom).toBe(from);
    expect(e.vacationTo).toBe(to);
  });
  test('будущий отпуск — не снимает с задачи', () => {
    const from = addWorkdays(todayStr(), 5);
    const to   = addWorkdays(todayStr(), 10);
    const s = setVacation(baseState(), 'e1', from, to);
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });
  test('текущий отпуск — статус vacation, снимает с задачи', () => {
    const today = todayStr();
    const tomorrow = addWorkdays(today, 1);
    const s = setVacation(baseState(), 'e1', today, tomorrow);
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('vacation');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toEqual([]);
  });
  test('исторический отпуск — возвращает на ту же задачу', () => {
    const from = subtractWorkdays(todayStr(), 10);
    const to   = subtractWorkdays(todayStr(), 5);
    const s = setVacation(baseState(), 'e1', from, to);
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(s.engineers.find(e => e.id === 'e1').vacationFrom).toBe(null);
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
    // History содержит и vacation, и switch обратно
    expect(s.history.find(h => h.type === 'vacation')).toBeDefined();
    expect(s.history.find(h => h.type === 'switch' && h.note.includes('Вернулся'))).toBeDefined();
  });
});

describe('cancelVacation', () => {
  test('очищает только даты, статус не трогает', () => {
    const future = addWorkdays(todayStr(), 5);
    const futureTo = addWorkdays(todayStr(), 10);
    const withVac = setVacation(baseState(), 'e1', future, futureTo);
    const cancelled = cancelVacation(withVac, 'e1');
    expect(cancelled.engineers.find(e => e.id === 'e1').vacationFrom).toBe(null);
    expect(cancelled.engineers.find(e => e.id === 'e1').vacationTo).toBe(null);
    expect(cancelled.engineers.find(e => e.id === 'e1').status).toBe('active');
  });
});

describe('endVacationEarly', () => {
  test('возвращает в active и чистит даты', () => {
    const today = todayStr();
    const tomorrow = addWorkdays(today, 1);
    const onVac = setVacation(baseState(), 'e1', today, tomorrow);
    const back = endVacationEarly(onVac, 'e1');
    expect(back.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(back.engineers.find(e => e.id === 'e1').vacationFrom).toBe(null);
  });
});

describe('setDayoff', () => {
  test('будущий — оставляет active, сохраняет дату', () => {
    const future = addWorkdays(todayStr(), 5);
    const s = setDayoff(baseState(), 'e1', future);
    const e = s.engineers.find(e => e.id === 'e1');
    expect(e.status).toBe('active');
    expect(e.dayoffDate).toBe(future);
  });
  test('сегодня — статус dayoff, снимает с задачи', () => {
    const today = todayStr();
    const s = setDayoff(baseState(), 'e1', today);
    expect(s.engineers.find(e => e.id === 'e1').status).toBe('dayoff');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toEqual([]);
  });
  test('исторический — чистит dayoffDate, оставляет историю', () => {
    const past = subtractWorkdays(todayStr(), 5);
    const s = setDayoff(baseState(), 'e1', past);
    expect(s.engineers.find(e => e.id === 'e1').dayoffDate).toBe(null);
    expect(s.history.find(h => h.type === 'dayoff')).toBeDefined();
  });
});

describe('cancelDayoff', () => {
  test('убирает дату дейофа', () => {
    const future = addWorkdays(todayStr(), 5);
    const withDayoff = setDayoff(baseState(), 'e1', future);
    const cancelled = cancelDayoff(withDayoff, 'e1');
    expect(cancelled.engineers.find(e => e.id === 'e1').dayoffDate).toBe(null);
  });
});

describe('endDayoffEarly', () => {
  test('возвращает в active и добавляет return history', () => {
    const today = todayStr();
    const inDayoff = setDayoff(baseState(), 'e1', today);
    const back = endDayoffEarly(inDayoff, 'e1');
    expect(back.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(back.engineers.find(e => e.id === 'e1').dayoffDate).toBe(null);
    expect(back.history.find(h => h.note?.includes('дейофа'))).toBeDefined();
  });
});

describe('removeFromTask', () => {
  test('снимает со всех задач', () => {
    const s = removeFromTask(baseState(), 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toEqual([]);
  });
  test('добавляет return history', () => {
    const s = removeFromTask(baseState(), 'e1');
    expect(s.history.find(h => h.type === 'return' && h.note === 'Снят с задачи')).toBeDefined();
  });
});

describe('switchToTask', () => {
  test('переключает между задачами', () => {
    const s = switchToTask(baseState(), 'e1', 't2');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).not.toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });
  test('добавляет switch history', () => {
    const s = switchToTask(baseState(), 'e1', 't2');
    expect(s.history.find(h => h.type === 'switch' && h.fromTask === 't1' && h.toTask === 't2')).toBeDefined();
  });
});
