import { useQueryParam, type TileHue } from '@repo/ui';
import { BadgeCheck, Briefcase, Building, Landmark, ShieldCheck, Wallet, type LucideIcon } from 'lucide-react';

/** The demos offered on Get started: a developer (Larkspur Estates) and a society (Al-Noor Residency). */
export const DEMO_KINDS = ['developer', 'society'] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];
export const isDemoKind = (v: string | null | undefined): v is DemoKind => DEMO_KINDS.includes(v as DemoKind);

/** The backoffice demo roles of each demo (persona ids in the fixtures). */
export const DEVELOPER_ROLES = ['manager', 'sales', 'finance'] as const;
export const SOCIETY_ROLES = ['alnoor_manager', 'alnoor_treasurer', 'alnoor_guard'] as const;
export const DEMO_ROLES = [...DEVELOPER_ROLES, ...SOCIETY_ROLES] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
export const ROLES_OF: Record<DemoKind, readonly DemoRole[]> = { developer: DEVELOPER_ROLES, society: SOCIETY_ROLES };

export const isDemoRole = (v: string | null | undefined): v is DemoRole => DEMO_ROLES.includes(v as DemoRole);
export const demoOf = (role: DemoRole): DemoKind => ((SOCIETY_ROLES as readonly string[]).includes(role) ? 'society' : 'developer');
/** The role each demo recommends for a first look. */
export const RECOMMENDED: Record<DemoKind, DemoRole> = { developer: 'manager', society: 'alnoor_manager' };

export const ROLE_LOOK: Record<DemoRole, { hue: TileHue; icon: LucideIcon }> = {
  manager: { hue: 'emerald', icon: BadgeCheck },
  sales: { hue: 'sky', icon: Briefcase },
  finance: { hue: 'gold', icon: Landmark },
  alnoor_manager: { hue: 'emerald', icon: Building },
  alnoor_treasurer: { hue: 'gold', icon: Wallet },
  alnoor_guard: { hue: 'slate', icon: ShieldCheck },
};

/**
 * The address a visitor originally asked for (`?next=`), if it is a backoffice page outside the
 * entry flow. Same rule as `useNextHref` in the prototype route table; pages stay router-agnostic,
 * so the check is repeated here on top of the navigation seam.
 */
export function useSafeNext(): string | null {
  const [next] = useQueryParam('next');
  return next && next.startsWith('/backoffice/') && !next.startsWith('/backoffice/get-started') && !next.startsWith('/backoffice/sign-in') ? next : null;
}

/** Appends extra query parameters (and the kept `next`) to an entry-flow address. */
export function entryHref(path: string, params: Record<string, string | null | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Moves keyboard and screen-reader focus to the page heading (after a step change). */
export function focusHeading(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

/**
 * Display headings set a tight Latin line height; Nastaliq needs far more room, so Urdu gets the
 * tuned leading back (matches the `:lang(ur)` text tokens in the theme).
 */
export const DISPLAY_UR = '[:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1';
