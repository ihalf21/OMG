// src/domain/types.ts — типы доменных сущностей OMG.

// Роль инженера. Лиды не работают в задачах (coeff = 0).
export type EngineerRole = 'lead' | 'responsible' | 'engineer' | 'intern';

// Статус инженера. Влияет на доступность.
export type EngineerStatus = 'active' | 'vacation' | 'sick' | 'dayoff';

// ISO date в формате YYYY-MM-DD (брендированный для безопасности — обычная строка тоже принимается).
export type ISODate = string;

export interface Engineer {
  id: string;
  name: string;
  role: EngineerRole;
  status: EngineerStatus;
  regularTask: string | null;
  vacationFrom: ISODate | null;
  vacationTo: ISODate | null;
  dayoffDate: ISODate | null;
  sickReturnDate: ISODate | null;
}

// Статус задачи.
export type TaskStatus = 'active' | 'done' | 'archived';
export type GlobalRole = 'admin' | 'user';
export type ProjectRole = 'admin' | 'lead';

export interface User {
  id: string;
  login: string;
  displayName: string;
  globalRole: GlobalRole;
  externalId?: string;
  active: boolean;
}

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  startDate: ISODate | null;
  deadline: ISODate | null;
  direction: string | null;
  estimateHours: number | null;
  assignedEngineers: string[];
  dependsOn: string | null;
  completedDate: ISODate | null;
  completedWithChildId: string | null;
  archivedDate: ISODate | null;
  sortOrder?: number;
  // Разбивка оценки по этапам
  hoursAnalysis?: number;
  hoursActualize?: number;
  hoursDevelopment?: number;
  hoursTesting?: number;
  // Произвольная форма из калькулятора оценки
  estimateForm?: Record<string, unknown>;
  link?: string;
  testOpsUrl?: string;
  workDocUrl?: string;
  extraWork?: ExtraWorkEntry[];
}

export interface ExtraWorkEntry {
  id: string;
  date: ISODate;
  title: string;
  note?: string;
}

// Тип записи в истории занятости.
export type HistoryType = 'switch' | 'return' | 'sick' | 'vacation' | 'dayoff';

export interface HistoryEntry {
  id: string;
  date: ISODate;
  engineerId: string;
  type: HistoryType;
  fromTask: string | null;
  toTask: string | null;
  note: string;
  // Доля рабочего дня переключения (switch), пришедшаяся на ПОКИДАЕМУЮ задачу
  // (0..1). Отсутствует → 0 → весь день уходит новой задаче (legacy-поведение).
  dayFraction?: number;
}

// Шаблон оценки трудозатрат (для калькулятора Estimate)
export interface EstimateTemplate {
  id: string;
  name: string;
  description?: string;
  form: Record<string, { o: string; m: string; p: string }>;
  archived: boolean;
  createdAt?: string;
  archivedAt?: string | null;
}

// Один проект — изолированная единица планирования.
export interface Project {
  id: string;
  name: string;
  revision?: number;
  updatedAt?: string;
  updatedBy?: string;
  lead?: string;
  jiraUrl?: string;
  directions?: string[];
  plannedEngineers?: number | null;
  leadIncluded?: boolean;
  engineers: Engineer[];
  tasks: Task[];
  history: HistoryEntry[];
  estimateTemplates?: EstimateTemplate[];
  archived?: boolean;
  archivedAt?: ISODate | null;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

// Корневое состояние воркспейса — список проектов и текущий выбранный.
export interface Workspace {
  projects: Project[];
  currentProjectId: string;
  users?: User[];
  projectMembers?: ProjectMember[];
}

// «State» для доменных функций — это всегда Project (внутри одного проекта).
// Алиас для семантики: «возьми этот проект, верни новый проект с изменением».
export type ProjectState = Project;
