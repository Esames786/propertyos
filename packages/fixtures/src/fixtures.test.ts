import { isValidIban } from '@repo/i18n/format';
import { LEAD_STATUSES, UNIT_STATUSES, type SearchResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEMO_COLLECTION_ACCOUNT,
  INVOICES,
  LEADS,
  MockTransport,
  PARTIES,
  PROJECTS,
  UNITS,
  type MockContext,
} from './index';

describe('fictional data rules', () => {
  it('uses only non-real contact patterns', () => {
    for (const p of PARTIES) {
      expect(p.phone).toMatch(/^\+92399\d{7}$/);
      expect(p.email).toMatch(/@example\.com$/);
      if (p.cnic) expect(p.cnic).toMatch(/^9\d{4}-\d{7}-\d$/);
    }
  });

  it('uses a checksum-valid IBAN with the non-existent DEMO bank code', () => {
    expect(DEMO_COLLECTION_ACCOUNT.iban.slice(4, 8)).toBe('DEMO');
    expect(isValidIban(DEMO_COLLECTION_ACCOUNT.iban)).toBe(true);
  });

  it('includes Urdu-script names so bidi rendering is exercised', () => {
    expect(PARTIES.some((p) => /[؀-ۿ]/.test(p.displayName))).toBe(true);
  });
});

describe('dataset shape is deterministic', () => {
  it('has the documented sizes', () => {
    expect(PROJECTS).toHaveLength(2);
    expect(UNITS).toHaveLength(496);
    expect(PARTIES).toHaveLength(150);
    expect(LEADS).toHaveLength(120);
    expect(INVOICES).toHaveLength(60);
  });

  it('only uses lifecycle states from blueprint 01 §9', () => {
    UNITS.forEach((u) => expect(UNIT_STATUSES).toContain(u.status));
    LEADS.forEach((l) => expect(LEAD_STATUSES).toContain(l.status));
  });

  it('keeps money as 2-decimal strings', () => {
    [...UNITS.map((u) => u.price), ...INVOICES.flatMap((i) => [i.total, i.paid])].forEach((m) =>
      expect(m.amount).toMatch(/^\d+\.\d{2}$/),
    );
  });

  it('never marks an invoice paid from unverified evidence', () => {
    INVOICES.filter((i) => i.settlement === 'paid').forEach((i) => expect(i.evidence).toBe('verified'));
  });

  it('is stable across module loads (snapshot of first records)', () => {
    expect(UNITS.slice(0, 3).map((u) => [u.ref, u.status, u.price.amount])).toMatchInlineSnapshot(`
      [
        [
          "LH-A-0101",
          "booked",
          "32180000.00",
        ],
        [
          "LH-A-0102",
          "available",
          "21959000.00",
        ],
        [
          "LH-A-0103",
          "booked",
          "22857000.00",
        ],
      ]
    `);
  });
});

describe('MockTransport', () => {
  const make = (ctx: MockContext) => new MockTransport({ getContext: () => ctx, getMode: () => 'fast' });

  it('scopes search by persona: Sales never sees invoices or Gardens records', async () => {
    const sales = make({ personaId: 'sales', projectId: 'all' });
    const res = await sales.request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'LG-P1' } });
    expect(res.records).toHaveLength(0);
    const inv = await sales.request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'INV-2026' } });
    expect(inv.records.filter((r) => r.type === 'invoice')).toHaveLength(0);

    const finance = make({ personaId: 'finance', projectId: 'all' });
    const fin = await finance.request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'INV-2026' } });
    expect(fin.records.filter((r) => r.type === 'invoice').length).toBeGreaterThan(0);
  });

  it('rejects requests from a signed-out session with 401 (fail closed)', async () => {
    const anon = make({ personaId: null, projectId: 'all' });
    await expect(anon.request({ method: 'GET', path: '/units' })).rejects.toMatchObject({ problem: { status: 401, code: 'unauthenticated' } });
  });

  it('routes practice writes to the training store only', async () => {
    const t = make({ personaId: 'sales', projectId: 'all' });
    await t.request({ method: 'POST', path: '/practice/leads', body: { name: 'Practice' }, training: true });
    expect(t.training.list()).toHaveLength(1);
    expect(t.liveMutations()).toHaveLength(0);
    await expect(t.request({ method: 'POST', path: '/practice/leads', body: {} })).rejects.toMatchObject({
      problem: { code: 'training_only' },
    });
  });

  it('simulates offline and outage modes with the error contract', async () => {
    const t = new MockTransport({ getContext: () => ({ personaId: 'manager', projectId: 'all' }), getMode: () => 'offline' });
    await expect(t.request({ method: 'GET', path: '/projects' })).rejects.toMatchObject({
      problem: { code: 'offline', changed: false },
    });
  });
});
