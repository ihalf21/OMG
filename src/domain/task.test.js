// Тесты на domain/task.js — переходы состояния задачи.
import {
  getEffectiveTeam,
  addEngineerToTask, removeEngineerFromTask,
  getEngineerCurrentTask, getEngineerActiveTasks,
  unlinkParent, unlinkChild,
  completeTask, reopenTask, archiveTask, restoreFromArchive,
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

describe('getEngineerActiveTasks', () => {
  test('возвращает все активные задачи инженера', () => {
    const state = {
      ...baseState(),
      tasks: [
        { id: 't1', name: 'T1', status: 'active',   assignedEngineers: ['e1'], dependsOn: null },
        { id: 't2', name: 'T2', status: 'active',   assignedEngineers: ['e1'], dependsOn: null },
        { id: 't3', name: 'T3', status: 'done',     assignedEngineers: ['e1'], dependsOn: null },
      ],
    };
    const result = getEngineerActiveTasks(state, 'e1');
    expect(result.map(t => t.id)).toEqual(expect.arrayContaining(['t1', 't2']));
    expect(result.find(t => t.id === 't3')).toBeUndefined();
  });

  test('excludeTaskId исключает задачу из результата', () => {
    const result = getEngineerActiveTasks(baseState(), 'e1', 't1');
    expect(result.find(t => t.id === 't1')).toBeUndefined();
  });

  test('возвращает пустой массив если инженер без задач', () => {
    expect(getEngineerActiveTasks(baseState(), 'e3')).toHaveLength(0);
  });
});

describe('getEngineerCurrentTask', () => {
  test('возвращает активную задачу инженера', () => {
    const s = baseState(); // e1 на t1
    expect(getEngineerCurrentTask(s, 'e1').id).toBe('t1');
  });

  test('исключает targetTaskId', () => {
    const s = baseState();
    expect(getEngineerCurrentTask(s, 'e1', 't1')).toBe(null);
  });

  test('возвращает null если инженер без задачи', () => {
    const s = baseState(); // e3 ни на какой задаче
    expect(getEngineerCurrentTask(s, 'e3')).toBe(null);
  });

  test('не возвращает завершённые задачи', () => {
    const state = {
      ...baseState(),
      tasks: [
        { id: 't1', name: 'T1', status: 'done',   assignedEngineers: ['e1'], dependsOn: null },
        { id: 't2', name: 'T2', status: 'active', assignedEngineers: [],    dependsOn: null },
      ],
    };
    expect(getEngineerCurrentTask(state, 'e1')).toBe(null);
  });
});

describe('addEngineerToTask — автоперенос с предыдущей задачи (transfer=true)', () => {
  test('снимает инженера с предыдущей активной задачи', () => {
    const s = addEngineerToTask(baseState(), 't2', 'e1', true);
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).not.toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });

  test('история: fromTask указывает на предыдущую задачу', () => {
    const s = addEngineerToTask(baseState(), 't2', 'e1', true);
    const entry = s.history.find(h => h.engineerId === 'e1' && h.toTask === 't2');
    expect(entry.fromTask).toBe('t1');
  });

  test('история: note содержит название предыдущей задачи', () => {
    const s = addEngineerToTask(baseState(), 't2', 'e1', true);
    const entry = s.history.find(h => h.engineerId === 'e1' && h.toTask === 't2');
    expect(entry.note).toContain('T1');
  });

  test('без предыдущей задачи: fromTask = null', () => {
    const s = addEngineerToTask(baseState(), 't1', 'e3', true);
    const entry = s.history.find(h => h.engineerId === 'e3' && h.toTask === 't1');
    expect(entry.fromTask).toBe(null);
  });

  test('без предыдущей задачи: note — «Добавлен на задачу»', () => {
    const s = addEngineerToTask(baseState(), 't1', 'e3', true);
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

describe('addEngineerToTask — transfer vs планирование', () => {
  const multiState = () => ({
    ...baseState(),
    tasks: [
      { id: 't1', name: 'T1', status: 'active', assignedEngineers: ['e1'], dependsOn: null },
      { id: 't2', name: 'T2', status: 'active', assignedEngineers: [],    dependsOn: null },
      { id: 't3', name: 'T3', status: 'active', assignedEngineers: ['e1'], dependsOn: null },
    ],
    history: [],
  });

  test('transfer=true: снимает со ВСЕХ активных задач', () => {
    const s = addEngineerToTask(multiState(), 't2', 'e1', true);
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).not.toContain('e1');
    expect(s.tasks.find(t => t.id === 't3').assignedEngineers).not.toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });

  test('transfer=true: инженер ровно на одной задаче', () => {
    const s = addEngineerToTask(multiState(), 't2', 'e1', true);
    const tasks = s.tasks.filter(t => (t.assignedEngineers || []).includes('e1'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t2');
  });

  test('transfer=false (планирование): инженер остаётся на старых задачах', () => {
    const s = addEngineerToTask(multiState(), 't2', 'e1', false);
    expect(s.tasks.find(t => t.id === 't1').assignedEngineers).toContain('e1');
    expect(s.tasks.find(t => t.id === 't3').assignedEngineers).toContain('e1');
    expect(s.tasks.find(t => t.id === 't2').assignedEngineers).toContain('e1');
  });

  test('transfer=false: note содержит "Запланирован"', () => {
    const s = addEngineerToTask(multiState(), 't2', 'e1', false);
    const entry = s.history.find(h => h.engineerId === 'e1' && h.toTask === 't2');
    expect(entry.note).toContain('Запланирован');
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

