import { decide, type AccessDecision, type AccessRecord, type EffectiveAccess } from '@repo/contracts';
/**
 * Dual gate for D.3 resident add-ons: a service grant NEVER substitutes for resident_portal.
 * The current resident/flat link and selected site are checked by the common access evaluator.
 * UI and mock endpoints must call the same gate before loading any group content.
 */
export function communityResidentAccess(
  access: EffectiveAccess,
  at: string,
  record: AccessRecord,
  service: 'community_chat' | 'community_hub',
  feature?: `${'community_hub'}.${string}`,
): AccessDecision {
  if (!record.siteId || !record.legalEntityId || !record.unitId) return { allowed: false, reason: 'site_context_missing' };
  const portal = decide(access, { module: 'resident_portal', permission: 'portal.use', record, at, suspension: 'operational' });
  if (!portal.allowed) return portal;
  return decide(access, { module: service, ...(feature ? { feature } : {}), record, at, suspension: 'operational' });
}
