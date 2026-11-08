/**
 * Gate E.0: the narrow-vs-full projection test kit (plan §4.4 "Test"). Framework-free, so any slice's
 * Vitest (or Playwright) test can use it:
 *
 *   const report = compareProjection({ narrow: { detail: asBilal, list: listAsBilal }, full: { detail: asNadia }, hidden: ['Larkspur Gardens', 'LG-P1-001', '1250000.00'] });
 *   expect(report.leaks).toEqual([]);        // the narrow reader's serialized answers name nothing hidden
 *   expect(report.unexercised).toEqual([]);  // and the full reader really saw each hidden term (the test hid something)
 *
 * Terms are matched in every string and number leaf and in every object key (maps keyed by id leak too),
 * case-sensitively, as substrings of the serialized value.
 */

export interface Leak {
  term: string;
  /** Which response (the key of `narrow`) and where in it, as a JSON path. */
  at: string;
}

export interface ProjectionReport {
  leaks: Leak[];
  /** Hidden terms the full reader's answers never contain: the test would pass without hiding anything. */
  unexercised: string[];
}

function walk(value: unknown, path: string, visit: (text: string, at: string) => void): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    visit(String(value), path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      visit(k, `${path}{key:${k}}`);
      walk(v, `${path}.${k}`, visit);
    }
  }
}

/** Every place a hidden term appears in the given answers. */
export function findTerms(responses: Readonly<Record<string, unknown>>, terms: readonly string[]): Leak[] {
  const found: Leak[] = [];
  for (const [name, response] of Object.entries(responses)) {
    walk(response, name, (text, at) => {
      for (const term of terms) if (term && text.includes(term)) found.push({ term, at });
    });
  }
  return found;
}

/** Compares serialized narrow and full answers for a set of terms the narrow reader must never see. */
export function compareProjection(input: { narrow: Readonly<Record<string, unknown>>; full: Readonly<Record<string, unknown>>; hidden: readonly string[] }): ProjectionReport {
  const leaks = findTerms(input.narrow, input.hidden);
  const seen = new Set(findTerms(input.full, input.hidden).map((l) => l.term));
  return { leaks, unexercised: input.hidden.filter((t) => !seen.has(t)) };
}
