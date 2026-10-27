import {
  ApiError,
  INSTALMENT_STATUSES,
  isMoneyAmount,
  type InstalmentItem,
  type PortalHome,
  type PortalPayments,
  type PortalServices,
  type ReceiptDetail,
  type ServiceRequest,
  type VisitorPass,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from './demo-store';
import { MockTransport, type MockContext } from './mock-transport';
import { daysBetween, fromPaisa, instalmentStatus, toPaisa } from './portal';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
};

const RESIDENT: MockContext = { personaId: 'resident', projectId: 'all' };
const make = (ctx: MockContext = RESIDENT, demo = new DemoStore(memoryStorage())) =>
  new MockTransport({ getContext: () => ctx, getMode: () => 'fast', demo });

const get = <T,>(t: MockTransport, path: string) => t.request<T>({ method: 'GET', path });
const post = <T,>(t: MockTransport, path: string, body: unknown) => t.request<T>({ method: 'POST', path, body });

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('expected the request to fail');
}

describe('portal money helpers', () => {
  it('round-trips integer paisa without float drift', () => {
    expect(toPaisa('804500.00')).toBe(80450000n);
    expect(toPaisa('0.5')).toBe(50n);
    expect(fromPaisa(1n)).toBe('0.01');
    expect(fromPaisa(-123456n)).toBe('-1234.56');
    expect(fromPaisa(toPaisa('32180000.00') - toPaisa('3218000.00'))).toBe('28962000.00');
  });

  it('derives statuses from evidence and the fixture clock', () => {
    expect(instalmentStatus('verified', '2020-01-01')).toBe('paid');
    expect(instalmentStatus('submitted', '2020-01-01')).toBe('awaiting_verification');
    expect(instalmentStatus('needs_information', '2030-01-01')).toBe('needs_information');
    expect(instalmentStatus('none', '2026-10-01', '2026-10-26')).toBe('overdue');
    expect(instalmentStatus('none', '2026-11-10', '2026-10-26')).toBe('due');
    expect(instalmentStatus('none', '2027-01-10', '2026-10-26')).toBe('upcoming');
    expect(daysBetween('2026-10-26', '2026-11-10')).toBe(15);
  });
});

describe('GET /portal/payments (PORTAL-004)', () => {
  it('returns a deterministic 36-instalment plan that adds up to the unit price', async () => {
    const a = await get<PortalPayments>(make(), '/portal/payments');
    const b = await get<PortalPayments>(make(), '/portal/payments');
    expect(a.schedule).toEqual(b.schedule);
    const instalments = a.schedule.filter((i) => i.kind === 'instalment');
    expect(instalments).toHaveLength(36);
    expect(a.schedule[0]!.kind).toBe('down_payment');
    expect(a.schedule.every((i) => isMoneyAmount(i.amount.amount) && INSTALMENT_STATUSES.includes(i.status))).toBe(true);
    const total = a.schedule.reduce((s, i) => s + toPaisa(i.amount.amount), 0n);
    expect(fromPaisa(total)).toBe(a.plan.totalPrice.amount);
    expect(a.property.unitRef).toBe('LH-A-0101');
    // Dates are monthly, on the same day, in order.
    const dates = instalments.map((i) => i.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates.map((d) => d.slice(8))).size).toBe(1);
  });

  it('tells a believable story relative to the fixture clock', async () => {
    const { schedule, plan, receipts, collectionAccount } = await get<PortalPayments>(make(), '/portal/payments');
    const by = (s: InstalmentItem['status']) => schedule.filter((i) => i.status === s);
    expect(by('paid').length).toBe(15); // down payment + 14 instalments
    expect(by('needs_information')).toHaveLength(1);
    expect(by('due')).toHaveLength(1);
    expect(by('overdue')).toHaveLength(0);
    expect(by('awaiting_verification')).toHaveLength(0);
    expect(plan.paidCount).toBe(14);
    expect(plan.instalmentCount).toBe(36);
    expect(fromPaisa(toPaisa(plan.paidToDate.amount) + toPaisa(plan.outstanding.amount))).toBe(plan.totalPrice.amount);
    expect(plan.paidShare).toBeCloseTo(0.45, 2);
    expect(receipts).toHaveLength(15);
    expect(receipts[0]!.instalmentNumber).toBe(14);
    expect(collectionAccount.bankName).toMatch(/fictional/i);
    expect(collectionAccount.iban.startsWith('PK')).toBe(true);
  });
});

describe('proof upload and the pay-online simulation never mark an instalment paid', () => {
  it('upload proof → awaiting verification on payments and home; totals unchanged; no receipt', async () => {
    const t = make();
    const before = await get<PortalPayments>(t, '/portal/payments');
    const due = before.schedule.find((i) => i.status === 'due')!;
    const updated = await post<InstalmentItem>(t, `/portal/instalments/${due.id}/proof`, {
      method: 'bank_transfer',
      amount: due.amount.amount,
      paidOn: '2026-10-25',
      reference: 'FT26123456',
      fileName: 'slip.png',
    });
    expect(updated.status).toBe('awaiting_verification');
    expect(updated.evidence).toBe('submitted');
    expect(updated.receiptId).toBeUndefined();

    const after = await get<PortalPayments>(t, '/portal/payments');
    const item = after.schedule.find((i) => i.id === due.id)!;
    expect(item.status).toBe('awaiting_verification');
    expect(item.proof?.simulated).toBe(false);
    expect(after.plan.paidToDate).toEqual(before.plan.paidToDate);
    expect(after.plan.awaitingVerification.amount).toBe(due.amount.amount);
    expect(after.receipts).toHaveLength(before.receipts.length);
    expect(after.schedule.filter((i) => i.status === 'paid')).toHaveLength(before.schedule.filter((i) => i.status === 'paid').length);

    const home = await get<PortalHome>(t, '/portal/home');
    expect(home.nextInstalment?.id).toBe(due.id);
    expect(home.nextInstalment?.status).toBe('awaiting_verification');
  });

  it('the online simulation also ends at awaiting verification and is labelled simulated', async () => {
    const t = make();
    const { schedule } = await get<PortalPayments>(t, '/portal/payments');
    const target = schedule.find((i) => i.status === 'upcoming')!;
    const result = await post<InstalmentItem>(t, `/portal/instalments/${target.id}/simulate-online`, {});
    expect(result.status).toBe('awaiting_verification');
    expect(result.proof).toMatchObject({ method: 'online_simulated', simulated: true });
    expect(result.status).not.toBe('paid');
  });

  it('a proof re-uploaded for "needs information" clears the finance note', async () => {
    const t = make();
    const { schedule } = await get<PortalPayments>(t, '/portal/payments');
    const asked = schedule.find((i) => i.status === 'needs_information')!;
    expect(asked.financeNoteKey).toBe('portal:payments.financeNote.unclear');
    const result = await post<InstalmentItem>(t, `/portal/instalments/${asked.id}/proof`, { method: 'cheque', amount: asked.amount.amount, paidOn: '2026-10-20', reference: 'CHQ-123456' });
    expect(result.status).toBe('awaiting_verification');
    expect(result.financeNoteKey).toBeUndefined();
    const home = await get<PortalHome>(t, '/portal/home');
    expect(home.attention).toHaveLength(0);
  });

  it('refuses paid or already-submitted instalments and invalid input', async () => {
    const t = make();
    const { schedule } = await get<PortalPayments>(t, '/portal/payments');
    const paid = schedule.find((i) => i.status === 'paid')!;
    expect((await rejection(post(t, `/portal/instalments/${paid.id}/proof`, {}))).problem.status).toBe(409);
    const due = schedule.find((i) => i.status === 'due')!;
    const bad = await rejection(post(t, `/portal/instalments/${due.id}/proof`, { method: 'bank_transfer', amount: '-5', paidOn: '2026-10-25', reference: 'FT1234' }));
    expect(bad.problem.status).toBe(422);
    expect(Object.keys(bad.problem.errors ?? {})).toEqual(['amount']);
    await post(t, `/portal/instalments/${due.id}/simulate-online`, {});
    expect((await rejection(post(t, `/portal/instalments/${due.id}/simulate-online`, {}))).problem.status).toBe(409);
    expect((await rejection(post(t, '/portal/instalments/ins_99/proof', {}))).problem.status).toBe(404);
  });

  it('keeps session writes in the demo store (survives a new transport on the same store)', async () => {
    const demo = new DemoStore(memoryStorage());
    const t1 = make(RESIDENT, demo);
    const { schedule } = await get<PortalPayments>(t1, '/portal/payments');
    const due = schedule.find((i) => i.status === 'due')!;
    await post(t1, `/portal/instalments/${due.id}/simulate-online`, {});
    const t2 = make(RESIDENT, demo);
    const after = await get<PortalPayments>(t2, '/portal/payments');
    expect(after.schedule.find((i) => i.id === due.id)!.status).toBe('awaiting_verification');
  });
});

describe('receipts, construction and documents', () => {
  it('serves receipt detail for a verified instalment only', async () => {
    const t = make();
    const { receipts } = await get<PortalPayments>(t, '/portal/payments');
    const detail = await get<ReceiptDetail>(t, `/portal/receipts/${receipts[0]!.id}`);
    expect(detail.ref).toMatch(/^RCP-\d{4}-\d{6}$/);
    expect(detail.owner.displayName).toBe('Usman Tariq');
    expect((await rejection(get(t, '/portal/receipts/rcp_99'))).problem.status).toBe(404);
  });

  it('home summarises construction, documents and services', async () => {
    const home = await get<PortalHome>(make(), '/portal/home');
    expect(home.construction.progress).toBe(0.64);
    expect(home.construction.latest?.titleKey).toMatch(/^portal:/);
    expect(home.documents.count).toBeGreaterThan(3);
    expect(home.recentReceipts).toHaveLength(3);
    expect(home.recentReceipts.every((r) => isMoneyAmount(r.amount.amount))).toBe(true);
    expect(home.services).toEqual({ openRequests: 1, activePasses: 1 });
  });
});

describe('services: maintenance requests and visitor passes', () => {
  it('a new maintenance request appears first in the list and counts as open', async () => {
    const t = make();
    const created = await post<ServiceRequest>(t, '/portal/service-requests', { category: 'plumbing', description: 'Kitchen sink drains slowly', preferredDate: '2026-10-30' });
    expect(created.status).toBe('submitted');
    expect(created.ref).toMatch(/^SR-2026-\d{4}$/);
    const services = await get<PortalServices>(t, '/portal/services');
    expect(services.requests[0]).toMatchObject({ id: created.id, createdInSession: true });
    const home = await get<PortalHome>(t, '/portal/home');
    expect(home.services.openRequests).toBe(2);
    expect((await rejection(post(t, '/portal/service-requests', { category: 'roof', description: 'x' }))).problem.status).toBe(422);
  });

  it('a visitor pass gets a gate code and validates the phone number', async () => {
    const t = make();
    const pass = await post<VisitorPass>(t, '/portal/visitor-passes', { visitorName: 'Ali Raza', purpose: 'guest', visitDate: '2026-10-28', phone: '0399 1234567' });
    expect(pass.code).toMatch(/^LKS-\d{4}$/);
    expect(pass.phone).toBe('+923991234567');
    expect(pass.status).toBe('active');
    const services = await get<PortalServices>(t, '/portal/services');
    expect(services.passes[0]!.id).toBe(pass.id);
    const bad = await rejection(post(t, '/portal/visitor-passes', { visitorName: 'Ali', purpose: 'guest', visitDate: '2026-10-28', phone: '12' }));
    expect(bad.problem.errors).toHaveProperty('phone');
  });
});

describe('access control', () => {
  it('only the customer-app resident may use portal endpoints', async () => {
    // Staff lack portal.use (403); a signed-out session is not authenticated at all (401).
    for (const [personaId, status] of [['manager', 403], ['sales', 403], ['finance', 403], [null, 401]] as const) {
      const t = make({ personaId, projectId: 'all' });
      for (const path of ['/portal/home', '/portal/payments', '/portal/services', '/portal/documents', '/portal/construction']) {
        expect((await rejection(get(t, path))).problem.status, `${personaId} ${path}`).toBe(status);
      }
      expect((await rejection(post(t, '/portal/visitor-passes', { visitorName: 'X Y', purpose: 'guest', visitDate: '2026-10-28' }))).problem.status).toBe(status);
    }
  });

  it('respects the project filter', async () => {
    const t = make({ personaId: 'resident', projectId: 'prj_gardens' });
    expect((await rejection(get(t, '/portal/home'))).problem.status).toBe(403);
  });
});
