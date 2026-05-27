// src/domain/availability.js
// Единая точка истины для доступности инженера и его capacity.
// Используется во всех расчётах: forecast, Gantt, Dashboard, Team, TaskCard.
//
// Принцип: вместо проверки `eng.status === 'sick'` в каждом месте,
// все запросы вида «доступен ли инженер на дату X» проходят через isAvailableOn().
// Когда добавляется новая причина недоступности (дейоф, командировка),
// меняется ОДНА функция здесь — а не 6 файлов.

import { todayStr } from '../utils/dates';

// Участвует ли роль в выполнении задач (лид — нет)
export function isWorkingRole(eng) {
  return eng.role !== 'lead';
}

// Коэффициент производительности по роли (для capacity)
export function roleCoeff(role) {
  return role === 'lead' ? 0 : 1.0;
}

// Доступен ли инженер на конкретную дату
export function isAvailableOn(eng, dateStr) {
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
export function isAvailableToday(eng) {
  return isAvailableOn(eng, todayStr());
}

// Capacity инженера на дату (0 если недоступен, иначе roleCoeff)
export function capacityOn(eng, dateStr) {
  return isAvailableOn(eng, dateStr) ? roleCoeff(eng.role) : 0;
}

// Capacity инженера сегодня
export function capacityToday(eng) {
  return capacityOn(eng, todayStr());
}

// Тип отсутствия на указанную дату — для UI бейджей и визуализации в Ганте.
// Возвращает: 'sick' | 'vacation' | 'dayoff' | null
export function leaveTypeOn(eng, dateStr) {
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
export function leaveTypeToday(eng) {
  return leaveTypeOn(eng, todayStr());
}
