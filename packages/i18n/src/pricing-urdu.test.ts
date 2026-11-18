import { describe, expect, it } from 'vitest';
import en from '../locales/en-PK/pricing.json';
import ur from '../locales/ur-PK/pricing.json';

/**
 * Gate E.3 integration (Wave 2): Urdu wording of the pricing screens. The row actions of COM-001 were written
 * as one run-together word ("سطرداخل", "سطراٹھائیں"); they now read like every other add / remove action of
 * these screens ("… شامل کریں", "… ہٹائیں"), and "accessible" is spelled one way (قابلِ رسائی).
 */
describe('pricing.json (ur-PK)', () => {
  it('row actions are separate words, like the other add and remove actions', () => {
    expect(ur.templateAdd).toBe('سطر شامل کریں');
    expect(ur.templateDelete).toBe('سطر ہٹائیں');
    expect(ur.previewAdd.endsWith('شامل کریں')).toBe(true);
    expect(ur.previewRemove.endsWith('ہٹائیں')).toBe(true);
  });

  it('spells "accessible" one way and has no run-together row words', () => {
    const all = Object.values(ur).join('\n');
    expect(all).not.toMatch(/قابل رسائی/);
    expect(all).not.toMatch(/سطر(?:داخل|اٹھا)/);
  });

  it('has exactly the English keys', () => {
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
  });
});
