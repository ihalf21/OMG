import type { GlobalRole, ProjectRole } from '../domain/types';
import type { NavTarget } from '../ui-types';

export function canAccessPage(
  target: NavTarget,
  globalRole: GlobalRole | null | undefined,
  projectRole: ProjectRole | null | undefined,
): boolean {
  if (globalRole === 'admin') return true;
  if (target === 'admin' || target === 'notes') return false;
  if (target === 'reports') return projectRole === 'admin';
  return true;
}
