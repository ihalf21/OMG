// src/domain/availability.ts
// Единая точка истины для доступности инженера и его capacity.

import { todayStr } from '../utils/dates';
import type { Engineer, EngineerRole, ISODate, HistoryType } from './types';

// Тип «причины отсутствия» — повторяет подмножество HistoryType + null если доступен.
export type LeaveType = Extract<HistoryType, 'sick' | 'vacation' | 'dayoff'>;

// Участвует ли роль в выполнении задач (лид — нет)
export function isWorkingRole(eng: Engineer): boolean {
  return eng.role !== 'lead';
}

// Коэффициент производительности по роли (для capacity)
export function roleCoeff(role: EngineerRole): number {
  return role === 'lead' ? 0 : 1.0;
}

// Доступен ли инженер на конкретную дату
export function isAvailableOn(eng: Engineer, dateStr: ISODate): boolean {
  if (!isWorkingRole(eng)) return false;
  if (eng.status === 'sick') return false;

  // Дейоф — запланированный или активный
  if (eng.dayoffDate === dateStr) return false;
  if (eng.status === 'dayoff') return false;

  // Отпуск — попадает ли дата в диапазон
  if (eng.vacationFrom && eng.vacationTo
      && dateStr >= eng.vacationFrom && dateStr <= eng.vacationTo) {
    return false;
  }

  // Edge-case: статус vacation без диапазона (legacy)
  if (eng.status === 'vacation' && (!eng.vacationFrom || !eng.vacationTo)) return false;

  return true;
}

// Доступен ли инженер сегодня
export function isAvailableToday(eng: Engineer): boolean {
  return isAvailableOn(eng, todayStr());
}

// Capacity инженера на дату (0 если недоступен, иначе roleCoeff)
export function capacityOn(eng: Engineer, dateStr: ISODate): number {
  return isAvailableOn(eng, dateStr) ? roleCoeff(eng.role) : 0;
}

// Capacity инженера сегодня
export function capacityToday(eng: Engineer): number {
  return capacityOn(eng, todayStr());
}

// Тип отсутствия на указанную дату — для UI бейджей и визуализации в Ганте.
export function leaveTypeOn(eng: Engineer, dateStr: ISODate): LeaveType | null {
  if (eng.status === 'sick') return 'sick';
  if (eng.dayoffDate === dateStr || eng.status === 'dayoff') return 'dayoff';
  if (eng.vacationFrom && eng.vacationTo
      && dateStr >= eng.vacationFrom && dateStr <= eng.vacationTo) {
    return 'vacation';
  }
  if (eng.status === 'vacation') return 'vacation';
  return null;
}

// Тип отсутствия сегодня
export function leaveTypeToday(eng: Engineer): LeaveType | null {
  return leaveTypeOn(eng, todayStr());
}
