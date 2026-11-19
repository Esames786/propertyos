#!/usr/bin/env node
/**
 * Gate E.3 (Wave 2 integration): proves where the test-only pricing principals are compiled in.
 *
 *   node scripts/check-test-principals.mjs                  a normal build: no trace anywhere (exit 1 otherwise)
 *   node scripts/check-test-principals.mjs --expect-present Playwright's build (PROPERTYOS_E2E_PRINCIPALS=1):
 *                                                           the backoffice holds them, the other apps do not
 *
 * Scans every file of apps/{backoffice,customer-web,platform-hq}/dist, sourcemaps (`.map`, whose sourcesContent
 * carries the original sources) included. The needles are read from the principals' own source, so a new or
 * renamed principal is checked without editing this file: every id, principal id, display name and exported
 * name, plus the module paths and names that would bring them in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const APPS = ['backoffice', 'customer-web', 'platform-hq'];
const expectPresent = process.argv.includes('--expect-present');

const source = readFileSync(join(ROOT, 'packages/fixtures/src/developer/pricing/test-principals.ts'), 'utf8');
const found = (re) => [...source.matchAll(re)].map((m) => m[1]);
const ids = found(/principal\('(res_e3qa_[\w]+)'/g);
const principalIds = found(/principal\('res_e3qa_[\w]+', '(usr_e3qa_[\w]+)'/g);
const names = found(/principal\('res_e3qa_[\w]+', 'usr_e3qa_[\w]+', '([^']+)'/g);
const exported = found(/^export const (E3QA_[A-Z_]+)/gm);
if (ids.length < 5 || principalIds.length < 5 || names.length < 5 || exported.length < 6) {
  console.error(`could not read the principals' source (ids ${ids.length}, principal ids ${principalIds.length}, names ${names.length}, exports ${exported.length})`);
  process.exit(2);
}
const NEEDLES = [...new Set([
  'E3QA', 'e3qa', 'E3 QA', 'usr_e3qa', 'res_e3qa',
  '@repo/fixtures/testing', 'fixtures/src/testing', 'test-principals', 'build-personas.e2e',
  ...ids, ...principalIds, ...names, ...exported,
])];

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

let failed = false;
const report = [];
for (const app of APPS) {
  const dist = join(ROOT, 'apps', app, 'dist');
  let all;
  try { all = files(dist); } catch { console.error(`${app}: no dist (build first)`); process.exit(2); }
  const maps = all.filter((f) => f.endsWith('.map')).length;
  const hits = new Map();
  for (const file of all) {
    const text = readFileSync(file).toString('latin1');
    for (const needle of NEEDLES) {
      const n = text.split(needle).length - 1;
      if (!n) continue;
      hits.set(needle, (hits.get(needle) ?? 0) + n);
      hits.set(`file:${relative(ROOT, file)}`, 1);
    }
  }
  const needleHits = [...hits].filter(([k]) => !k.startsWith('file:'));
  const fileHits = [...hits.keys()].filter((k) => k.startsWith('file:')).map((k) => k.slice(5));
  report.push(`${app}: ${all.length} files scanned (${maps} sourcemaps), ${needleHits.length ? needleHits.map(([k, v]) => `${k}×${v}`).join(', ') : 'no needle found'}`);
  if (fileHits.length) report.push(`  in: ${fileHits.join(', ')}`);
  const mustHave = expectPresent && app === 'backoffice';
  if (mustHave) {
    const missing = [...ids, ...principalIds, ...names].filter((n) => !hits.has(n));
    if (missing.length) { failed = true; report.push(`  EXPECTED but missing: ${missing.join(', ')}`); }
  } else if (needleHits.length) failed = true;
}
console.log(`needles (${NEEDLES.length}): ${NEEDLES.join(' | ')}`);
console.log(report.join('\n'));
console.log(failed ? 'FAIL' : expectPresent ? 'OK: the test build holds them (backoffice only)' : 'OK: no trace of the test-only principals');
process.exit(failed ? 1 : 0);
