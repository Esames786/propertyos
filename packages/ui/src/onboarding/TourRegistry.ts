import type { ModuleKey, Permission, Persona } from '@repo/contracts';
import type { TourDefinition, TourStep } from './tourTypes';

/**
 * Tours are registered per application and filtered by persona and permission.
 * Unauthorised steps are removed before a tour starts, so their titles are never shown (doc 09 §4).
 */
/** `can` is the session check: the permission AND its module licensed for the tenant. */
export function toursForPersona(
  tours: readonly TourDefinition[],
  persona: Persona | null,
  can: (p: Permission) => boolean = (p) => persona?.permissions.includes(p) ?? false,
  licensed: (m: ModuleKey) => boolean = () => true,
): TourDefinition[] {
  if (!persona) return [];
  return tours.filter(
    (tour) =>
      tour.app === persona.app &&
      (tour.applicablePersonas === '*' || tour.applicablePersonas.includes(persona.id)) &&
      (!tour.requiredPermission || can(tour.requiredPermission)) &&
      resolveSteps(tour, can, licensed).length > 0,
  );
}

export function resolveSteps(tour: TourDefinition, can: (p: Permission) => boolean, licensed: (m: ModuleKey) => boolean = () => true): TourStep[] {
  return tour.steps.filter((step) => (!step.requiredPermission || can(step.requiredPermission)) && (!step.anyModule || step.anyModule.some(licensed)));
}

export function tourForModule(tours: readonly TourDefinition[], moduleId: string): TourDefinition | undefined {
  return tours.find((t) => t.moduleId === moduleId);
}
