import type { Permission, Persona } from '@repo/contracts';
import type { TourDefinition, TourStep } from './tourTypes';

/**
 * Tours are registered per application and filtered by persona and permission.
 * Unauthorised steps are removed before a tour starts, so their titles are never shown (doc 09 §4).
 */
export function toursForPersona(tours: readonly TourDefinition[], persona: Persona | null): TourDefinition[] {
  if (!persona) return [];
  return tours.filter(
    (tour) =>
      tour.app === persona.app &&
      (tour.applicablePersonas === '*' || tour.applicablePersonas.includes(persona.id)) &&
      resolveSteps(tour, (p) => persona.permissions.includes(p)).length > 0,
  );
}

export function resolveSteps(tour: TourDefinition, can: (p: Permission) => boolean): TourStep[] {
  return tour.steps.filter((step) => !step.requiredPermission || can(step.requiredPermission));
}

export function tourForModule(tours: readonly TourDefinition[], moduleId: string): TourDefinition | undefined {
  return tours.find((t) => t.moduleId === moduleId);
}
