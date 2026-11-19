/**
 * `@repo/fixtures/testing`: identities that exist only for automated tests (never part of the demo).
 * Only Playwright's backoffice build imports this (apps/backoffice/vite.config.ts swaps the empty
 * `prototype/build-personas` for `build-personas.e2e.ts`); no other build does. Not re-exported from `@repo/fixtures`.
 */
export { E3QA_TEST_PRINCIPALS, E3QA_PRICING, E3QA_PRICING_PEER, E3QA_PRICING_HEIGHTS, E3QA_PRICING_REVOKED, E3QA_PRICING_CRESCENT } from './developer/pricing/test-principals';
