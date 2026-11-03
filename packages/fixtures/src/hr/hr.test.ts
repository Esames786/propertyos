import type { AttendanceState, HrDepartment } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { fromPaisa } from '../portal';
import { assignBlock, coverage, documentStatus, instalmentPlan, lateBy, maskCnic, normaliseCnic, normalisePhone, overlaps, pendingLeaveOn, shiftWindow, type DutyFacts } from './rules';
import vectors from './hr-roster.vectors.json';

/**
 * Gate S.2a pure rules against `hr-roster.vectors.json`: shift windows across midnight, month and
 * year ends; double booking (across sites too); leave and employment dates; lateness; coverage;
 * document expiry; a loan's instalment plan; identity and phone numbers.
 */
type Key = keyof typeof vectors.templates;
const T = vectors.templates as Record<Key, { start: string; end: string; crossesMidnight: boolean }>;
const win = (key: string, date: string) => shiftWindow(T[key as Key], date);

describe('shift windows (overnight, month and year end)', () => {
  for (const c of vectors.windows) it(c.name, () => expect(win(c.template, c.date)).toEqual({ start: c.start, end: c.end }));
});

describe('overlap: back-to-back shifts are not double booking', () => {
  for (const c of vectors.overlaps) {
    it(c.name, () => {
      const a = win(c.a[0]!, c.a[1]!);
      const b = win(c.b[0]!, c.b[1]!);
      expect(overlaps(a, b)).toBe(c.overlap);
      expect(overlaps(b, a)).toBe(c.overlap);
    });
  }
});

describe('lateness against the grace period', () => {
  for (const c of vectors.lateness) it(c.name, () => expect(lateBy(c.start, c.checkIn, c.grace)).toBe(c.late));
});

describe('who may take a duty (multi-site, leave, employment, department)', () => {
  type Case = (typeof vectors.assign)[number] & { sites?: string[][]; leave?: string[][]; employment?: DutyFacts['employment']; department?: HrDepartment; ignore?: string[]; pendingLeave?: boolean };
  for (const c of vectors.assign as Case[]) {
    it(c.name, () => {
      const facts: DutyFacts = {
        duties: (c.duties ?? []).map((d, i) => ({ id: d[3] ?? `d${i}`, ...win(d[0]!, d[1]!) })),
        leave: (c.leave ?? []).map(([from, to, state]) => ({ from: from!, to: to!, state: state as 'pending' | 'approved' })),
        employment: c.employment ?? { status: 'active', startDate: '2024-01-01' },
        department: c.department ?? 'security',
        sites: (c.sites ?? [['site_a', '2024-01-01'], ['site_b', '2026-10-01']]).map(([siteId, from, to]) => ({ siteId: siteId!, from: from!, ...(to ? { to } : {}) })),
      };
      const [key, date, siteId] = c.duty as [string, string, string];
      expect(assignBlock(facts, { siteId, date, department: 'security', ...(c.ignore ? { ignore: c.ignore } : {}), ...win(key, date) })).toBe(c.block);
      expect(pendingLeaveOn(facts, date)).toBe(c.pendingLeave ?? false);
    });
  }
});

describe('coverage against the minimum', () => {
  for (const c of vectors.coverage) it(c.name, () => expect(coverage(c.min, c.states as AttendanceState[])).toEqual({ required: c.min, available: c.available, short: c.short }));
});

describe('document expiry', () => {
  for (const c of vectors.documents) it(c.name, () => expect(documentStatus((c as { expiresOn?: string }).expiresOn, vectors.today)).toBe(c.status));
});

describe('a planned repayment schedule always adds up to the amount', () => {
  for (const c of vectors.instalments) {
    it(c.name, () => {
      const plan = instalmentPlan(BigInt(c.amount.replace('.', '')), c.count, c.firstMonth);
      expect(plan.map((p) => fromPaisa(p.paisa))).toEqual(c.plan);
      expect(plan.map((p) => p.month)).toEqual(c.months);
      expect(fromPaisa(plan.reduce((s, p) => s + p.paisa, 0n))).toBe(c.amount);
    });
  }
});

describe('identity and phone numbers', () => {
  for (const c of vectors.cnic) {
    it(`CNIC "${c.raw}"`, () => {
      expect(normaliseCnic(c.raw)).toBe(c.normal);
      if (c.normal) expect(maskCnic(c.normal)).toBe((c as { masked?: string }).masked);
    });
  }
  for (const c of vectors.phone) it(`phone "${c.raw}"`, () => expect(normalisePhone(c.raw)).toBe(c.normal));
});
