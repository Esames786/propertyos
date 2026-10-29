import { describe, expect, it } from 'vitest';
import { checkBrand } from './brand';
import { contrastRatio } from './tokens';

/** ADM-022 guardrails: a custom brand colour is used only when every contrast pair passes, light and dark. */
describe('checkBrand', () => {
  it('accepts a readable colour and works out the other shades', () => {
    const r = checkBrand('#1e4d42');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(contrastRatio('#ffffff', r.colours.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.colours.darkPrimary, '#15181c')).toBeGreaterThanOrEqual(4.5);
  });

  it('refuses a pale colour, names what fails, and suggests a darker shade that passes', () => {
    const r = checkBrand('#ffcc00');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failures).toContain('label_on_primary');
    expect(r.suggestion).toMatch(/^#[0-9a-f]{6}$/i);
    expect(checkBrand(r.suggestion!).ok).toBe(true);
  });

  it('refuses anything that is not a six-digit hex colour', () => {
    expect(checkBrand('green')).toEqual({ ok: false, failures: ['not_a_colour'] });
    expect(checkBrand('#fff')).toEqual({ ok: false, failures: ['not_a_colour'] });
  });
});
