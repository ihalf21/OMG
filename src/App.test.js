import { normalizeStatuses } from './App';
import { todayStr, addWorkdays, subtractWorkdays } from './utils/dates';

function state(overrides = {}) {
  return {
    engineers: [
      {
        id: 'e1',
        name: 'Иванов',
        role: 'engineer',
        status: 'active',
        regularTask: null,
        vacationFrom: null,
        vacationTo: null,
        dayoffDate: null,
      },
    ],
    tasks: [
      { id: 't1', name: 'Задача 1', status: 'active', assignedEngineers: ['e1'] },
    ],
    history: [],
    ...overrides,
  };
}

describe('normalizeStatuses', () => {
  test('запланированный дейоф на сегодня меняет статус, но не состав задачи', () => {
    const today = todayStr();
    const normalized = normalizeStatuses(state({
      engineers: [
        {
          id: 'e1',
          name: 'Иванов',
          role: 'engineer',
          status: 'active',
          regularTask: null,
          vacationFrom: null,
          vacationTo: null,
          dayoffDate: today,
        },
      ],
    }));

    expect(normalized.engineers.find(e => e.id === 'e1').status).toBe('dayoff');
    expect(normalized.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });

  test('запланированный отпуск на сегодня меняет статус, но не состав задачи', () => {
    const today = todayStr();
    const normalized = normalizeStatuses(state({
      engineers: [
        {
          id: 'e1',
          name: 'Иванов',
          role: 'engineer',
          status: 'active',
          regularTask: null,
          vacationFrom: today,
          vacationTo: addWorkdays(today, 2),
          dayoffDate: null,
        },
      ],
    }));

    expect(normalized.engineers.find(e => e.id === 'e1').status).toBe('vacation');
    expect(normalized.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });

  test('завершившийся дейоф очищает дату и сохраняет назначение на legacy-задаче', () => {
    const normalized = normalizeStatuses(state({
      engineers: [
        {
          id: 'e1',
          name: 'Иванов',
          role: 'engineer',
          status: 'dayoff',
          regularTask: null,
          vacationFrom: null,
          vacationTo: null,
          dayoffDate: subtractWorkdays(todayStr(), 1),
        },
      ],
    }));

    expect(normalized.engineers.find(e => e.id === 'e1').status).toBe('active');
    expect(normalized.engineers.find(e => e.id === 'e1').dayoffDate).toBe(null);
    expect(normalized.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });
});
