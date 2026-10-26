import { SCREENS } from '../../packages/contracts/src/screens/register.generated';
import { BO, CU, expect, seed, test } from '../support/fixtures';

/**
 * Blueprint 01 §16: every screen in the register resolves to an intentional page (never a 404 or a
 * blank). Built screens show their page; the rest show the planned-screen page with their ID.
 */
const isCustomerHost = (route: string) =>
  route.startsWith('/customer/') || route.startsWith('/portal/') || route.startsWith('/public/') || route === '/shared/auth/customer-portal-login';

const chunks = <T,>(list: readonly T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

test.describe('Screen register coverage', () => {
  for (const [i, group] of chunks(SCREENS, 25).entries()) {
    test(`register routes ${i * 25 + 1}–${i * 25 + group.length} of ${SCREENS.length}`, async ({ page, consoleErrors }) => {
      test.setTimeout(180_000);
      await seed(page, { persona: 'manager' });
      await page.addInitScript(() => localStorage.setItem('demo:session:customer', JSON.stringify({ personaId: 'resident', projectId: 'all' })));
      for (const screen of group) {
        const host = isCustomerHost(screen.registerRoute) ? CU : BO;
        await page.goto(`${host}${screen.registerRoute}`);
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
