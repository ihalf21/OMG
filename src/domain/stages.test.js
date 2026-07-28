import {
  computeTaskStageProgress,
  buildTaskStageTimeline,
  currentTaskStage,
  normalizeTaskStages,
  taskEstimateHours,
  taskStagesTotal,
  withTaskStages,
} from './stages';

const task = (patch = {}) => ({
  id: 't1', name: 'Регресс', status: 'active', startDate: '2026-07-01', deadline: null,
  direction: null, estimateHours: 72, assignedEngineers: [], dependsOn: null,
  completedDate: null, completedWithChildId: null, archivedDate: null,
  ...patch,
});

const stages = [
  { id: 's2', name: 'Актуализация', estimateHours: 16, sortOrder: 1 },
  { id: 's1', name: 'Анализ', estimateHours: 8, sortOrder: 0 },
  { id: 's3', name: 'Прогон', estimateHours: 40, sortOrder: 2 },
  { id: 's4', name: 'Отчёт', estimateHours: 8, sortOrder: 3 },
];

describe('task stages', () => {
  test('нормализует порядок, названия и оценки', () => {
    const result = normalizeTaskStages([
      { id: 'b', name: '  Второй ', estimateHours: 4, sortOrder: 2 },
      { id: 'empty', name: '', estimateHours: 3, sortOrder: 1 },
      { id: 'a', name: 'Первый', estimateHours: 2, sortOrder: 0 },
      { id: 'zero', name: 'Нулевой', estimateHours: 0, sortOrder: 3 },
    ]);
    expect(result.map(stage => stage.name)).toEqual(['Первый', 'Второй']);
    expect(result.map(stage => stage.sortOrder)).toEqual([0, 1]);
  });

  test('считает сумму этапов как единую оценку задачи', () => {
    expect(taskStagesTotal(stages)).toBe(72);
    expect(taskEstimateHours(task({ stages }))).toBe(72);
    expect(taskEstimateHours(task({ estimateHours: 11 }))).toBe(11);
  });

  test('синхронизирует estimateHours при сохранении этапов', () => {
    const result = withTaskStages(task({ estimateHours: 10 }), stages);
    expect(result.estimateHours).toBe(72);
    expect(result.stages).toHaveLength(4);
  });

  test('распределяет фактические часы последовательно', () => {
    const result = computeTaskStageProgress(task({ stages }), 20);
    expect(result.map(stage => [stage.state, stage.usedHours, stage.progressPct])).toEqual([
      ['completed', 8, 100],
      ['current', 12, 75],
      ['planned', 0, 0],
      ['planned', 0, 0],
    ]);
    expect(currentTaskStage(task({ stages }), 20)?.id).toBe('s2');
  });

  test('завершённая задача завершает все этапы', () => {
    const result = computeTaskStageProgress(task({ stages, status: 'done' }), 0);
    expect(result.every(stage => stage.state === 'completed')).toBe(true);
  });

  test('раскладывает этапы по полному расписанию и обрезает по видимому периоду', () => {
    const date = (day) => `2026-07-${String(day).padStart(2, '0')}`;
    const scheduleDates = Array.from({ length: 36 }, (_, i) => date(i + 1));
    const visibleDates = scheduleDates.slice(0, 10);
    const result = buildTaskStageTimeline(task({ stages }), 20, scheduleDates, visibleDates, date(15));

    expect(result.map(stage => [stage.id, stage.from, stage.to])).toEqual([
      ['s1', 0, 4],
      ['s2', 4, 10],
    ]);
    expect(result.map(stage => stage.state)).toEqual(['completed', 'current']);
    expect(result.map(stage => stage.deadlineStatus)).toEqual(['ok', 'ok']);
  });

  test('помечает этапы после дедлайна как просроченные', () => {
    const date = (day) => `2026-07-${String(day).padStart(2, '0')}`;
    const scheduleDates = Array.from({ length: 36 }, (_, i) => date(i + 1));
    const visibleDates = scheduleDates.slice(12, 20);
    const result = buildTaskStageTimeline(task({ stages }), 20, scheduleDates, visibleDates, date(15));

    expect(result.map(stage => [stage.id, stage.from, stage.to, stage.deadlineStatus])).toEqual([
      ['s3', 0, 8, 'overdue'],
    ]);
  });

  test('задача без этапов остаётся совместимой', () => {
    expect(computeTaskStageProgress(task(), 10)).toEqual([]);
    expect(currentTaskStage(task(), 10)).toBeNull();
  });
});
