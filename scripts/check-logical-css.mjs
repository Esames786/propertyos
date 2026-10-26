#!/usr/bin/env node
/**
 * RTL guard (blueprint 01 §3: CSS uses logical properties, not fixed left/right).
 * Fails on physical-direction Tailwind utilities in TS/TSX and physical properties in CSS.
 * A CSS rule may opt out with a `logical-exception: <reason>` comment in it or in the rule before it.
 * Inline `style={{ left }}` for measured overlay geometry is allowed (physical by nature).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = ['packages', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'locales']);

const CLASS_RULE =
  /(?<=[\s"'`{:])(?:-?(?:ml|mr|pl|pr)-[\w[\]./-]+|-?(?:left|right)-[\w[\]./-]+|text-(?:left|right)\b|border-[lr](?:-[\w[\]./-]+)?\b|rounded-(?:l|r|tl|tr|bl|br)(?:-[\w[\]./-]+)?\b|float-(?:left|right)\b|clear-(?:left|right)\b|scroll-[mp][lr]-[\w-]+)/g;
const CSS_RULE = /\b(?:margin|padding|border)-(?:left|right)\b|(?<![\w-])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

const problems = [];
for (const base of SCAN) {
  for (const file of walk(join(root, base))) {
    const raw = readFileSync(file, 'utf8');
    // Comments may mention directions ("left-to-right"); only code is checked. Line numbers are kept.
    const text = file.endsWith('.css')
      ? raw
      : raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
    const rel = relative(root, file).replace(/\\/g, '/');
    if (file.endsWith('.css')) {
      const blocks = text.split('}');
      blocks.forEach((block, i) => {
        // Exceptions are declared in comments; violations are only searched in code.
        if (/logical-exception/.test(block) || /logical-exception/.test(blocks[i - 1] ?? '')) return;
        const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of code.matchAll(CSS_RULE)) problems.push(`${rel}: physical CSS "${m[0].trim()}"`);
      });
    } else {
      for (const m of text.matchAll(CLASS_RULE)) {
        const line = text.slice(0, m.index).split('\n').length;
        problems.push(`${rel}:${line}: physical utility "${m[0]}" (use ms-/me-/ps-/pe-/start-/end-/text-start/text-end)`);
      }
    }
  }
}

if (problems.length) {
  console.error(`logical CSS: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('logical CSS: no physical left/right utilities or properties');
