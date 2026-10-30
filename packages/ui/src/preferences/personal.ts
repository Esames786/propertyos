import type { SharedAccessibility, SharedAccessibilityRecord } from '@repo/contracts';
import type { AppLocale } from '@repo/i18n';

/**
 * The personalization hub's model (Gate D.1; V3.1 §05 "Every user controls their experience"). Pure
 * functions only, so the rules are table-tested: what a saved record means, how an older record is
 * upgraded without asking again, and how a person's choices combine with the device and with the
 * organisation's colours. Priority (V3.1 §05): accessibility and legibility first, then the person's
 * own appearance choices, then the organisation's colours, then the platform defaults.
 */

/** 100 %, 112 %, 125 %, 150 %, 175 %, 200 % (WCAG 1.4.4 asks for 200 % without loss). */
export const TEXT_SCALES = [1, 1.12, 1.25, 1.5, 1.75, 2] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
/** Offered at first run: Small, Comfortable, Large, Extra large (owner, C.2). */
export const FIRST_RUN_SCALES: readonly TextScale[] = [1, 1.12, 1.25, 1.5];
export const DEFAULT_TEXT_SCALE: TextScale = 1;

export const THEMES = ['system', 'light', 'dark'] as const;
export const CONTRASTS = ['system', 'standard', 'more', 'high'] as const;
/** 'organisation' follows the organisation's colours (Evergreen when it has none). */
export const PALETTES = ['organisation', 'evergreen', 'ocean', 'indigo', 'warm'] as const;
export const ORG_PALETTES = ['evergreen', 'ocean', 'indigo', 'warm', 'brand'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const LATIN_FONTS = ['geist', 'system', 'readable'] as const;
export const URDU_FONTS = ['naskh', 'nastaliq'] as const;
export const MOTIONS = ['system', 'reduce', 'full'] as const;
export const VOLUMES = ['quiet', 'normal'] as const;

export type Theme = (typeof THEMES)[number];
export type Contrast = (typeof CONTRASTS)[number];
export type Palette = (typeof PALETTES)[number];
export type OrgPalette = (typeof ORG_PALETTES)[number];
export type Density = (typeof DENSITIES)[number];
export type LatinFont = (typeof LATIN_FONTS)[number];
export type UrduFont = (typeof URDU_FONTS)[number];
export type Motion = (typeof MOTIONS)[number];
export type Volume = (typeof VOLUMES)[number];

export interface PersonalPreferences {
  version: 2;
  textScale: TextScale;
  theme: Theme;
  contrast: Contrast;
  palette: Palette;
  density: Density;
  fontLatin: LatinFont;
  fontUrdu: UrduFont;
  motion: Motion;
  /** Simplified reading mode: decoration hidden, calmer, more line height. */
  reading: boolean;
  /** Interface sounds: opt-in, OFF by default (blueprint 01 §2). */
  sound: boolean;
  volume: Volume;
  /** A short vibration with success and error messages, on phones that support it. Off by default. */
  haptics: boolean;
  /** Open tours as a text guide instead of the spotlight. */
  textOnlyGuide: boolean;
  /** The language this person chose while signed in (applied when they sign in again). */
  locale?: AppLocale;
  /** When the person chose a text size (first run or settings). Absent: the first-run step is still due. */
  chosenAt?: string;
  /** When a shared accessibility essential last changed here (D.1 closure); absent: never chosen here. */
  essentialsAt?: string;
  /** When this app's record was first reconciled with the person's shared essentials. */
  sharedSince?: string;
  updatedAt: string;
}

/** The device's own settings (before anyone signs in), kept as before Gate D.1 under `pref:a11y`. */
export interface DevicePreferences {
  motion: Motion;
  contrast: 'system' | 'standard' | 'more';
  sound: boolean;
  textOnlyGuide: boolean;
}

export const DEVICE_DEFAULTS: DevicePreferences = { motion: 'system', contrast: 'system', sound: false, textOnlyGuide: false };

/** Colours an organisation chose for everyone (ADM-022). `brand` carries validated custom colours. */
export interface OrgAppearance {
  palette: OrgPalette;
  brand?: BrandColours;
}

export interface BrandColours {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  darkPrimary: string;
  darkPrimaryHover: string;
  darkPrimarySoft: string;
}

export const isTextScale = (v: unknown): v is TextScale => (TEXT_SCALES as readonly unknown[]).includes(v);
export const percentOf = (s: TextScale) => Math.round(s * 100);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback);

/** A new person's settings: the device's accessibility choices carry over, everything else is default. */
export function defaultsFrom(device: DevicePreferences = DEVICE_DEFAULTS, now = new Date().toISOString()): PersonalPreferences {
  return {
    version: 2,
    textScale: DEFAULT_TEXT_SCALE,
    theme: 'system',
    contrast: device.contrast,
    palette: 'organisation',
    density: 'comfortable',
    fontLatin: 'geist',
    fontUrdu: 'naskh',
    motion: device.motion,
    reading: false,
    sound: device.sound,
    volume: 'normal',
    haptics: false,
    textOnlyGuide: device.textOnlyGuide,
    updatedAt: now,
  };
}

export function readDevice(raw: unknown): DevicePreferences {
  const r = (raw ?? {}) as Partial<DevicePreferences>;
  return {
    motion: oneOf(MOTIONS, r.motion, DEVICE_DEFAULTS.motion),
    contrast: oneOf(['system', 'standard', 'more'] as const, r.contrast, DEVICE_DEFAULTS.contrast),
    sound: typeof r.sound === 'boolean' ? r.sound : DEVICE_DEFAULTS.sound,
    textOnlyGuide: typeof r.textOnlyGuide === 'boolean' ? r.textOnlyGuide : DEVICE_DEFAULTS.textOnlyGuide,
  };
}

/**
 * A stored record as today's model, or null when there is none (or it is unreadable).
 * - Version 2: every field is checked; an unknown value falls back to its default.
 * - Version 1 (Gate C.2: text size only): upgraded with the device's settings, keeping the size and
 *   when it was chosen, so a resident who chose a size in C.2 is never asked again (owner, D.1).
 */
export function migrate(raw: unknown, device: DevicePreferences = DEVICE_DEFAULTS): PersonalPreferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = defaultsFrom(device, typeof r.updatedAt === 'string' ? r.updatedAt : typeof r.chosenAt === 'string' ? r.chosenAt : new Date(0).toISOString());
  if (r.version === 1) {
    if (!isTextScale(r.textScale)) return null;
    return withLegacyEssentialsAt({ ...base, textScale: r.textScale, ...(typeof r.chosenAt === 'string' ? { chosenAt: r.chosenAt } : {}) }, device);
  }
  if (r.version !== 2) return null;
  return withLegacyEssentialsAt({
    version: 2,
    textScale: isTextScale(r.textScale) ? r.textScale : base.textScale,
    theme: oneOf(THEMES, r.theme, base.theme),
    contrast: oneOf(CONTRASTS, r.contrast, base.contrast),
    palette: oneOf(PALETTES, r.palette, base.palette),
    density: oneOf(DENSITIES, r.density, base.density),
    fontLatin: oneOf(LATIN_FONTS, r.fontLatin, base.fontLatin),
    fontUrdu: oneOf(URDU_FONTS, r.fontUrdu, base.fontUrdu),
    motion: oneOf(MOTIONS, r.motion, base.motion),
    reading: typeof r.reading === 'boolean' ? r.reading : base.reading,
    sound: typeof r.sound === 'boolean' ? r.sound : base.sound,
    volume: oneOf(VOLUMES, r.volume, base.volume),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : base.haptics,
    textOnlyGuide: typeof r.textOnlyGuide === 'boolean' ? r.textOnlyGuide : base.textOnlyGuide,
    ...(r.locale === 'en-PK' || r.locale === 'ur-PK' ? { locale: r.locale } : {}),
    ...(typeof r.chosenAt === 'string' ? { chosenAt: r.chosenAt } : {}),
    ...(typeof r.essentialsAt === 'string' ? { essentialsAt: r.essentialsAt } : {}),
    ...(typeof r.sharedSince === 'string' ? { sharedSince: r.sharedSince } : {}),
    updatedAt: base.updatedAt,
  }, device);
}

// ---------------------------------------------------------------- shared accessibility (D.1 closure)

/**
 * The essentials that follow a person across the office app and the resident app (owner, D.1
 * closure): text size, contrast, motion, reading mode, fonts and language. Theme, palette, spacing,
 * sound and tours stay with each app.
 */
export const SHARED_FIELDS = ['textScale', 'contrast', 'motion', 'reading', 'fontLatin', 'fontUrdu', 'locale'] as const;
export type SharedField = (typeof SHARED_FIELDS)[number];

export function essentialsOf(p: PersonalPreferences): SharedAccessibility {
  return { textScale: p.textScale, contrast: p.contrast, motion: p.motion, reading: p.reading, fontLatin: p.fontLatin, fontUrdu: p.fontUrdu, ...(p.locale ? { locale: p.locale } : {}) };
}

/** This app's record as the shared record, or null while no essential was ever chosen here. */
export function sharedRecordOf(p: PersonalPreferences | null): SharedAccessibilityRecord | null {
  if (!p?.essentialsAt) return null;
  return { essentials: essentialsOf(p), changedAt: p.essentialsAt, ...(p.chosenAt ? { chosenAt: p.chosenAt } : {}) };
}

const sameEssentials = (a: SharedAccessibility, b: SharedAccessibility) => SHARED_FIELDS.every((k) => a[k] === b[k]);

/** Whether a change touches an essential (a text-size choice counts too). */
export const changesEssentials = (prev: PersonalPreferences, next: PersonalPreferences) => !sameEssentials(essentialsOf(prev), essentialsOf(next)) || prev.chosenAt !== next.chosenAt;

/**
 * Records saved before the closure: an essential that differs from the defaults, or a text size the
 * person chose (C.2), is a deliberate choice and is kept when the apps first share them.
 */
function withLegacyEssentialsAt(p: PersonalPreferences, device: DevicePreferences): PersonalPreferences {
  if (p.essentialsAt) return p;
  const chosen = !sameEssentials(essentialsOf(p), essentialsOf(defaultsFrom(device)));
  const at = chosen ? p.updatedAt : p.chosenAt;
  return at ? { ...p, essentialsAt: at } : p;
}

const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * How this app's record and the person's shared record come together:
 * - the first time an app shares (a record saved before the closure), field by field: a deliberate
 *   choice beats a default, and when both apps chose differently, the more recent choice wins;
 * - after that, the more recent change wins as a whole;
 * - a text-size choice made in either app is kept, so neither app asks again.
 * "adopt" updates this app; "push" updates the shared record.
 */
export function reconcileShared(input: {
  local: SharedAccessibilityRecord | null;
  server: SharedAccessibilityRecord | null;
  firstSync: boolean;
  defaults: SharedAccessibility;
  now: string;
}): { result: SharedAccessibilityRecord | null; adopt: boolean; push: boolean } {
  const { local, server, firstSync, defaults, now } = input;
  if (!local && !server) return { result: null, adopt: false, push: false };
  if (!server) return { result: local, adopt: false, push: true };
  if (!local) return { result: server, adopt: true, push: false };
  const chosenAt = earliest(local.chosenAt, server.chosenAt);
  const withChosen = (r: SharedAccessibilityRecord): SharedAccessibilityRecord => ({ ...r, ...(chosenAt ? { chosenAt } : {}) });
  if (firstSync) {
    const localNewer = local.changedAt > server.changedAt;
    const essentials: Record<string, unknown> = {};
    for (const k of SHARED_FIELDS) {
      const lv = local.essentials[k];
      const sv = server.essentials[k];
      const dv = defaults[k];
      const value = lv === sv ? lv : lv !== dv && sv === dv ? lv : sv !== dv && lv === dv ? sv : localNewer ? lv : sv;
      if (value !== undefined) essentials[k] = value;
    }
    const merged = essentials as unknown as SharedAccessibility;
    const result = withChosen({ essentials: merged, changedAt: now });
    return {
      result,
      adopt: !sameEssentials(merged, local.essentials) || local.chosenAt !== result.chosenAt,
      push: !sameEssentials(merged, server.essentials) || server.chosenAt !== result.chosenAt,
    };
  }
  if (server.changedAt > local.changedAt) return { result: withChosen(server), adopt: true, push: server.chosenAt !== chosenAt };
  if (local.changedAt > server.changedAt) return { result: withChosen(local), adopt: local.chosenAt !== chosenAt, push: true };
  if (!sameEssentials(local.essentials, server.essentials) || local.chosenAt !== server.chosenAt) return { result: withChosen(server), adopt: true, push: server.chosenAt !== chosenAt };
  return { result: local, adopt: false, push: false };
}

/** This app's record after taking the shared essentials (theme, palette, spacing and sound untouched). */
export function adoptShared(p: PersonalPreferences, rec: SharedAccessibilityRecord, now: string): PersonalPreferences {
  const e = rec.essentials;
  return {
    ...p,
    textScale: isTextScale(e.textScale) ? e.textScale : p.textScale,
    contrast: oneOf(CONTRASTS, e.contrast, p.contrast),
    motion: oneOf(MOTIONS, e.motion, p.motion),
    reading: typeof e.reading === 'boolean' ? e.reading : p.reading,
    fontLatin: oneOf(LATIN_FONTS, e.fontLatin, p.fontLatin),
    fontUrdu: oneOf(URDU_FONTS, e.fontUrdu, p.fontUrdu),
    ...(e.locale ? { locale: e.locale } : {}),
    ...(rec.chosenAt ? { chosenAt: rec.chosenAt } : {}),
    essentialsAt: rec.changedAt,
    sharedSince: p.sharedSince ?? now,
    updatedAt: now,
  };
}

/** What the page actually shows, after the device and the organisation are taken into account. */
export interface ResolvedAppearance {
  theme: 'light' | 'dark';
  /** Applied as data-contrast; undefined follows the device's own contrast setting. */
  contrast: 'standard' | 'more' | 'high' | undefined;
  /** The palette in force (high contrast replaces it with its own colours). */
  palette: OrgPalette;
  /** Why this palette: the person's choice, the organisation's, or the platform default. */
  paletteSource: 'person' | 'organisation' | 'default';
  /** True when high contrast is on: palettes and organisation colours are paused (accessibility wins). */
  paletteOverridden: boolean;
  reducedMotion: boolean;
  motion: Motion;
  density: Density;
  reading: boolean;
  fontLatin: LatinFont;
  fontUrdu: UrduFont;
  textScale: TextScale;
}

export function resolve(p: PersonalPreferences, env: { systemDark: boolean; systemReduce: boolean; org: OrgAppearance | null }): ResolvedAppearance {
  const theme = p.theme === 'system' ? (env.systemDark ? 'dark' : 'light') : p.theme;
  const orgPalette = env.org?.palette === 'brand' && !env.org.brand ? 'evergreen' : env.org?.palette;
  const palette: OrgPalette = p.palette !== 'organisation' ? p.palette : (orgPalette ?? 'evergreen');
  const paletteSource = p.palette !== 'organisation' ? 'person' : orgPalette ? 'organisation' : 'default';
  return {
    theme,
    contrast: p.contrast === 'system' ? undefined : p.contrast,
    palette,
    paletteSource,
    paletteOverridden: p.contrast === 'high',
    reducedMotion: p.motion === 'reduce' || (p.motion === 'system' && env.systemReduce) || p.reading,
    motion: p.motion,
    density: p.density,
    reading: p.reading,
    fontLatin: p.fontLatin,
    fontUrdu: p.fontUrdu,
    textScale: p.textScale,
  };
}

/** Attributes and custom properties written on <html> (the design tokens read them). */
export function htmlState(r: ResolvedAppearance, org: OrgAppearance | null): { attributes: Record<string, string | undefined>; properties: Record<string, string | undefined> } {
  const brand = r.palette === 'brand' ? org?.brand : undefined;
  return {
    attributes: {
      'data-theme': r.theme,
      'data-contrast': r.contrast,
      'data-palette': r.palette,
      'data-density': r.density === 'compact' ? 'compact' : undefined,
      'data-reading': r.reading ? 'on' : undefined,
      'data-font-latin': r.fontLatin === 'geist' ? undefined : r.fontLatin,
      'data-font-urdu': r.fontUrdu === 'naskh' ? undefined : r.fontUrdu,
      // 'full' keeps movement even when the device asks to reduce it (the person chose so).
      'data-motion': r.reducedMotion ? 'reduce' : r.motion === 'full' ? 'full' : undefined,
      'data-text-scale': String(percentOf(r.textScale)),
    },
    properties: {
      '--text-scale': r.textScale === DEFAULT_TEXT_SCALE ? undefined : String(r.textScale),
      '--brand-primary': brand?.primary,
      '--brand-primary-hover': brand?.primaryHover,
      '--brand-primary-soft': brand?.primarySoft,
      '--brand-dark-primary': brand?.darkPrimary,
      '--brand-dark-primary-hover': brand?.darkPrimaryHover,
      '--brand-dark-primary-soft': brand?.darkPrimarySoft,
    },
  };
}

/** Fields "Reset to default" returns; the text-size choice is kept as made, so first run does not return. */
export function resetAll(p: PersonalPreferences, now = new Date().toISOString()): PersonalPreferences {
  return { ...defaultsFrom(DEVICE_DEFAULTS, now), ...(p.locale ? { locale: p.locale } : {}), chosenAt: p.chosenAt ?? now };
}
