/**
 * Platform plane fixtures (`@repo/fixtures/platform`). Kept apart from the tenant fixtures so the
 * Platform HQ bundle never contains tenant people, units or finance records.
 */
export { PlatformMockTransport } from './transport';
export { PlatformStore, PLATFORM_STORE_KEY } from './store';
export { PLATFORM_PERSONAS, PLATFORM_OPERATOR, findPlatformPersona, SEED_TENANTS, SEED_REQUESTS } from './tenants';
export { CATALOG, MODULES, PRESETS } from './catalog';
export { RATE_CARD, COMMERCIAL_POLICY } from './rate-card';
export { priceContract, toPaisa, fromPaisa } from './pricing';
export { checkDependencies, applyFixes } from './dependencies';
export { checkApproval } from './approvals';
export { defaultContract } from './contracts';
