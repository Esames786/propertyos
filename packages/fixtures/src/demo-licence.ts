import type { EffectiveAccess, ModuleKey, Persona } from '@repo/contracts';
import { effectiveAccessFor } from './tenant-directory';

/**
 * Prototype only (Gate D.3): simulate the organisation withdrawing an optional add-on in this browser
 * tab, to show what residents and staff see without it (official notices must keep working, D-49).
 * Remove-only: it can take the two community add-ons away, never grant anything. Both the screens and
 * the mock server use the same access, so the refusal is real. Set by the demo or a test through
 * sessionStorage; nothing else reads it.
 */
export const DEMO_WITHDRAWN_KEY = 'demo:withdrawn-modules';
// Gate S.2a: the optional HR add-on too (shows "not in your plan" and the residents' tab going away).
const WITHDRAWABLE: readonly ModuleKey[] = ['community_chat', 'community_hub', 'hr'];

function withdrawn(): ModuleKey[] {
  try {
    const raw = globalThis.sessionStorage?.getItem(DEMO_WITHDRAWN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? WITHDRAWABLE.filter((m) => list.includes(m)) : [];
  } catch {
    return [];
  }
}

/**
 * Prototype only (Gate S.2a closure, Issue #14): simulate a person whose data scope is limited to
 * some sites. It is used to show the screens a single-site manager gets for an employee who also
 * works at another site.
 *
 * Narrow-only: it applies only to a person whose scope is organisation-wide, and replaces it with
 * those sites. A person already limited in any way is left as they are, and nothing is ever widened.
 * Set by a test through sessionStorage as `{ "<personaId>": ["<siteId>", …] }`; nothing else reads it.
 */
export const DEMO_SITE_SCOPE_KEY = 'demo:site-scope';

function siteScopeFor(personaId: string): string[] | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(DEMO_SITE_SCOPE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const ids = map?.[personaId];
    return Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? (ids as string[]) : null;
  } catch {
    return null;
  }
}

export function demoAccessFor(base: (persona: Persona) => EffectiveAccess | null = effectiveAccessFor): (persona: Persona) => EffectiveAccess | null {
  return (persona) => {
    let access = base(persona);
    if (!access) return access;
    const off = withdrawn();
    if (off.length) access = { ...access, grants: access.grants.filter((g) => !off.includes(g.module)) };
    const sites = siteScopeFor(persona.id);
    if (sites && access.scopes.length > 0 && access.scopes.every((s) => s.type === 'all')) access = { ...access, scopes: [{ type: 'site', ids: sites }] };
    return access;
  };
}
