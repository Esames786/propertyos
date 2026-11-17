/**
 * `@repo/fixtures/testing`: identities that exist only for automated tests (never part of the demo).
 * The backoffice imports this behind its build-time switch `__E2E_TEST_PRINCIPALS__` (see
 * apps/backoffice/vite.config.ts); every other build drops it. Not re-exported from `@repo/fixtures`.
 */
export { E3QA_TEST_PRINCIPALS, E3QA_PRICING, E3QA_PRICING_PEER, E3QA_PRICING_HEIGHTS, E3QA_PRICING_REVOKED, E3QA_PRICING_CRESCENT } from './developer/pricing/test-principals';
