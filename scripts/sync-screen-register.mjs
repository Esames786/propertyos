#!/usr/bin/env node
/**
 * V3.1 screen register → packages/contracts/src/screens/register.generated.ts
 *
 * docs/ui/screen-register.csv is the authoritative register since Gate B (adopted from the Gate A
 * proposal; owner decision D-19). This script validates it and generates the typed table the apps
 * and tests use. It never rewrites the CSV. Checks:
 * - every screen ID in the owner's V2.1 register (docs/blueprint/v2.1/06_SCREEN_REGISTER.csv) is still
 *   present, and its V2.1 address (v21_route) is unchanged, so old links and bookmarks keep working;
 * - IDs are unique, every canonical_id exists, status is BUILT / PARTIAL / PLANNED;
 * - every counted screen (canonical_id = itself) has the V3.1 required fields.
 *
 * Usage: node scripts/sync-screen-register.mjs [--check]   (--check: validate only, write nothing)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_V21 = resolve(root, 'docs/blueprint/v2.1/06_SCREEN_REGISTER.csv');
const LIVE = resolve(root, 'docs/ui/screen-register.csv');
const OUT_TS = resolve(root, 'packages/contracts/src/screens/register.generated.ts');
const checkOnly = process.argv.includes('--check');

function parseCsv(raw) {
  // Strip a UTF-8 byte-order mark (the owner's V2.1 CSV starts with one).
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const errors = [];
const fail = (msg) => errors.push(msg);

const owner = parseCsv(readFileSync(OWNER_V21, 'utf8'));
const live = parseCsv(readFileSync(LIVE, 'utf8'));
const byId = new Map();
for (const r of live) {
  if (byId.has(r.screen_id)) fail(`duplicate screen_id ${r.screen_id}`);
  byId.set(r.screen_id, r);
}

for (const o of owner) {
  const r = byId.get(o.screen_id);
  if (!r) fail(`V2.1 screen ${o.screen_id} missing (IDs must stay stable)`);
  else if (r.v21_route !== o.prototype_route) fail(`${o.screen_id}: v21_route "${r.v21_route}" differs from the owner's "${o.prototype_route}"`);
}

const REQUIRED = ['name', 'application', 'tenant_edition', 'module', 'min_permission', 'data_scope', 'surface', 'route', 'status', 'gate'];
for (const r of live) {
  if (!['BUILT', 'PARTIAL', 'PLANNED'].includes(r.status)) fail(`${r.screen_id}: status "${r.status}"`);
  if (!byId.has(r.canonical_id)) fail(`${r.screen_id}: unknown canonical_id ${r.canonical_id}`);
  if (r.canonical_id === r.screen_id) for (const f of REQUIRED) if (!r[f]) fail(`${r.screen_id}: missing ${f}`);
}

if (errors.length) {
  console.error(`screen register: ${errors.length} problem(s)\n- ${errors.slice(0, 25).join('\n- ')}`);
  process.exit(1);
}

/**
 * A route the browser can open as-is: a plain path with no parameters or placeholders. A route with
 * a query string is a state of another screen (a wizard step, a tab, a drawer), not an address.
 */
function concretePath(route) {
  const path = route.trim();
  return /^\/[\w\-/.]*$/.test(path) && !path.includes('//') ? path.replace(/\/+$/, '') || '/' : '';
}

function legacyApp(r) {
  const u = r.v21_route;
  if (u) {
    if (u.startsWith('/customer/') || u.startsWith('/portal/') || u === '/shared/auth/customer-portal-login') return 'customer';
    if (u.startsWith('/public/')) return 'public';
    if (u.startsWith('/saas/')) return 'saas';
    if (u.startsWith('/shared/')) return 'shared';
    return 'backoffice';
  }
  return { 'platform-hq': 'platform', 'customer-web': 'customer', 'public-site': 'public', 'shared-auth': 'shared' }[r.application] ?? 'backoffice';
}

function uiTemplateOf(r) {
  if (r.ui_template) return r.ui_template;
  const s = r.surface;
  if (s === 'workspace') return 'workspace';
  if (s === 'wizard' || s === 'step') return 'wizard';
  if (s === 'drawer') return 'form';
  if (s === 'report') return 'report';
  if (s === 'overlay') return 'onboarding';
  return /dashboard|home$/i.test(r.name) ? 'dashboard' : 'index';
}

const STATUS = { BUILT: 'implemented', PARTIAL: 'partial', PLANNED: 'planned' };

const entries = live.map((r) => {
  const canonical = byId.get(r.canonical_id);
  const path = concretePath(r.route);
  const id = r.screen_id;
  return {
    id,
    app: legacyApp(r),
    domain: id.startsWith('GUIDE-') ? 'GUIDED_ONBOARDING' : id.replace(/-\d+$/, ''),
    name: r.name,
    surface: r.surface,
    registerTemplate: r.v21_template || r.surface,
    uiTemplate: uiTemplateOf(r),
    registerRoute: r.v21_route || path,
    route: path || r.v21_route,
    status: STATUS[r.status],
    stage: Number(r.v21_stage || 0),
    // V3.1 fields
    application: r.application,
    edition: r.tenant_edition,
    module: r.module,
    permission: r.min_permission,
    scope: r.data_scope,
    disposition: r.disposition,
    canonicalId: r.canonical_id,
    gate: r.canonical_id === id ? r.gate : canonical.gate,
    concrete: Boolean(path || r.v21_route),
  };
});

const counted = live.filter((r) => r.canonical_id === r.screen_id);
const tally = (s) => counted.filter((r) => r.status === s).length;
console.log(`screen register: ${live.length} rows, ${counted.length} distinct screens (${tally('BUILT')} built, ${tally('PARTIAL')} partial, ${tally('PLANNED')} planned); ${owner.length} V2.1 IDs and addresses preserved`);

if (checkOnly) process.exit(0);
const body =
  `// GENERATED by scripts/sync-screen-register.mjs from docs/ui/screen-register.csv. Do not edit.\n` +
  `import type { ScreenEntry } from './types';\n\n` +
  `export const SCREENS: readonly ScreenEntry[] = ${JSON.stringify(entries, null, 2)} as const satisfies readonly ScreenEntry[];\n`;
if (!existsSync(OUT_TS) || readFileSync(OUT_TS, 'utf8') !== body) writeFileSync(OUT_TS, body);
