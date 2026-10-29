import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { CONTRAST, CONTRAST_PAIRS, IMAGE_SCRIM, ORDINAL_RAMPS } from './tokens';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

function block(selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`Block not found: ${selector}`);
  const start = css.indexOf('{', match.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function colours(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

const toHex = (rgb: readonly number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

const base = colours(block(/@theme\s*\{/));
const moreContrast = { ...base, ...colours(block(/:root\[data-contrast='more'\]\s*\{/)) };
const dark = { ...base, ...colours(block(/:root\[data-theme='dark'\]\s*\{/)) };
const highLight = { ...base, ...colours(block(/:root\[data-contrast='high'\]\[data-theme\]\s*\{/)) };
const highDark = { ...dark, ...colours(block(/:root\[data-contrast='high'\]\[data-theme='dark'\]\s*\{/)) };
/** Gate D.1 palettes: each changes the action colour family only, in light and dark. */
const PALETTES = ['ocean', 'indigo', 'warm'] as const;
const paletteSets: Array<[string, Record<string, string>]> = PALETTES.flatMap((p): Array<[string, Record<string, string>]> => [
  [`${p} (light)`, { ...base, ...colours(block(new RegExp(`:root\\[data-palette='${p}'\\]\\s*\\{`))) }],
  [`${p} (dark)`, { ...dark, ...colours(block(new RegExp(`:root\\[data-theme='dark'\\]\\[data-palette='${p}'\\]\\s*\\{`))) }],
]);

const SETS: Array<[string, Record<string, string>]> = [
  ['standard', base],
  ['more contrast', moreContrast],
  ['dark', dark],
  ['high contrast (light)', highLight],
  ['high contrast (dark)', highDark],
  ...paletteSets,
];

describe.each(SETS)('token contrast (%s)', (_name, palette) => {
  it.each(CONTRAST_PAIRS.map((p) => [p.usage, p] as const))('%s', (_usage, pair) => {
    const fg = palette[pair.fg];
    const bg = palette[pair.bg];
    expect(fg, `token --color-${pair.fg}`).toBeDefined();
    expect(bg, `token --color-${pair.bg}`).toBeDefined();
    const ratio = contrastRatio(fg!, bg!);
    expect(
      ratio,
      `${pair.fg} on ${pair.bg} = ${ratio.toFixed(2)}:1, needs ${CONTRAST[pair.kind]}:1`,
    ).toBeGreaterThanOrEqual(CONTRAST[pair.kind]);
  });
});

describe('blueprint conflicts resolved', () => {
  it('C1: decorative border stays decorative; control border passes 3:1', () => {
    expect(contrastRatio(base.border!, base.panel!)).toBeLessThan(3);
    expect(contrastRatio(base['border-control']!, base.panel!)).toBeGreaterThanOrEqual(3);
  });

  it('C2: focus ring contrasts with the page background around a primary fill', () => {
    expect(base.focus).toBe(base.primary);
    expect(contrastRatio(base.focus!, base.bg!)).toBeGreaterThanOrEqual(3);
  });
});

describe('Stage 1.5 design system rules', () => {
  it('brass is decorative only: below text contrast, so it must never carry text', () => {
    expect(contrastRatio(base.brass!, base.panel!)).toBeLessThan(CONTRAST.text);
    expect(contrastRatio(base.brass!, base.bg!)).toBeLessThan(CONTRAST.nonText);
  });

  it.each(Object.entries(ORDINAL_RAMPS))('%s ordinal ramp darkens step by step and its light end clears 2:1', (_name, steps) => {
    const ratios = steps.map((s) => contrastRatio(base[s]!, base.panel!));
    expect(ratios[0]).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]!);
  });

  it('white text on photography keeps 4.5:1 at the weakest point of the scrim, over a white pixel', () => {
    const a = IMAGE_SCRIM.textZoneMinAlpha;
    const composite = toHex(IMAGE_SCRIM.rgb.map((c) => c * a + 255 * (1 - a)));
    expect(contrastRatio('#ffffff', composite)).toBeGreaterThanOrEqual(CONTRAST.text);
  });

  it('chips on photography keep white text at 4.5:1 over a white pixel', () => {
    const a = IMAGE_SCRIM.chipAlpha;
    const composite = toHex(IMAGE_SCRIM.rgb.map((c) => c * a + 255 * (1 - a)));
    expect(contrastRatio('#ffffff', composite)).toBeGreaterThanOrEqual(CONTRAST.text);
  });
});
