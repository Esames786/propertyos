import { SCREENS } from './register.generated';
import type { ScreenEntry } from './types';

export type { ScreenApp, ScreenEntry, ScreenStatus, UiTemplate } from './types';
export { SCREENS };

const byPath = new Map<string, ScreenEntry>();
// Canonical routes first, so the owner's register URL wins if both happen to collide.
for (const s of SCREENS) byPath.set(s.route, s);
for (const s of SCREENS) byPath.set(s.registerRoute, s);

/**
 * Finds the register entry served at `pathname`: either its URL in the owner's register or the
 * corrected canonical route (e.g. GUIDE-005 /portal/help/tours → /customer/portal/help/tours).
 */
export function findScreenByRegisterRoute(pathname: string): ScreenEntry | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return byPath.get(clean);
}

export function findScreen(id: string): ScreenEntry | undefined {
  return SCREENS.find((s) => s.id === id);
}

export function screensForPrefix(prefix: string): ScreenEntry[] {
  return SCREENS.filter((s) => s.registerRoute.startsWith(prefix));
}
