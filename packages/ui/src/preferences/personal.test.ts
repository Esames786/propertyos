import { describe, expect, it } from 'vitest';
import { adoptShared, defaultsFrom, essentialsOf, htmlState, migrate, reconcileShared, resetAll, resolve, sharedRecordOf, type PersonalPreferences } from './personal';

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

/**
 * D.1 closure: the essentials (text size, contrast, motion, reading mode, fonts, language) follow a
 * person between the office app and the resident app; theme, palette, spacing and sound do not.
 */
describe('shared essentials', () => {
  const defaults = essentialsOf(defaultsFrom());
  const at = (d: string) => `2026-10-${d}T08:00:00Z`;

  it('marks records saved before the closure: a C.2 size choice or a changed essential counts, defaults do not', () => {
    expect(migrate({ version: 1, textScale: 1, chosenAt: at('20') })?.essentialsAt).toBe(at('20'));
    expect(migrate({ version: 2, textScale: 1, contrast: 'high', updatedAt: at('25') })?.essentialsAt).toBe(at('25'));
    expect(migrate({ version: 2, textScale: 1, theme: 'dark', updatedAt: at('25') })?.essentialsAt).toBeUndefined();
    expect(sharedRecordOf(migrate({ version: 2, theme: 'dark', updatedAt: at('25') }))).toBeNull();
  });

  it("first sharing keeps both apps' deliberate choices; a C.2 size is never lost or asked again", () => {
    // The resident app chose 125 % in C.2; the office later turned on high contrast but kept 100 %.
    const resident = { essentials: { ...defaults, textScale: 1.25 }, changedAt: at('20'), chosenAt: at('20') };
    const office = { essentials: { ...defaults, contrast: 'high' as const }, changedAt: at('25') };
    const r = reconcileShared({ local: office, server: resident, firstSync: true, defaults, now: at('29') });
    expect(r.result?.essentials).toMatchObject({ textScale: 1.25, contrast: 'high' });
    expect(r.result?.chosenAt).toBe(at('20'));
    expect(r).toMatchObject({ adopt: true, push: true });
  });

  it('after that the newer change wins as a whole, in either direction', () => {
    const older = { essentials: { ...defaults, textScale: 1.5 }, changedAt: at('26') };
    const newer = { essentials: { ...defaults, textScale: 1.75, locale: 'ur-PK' as const }, changedAt: at('28') };
    expect(reconcileShared({ local: older, server: newer, firstSync: false, defaults, now: at('29') })).toMatchObject({ adopt: true, push: false, result: { essentials: { textScale: 1.75, locale: 'ur-PK' } } });
    expect(reconcileShared({ local: newer, server: older, firstSync: false, defaults, now: at('29') })).toMatchObject({ adopt: false, push: true });
    expect(reconcileShared({ local: newer, server: newer, firstSync: false, defaults, now: at('29') })).toMatchObject({ adopt: false, push: false });
    expect(reconcileShared({ local: null, server: null, firstSync: true, defaults, now: at('29') }).result).toBeNull();
  });

  it("taking the shared essentials leaves this app's theme, palette, spacing and sound alone", () => {
    const here = { ...defaultsFrom(undefined, at('26')), theme: 'dark' as const, palette: 'ocean' as const, density: 'compact' as const, sound: true };
    const next = adoptShared(here, { essentials: { ...defaults, textScale: 1.5, contrast: 'high', motion: 'reduce', locale: 'ur-PK' }, changedAt: at('28'), chosenAt: at('20') }, at('29'));
    expect(next).toMatchObject({ textScale: 1.5, contrast: 'high', motion: 'reduce', locale: 'ur-PK', theme: 'dark', palette: 'ocean', density: 'compact', sound: true, chosenAt: at('20'), essentialsAt: at('28') });
    expect(next.sharedSince).toBe(at('29'));
  });
});
