// src/domain/tasks.ts — справочники.

// Регулярные направления (используются для регулярной задачи инженера и направления задачи)
export const REGULAR_TASKS = [
  'Релиз', 'Регресс', 'Смоук', 'Синхронизация', 'Сверка', 'Приёмка', 'Спецзадачи',
] as const;

export type RegularTask = typeof REGULAR_TASKS[number];
