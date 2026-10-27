import type { Page } from '@playwright/test';
import { BO, expect, seed, test } from '../support/fixtures';

async function tabTo(page: Page, matcher: () => Promise<boolean>, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await matcher()) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Focus target not reached by Tab');
}

/** Matches the focused element's accessible-name sources (never <body>, whose text is the whole page). */
const focused = (page: Page, name: RegExp) => () =>
  page.evaluate((src) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || el === document.body) return false;
    const own = el.getAttribute('aria-label') ?? '';
    const labels = [...(el.labels ?? [])].map((l) => l.textContent ?? '').join(' ');
    const labelledBy = (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    const text = el.tagName === 'BUTTON' || el.tagName === 'A' ? (el.textContent ?? '') : '';
    return new RegExp(src, 'i').test(`${own} ${labels} ${labelledBy} ${text}`);
  }, name.source);

/** A focused radio button whose label matches (a text field named "Email" must not count). */
const focusedRadio = (page: Page, name: RegExp) => () =>
  page.evaluate((src) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || el.type !== 'radio') return false;
    return new RegExp(src, 'i').test([...(el.labels ?? [])].map((l) => l.textContent ?? '').join(' '));
  }, name.source);

/**
 * Root cause of the Stage 1.5 intermittent failure: when a listbox popup closes, React Aria moves
 * focus back to its trigger on the next animation frame. Under heavy load the test's next Tab
 * arrived inside that frame, while focus was still on <body>; Tab then started from the top of the
 * page, and the loose "Email" match landed on the Email text field instead of the contact radios.
 * Wait for the popup to close and focus to be back on a real control before tabbing on.
 */
async function afterPopupCloses(page: Page) {
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('[role="listbox"]')))
    .toBe(true);
}

test.describe('Forms lab', () => {
  test('a failed submit focuses the summary; each link focuses its field', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/forms`);
    await page.getByTestId('lab-form-submit').click();
    const summary = page.getByTestId('validation-summary');
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('heading')).toHaveText('Fix 10 problems to continue');
    await summary.getByRole('link', { name: /Mobile number/ }).click();
    await expect(page.getByRole('textbox', { name: 'Mobile number' })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Mobile number' })).toHaveAttribute('aria-invalid', 'true');
  });

  test('the whole form can be completed with the keyboard only', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/lab/forms`);
    await page.getByRole('link', { name: /practice version/ }).focus();

    // Async customer search: type, arrow to a result, Enter selects and prefills contact fields.
    await tabTo(page, focused(page, /Existing customer/));
    await page.keyboard.type('Ay');
    await expect(page.getByRole('option').first()).toBeVisible();
    const combobox = page.getByRole('combobox', { name: /Existing customer/ });
    await expect(async () => {
      await page.keyboard.press('ArrowDown');
      await expect(combobox).toHaveAttribute('aria-activedescendant', /option/, { timeout: 500 });
    }).toPass();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Full name' })).not.toHaveValue('');
    await afterPopupCloses(page);

    await tabTo(page, focused(page, /^\s*CNIC/));
    await page.keyboard.type('9123412345671');
    await expect(page.getByRole('textbox', { name: /CNIC/ })).toHaveValue('91234-1234567-1');

    // Dependent unit picker, operated with Enter/arrows.
    for (const [label, pick] of [
      ['Project', 'Larkspur Heights'],
      ['Tower', 'Tower A'],
      ['Floor', 'Floor 2'],
    ] as const) {
      // A Select trigger is named "<current value> <label>", so match the label word anywhere.
      await tabTo(page, focused(page, new RegExp(`\\b${label}\\b`)));
      await page.keyboard.press('Enter');
      const option = page.getByRole('option', { name: new RegExp(pick) }).first();
      await expect(option).toBeVisible();
      for (let i = 0; i < 20 && !(await option.evaluate((el) => el.hasAttribute('data-focused'))); i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await afterPopupCloses(page);
    }
    await tabTo(page, focused(page, /\bUnit\b/));
    await page.keyboard.press('Enter');
    const available = page.locator('[role="option"]:not([aria-disabled="true"])').first();
    await expect(available).toBeVisible();
    for (let i = 0; i < 10 && !(await available.evaluate((el) => el.hasAttribute('data-focused'))); i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await afterPopupCloses(page);

    await tabTo(page, focused(page, /Budget/));
    await page.keyboard.type('25000000');

    await tabTo(page, focused(page, /month|day|year|Preferred visit date/));
    await page.keyboard.type('12152026');

    await tabTo(page, focused(page, /Lead source/));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Enter');
    await afterPopupCloses(page);

    await tabTo(page, focused(page, /Interested in/));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await afterPopupCloses(page);

    await tabTo(page, focusedRadio(page, /Phone call|WhatsApp|Email/));
    await page.keyboard.press('Space');
    await expect(page.getByRole('radiogroup', { name: 'Preferred contact method' }).getByRole('radio', { checked: true })).toHaveCount(1);

    await tabTo(page, focused(page, /Choose file/));
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({ name: 'cnic-front.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
    // The name is also announced in the live region; check the visible file list item.
    await expect(page.getByRole('listitem').filter({ hasText: 'cnic-front.png' })).toBeVisible();
    await expect(page.getByTestId('live-polite')).toContainText('cnic-front.png added');

    await tabTo(page, focused(page, /agreed to be contacted/));
    await page.keyboard.press('Space');

    await tabTo(page, focused(page, /Check and submit/));
    await page.keyboard.press('Enter');
    // Validation is asynchronous: wait for whichever outcome appears, then report the fields named
    // by the summary if it failed (instead of an opaque "no toast" timeout).
    const summary = page.getByTestId('validation-summary');
    const toast = page.getByTestId('toast-success');
    await expect(toast.or(summary).first()).toBeVisible();
    if (await summary.isVisible()) throw new Error(`Validation failed: ${await summary.innerText()}`);
    await expect(toast).toContainText('Form is valid');
    await expect(page.getByTestId('validation-summary')).toHaveCount(0);
  });

  test('entries survive leaving the page and coming back (in-memory draft)', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/forms`);
    await page.getByRole('textbox', { name: 'Full name' }).fill('Draft Person');
    await page.getByRole('link', { name: 'Design system lab' }).first().click();
    await expect(page.locator('main h1')).toHaveText('Design system lab');
    await page.goBack();
    await expect(page.getByRole('textbox', { name: 'Full name' })).toHaveValue('Draft Person');
    await expect(page.getByTestId('live-polite')).toContainText('Your unsaved entries were restored.');
    // Drafts are memory-only: nothing personal was written to browser storage.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stored).not.toContain('Draft Person');
  });

  test('the unit picker explains disabled levels and clears children when a parent changes', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/forms`);
    const picker = page.getByTestId('unit-picker');
    await expect(picker).toContainText('Choose a project first.');
    await picker.getByTestId('unit-picker-project').getByRole('button').click();
    await page.getByRole('option', { name: /Larkspur Heights/ }).click();
    await picker.getByTestId('unit-picker-tower').getByRole('button').click();
    await page.getByRole('option', { name: /Tower B/ }).click();
    await picker.getByTestId('unit-picker-project').getByRole('button').click();
    await page.getByRole('option', { name: /Larkspur Gardens/ }).click();
    await expect(page.getByTestId('live-polite')).toContainText('was cleared because Project changed');
    await expect(picker).toContainText('This project has plots and villas');
  });
});
