/**
 * Gate E.3 (Wave 2 integration): Playwright's build only. With PROPERTYOS_E2E_PRINCIPALS=1, vite.config.ts
 * resolves `./prototype/build-personas` to this module, which adds the unlisted test-only pricing principals.
 * No other build imports it, so a normal build (its files and its sourcemaps) holds no trace of them.
 */
export { E3QA_TEST_PRINCIPALS as BUILD_PERSONAS } from '@repo/fixtures/testing';
