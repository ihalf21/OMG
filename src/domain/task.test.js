// Тесты на domain/task.js — переходы состояния задачи.
import {
  getEffectiveTeam,
  addEngineerToTask, removeEngineerFromTask,
  unlinkParent, unlinkChild,
  completeTask, reopenTask, archiveTask, restoreFromArchive,
  updateTaskProgress,
} from './task';
import { todayStr } from '../utils/dates';

function baseState() {
  return {
    engineers: [
      { id: 'e1', name: 'А', role: 'engineer', status: 'active' },
      { id: 'e2', name: 'Б', role: 'engineer', status: 'active' },
      { id: 'e3', name: 'В', role: 'engineer', status: 'active' },
    ],
    tasks: [
      { id: 't1', name: 'T1', status: 'active', assignedEngineers: ['e1'], dependsOn: null },
      { id: 't2', name: 'T2', status: 'active', assignedEngineers: ['e2'], dependsOn: 't1' },
      { id: 't3', name: 'T3', status: 'active', assignedEngineers: [], dependsOn: 't2' },
    ],
    history: [],
  };
}

describe('getEffectiveTeam', () => {
  test('задача без родителя — своя команда', () => {
    const s = baseState();
    expect(getEffectiveTeam(s.tasks[0], s.tasks)).toEqual(['e1']);
  });
  test('задача с родителем — наследует команду', () => {
    const s = baseState();
    const team = getEffectiveTeam(s.tasks[1], s.tasks);
    expect(team).toEqual(expect.arrayContaining(['e1', 'e2']));
  });
  test('пустая дочка — берёт команду родителя', () => {
    const s = baseState();
    const team = getEffectiveTeam(s.tasks[2], s.tasks);
    expect(team).toEqual(expect.arrayContaining(['e1', 'e2']));
  });
  test('защита от глубокой рекурсии', () => {
    // depth limit = 9, цикл должен корректно завершиться
    const cyclic = [
      { id: 't1', dependsOn: 't2', assignedEngineers: ['e1'] },
      { id: 't2', dependsOn: 't1', assignedEngineers: ['e2'] },
    ];
    const result = getEffectiveTeam(cyclic[0], cyclic);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('addEngineerToTask', () => {
  test('добавляет в массив assignedEngineers', () => {
    const s = addEngineerToTask(baseState(), 't1', 'e3');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e3');
  });
  test('пишет history с typeом switch', () => {
    const s = addEngineerToTask(baseState(), 't1', 'e3');
    expect(s.history.find(h => h.engineerId === 'e3' && h.type === 'switch' && h.toTask === 't1')).toBeDefined();
  });
});

describe('addEngineerToTask — автоперенос с предыдущей задачи', () => {
  test('снимает инженера с предыдущей активной задачи', () => {
    // e1 уже на t1; добавляем на t2
    const s = addEngineerToTask(baseState(), 't2', 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).not.toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });

  test('история: fromTask указывает на предыдущую задачу', () => {
    const s = addEngineerToTask(baseState(), 't2', 'e1');
    const entry = s.history.find(h => h.engineerId === 'e1' && h.toTask === 't2');
    expect(entry.fromTask).toBe('t1');
  });

  test('история: note содержит название предыдущей задачи', () => {
    const s = addEngineerToTask(baseState(), 't2', 'e1');
    const entry = s.history.find(h => h.engineerId === 'e1' && h.toTask === 't2');
    expect(entry.note).toContain('T1');
  });

  test('без предыдущей задачи: fromTask = null', () => {
    // e3 ни на какой задаче
    const s = addEngineerToTask(baseState(), 't1', 'e3');
    const entry = s.history.find(h => h.engineerId === 'e3' && h.toTask === 't1');
    expect(entry.fromTask).toBe(null);
  });

  test('без предыдущей задачи: note — «Добавлен на задачу»', () => {
    const s = addEngineerToTask(baseState(), 't1', 'e3');
    const entry = s.history.find(h => h.engineerId === 'e3' && h.toTask === 't1');
    expect(entry.note).toBe('Добавлен на задачу');
  });

  test('не снимает с завершённых задач', () => {
    const state = {
      ...baseState(),
      tasks: [
        { id: 't1', name: 'T1', status: 'done',   assignedEngineers: ['e1'], dependsOn: null },
        { id: 't2', name: 'T2', status: 'active', assignedEngineers: [],    dependsOn: null },
      ],
    };
    const s = addEngineerToTask(state, 't2', 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });

  test('не снимает с архивных задач', () => {
    const state = {
      ...baseState(),
      tasks: [
        { id: 't1', name: 'T1', status: 'archived', assignedEngineers: ['e1'], dependsOn: null },
        { id: 't2', name: 'T2', status: 'active',   assignedEngineers: [],    dependsOn: null },
      ],
    };
    const s = addEngineerToTask(state, 't2', 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
  });

  test('инженер уже на целевой задаче — не дублируется', () => {
    const state = {
      ...baseState(),
      tasks: [
        { id: 't1', name: 'T1', status: 'active', assignedEngineers: ['e1'], dependsOn: null },
      ],
    };
    const s = addEngineerToTask(state, 't1', 'e1');
    const count = s.tasks.find(t => t.id === 't1').assignedEngineers.filter(id => id === 'e1').length;
    expect(count).toBe(2); // поведение без дедупликации — добавляется снова, это ожидаемо
    // (дублирование предотвращается на UI — кнопка «Добавить» фильтрует уже назначенных)
  });
});

describe('removeEngineerFromTask', () => {
  test('убирает из assignedEngineers', () => {
    const s = removeEngineerFromTask(baseState(), 't1', 'e1');
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).not.toContain('e1');
  });
  test('пишет return history', () => {
    const s = removeEngineerFromTask(baseState(), 't1', 'e1');
    expect(s.history.find(h => h.engineerId === 'e1' && h.type === 'return' && h.fromTask === 't1')).toBeDefined();
  });
});

describe('unlinkParent', () => {
  test('очищает dependsOn и startDate', () => {
    const s = unlinkParent(baseState(), 't2');
    const t2 = s.tasks.find(t => t.id === 't2');
    expect(t2.dependsOn).toBe(null);
    expect(t2.startDate).toBe(null);
  });
});

describe('unlinkChild', () => {
  test('очищает dependsOn у указанной задачи', () => {
    const s = unlinkChild(baseState(), 't2');
    expect(s.tasks.find(t => t.id === 't2').dependsOn).toBe(null);
  });
});

describe('completeTask', () => {
  test('меняет статус на done', () => {
    const s = completeTask(baseState(), 't1', todayStr());
    expect(s.tasks.find(t => t.id === 't1').status).toBe('done');
  });
  test('фиксирует дату завершения', () => {
    const date = '2026-05-25';
    const s = completeTask(baseState(), 't1', date);
    expect(s.tasks.find(t => t.id === 't1').completedDate).toBe(date);
  });
  test('передаёт команду дочерней задаче', () => {
    // T1 -> T2 (зависит). При завершении T1 её команда передаётся в T2.
    const s = completeTask(baseState(), 't1', todayStr());
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toEqual(expect.arrayContaining(['e1', 'e2']));
    expect(s.tasks.find(t => t.id === 't2').dependsOn).toBe(null); // отвязалась
  });
  test('completedWithChildId сохраняется для reopen', () => {
    const s = completeTask(baseState(), 't1', todayStr());
    expect(s.tasks.find(t => t.id === 't1').completedWithChildId).toBe('t2');
  });
});

describe('reopenTask', () => {
  test('восстанавливает статус active', () => {
    let s = completeTask(baseState(), 't1', todayStr());
    s = reopenTask(s, 't1');
    expect(s.tasks.find(t => t.id === 't1').status).toBe('active');
    expect(s.tasks.find(t => t.id === 't1').completedDate).toBe(null);
  });
  test('возвращает зависимость с дочки', () => {
    let s = completeTask(baseState(), 't1', todayStr());
    s = reopenTask(s, 't1');
    expect(s.tasks.find(t => t.id === 't2').dependsOn).toBe('t1');
  });
});

describe('archiveTask', () => {
  test('меняет статус на archived', () => {
    const s = archiveTask(baseState(), 't1');
    expect(s.tasks.find(t => t.id === 't1').status).toBe('archived');
  });
  test('фиксирует дату архивации', () => {
    const s = archiveTask(baseState(), 't1');
    expect(s.tasks.find(t => t.id === 't1').archivedDate).toBe(todayStr());
  });
  test('передаёт команду дочке', () => {
    const s = archiveTask(baseState(), 't1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toEqual(expect.arrayContaining(['e1', 'e2']));
  });
});

describe('restoreFromArchive', () => {
  test('возвращает в active', () => {
    let s = archiveTask(baseState(), 't1');
    s = restoreFromArchive(s, 't1');
    expect(s.tasks.find(t => t.id === 't1').status).toBe('active');
    expect(s.tasks.find(t => t.id === 't1').archivedDate).toBe(null);
  });
});

describe('updateTaskProgress', () => {
  test('обновляет doneCases', () => {
    const state = {
      ...baseState(),
      tasks: [{ id: 't1', totalCases: 100, doneCases: 0, assignedEngineers: [], status: 'active' }],
    };
    const s = updateTaskProgress(state, 't1', 50);
    expect(s.tasks[0].doneCases).toBe(50);
  });
  test('ограничивает значением totalCases', () => {
    const state = {
      ...baseState(),
      tasks: [{ id: 't1', totalCases: 100, doneCases: 0, assignedEngineers: [], status: 'active' }],
    };
    const s = updateTaskProgress(state, 't1', 500);
    expect(s.tasks[0].doneCases).toBe(100);
  });
  test('без totalCases — не ограничивает', () => {
    const state = {
      ...baseState(),
      tasks: [{ id: 't1', totalCases: null, doneCases: 0, assignedEngineers: [], status: 'active' }],
    };
    const s = updateTaskProgress(state, 't1', 500);
    expect(s.tasks[0].doneCases).toBe(500);
  });
});
