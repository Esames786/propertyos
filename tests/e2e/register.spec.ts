import { SCREENS } from '../../packages/contracts/src/screens/register.generated';
import { BO, CU, expect, HQ, seed, test } from '../support/fixtures';

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
const chunks = <T,>(list: readonly T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

test.describe('Screen register coverage (V3.1)', () => {
  test('the register keeps every V2.1 screen and adds the V3.1 families', () => {
    const ids = new Set(SCREENS.map((s) => s.id));
    expect(SCREENS.length).toBe(390);
    for (const prefix of ['GLOBAL', 'AUTH', 'SAAS', 'CRM', 'PORTAL', 'WEB', 'HQ', 'SITE', 'BILL', 'ENTRY']) {
      expect([...ids].some((id) => id.startsWith(`${prefix}-`)), prefix).toBe(true);
    }
    expect(SCREENS.filter((s) => s.canonicalId === s.id)).toHaveLength(331);
  });

  for (const [i, group] of chunks(OPENABLE, 25).entries()) {
    test(`register addresses ${i * 25 + 1}–${i * 25 + group.length} of ${OPENABLE.length}`, async ({ page, consoleErrors }) => {
      test.setTimeout(240_000);
      await seed(page, { persona: 'manager' });
      await page.addInitScript(() => {
        localStorage.setItem('demo:session:customer', JSON.stringify({ personaId: 'resident', projectId: 'all' }));
        localStorage.setItem('demo:session:platform', JSON.stringify({ personaId: 'supreme_admin', projectId: 'all' }));
        localStorage.setItem(
          'onboarding:v1:platform:supreme_admin:platform',
          JSON.stringify({ profile: { tenantId: 'platform', personaId: 'supreme_admin', app: 'platform', welcomeDecision: 'declined', autoOffer: false, seenModules: [], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }),
        );
      });
      for (const screen of group) {
        await page.goto(`${hostFor(screen)}${screen.registerRoute}`);
        await expect(page.locator('h1').first(), `${screen.id} ${screen.registerRoute}`).toBeVisible();
        if (screen.status === 'planned') {
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
