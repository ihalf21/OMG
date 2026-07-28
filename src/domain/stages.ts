import type { Task, TaskStage } from './types';

export type TaskStageState = 'completed' | 'current' | 'planned';

export interface TaskStageProgress extends TaskStage {
  usedHours: number;
  progressPct: number;
  state: TaskStageState;
}

export interface TaskStageTimelineItem extends TaskStageProgress {
  from: number;
  to: number;
  startDate: string;
  endDate: string;
  deadlineStatus: 'ok' | 'overdue' | null;
}

export function sortTaskStages(stages: TaskStage[] | null | undefined): TaskStage[] {
  return [...(stages || [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function normalizeTaskStages(stages: TaskStage[] | null | undefined): TaskStage[] {
  return sortTaskStages(stages)
    .map(stage => ({
      ...stage,
      name: stage.name.trim(),
      estimateHours: Math.max(0, Number(stage.estimateHours) || 0),
    }))
    .filter(stage => stage.name.length > 0 && stage.estimateHours > 0)
    .map((stage, sortOrder) => ({ ...stage, sortOrder }));
}

export function taskStagesTotal(stages: TaskStage[] | null | undefined): number {
  return normalizeTaskStages(stages).reduce((sum, stage) => sum + stage.estimateHours, 0);
}

export function taskEstimateHours(task: Task): number {
  const total = taskStagesTotal(task.stages);
  return total > 0 ? total : (task.estimateHours || 0);
}

export function withTaskStages(task: Task, stages: TaskStage[]): Task {
  const normalized = normalizeTaskStages(stages);
  return {
    ...task,
    stages: normalized.length > 0 ? normalized : undefined,
    estimateHours: normalized.length > 0
      ? normalized.reduce((sum, stage) => sum + stage.estimateHours, 0)
      : task.estimateHours,
  };
}

export function computeTaskStageProgress(task: Task, usedHours: number): TaskStageProgress[] {
  const stages = normalizeTaskStages(task.stages);
  if (stages.length === 0) return [];

  const total = stages.reduce((sum, stage) => sum + stage.estimateHours, 0);
  const effectiveUsed = task.status === 'done'
    ? total
    : Math.max(0, Math.min(usedHours, total));
  let consumedBefore = 0;

  return stages.map(stage => {
    const stageUsed = Math.max(0, Math.min(stage.estimateHours, effectiveUsed - consumedBefore));
    consumedBefore += stage.estimateHours;
    const progressPct = stage.estimateHours > 0
      ? Math.min(100, Math.round((stageUsed / stage.estimateHours) * 100))
      : 100;
    const state: TaskStageState = progressPct >= 100
      ? 'completed'
      : stageUsed > 0 || effectiveUsed === consumedBefore - stage.estimateHours
        ? 'current'
        : 'planned';

    return { ...stage, usedHours: stageUsed, progressPct, state };
  });
}

export function currentTaskStage(task: Task, usedHours: number): TaskStageProgress | null {
  const stages = computeTaskStageProgress(task, usedHours);
  return stages.find(stage => stage.state === 'current') || null;
}

export function buildTaskStageTimeline(
  task: Task,
  usedHours: number,
  scheduleDates: string[],
  visibleDates: string[],
  deadline: string | null = null,
): TaskStageTimelineItem[] {
  const stages = computeTaskStageProgress(task, usedHours);
  const total = taskStagesTotal(task.stages);
  if (stages.length === 0 || total <= 0 || scheduleDates.length === 0 || visibleDates.length === 0) return [];

  const scheduleIdxByDate = new Map(scheduleDates.map((date, index) => [date, index]));

  let consumedBefore = 0;
  return stages.flatMap(stage => {
    const stageFrom = (consumedBefore / total) * scheduleDates.length;
    consumedBefore += stage.estimateHours;
    const stageTo = (consumedBefore / total) * scheduleDates.length;
    const startIdx = Math.max(0, Math.min(scheduleDates.length - 1, Math.floor(stageFrom)));
    const endIdx = Math.max(0, Math.min(scheduleDates.length - 1, Math.ceil(stageTo) - 1));
    const endDate = scheduleDates[endIdx];

    let from: number | null = null;
    let to: number | null = null;
    visibleDates.forEach((date, visibleIdx) => {
      const scheduleIdx = scheduleIdxByDate.get(date);
      if (scheduleIdx === undefined) return;
      const overlapFrom = Math.max(stageFrom, scheduleIdx);
      const overlapTo = Math.min(stageTo, scheduleIdx + 1);
      if (overlapTo <= overlapFrom) return;
      const axisFrom = visibleIdx + (overlapFrom - scheduleIdx);
      const axisTo = visibleIdx + (overlapTo - scheduleIdx);
      from = from === null ? axisFrom : Math.min(from, axisFrom);
      to = to === null ? axisTo : Math.max(to, axisTo);
    });

    if (from === null || to === null || to <= from) return [];

    return [{
      ...stage,
      from,
      to,
      startDate: scheduleDates[startIdx],
      endDate,
      deadlineStatus: deadline ? (endDate <= deadline ? 'ok' : 'overdue') : null,
    }];
  });
}
