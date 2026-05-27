// src/ui-types.ts — UI-уровень типов: пропсы страниц, навигация.

import type { Project, ProjectState } from './domain/types';

// Цели навигации между страницами.
export type NavTarget =
  | 'dashboard'
  | 'tasks'
  | 'task'        // конкретная задача — передаётся taskId
  | 'team'
  | 'engineer'   // конкретный инженер — передаётся engineerId
  | 'gantt'
  | 'estimate';

export type NavigateFn = (target: NavTarget, id?: string) => void;

// Обновление состояния проекта — принимает редьюсер.
export type UpdateProjectData = (fn: (state: ProjectState) => ProjectState) => void;

// Базовые пропсы, которые получает каждая страница от App.
export interface PageProps {
  data: Project;
  updateData: UpdateProjectData;
  navigate: NavigateFn;
}
