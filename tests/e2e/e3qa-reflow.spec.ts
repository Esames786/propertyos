import { BO, expect, test, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';
import { seedPrincipal } from '../support/e3-pricing';
import { EDITORS, SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 integration (Wave 2, Agent 2): at 320 px with 200 % text a native select showed one line and cut its
 * chosen text (in Urdu from the start: "…arkspur Heights"). Every select of the E.3 editors is now a FitSelect:
 * the chosen text is drawn in full and wraps, inside its box; the transparent select over it is the same size,
 * keeps the label (accessible name) and the keyboard, and the box shows the focus ring.
 */
const LOCALES: readonly Locale[] = ['en-PK', 'ur-PK'];
const EDITOR_SCREENS = SCREENS.filter((s) => EDITORS.some((e) => e.id === s.id));

for (const locale of LOCALES) {
  test(`COM-001/003/004/005 at 320 px, 200 % text (${locale}): every select shows its whole chosen text, inside its box`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: VIEWPORTS.reflow, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: 2 });
    let checked = 0;
    for (const screen of EDITOR_SCREENS) {
      await screen.prepare(page);
      const boxes = screen.region(page).locator('[data-fit-select]');
      expect(await boxes.count(), screen.id).toBeGreaterThan(1);
      for (const box of await boxes.all()) {
        const r = await box.evaluate((el) => {
          const select = el.querySelector('select')!;
          const text = el.querySelector<HTMLElement>('[data-fit-select-text]')!;
          const b = el.getBoundingClientRect();
          const s = select.getBoundingClientRect();
          const rects = [...text.getClientRects()];
          return {
            chosen: select.selectedOptions[0]?.text ?? '',
            shown: text.textContent ?? '',
            inside: rects.every((x) => x.left >= b.left - 1 && x.right <= b.right + 1),
            fits: text.scrollWidth <= text.clientWidth + 1,
            covers: Math.abs(s.left - b.left) <= 1 && Math.abs(s.right - b.right) <= 1 && Math.abs(s.top - b.top) <= 1 && Math.abs(s.bottom - b.bottom) <= 1,
            inViewport: b.left >= -1 && b.right <= document.documentElement.clientWidth + 1,
            hidden: getComputedStyle(select).opacity === '0',
          };
        });
        const at = `${screen.id} ${locale} "${r.chosen}"`;
        expect(r.shown, at).toBe(r.chosen);
        expect(r, at).toMatchObject({ inside: true, fits: true, covers: true, inViewport: true, hidden: true });
        checked++;
      }
    }
    // The project select keeps its label as its name and shows the whole project name.
    await page.goto(`${BO}${EDITORS[0]!.path}`);
    const select = page.getByTestId('template-project');
    await select.selectOption('prj_heights');
    await expect(page.locator('[data-fit-select]').filter({ has: select }).locator('[data-fit-select-text]')).toHaveText('Larkspur Heights');
    expect(checked).toBeGreaterThanOrEqual(8);
    await ctx.close();
  });
}

test('a FitSelect takes keyboard focus, shows the ring on its box and changes with the arrow keys', async ({ page }) => {
  await seedPrincipal(page, 'res_e3qa_pricing');
  await EDITOR_SCREENS[0]!.prepare(page);
  await page.getByRole('button', { name: /Start new draft/ }).click();
  const select = page.getByTestId('template-project');
  // Reach it from the keyboard (the ring is for keyboard focus): focus, step away and back.
  await select.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(select).toBeFocused();
  await expect(select).toHaveAccessibleName('Project');
  const box = page.locator('[data-fit-select]').filter({ has: select });
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('ArrowDown');
  await expect(select).not.toHaveValue('');
  await expect(box.locator('[data-fit-select-text]')).toHaveText(await select.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]!.text));
});
