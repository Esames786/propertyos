import { contrastRatio, parseHex } from './contrast';

/** WCAG text contrast (the same threshold as CONTRAST.text in tokens.ts; kept here to avoid an import cycle). */
const TEXT = 4.5;

/**
 * Organisation brand colours (ADM-022, white label) within the platform's guardrails (Gate D.1). From
 * one chosen colour the action family is derived (hover, soft tint, and the dark-theme shades), then
 * every pair the interface uses is checked with the same thresholds as the built-in palettes. A
 * colour that fails is refused with the reasons and the nearest shade that passes. Personal high
 * contrast always replaces brand colours (accessibility beats branding).
 */
export interface BrandFamily {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  darkPrimary: string;
  darkPrimaryHover: string;
  darkPrimarySoft: string;
}

export type BrandCheck = { ok: true; colours: BrandFamily } | { ok: false; failures: string[]; suggestion?: string };

const LIGHT = { panel: '#ffffff', bg: '#f6f6f3', onPrimary: '#ffffff' };
const DARK = { panel: '#15181c', bg: '#0c0e11', onPrimary: '#0c0e11' };

const toHex = (rgb: readonly number[]) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
/** Mix two colours in sRGB (t = share of `b`). */
export const mix = (a: string, b: string, t: number) => {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(x.map((c, i) => c * (1 - t) + y[i]! * t));
};

export const isHexColour = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim());

function family(primary: string): BrandFamily {
  const p = primary.toLowerCase();
  // The dark theme needs a lighter shade of the same hue: the first mix with white that reads on the dark panel.
  let darkPrimary = mix(p, '#ffffff', 0.35);
  for (let t = 0.2; t <= 0.9; t += 0.05) {
    const candidate = mix(p, '#ffffff', t);
    if (contrastRatio(candidate, DARK.panel) >= TEXT + 0.3 && contrastRatio(DARK.onPrimary, candidate) >= TEXT + 0.3) {
      darkPrimary = candidate;
      break;
    }
  }
  return {
    primary: p,
    primaryHover: mix(p, '#000000', 0.18),
    primarySoft: mix(p, '#ffffff', 0.88),
    darkPrimary,
    darkPrimaryHover: mix(darkPrimary, '#ffffff', 0.15),
    darkPrimarySoft: mix(p, DARK.bg, 0.78),
  };
}

function failuresOf(f: BrandFamily): string[] {
  const t = TEXT;
  const checks: Array<[string, number]> = [
    ['primary_on_panel', contrastRatio(f.primary, LIGHT.panel)],
    ['primary_on_page', contrastRatio(f.primary, LIGHT.bg)],
    ['primary_on_soft', contrastRatio(f.primary, f.primarySoft)],
    ['label_on_primary', contrastRatio(LIGHT.onPrimary, f.primary)],
    ['label_on_hover', contrastRatio(LIGHT.onPrimary, f.primaryHover)],
    ['dark_primary_on_panel', contrastRatio(f.darkPrimary, DARK.panel)],
    ['dark_primary_on_page', contrastRatio(f.darkPrimary, DARK.bg)],
    ['dark_primary_on_soft', contrastRatio(f.darkPrimary, f.darkPrimarySoft)],
    ['dark_label_on_primary', contrastRatio(DARK.onPrimary, f.darkPrimary)],
    ['dark_label_on_hover', contrastRatio(DARK.onPrimary, f.darkPrimaryHover)],
  ];
  return checks.filter(([, r]) => r < t).map(([name]) => name);
}

/** Validate a brand colour; when it fails, suggest the closest darker shade that passes. */
export function checkBrand(hex: string): BrandCheck {
  if (!isHexColour(hex)) return { ok: false, failures: ['not_a_colour'] };
  const f = family(hex);
  const failures = failuresOf(f);
  if (!failures.length) return { ok: true, colours: f };
  for (let t = 0.05; t <= 0.8; t += 0.05) {
    const darker = mix(hex, '#000000', t);
    if (!failuresOf(family(darker)).length) return { ok: false, failures, suggestion: darker };
  }
  return { ok: false, failures };
}
