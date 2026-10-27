import type { DependencyCheckResult, DependencyIssue, ModuleCatalogEntry, ModuleKey, ModuleSelection } from '@repo/contracts';
import { MODULES } from './catalog';

/**
 * Module dependency check (Gate A, A1 §6). Hard requirements must be granted for at least the same
 * sites; the result lists every gap and the smallest set of grants that closes them (followed
 * transitively: adding Sales also needs Inventory, which needs Projects). Soft links are reported
 * as integrations that will light up.
 */
type Sites = 'all' | readonly string[];

const covers = (have: Sites, need: Sites) => have === 'all' || (need !== 'all' && need.every((s) => have.includes(s)));
const union = (a: Sites, b: Sites): Sites => (a === 'all' || b === 'all' ? 'all' : [...new Set([...a, ...b])]);
const missingSites = (have: Sites, need: Sites): Sites => (need === 'all' ? 'all' : need.filter((s) => have === 'all' || !have.includes(s)));

function withCore(selection: readonly ModuleSelection[]): Map<ModuleKey, Sites> {
  const map = new Map<ModuleKey, Sites>(selection.map((s) => [s.module, s.sites]));
  map.set('core', 'all');
  return map;
}

type Entry = (key: ModuleKey) => ModuleCatalogEntry;
const lookup = (modules: readonly ModuleCatalogEntry[]): Entry => (key) => modules.find((m) => m.key === key)!;

function issuesOf(map: Map<ModuleKey, Sites>, moduleEntry: Entry): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  for (const [module, sites] of map) {
    for (const req of moduleEntry(module).requires) {
      const have = map.get(req);
      // A tenant-wide requirement is satisfied by any grant; a site-scoped one must cover the dependant's sites.
      const need: Sites = moduleEntry(req).scope === 'tenant' ? 'all' : sites;
      if (have === undefined) issues.push({ module, requires: req, kind: 'missing', sites: need });
      else if (!covers(have, need)) issues.push({ module, requires: req, kind: 'site_gap', sites: missingSites(have, need) });
    }
  }
  return issues;
}

/** Checked against a catalogue version (the one in force; default: the seed catalogue). */
export function checkDependencies(selection: readonly ModuleSelection[], modules: readonly ModuleCatalogEntry[] = MODULES): DependencyCheckResult {
  const moduleEntry = lookup(modules);
  const original = withCore(selection);
  const issues = issuesOf(original, moduleEntry);

  // Close every gap transitively on a copy; what we had to add or widen is the fix list.
  const fixed = new Map(original);
  for (let guard = 0; guard < 30; guard++) {
    const open = issuesOf(fixed, moduleEntry);
    if (open.length === 0) break;
    for (const i of open) {
      const scope = moduleEntry(i.requires).scope;
      const add: Sites = scope === 'tenant' ? 'all' : i.sites;
      fixed.set(i.requires, fixed.has(i.requires) ? union(fixed.get(i.requires)!, add) : add);
    }
  }
  const fixes: ModuleSelection[] = [];
  for (const [module, sites] of fixed) {
    const before = original.get(module);
    if (before === undefined || !covers(before, sites)) fixes.push({ module, sites });
  }

  const integrations: DependencyCheckResult['integrations'] = [];
  const seen = new Set<string>();
  for (const module of original.keys()) {
    for (const other of moduleEntry(module).integrates) {
      const key = [module, other].sort().join('|');
      if (original.has(other) && !seen.has(key)) {
        seen.add(key);
        integrations.push({ module, with: other });
      }
    }
  }

  return { ok: issues.length === 0, issues, fixes, integrations };
}

/** Grants with every fix applied (what "Add the required modules" does). */
export function applyFixes(selection: readonly ModuleSelection[], fixes: readonly ModuleSelection[]): ModuleSelection[] {
  const map = new Map<ModuleKey, Sites>(selection.map((s) => [s.module, s.sites]));
  for (const f of fixes) map.set(f.module, map.has(f.module) ? union(map.get(f.module)!, f.sites) : f.sites);
  return [...map].map(([module, sites]) => ({ module, sites }));
}
