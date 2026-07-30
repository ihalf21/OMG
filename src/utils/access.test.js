import { canAccessPage } from './access';

describe('canAccessPage', () => {
  test('глобальный администратор имеет доступ ко всем разделам', () => {
    expect(canAccessPage('admin', 'admin', null)).toBe(true);
    expect(canAccessPage('notes', 'admin', null)).toBe(true);
    expect(canAccessPage('reports', 'admin', null)).toBe(true);
  });

  test('проектный администратор видит отчёты, но не глобальные разделы', () => {
    expect(canAccessPage('reports', 'user', 'admin')).toBe(true);
    expect(canAccessPage('admin', 'user', 'admin')).toBe(false);
    expect(canAccessPage('notes', 'user', 'admin')).toBe(false);
  });

  test('проектный лид не видит отчёты и глобальные разделы', () => {
    expect(canAccessPage('reports', 'user', 'lead')).toBe(false);
    expect(canAccessPage('admin', 'user', 'lead')).toBe(false);
    expect(canAccessPage('notes', 'user', 'lead')).toBe(false);
    expect(canAccessPage('gantt', 'user', 'lead')).toBe(true);
  });
});
