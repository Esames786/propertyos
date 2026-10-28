import type { DocumentKind, NumberingScheme } from '@repo/contracts';
import { pad } from '../seed';

/**
 * Document numbering per issuing legal entity and site (owner decision, C.1 review). Patterns are
 * data, not code: {code} is the entity's short code at the site, {yyyy} and {yyyymm} the document's
 * year or billing period, {seq:N} its sequence with N digits. A change applies to new documents
 * only; issued references never change.
 */

export const defaultNumbering = (code: string): NumberingScheme => ({
  code,
  invoice: '{code}-INV-{yyyymm}-{seq:4}',
  opening: '{code}-OB-{seq:4}',
  creditNote: '{code}-CN-{seq:4}',
  payment: '{code}-PAY-{yyyy}-{seq:5}',
  receipt: '{code}-RCT-{yyyy}-{seq:5}',
  submission: '{code}-PRF-{seq:4}',
  run: '{code}-RUN-{yyyymm}',
});

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['invoice', 'opening', 'creditNote', 'payment', 'receipt', 'submission', 'run'];

const TOKEN = /\{(code|yyyy|yyyymm|seq:(\d))\}/g;

/** The reference for one document. `on` is a calendar date (YYYY-MM-DD) or a period (YYYY-MM). */
export function formatRef(pattern: string, input: { code: string; seq: number; on: string }): string {
  const yyyy = input.on.slice(0, 4);
  const yyyymm = input.on.slice(0, 7).replace('-', '');
  return pattern.replace(TOKEN, (_m, token: string, digits?: string) => {
    if (token === 'code') return input.code;
    if (token === 'yyyy') return yyyy;
    if (token === 'yyyymm') return yyyymm;
    return pad(input.seq, Number(digits));
  });
}

/** The scope a sequence restarts in: per period for {yyyymm}, per year for {yyyy}, else never. */
export function sequenceScope(kind: DocumentKind, pattern: string, on: string): string {
  if (pattern.includes('{yyyymm}')) return `${kind}:${on.slice(0, 7)}`;
  if (pattern.includes('{yyyy}')) return `${kind}:${on.slice(0, 4)}`;
  return kind;
}

export type PatternProblem = 'pattern_empty' | 'pattern_sequence' | 'pattern_token' | 'pattern_characters' | 'pattern_length';

/**
 * A pattern's problem, or null. Every document but a run needs a sequence ({seq:N}, 3–6 digits) so
 * two documents never share a reference; a run is one per period, so it needs {yyyymm} instead.
 */
export function patternProblem(kind: DocumentKind, pattern: string): PatternProblem | null {
  const p = pattern.trim();
  if (!p) return 'pattern_empty';
  if (p.length > 40) return 'pattern_length';
  const tokens = [...p.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!);
  if (tokens.some((t) => !/^(code|yyyy|yyyymm|seq:[3-6])$/.test(t))) return 'pattern_token';
  if (!/^[A-Z0-9/{}:_-]+$/i.test(p.replace(/\{[^}]*\}/g, ''))) return 'pattern_characters';
  if (kind === 'run' ? !tokens.includes('yyyymm') : !tokens.some((t) => t.startsWith('seq:'))) return 'pattern_sequence';
  return null;
}
