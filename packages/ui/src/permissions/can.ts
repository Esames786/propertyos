import type { Permission, Persona } from '@repo/contracts';

export interface Guarded {
  permission?: Permission | readonly Permission[];
}

/** True when the persona holds every listed permission (or none is required). */
export function allowed(persona: Pick<Persona, 'permissions'> | null, item: Guarded): boolean {
  if (!item.permission) return persona !== null;
  const required = Array.isArray(item.permission) ? item.permission : [item.permission];
  return persona !== null && required.every((p) => persona.permissions.includes(p as Permission));
}

/** Filters navigation items, actions or tour steps to what the persona may use. */
export function filterAllowed<T extends Guarded>(persona: Pick<Persona, 'permissions'> | null, items: readonly T[]): T[] {
  return items.filter((item) => allowed(persona, item));
}
