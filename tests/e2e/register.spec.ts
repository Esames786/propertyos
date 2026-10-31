import { MODULE_KEYS } from '../../packages/contracts/src/access';
import { SCREENS } from '../../packages/contracts/src/screens/register.generated';
import { directoryTenant } from '../../packages/fixtures/src/tenant-directory';
import { BO, CU, displayKey, expect, HQ, seed, test } from '../support/fixtures';

/**
 * Blueprint 01 §16, kept for the V3.1 register (adopted in Gate B, D-19): every register address a
 * browser can open resolves to an intentional page (never a 404 or a blank). Built screens show their
 * page; the rest show the planned-screen page with their ID. Rows that are tabs, drawers, wizard
 * steps or parameterised routes have no address of their own and are covered by their screen's tests.
 * Every V2.1 address is still in the list (the sync script refuses a register that drops one).
 */
const hostFor = (screen: (typeof SCREENS)[number]) => {
  if (screen.app === 'platform') return HQ;
  const route = screen.registerRoute;
  return route.startsWith('/customer/') || route.startsWith('/portal/') || route.startsWith('/public/') || route === '/shared/auth/customer-portal-login' ? CU : BO;
};

const OPENABLE = SCREENS.filter((s) => s.concrete && s.registerRoute);
/** Modules Larkspur (the manager's tenant) licenses; other backoffice modules answer "not in your plan" (V3.1). */
const LARKSPUR = new Set<string>(directoryTenant('tnt_larkspur')!.modules.map((m) => m.module));
const outsidePlan = (screen: (typeof SCREENS)[number]) =>
  screen.app === 'backoffice' && hostFor(screen) === BO && (MODULE_KEYS as readonly string[]).includes(screen.module) && !LARKSPUR.has(screen.module);
const chunks = <T,>(list: readonly T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

test.describe('Screen register coverage (V3.1)', () => {
  test('the register keeps every V2.1 screen and adds the V3.1 families', () => {
    const ids = new Set(SCREENS.map((s) => s.id));
    // Gate B final adds GLOBAL-014 (My access) and HQ-026–028 (policy, requests and signup, audit log);
    // Gate C.2 adds BILL-016 (billing controls) and BILL-017 (payer changes).
    // Gate D.1 adopts its V3.2 rows only (D-43): RES-007, AUTH-007 and ADM-024, and the states
    // RES-009, SITE-009, GLOBAL-015, GLOBAL-016 and PORTAL-041.
    // Gate S.1 adopts its V3.2 rows only: BANK-007, FIN-013, COL-007 and RES-008, and the states
    // BANK-008, BANK-009, FIN-014, BILL-018, COL-008, COL-009 and OWN-006.
    expect(SCREENS.length).toBe(415);
    for (const prefix of ['GLOBAL', 'AUTH', 'SAAS', 'CRM', 'PORTAL', 'WEB', 'HQ', 'SITE', 'BILL', 'ENTRY']) {
      expect([...ids].some((id) => id.startsWith(`${prefix}-`)), prefix).toBe(true);
    }
    expect(SCREENS.filter((s) => s.canonicalId === s.id)).toHaveLength(344);
  });

  for (const [i, group] of chunks(OPENABLE, 25).entries()) {
    test(`register addresses ${i * 25 + 1}–${i * 25 + group.length} of ${OPENABLE.length}`, async ({ page, consoleErrors }) => {
      test.setTimeout(240_000);
      await seed(page, { persona: 'manager' });
      await page.addInitScript((display) => {
        localStorage.setItem('demo:session:customer', JSON.stringify({ personaId: 'resident', projectId: 'all' }));
        // The resident has chosen a text size (otherwise the first-run step is shown first).
        localStorage.setItem(display, JSON.stringify({ version: 1, textScale: 1, chosenAt: '2026-10-26T00:00:00Z' }));
        localStorage.setItem('demo:session:platform', JSON.stringify({ personaId: 'supreme_admin', projectId: 'all' }));
        localStorage.setItem(
          'onboarding:v1:platform:supreme_admin:platform',
          JSON.stringify({ profile: { tenantId: 'platform', personaId: 'supreme_admin', app: 'platform', welcomeDecision: 'declined', autoOffer: false, seenModules: [], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }),
        );
      }, displayKey('resident'));
      for (const screen of group) {
        await page.goto(`${hostFor(screen)}${screen.registerRoute}`);
        await expect(page.locator('h1').first(), `${screen.id} ${screen.registerRoute}`).toBeVisible();
        if (outsidePlan(screen)) {
          await expect(page.getByTestId('access-outcome'), `${screen.id} outside the plan`).toHaveAttribute('data-module', screen.module);
        } else if (screen.status === 'planned') {
          await expect(page.getByTestId('planned-screen'), `${screen.id} planned`).toHaveAttribute('data-screen-id', screen.id);
        } else {
          await expect(page.getByTestId('state-not-found'), `${screen.id} built`).toHaveCount(0);
        }
        await page.keyboard.press('Escape');
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});
