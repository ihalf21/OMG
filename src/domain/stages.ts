import type { Task, TaskStage } from './types';

export type TaskStageState = 'completed' | 'current' | 'planned';

export interface TaskStageProgress extends TaskStage {
  usedHours: number;
  progressPct: number;
  state: TaskStageState;
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
