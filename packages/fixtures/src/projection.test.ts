import { describe, expect, it } from 'vitest';
import { projectHistory, projectVersions, wholeOnly, type AuditEvent } from './projection';
import { compareProjection, findTerms } from './projection.testkit';

/**
 * Gate E.0 shared projection (plan §4.4) and its narrow-vs-full test kit. The fixture is a journal-like
 * record touching two projects; the narrow reader sees Larkspur Heights only.
 */
interface JEvent extends AuditEvent {
  projectId?: string;
}
const EVENTS: JEvent[] = [
  { at: '2026-10-20T09:00:00Z', by: 'usr_6', byName: 'Faiza Noor', action: 'drafted', values: { version: 1, ref: 'LSP-JV-202610-0001', total: '2500000.00' }, note: 'Gardens plot LG-P1-001 deposit moved' },
  { at: '2026-10-20T10:00:00Z', by: 'usr_6', byName: 'Faiza Noor', action: 'line_added', values: { amount: '1000000.00', project: 'Larkspur Heights' }, projectId: 'prj_heights' },
  { at: '2026-10-20T10:05:00Z', by: 'usr_6', byName: 'Faiza Noor', action: 'line_added', values: { amount: '1500000.00', project: 'Larkspur Gardens' }, projectId: 'prj_gardens' },
  { at: '2026-10-21T09:00:00Z', by: 'usr_7', byName: 'Zubair Ansari', action: 'approved_amount', values: { total: '2500000.00', version: 2 } },
];
const policy = (whole: boolean) => ({
  whole,
  about: (e: JEvent) => e.projectId,
  sees: (id: string) => id === 'prj_heights',
  safeValues: ['version', 'ref'],
  limitedActions: new Set(['approved_amount']),
  internal: ['projectId'] as Array<keyof JEvent>,
});

describe('projection.ts — history', () => {
  it('a whole reader gets the full audit (internal fields never returned)', () => {
    const full = projectHistory(EVENTS, policy(true));
    expect(full).toHaveLength(4);
    expect(full[0]).toEqual({ at: EVENTS[0]!.at, by: 'usr_6', byName: 'Faiza Noor', action: 'drafted', values: EVENTS[0]!.values, note: EVENTS[0]!.note });
    expect(full.some((e) => 'projectId' in e)).toBe(false);
  });

  it('a partial reader: events about what they see are kept, others omitted; record-wide events lose values, notes and amount wording', () => {
    const narrow = projectHistory(EVENTS, policy(false));
    expect(narrow).toEqual([
      { at: EVENTS[0]!.at, by: 'usr_6', byName: 'Faiza Noor', action: 'drafted', values: { version: 1, ref: 'LSP-JV-202610-0001' } },
      { at: EVENTS[1]!.at, by: 'usr_6', byName: 'Faiza Noor', action: 'line_added', values: { amount: '1000000.00', project: 'Larkspur Heights' } },
      { at: EVENTS[3]!.at, by: 'usr_7', byName: 'Zubair Ansari', action: 'approved_amount_limited', values: { version: 2 } },
    ]);
  });

  it('without a `sees`, nothing narrower than the record is shown', () => {
    expect(projectHistory(EVENTS, { whole: false, about: (e: JEvent) => e.projectId }).map((e) => e.action)).toEqual(['drafted', 'approved_amount']);
  });

  it('the test kit: the narrow answer names nothing hidden, and the full answer proves the test hid something', () => {
    const hidden = ['Larkspur Gardens', 'LG-P1-001', '1500000.00', '2500000.00'];
    const report = compareProjection({ narrow: { history: projectHistory(EVENTS, policy(false)) }, full: { history: projectHistory(EVENTS, policy(true)) }, hidden });
    expect(report).toEqual({ leaks: [], unexercised: [] });
    // And the kit does catch the raw history (it is not vacuous).
    const raw = compareProjection({ narrow: { history: EVENTS }, full: { history: EVENTS }, hidden });
    expect(raw.leaks.map((l) => l.term).sort()).toEqual(['1500000.00', '2500000.00', '2500000.00', 'LG-P1-001', 'Larkspur Gardens']);
  });

  it('the test kit reports a hidden term the full reader never saw, and finds terms in object keys', () => {
    expect(compareProjection({ narrow: {}, full: { a: 'x' }, hidden: ['nowhere'] }).unexercised).toEqual(['nowhere']);
    expect(findTerms({ holds: { unt_lg_p1_001: { until: 'x' } } }, ['unt_lg_p1_001'])).toEqual([{ term: 'unt_lg_p1_001', at: 'holds{key:unt_lg_p1_001}' }]);
  });
});

describe('projection.ts — versions and totals', () => {
  const VERSIONS = [
    { n: 1, at: '2026-10-20T09:00:00Z', byName: 'Faiza Noor', reason: 'prepared' },
    { n: 2, at: '2026-10-20T10:05:00Z', byName: 'Faiza Noor', reason: 'line_changed', aboutId: 'prj_gardens', about: 'Larkspur Gardens' },
    { n: 3, at: '2026-10-20T11:00:00Z', byName: 'Faiza Noor', reason: 'line_changed', aboutId: 'prj_heights', about: 'Larkspur Heights' },
  ];
  it('a whole reader sees every version with what it was about', () => {
    expect(projectVersions(VERSIONS, { whole: true })).toEqual(VERSIONS.map(({ aboutId: _a, ...v }) => v));
  });
  it('a partial reader sees number, time, author and reason; a change about something hidden reads "changed" without naming it', () => {
    expect(projectVersions(VERSIONS, { whole: false, sees: (id) => id === 'prj_heights', recordWide: new Set(['prepared']) })).toEqual([
      { n: 1, at: VERSIONS[0]!.at, byName: 'Faiza Noor', reason: 'prepared' },
      { n: 2, at: VERSIONS[1]!.at, byName: 'Faiza Noor', reason: 'changed' },
      { n: 3, at: VERSIONS[2]!.at, byName: 'Faiza Noor', reason: 'line_changed', about: 'Larkspur Heights' },
    ]);
  });
  it('totals are withheld from a partial reader, never recomputed', () => {
    expect(wholeOnly(true, '2500000.00')).toBe('2500000.00');
    expect(wholeOnly(false, '2500000.00')).toBeUndefined();
  });
});
