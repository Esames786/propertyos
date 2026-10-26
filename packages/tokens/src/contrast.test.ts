import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { CONTRAST, CONTRAST_PAIRS } from './tokens';

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
  for (const m of source.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

const base = colours(block(/@theme\s*\{/));
const moreContrast = { ...base, ...colours(block(/:root\[data-contrast='more'\]\s*\{/)) };

describe.each([
  ['standard', base],
  ['more contrast', moreContrast],
])('token contrast (%s)', (_name, palette) => {
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
