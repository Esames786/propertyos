import { describe, expect, it } from 'vitest';
import { defaultsFrom, htmlState, migrate, resetAll, resolve, type PersonalPreferences } from './personal';

/**
 * Gate D.1 personal preferences: one record per person and organisation, the C.2 text-size choice
 * carried over (never asked again), and accessibility always ahead of the organisation's colours.
 */
const env = { systemDark: false, systemReduce: false, org: null };
const prefs = (patch: Partial<PersonalPreferences> = {}): PersonalPreferences => ({ ...defaultsFrom(undefined, '2026-10-26T00:00:00Z'), ...patch });

describe('migrate', () => {
  it('keeps a C.2 resident’s text size and when they chose it', () => {
    const p = migrate({ version: 1, textScale: 1.25, chosenAt: '2026-10-20T08:00:00Z' });
    expect(p?.version).toBe(2);
    expect(p?.textScale).toBe(1.25);
    expect(p?.chosenAt).toBe('2026-10-20T08:00:00Z');
    expect(p?.theme).toBe('system');
  });

  it('starts from the device’s settings and ignores unreadable or unknown values', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({ version: 1, textScale: 3 })).toBeNull();
    expect(migrate({ version: 9 })).toBeNull();
    const p = migrate({ version: 2, textScale: 1.5, theme: 'purple', palette: 'ocean', density: 'compact', reading: 'yes' }, { motion: 'reduce', contrast: 'more', sound: true, textOnlyGuide: false });
    expect(p).toMatchObject({ textScale: 1.5, theme: 'system', palette: 'ocean', density: 'compact', reading: false, motion: 'reduce', contrast: 'more', sound: true });
  });
});

describe('resolve', () => {
  it('uses the organisation’s palette by default, the person’s own choice when made', () => {
    const org = { palette: 'indigo' as const };
    expect(resolve(prefs(), { ...env, org })).toMatchObject({ palette: 'indigo', paletteSource: 'organisation' });
    expect(resolve(prefs({ palette: 'warm' }), { ...env, org })).toMatchObject({ palette: 'warm', paletteSource: 'person' });
    expect(resolve(prefs(), env)).toMatchObject({ palette: 'evergreen', paletteSource: 'default' });
  });

  it('high contrast pauses palettes and organisation colours', () => {
    const r = resolve(prefs({ contrast: 'high' }), { ...env, org: { palette: 'brand', brand: { primary: '#123456', primaryHover: '#0f2b45', primarySoft: '#e3e7ec', darkPrimary: '#8fb0d0', darkPrimaryHover: '#a5c0da', darkPrimarySoft: '#1d2732' } } });
    expect(r.paletteOverridden).toBe(true);
    expect(htmlState(r, null).attributes['data-contrast']).toBe('high');
  });

  it('follows the device for theme and motion unless the person chose; reading mode stops movement', () => {
    expect(resolve(prefs(), { ...env, systemDark: true }).theme).toBe('dark');
    expect(resolve(prefs({ theme: 'light' }), { ...env, systemDark: true }).theme).toBe('light');
    expect(resolve(prefs(), { ...env, systemReduce: true }).reducedMotion).toBe(true);
    expect(resolve(prefs({ motion: 'full' }), { ...env, systemReduce: true }).reducedMotion).toBe(false);
    expect(resolve(prefs({ reading: true }), env).reducedMotion).toBe(true);
  });

  it('writes a brand family only for the brand palette', () => {
    const brand = { primary: '#123456', primaryHover: '#0f2b45', primarySoft: '#e3e7ec', darkPrimary: '#8fb0d0', darkPrimaryHover: '#a5c0da', darkPrimarySoft: '#1d2732' };
    const org = { palette: 'brand' as const, brand };
    const s = htmlState(resolve(prefs({ textScale: 1.5 }), { ...env, org }), org);
    expect(s.attributes['data-palette']).toBe('brand');
    expect(s.properties['--brand-primary']).toBe('#123456');
    expect(s.properties['--text-scale']).toBe('1.5');
    expect(htmlState(resolve(prefs(), env), org).properties['--brand-primary']).toBeUndefined();
  });
});

describe('resetAll', () => {
  it('returns every setting to its default but keeps the fact that a size was chosen, and the language', () => {
    const p = resetAll(prefs({ textScale: 2, theme: 'dark', palette: 'ocean', locale: 'ur-PK', chosenAt: '2026-10-20T08:00:00Z' }), '2026-10-29T00:00:00Z');
    expect(p).toMatchObject({ textScale: 1, theme: 'system', palette: 'organisation', locale: 'ur-PK', chosenAt: '2026-10-20T08:00:00Z' });
  });
});
