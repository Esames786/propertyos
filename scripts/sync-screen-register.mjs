#!/usr/bin/env node
/**
 * Keeps docs/ui/screen-register.csv (project-local tracking copy) in step with the owner's
 * blueprint register, and generates packages/contracts/src/screens/register.generated.ts.
 *
 * - Owner columns are copied from docs/blueprint/v2.1/06_SCREEN_REGISTER.csv (never edited there).
 * - Tracking columns (status, stage, ui_template, canonical_route, notes) are preserved when present,
 *   otherwise seeded with defaults. Stage 2 refines ui_template per screen.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_CSV = resolve(root, 'docs/blueprint/v2.1/06_SCREEN_REGISTER.csv');
const LOCAL_CSV = resolve(root, 'docs/ui/screen-register.csv');
const OUT_TS = resolve(root, 'packages/contracts/src/screens/register.generated.ts');

const OWNER_COLUMNS = ['screen_id', 'app', 'domain', 'name', 'surface', 'template', 'prototype_route', 'permission', 'data_rule'];
const TRACKING_COLUMNS = ['status', 'stage', 'ui_template', 'canonical_route', 'notes'];

function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip UTF-8 BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Initial canonical template family (Stage 0 report §5). Refined screen by screen in Stage 2. */
function seedTemplate(r) {
  const n = r.name.toLowerCase();
  if (r.domain === 'GUIDED_ONBOARDING') return 'onboarding';
  if (r.domain === 'AUTH') return 'auth';
  if (r.app === 'public') return 'public-story';
  if (r.domain === 'RPT' || /trial balance|profit and loss|balance sheet|budget vs actual|aging|statement|ledger$/.test(n)) return 'report';
  if (n.includes('reconciliation')) return 'reconciliation';
  if (n.includes('dashboard') || n === 'home' || n.endsWith(' home') || n.includes('overview') || n.includes('analytics')) return 'dashboard';
  if (r.template === 'detail') return 'workspace';
  if (r.template === 'calendar' || n.includes('calendar') || n.includes('scheduler')) return 'calendar';
  if (r.template === 'matrix') return 'matrix';
  if (r.template === 'wizard') return 'wizard';
  if (n.includes('approv') || n.includes('review') || n.includes('verification')) return 'approval';
  if (r.surface === 'drawer' || /^(new|create|invite|upload|edit|allocate|schedule|hold|receive|reverse|bulk|send) /.test(n)) return 'form';
  if (r.domain === 'ADM' && /settings|rules|profile|sequences|policies/.test(n)) return 'settings';
  if (/preferences|settings/.test(n)) return 'settings';
  return 'index';
}

const STAGE_ONE = {
  'GLOBAL-001': ['implemented', '/backoffice/global/command-palette', 'Opens the command palette over the start page'],
  'GLOBAL-003': ['implemented', '/backoffice/global/quick-create', 'Actions for screens not built yet are disabled with an explanation'],
  'GLOBAL-004': ['implemented', '/backoffice/global/notifications', 'Opens the notifications panel'],
  'GLOBAL-007': ['implemented', '/backoffice/global/context-help', 'Opens the help drawer'],
  'GLOBAL-008': ['partial', '/backoffice/global/profile--preferences', 'Preferences done; profile section is Stage 2'],
  'GLOBAL-009': ['implemented', '/backoffice/global/language-switcher', 'Preferences > Language'],
  'GLOBAL-010': ['implemented', '/backoffice/global/accessibility-preferences', 'Preferences > Accessibility'],
  'GUIDE-001': ['implemented', '/backoffice', 'First-entry welcome per tenant + persona + app'],
  'GUIDE-002': ['implemented', '/backoffice/help/tours/GLOBAL-TOUR-001', 'Register route duplicated GUIDE-003 (C11); launches GLOBAL-TOUR-001'],
  'GUIDE-003': ['implemented', '/backoffice/help/tours', 'Tour library: start, resume, replay, text version'],
  'GUIDE-004': ['partial', '/backoffice/help/practice', 'Practice foundation with one demo task; module practice in Stage 3'],
  'GUIDE-005': ['planned', '/customer/portal/help/tours', 'Register route /portal/help/tours normalised (C12); resident tour in Stage 4'],
  'GUIDE-006': ['implemented', '/backoffice/settings/onboarding', 'Preferences > Guided tours'],
  'PORTAL-027': ['implemented', '/customer/portal/accessibility-preferences', 'Shared preferences component in customer shell'],
};

function seedTracking(r) {
  const s1 = STAGE_ONE[r.screen_id];
  const stage = s1 ? (s1[0] === 'planned' ? (r.app === 'customer' ? '4' : '2') : '1') : r.app === 'customer' ? '4' : r.app === 'public' ? '5' : '2';
  return {
    status: s1 ? s1[0] : 'planned',
    stage,
    ui_template: seedTemplate(r),
    canonical_route: s1 ? s1[1] : r.prototype_route,
    notes: s1 ? s1[2] : '',
  };
}

const owner = parseCsv(readFileSync(OWNER_CSV, 'utf8'));
const local = existsSync(LOCAL_CSV) ? parseCsv(readFileSync(LOCAL_CSV, 'utf8')) : [];
const localById = new Map(local.map((r) => [r.screen_id, r]));

const merged = owner.map((r) => {
  const existing = localById.get(r.screen_id);
  const tracking = existing
    ? Object.fromEntries(TRACKING_COLUMNS.map((c) => [c, existing[c] ?? '']))
    : seedTracking(r);
  return { ...Object.fromEntries(OWNER_COLUMNS.map((c) => [c, r[c] ?? ''])), ...tracking };
});

const removed = local.filter((r) => !owner.some((o) => o.screen_id === r.screen_id)).map((r) => r.screen_id);

const header = [...OWNER_COLUMNS, ...TRACKING_COLUMNS];
mkdirSync(dirname(LOCAL_CSV), { recursive: true });
writeFileSync(
  LOCAL_CSV,
  [header.join(','), ...merged.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n',
);

const entries = merged.map((r) => ({
  id: r.screen_id,
  app: r.app,
  domain: r.domain,
  name: r.name,
  surface: r.surface,
  registerTemplate: r.template,
  uiTemplate: r.ui_template,
  registerRoute: r.prototype_route,
  route: r.canonical_route || r.prototype_route,
  status: r.status,
  stage: Number(r.stage),
}));

mkdirSync(dirname(OUT_TS), { recursive: true });
writeFileSync(
  OUT_TS,
  `// GENERATED by scripts/sync-screen-register.mjs from docs/ui/screen-register.csv. Do not edit.\n` +
    `import type { ScreenEntry } from './types';\n\n` +
    `export const SCREENS: readonly ScreenEntry[] = ${JSON.stringify(entries, null, 2)} as const satisfies readonly ScreenEntry[];\n`,
);

const counts = merged.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
console.log(`register: ${merged.length} screens ->`, counts, removed.length ? `removed upstream: ${removed.join(', ')}` : '');
