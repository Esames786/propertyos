import { DASHBOARD_RANGES, isMoneyAmount, type DashboardSummary } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { MockTransport, type MockContext } from './mock-transport';

const make = (ctx: MockContext) => new MockTransport({ getContext: () => ctx, getMode: () => 'fast' });
const summary = (ctx: MockContext, range?: string) =>
  make(ctx).request<DashboardSummary>({ method: 'GET', path: '/dashboard/summary', query: range ? { range } : {} });

describe('GET /dashboard/summary (HOME-001)', () => {
  it('composes by role: each persona gets only the sections its permissions allow', async () => {
    const manager = await summary({ personaId: 'manager', projectId: 'all' });
    expect(manager.kpis.map((k) => k.id)).toEqual(['salesBooked', 'collected', 'available', 'conversion']);
    expect(manager.collections).not.toBeNull();
    expect(manager.funnel).not.toBeNull();
    expect(Object.keys(manager.attention).sort()).toEqual(['followUp', 'hold', 'overdue', 'verification']);

    const sales = await summary({ personaId: 'sales', projectId: 'all' });
    expect(sales.kpis.map((k) => k.id)).toEqual(['salesBooked', 'conversion', 'pipeline', 'available']);
    expect(sales.collections).toBeNull();
    expect(sales.attention.verification).toBeUndefined();
    expect(sales.attention.overdue).toBeUndefined();
    // Sales is scoped to Larkspur Heights only.
    expect(sales.projects.map((p) => p.id)).toEqual(['prj_heights']);
    expect(sales.inventory!.every((r) => r.projectId === 'prj_heights')).toBe(true);

    const finance = await summary({ personaId: 'finance', projectId: 'all' });
    expect(finance.kpis.map((k) => k.id)).toEqual(['collected', 'receivables', 'verifications', 'salesBooked']);
    expect(finance.inventory).toBeNull();
    expect(finance.funnel).toBeNull();
    expect(finance.residences).toBeNull();
  });

  it('follows the header project filter', async () => {
    const all = await summary({ personaId: 'manager', projectId: 'all' });
    const gardens = await summary({ personaId: 'manager', projectId: 'prj_gardens' });
    expect(gardens.projects.map((p) => p.id)).toEqual(['prj_gardens']);
    expect(gardens.inventory!.map((r) => r.label)).toEqual(['Phase 1', 'Phase 2']);
    expect(Number(gardens.kpis[0]!.value)).toBeLessThan(Number(all.kpis[0]!.value));
  });

  it('returns one collections point per month of the range, the current month flagged as partial', async () => {
    const counts = { '3m': 3, '6m': 6, ytd: 10, '12m': 12 } as const;
    for (const range of DASHBOARD_RANGES) {
      const s = await summary({ personaId: 'manager', projectId: 'all' }, range);
      expect(s.range).toBe(range);
      expect(s.collections).toHaveLength(counts[range]);
      expect(s.collections!.at(-1)!.partial).toBe(true);
      expect(s.collections!.slice(0, -1).every((p) => !p.partial)).toBe(true);
    }
  });

  it('keeps money as 2-decimal strings and the funnel monotone', async () => {
    const s = await summary({ personaId: 'manager', projectId: 'all' }, '12m');
    for (const k of s.kpis.filter((k) => k.format === 'money')) expect(isMoneyAmount(k.value)).toBe(true);
    for (const p of s.collections!) {
      expect(isMoneyAmount(p.collected)).toBe(true);
      expect(isMoneyAmount(p.scheduled)).toBe(true);
    }
    const counts = s.funnel!.map((f) => f.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
  });

  it('falls back to six months for an unknown range and refuses residents', async () => {
    expect((await summary({ personaId: 'manager', projectId: 'all' }, 'forever')).range).toBe('6m');
    await expect(summary({ personaId: 'resident', projectId: 'all' })).rejects.toMatchObject({ problem: { status: 403 } });
  });

  it('never presents unverified payment evidence as paid', async () => {
    const s = await summary({ personaId: 'finance', projectId: 'all' });
    for (const item of s.attention.verification ?? []) expect(item.kind).toBe('verification');
    expect(s.kpis.find((k) => k.id === 'verifications')!.value).toBe(String((s.attention.verification ?? []).length));
  });
});
