import type { LeasesList, OwnerStatementView, PayoutsView } from '@repo/contracts';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rentSession } from './rent-test-kit';

/**
 * Integration of S.3 Rentals with UX B1 (money truth), Issue #21 and UX B2 (plan §5.2). B1's rules (a
 * reversed payment is not money received; credit from a reversed receipt is not credit) reach Rentals
 * only once Rentals holds settled money of its own. At this integration it holds none, and it reads no
 * society money. This pins both facts on the merged code; a changed answer stops the integration for
 * review. The rules Rentals must follow when its settlement subject (S.3 risk G1) lands are R-INT-1…4
 * in docs/status/integration-s3-b1-b2/INTEGRATION_REPORT.md.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');

/** Every non-test TypeScript source of the packages and the apps (no tests, no builds, no dependencies). */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage', '.vite'].includes(e.name)) sources(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/test-kit\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const ALL = ['packages', 'apps'].flatMap((top) => readdirSync(join(ROOT, top), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(ROOT, top, d.name, 'src'))).flatMap((d) => {
  try {
    return sources(d);
  } catch {
    return [];
  }
});
const RENTAL_SOURCES = ALL.filter((f) => rel(f).startsWith('packages/fixtures/src/rentals/'));

/** Source text without comments (a comment that says "settled = …" is not a writer). */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** A write to a `settled` list through a member access: push, unshift, splice, sort, an assignment, an index assignment, a length change. */
const WRITE = /\.settled\s*(?:\.\s*(?:push|unshift|splice|fill|copyWithin|sort|reverse|pop|shift)\s*\(|\.\s*length\s*=(?!=)|\[[^\]]*\]\s*=(?!=)|=(?![=>]))/;

describe('Integration §5.2: Rentals holds no settled money and reads no society money', () => {
  it('found the sources it checks (the scan is not empty)', () => {
    expect(ALL.length).toBeGreaterThan(200);
    expect(RENTAL_SOURCES.map(rel).sort()).toEqual(['packages/fixtures/src/rentals/handlers.ts', 'packages/fixtures/src/rentals/portal.ts', 'packages/fixtures/src/rentals/rules.ts', 'packages/fixtures/src/rentals/state.ts', 'packages/fixtures/src/rentals/views.ts']);
  });

  it('nothing outside tests writes RentalsState.settled; the store starts it empty; no other code builds a SettledEvent', () => {
    const writers = ALL.flatMap((f) =>
      code(f)
        .split('\n')
        .map((line, i) => ({ at: `${rel(f)}:${i + 1}`, line: line.trim() }))
        .filter((x) => WRITE.test(x.line)),
    );
    expect(writers).toEqual([]);
    // The only `settled:` properties in Rentals' sources: the empty store list, the landlord view's empty
    // settled payouts, and the zero sub-ledger figure on Lease 360.
    const props = RENTAL_SOURCES.flatMap((f) => [...code(f).matchAll(/\bsettled\s*:\s*([^,}\n]+)/g)].map((m) => `${rel(f)}: settled: ${m[1]!.trim()}`)).sort();
    expect(props).toEqual(['packages/fixtures/src/rentals/portal.ts: settled: []', 'packages/fixtures/src/rentals/state.ts: settled: SettledEvent[];', 'packages/fixtures/src/rentals/state.ts: settled: []', 'packages/fixtures/src/rentals/views.ts: settled: ZERO']);
    const events = ALL.filter((f) => /\bSettledEvent\b/.test(code(f))).map(rel);
    expect(events).toEqual(['packages/fixtures/src/rentals/state.ts']);
  });

  it('from society code Rentals imports only problem and stamp (society/handlers) and seesBankFeed (society/finance/bank-scope)', () => {
    const named: Record<string, string[]> = {};
    const other: string[] = [];
    for (const f of RENTAL_SOURCES) {
      const text = code(f);
      for (const m of text.matchAll(/(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'/g)) {
        const [, , what, from] = m;
        if (!/(^|\/)society(\/|$)/.test(from!)) continue;
        const names = /^\{([\s\S]*)\}$/.exec(what!.trim());
        if (!names) {
          other.push(`${rel(f)}: ${m[0]}`);
          continue;
        }
        const list = names[1]!.split(',').map((x) => x.trim()).filter(Boolean);
        named[from!] = [...new Set([...(named[from!] ?? []), ...list])].sort();
      }
      for (const m of text.matchAll(/(?:import|require)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) if (/society/.test(m[1]!)) other.push(`${rel(f)}: ${m[0]}`);
      for (const m of text.matchAll(/import\s+'([^']+)'/g)) if (/society/.test(m[1]!)) other.push(`${rel(f)}: ${m[0]}`);
    }
    expect(other).toEqual([]);
    expect(named).toEqual({ '../society/finance/bank-scope': ['seesBankFeed'], '../society/handlers': ['problem', 'stamp'] });
    // And the other way round: no society (or any other) code reaches into Rentals' records; only the route table registers its handlers.
    const into = ALL.filter((f) => !rel(f).startsWith('packages/fixtures/src/rentals/') && /from\s+'(?:\.\.?\/)+(?:[\w-]+\/)*rentals\/(?:state|views|rules|handlers|portal)'|from\s+'\.\/rentals\//.test(code(f))).map(rel);
    expect(into).toEqual(['packages/fixtures/src/handlers.ts']);
    expect(ALL.filter((f) => !rel(f).startsWith('packages/fixtures/src/rentals/') && /\bRENT_SECTION\b|section<RentalsState>/.test(code(f))).map(rel)).toEqual([]);
  });

  it('on the merged demo every settled-basis figure is 0.00 and the store holds no settled event', async () => {
    const api = rentSession().as('rb_accounts');
    const leases = await api.get<LeasesList>('/rentals/leases');
    expect(leases.kpis.ownerPayableSettled).toEqual({ amount: '0.00', currency: 'PKR' });
    const payouts = await api.get<PayoutsView>('/rentals/payouts');
    expect(payouts.owners.length).toBeGreaterThan(0);
    for (const o of payouts.owners) expect(o.closing?.amount ?? '0.00', o.id).toBe('0.00');
    const st = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-10' });
    expect(st.lines.filter((l) => l.basis === 'settled')).toEqual([]);
    expect(st.totals.closing.amount).toBe('0.00');
    expect(api.rent().settled).toEqual([]);
  });
});
