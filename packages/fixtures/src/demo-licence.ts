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

export function demoAccessFor(base: (persona: Persona) => EffectiveAccess | null = effectiveAccessFor): (persona: Persona) => EffectiveAccess | null {
  return (persona) => {
    const access = base(persona);
    const off = withdrawn();
    if (!access || !off.length) return access;
    return { ...access, grants: access.grants.filter((g) => !off.includes(g.module)) };
  };
}
