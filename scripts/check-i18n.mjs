#!/usr/bin/env node
/**
 * Dictionary checks (blueprint 04: "missing keys are tracked, not silently shown as cryptic IDs"):
 * - every locale has the same namespaces and keys as en-PK (plural suffixes compared by base key);
 * - no empty values;
 * - interpolation placeholders match between locales.
 * Exits non-zero on any problem.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/i18n/locales');
const BASE = 'en-PK';
const locales = readdirSync(dir);
const problems = [];

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

const placeholders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
const load = (locale, file) => new Map(flatten(JSON.parse(readFileSync(join(dir, locale, file), 'utf8'))));

const baseFiles = readdirSync(join(dir, BASE)).filter((f) => f.endsWith('.json'));
let keyCount = 0;

for (const file of baseFiles) {
  const base = load(BASE, file);
  keyCount += base.size;
  for (const [key, value] of base) if (!String(value).trim()) problems.push(`${BASE}/${file}: empty value for ${key}`);
  for (const locale of locales.filter((l) => l !== BASE)) {
    let other;
    try {
      other = load(locale, file);
    } catch {
      problems.push(`${locale}: missing namespace file ${file}`);
      continue;
    }
    for (const [key, value] of base) {
      if (!other.has(key)) problems.push(`${locale}/${file}: missing ${key}`);
      else if (!String(other.get(key)).trim()) problems.push(`${locale}/${file}: empty value for ${key}`);
      // A temporary English stub (marked ⟦EN⟧ while a translation is pending) never ships.
      else if (String(other.get(key)).includes('⟦EN⟧')) problems.push(`${locale}/${file}: untranslated stub for ${key}`);
      else if (placeholders(value) !== placeholders(other.get(key)))
        problems.push(`${locale}/${file}: placeholders differ for ${key} ({${placeholders(value)}} vs {${placeholders(other.get(key))}})`);
    }
    for (const key of other.keys()) if (!base.has(key)) problems.push(`${locale}/${file}: extra key ${key} (not in ${BASE})`);
  }
}

if (problems.length) {
  console.error(`i18n: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`i18n: ${locales.length} locales × ${baseFiles.length} namespaces, ${keyCount} keys each, parity OK`);
