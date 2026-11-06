import {
  ApiError,
  type ApprovalDetail,
  type ApprovalInbox,
  type BankFeed,
  type CashbookView,
  type ChequeDetail,
  type ChequeList,
  type CloseChecklist,
  type CollectionCandidate,
  type DemoStatementFile,
  type DemoStatementOptions,
  type EffectiveAccess,
  type ExportFile,
  type ExportRequest,
  type FinanceAccountDetail,
  type FinanceAccountRow,
  type FinanceOverview,
  type OfficeCashRecorded,
  type OwnershipTransferDetail,
  type PaymentDetail,
  type PaymentList,
  type Permission,
  type Persona,
  type SocietyAuditEntry,
  type SubmissionDetail,
  type SubmissionQueue,
  type TransferDetail,
  type TransferList,
  type VoucherDetail,
  type BatchDetail,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { effectiveAccessFor } from '../../tenant-directory';
import { SOCIETY_SECTION, type SocietyState } from '../state';

/**
 * GitHub Issue #18, through the fail-closed mock API (Al-Noor Residency, demo date 26 October 2026).
 * - **FIN-01 (P0).** The bank feed is a confidentiality boundary: `bank.view` (or `bank.reconcile`).
 *   The building manager Imran (cashbook.view, collections.view, funds_transfer.create, no bank feed)
 *   receives no statement line, statement import, bank transaction or line id, counterparty, full IBAN
 *   or count or amount of lines from any S.1/C.2 read, export or history; a line id he offers answers
 *   like one never issued. The finance roles (Ayesha: bank.view; Saba: bank.view and bank.reconcile)
 *   keep the whole flow.
 * - **FIN-02 (P1).** Every S.1 create sharing the finance key map replays only the exact same request
 *   (operation, principal, target, normalised input), after the target check; any other reuse of the
 *   key is one non-disclosing 409 and nothing changes. A true retry returns the original once.
 * Every refusal is checked to leave the society's stores byte-identical.
 */
const IMRAN = 'alnoor_manager';
const AYESHA = 'alnoor_treasurer';
const SABA = 'alnoor_accounts';
const RABIA = 'alnoor_admin';
const SITE = '/sites/site_alnoor';
const MAIN = 'ben_anr_main';
const COMMITTEE = 'ben_anr_committee';
const OFFICE = 'cac_anr_office';
const PETTY = 'cac_anr_petty';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type AccessFor = (p: Persona) => EffectiveAccess | null;
/** Access as configured, with test-only changes for named personas (added or removed permissions). */
const changed =
  (rules: Record<string, { add?: Permission[]; remove?: Permission[] } | (() => { add?: Permission[]; remove?: Permission[] })>): AccessFor =>
  (p) => {
    const a = effectiveAccessFor(p);
    const raw = rules[p.id];
    const r = typeof raw === 'function' ? raw() : raw;
    if (!a || !r) return a;
    return { ...a, permissions: [...a.permissions.filter((x) => !(r.remove ?? []).includes(x)), ...(r.add ?? [])] };
  };

function session(accessFor?: AccessFor) {
  const demo = new DemoStore(memory());
  let personaId: string | null = SABA;
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(accessFor ? { accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: IMRAN, projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}, opts: { key?: string } = {}) => (await ready, t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}) })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
    /** The society's stores (finance, bank, collections, audit): the state every refusal must leave as it was. */
    state: () => demo.partition('tnt_alnoor').section<SocietyState>(SOCIETY_SECTION, () => {
      throw new Error('society state not created yet');
    }),
    snapshot: () => JSON.stringify(api.state()),
  };
  return api;
}
type Api = ReturnType<typeof session>;

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};

/** A refusal that changes nothing: the society's stores are byte-identical before and after. */
async function refusedUnchanged(s: Api, request: () => Promise<unknown>) {
  await s.get('/finance/overview').catch(() => undefined);
  const before = s.snapshot();
  const r = await refusal(request());
  expect(s.snapshot()).toBe(before);
  return r;
}

const REUSED = { status: 409, code: 'idempotency_key_reused', messageKey: 'finance:problems.idempotencyKeyReused', errors: {} };

async function importSample(s: Api, account: string, choose: (item: DemoStatementOptions['items'][number]) => string) {
  const options = await s.as(SABA).get<DemoStatementOptions>('/finance/demo-statement', { account });
  const file = await s.post<DemoStatementFile>('/finance/demo-statement', { accountId: account, choices: options.items.map((i) => ({ id: i.id, kind: i.kind, ...(i.leg ? { leg: i.leg } : {}), variant: choose(i) })) });
  await s.post('/bank/statements', { beneficiaryId: account, fileName: file.fileName, content: file.content, from: file.from, to: file.to });
  return file;
}

const approve = (s: Api, persona: string, approvalId: string) => s.as(persona).post<ApprovalDetail>(`/approvals/${approvalId}/decide`, { decision: 'approve', reason: 'Checked against the evidence.' });

async function enableOfficeMethods(s: Api) {
  await s.as(AYESHA).patch(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true });
  await s.patch(`${SITE}/cheque-rules`, { enabled: true, payableTo: 'Al-Noor Residency Owners’ Association (Demo)', depositAccountId: MAIN, maxPostDatedDays: 0 });
}

async function payerOf(s: Api, q: string) {
  const [c] = await s.as(SABA).get<CollectionCandidate[]>('/office-collections/candidates', { q });
  return { accountId: c!.billingAccountId, partyId: c!.payers[0]!.partyId };
}

/**
 * A storyline that puts bank data on every S.1/C.2 path: a deposit settled on its statement line,
 * a cheque cleared on its line, a proof waiting on an exception that names another payer's transfer,
 * plus the seed's matched payments and imported statements.
 */
async function bankStoryline(s: Api) {
  await enableOfficeMethods(s);
  const dep = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '10000', purpose: 'Bank the office cash of the week' });
  await approve(s, AYESHA, dep.transfer.approvalId!);
  await s.as(IMRAN).post(`/finance/transfers/${dep.transfer.id}/legs/out/slip`, { slipNo: 'DS-0412', on: '2026-10-26' });
  await s.as(AYESHA).post(`/finance/transfers/${dep.transfer.id}/legs/out/witness`);
  const a101 = await payerOf(s, 'A-101');
  const chq = await s.as(SABA).post<ChequeDetail>('/cheques', { accountId: a101.accountId, payerPartyId: a101.partyId, amount: '5200', drawerBank: 'Demo Bank', number: '004599', date: '2026-10-26' });
  await s.post(`/cheques/${chq.cheque.id}/deposit`, { slipNo: 'CD-0101' });
  // A second cheque, deposited and still waiting: its statement line is a candidate (feed only).
  const b204 = await payerOf(s, 'B-204');
  const waiting = await s.as(SABA).post<ChequeDetail>('/cheques', { accountId: b204.accountId, payerPartyId: b204.partyId, amount: '4200', drawerBank: 'Demo Bank', number: '778899', date: '2026-10-26' });
  await s.post(`/cheques/${waiting.cheque.id}/deposit`, { slipNo: 'CD-0102' });
  await importSample(s, MAIN, () => 'full');
  const legs = await s.as(SABA).get<TransferDetail>(`/finance/transfers/${dep.transfer.id}`);
  await s.post(`/finance/transfers/${dep.transfer.id}/legs/in/match`, { bankLineId: legs.candidates.in.find((c) => c.strength === 'full')!.bankLine.id });
  const deposited = await s.get<ChequeDetail>(`/cheques/${chq.cheque.id}`);
  await s.post(`/cheques/${chq.cheque.id}/clear`, { bankLineId: deposited.candidates.find((c) => c.strength === 'full')!.bankLine.id });
  // A second deposit whose bank line only partly matches: its exception waits and names the line.
  const dep2 = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '3000', purpose: 'Second deposit of the week' });
  await approve(s, AYESHA, dep2.transfer.approvalId!);
  await s.as(IMRAN).post(`/finance/transfers/${dep2.transfer.id}/legs/out/slip`, { slipNo: 'DS-0414', on: '2026-10-26' });
  await s.as(AYESHA).post(`/finance/transfers/${dep2.transfer.id}/legs/out/witness`);
  // The bank takes the cleared cheque back (a debit line) and prints its own reference on the deposit.
  await importSample(s, MAIN, (i) => (i.kind === 'cheque_return' ? 'returned_after_clearing' : i.kind === 'transfer_leg' && i.id === dep2.transfer.id ? 'partial' : 'skip'));
  const partial = await s.as(SABA).get<TransferDetail>(`/finance/transfers/${dep2.transfer.id}`);
  await s.post(`/finance/transfers/${dep2.transfer.id}/legs/in/exception`, { bankLineId: partial.candidates.in.find((c) => c.reasons.includes('amount'))!.bankLine.id, reason: 'The bank printed its own reference; amount, date and depositor agree.' });
  const returned = await s.get<ChequeDetail>(`/cheques/${chq.cheque.id}`);
  const asked = await s.post<ChequeDetail>(`/cheques/${chq.cheque.id}/reversal-request`, { bankLineId: returned.candidates.find((c) => c.reasons.includes('amount'))!.bankLine.id, reason: 'Returned after clearing: account closed' });
  expect(asked.cheque.reversal?.bankLineId).toBeTruthy();
  const queue = await s.get<SubmissionQueue>('/payment-submissions');
  const komal = queue.items.find((r) => r.flats[0] === 'B-405' && r.state === 'submitted')!;
  const d = await s.get<SubmissionDetail>(`/payment-submissions/${komal.id}`);
  const other = d.candidates.find((c) => c.bankLine.counterpartyName === 'IMRAN HUSSAIN')!;
  await s.post(`/payment-submissions/${komal.id}/exception`, { bankLineId: other.bankLine.id, reason: 'Komal says her husband Imran sent it from his account; confirmed by phone.' });
  return { deposit: dep.transfer.id, partialDeposit: dep2.transfer.id, cheque: chq.cheque.id, waitingCheque: waiting.cheque.id, reversalApproval: asked.cheque.reversal!.approvalId, komal: komal.id, otherLine: other.bankLine };
}

/** What only the bank feed may show: every line's ids, counterparty and account, statements, full IBANs. */
async function bankSecrets(s: Api) {
  const feed = await s.as(SABA).get<BankFeed>('/bank/feed');
  const accounts = await s.get<FinanceAccountRow[]>('/finance/accounts');
  const ibans = accounts.map((a) => a.iban).filter((x): x is string => !!x);
  expect(ibans.length).toBeGreaterThanOrEqual(2);
  expect(feed.lines.length).toBeGreaterThan(10);
  return [
    ...feed.lines.flatMap((l) => [l.id, l.bankTxnId, l.counterpartyName, l.counterpartyAccount]),
    ...feed.statements.flatMap((st) => [st.id, st.fileName]),
    ...ibans,
  ].filter((x) => x && x !== '—');
}

/** Every S.1/C.2 read a cashbook or collections reader can call, with each record opened. */
async function everyRead(s: Api, persona: string) {
  const reads: Array<[string, unknown]> = [];
  const get = async <T,>(path: string, query?: Record<string, string>) => {
    const r = await s.as(persona).get<T>(path, query);
    reads.push([`${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`, r]);
    return r;
  };
  await get('/finance/overview');
  await get('/finance/overview', { period: '2026-09' });
  for (const a of await get<FinanceAccountRow[]>('/finance/accounts')) await get(`/finance/accounts/${a.id}`);
  await get('/finance/cashbook');
  for (const account of [MAIN, COMMITTEE, OFFICE, PETTY]) await get('/finance/cashbook', { account, period: '2026-10' });
  await get('/finance/cashbook', { period: '2026-09' });
  for (const t of (await get<TransferList>('/finance/transfers')).items) await get(`/finance/transfers/${t.id}`);
  for (const p of ['2026-09', '2026-10']) await get(`/finance/periods/${p}/checklist`);
  await get('/finance/vouchers');
  for (const sub of (await get<SubmissionQueue>('/payment-submissions')).items) await get(`/payment-submissions/${sub.id}`);
  for (const p of (await get<PaymentList>('/payments')).items) await get(`/payments/${p.id}`);
  for (const c of (await get<ChequeList>('/cheques')).items) await get(`/cheques/${c.id}`);
  const inbox = await get<ApprovalInbox>('/approvals');
  for (const a of [...inbox.mine, ...inbox.requested, ...inbox.others]) await get(`/approvals/${a.id}`);
  await get('/collections/summary');
  await get('/society/dashboard');
  await get<SocietyAuditEntry[]>('/society/audit');
  return reads;
}

// ---------------------------------------------------------------------------------------------
// FIN-01
// ---------------------------------------------------------------------------------------------

describe('Issue #18 FIN-01: the bank feed is for bank.view or bank.reconcile only', { timeout: 30_000 }, () => {
  it('Imran (cashbook, collections, transfers; no bank feed) gets no line, bank id, counterparty, full IBAN or line count from any read, and his reads change nothing', async () => {
    const s = session();
    const story = await bankStoryline(s);
    const secrets = await bankSecrets(s);
    const before = s.snapshot();
    const reads = await everyRead(s, IMRAN);
    expect(s.snapshot()).toBe(before);
    expect(reads.length).toBeGreaterThan(40);
    for (const [path, body] of reads) {
      const text = JSON.stringify(body);
      for (const secret of secrets) expect(text, `${path} → ${secret}`).not.toContain(secret);
    }
    const read = <T,>(path: string) => reads.find(([p]) => p === path)![1] as T;

    // BANK-002: the account itself stays (balance, movements); statements, lines and imports do not.
    const main = read<FinanceAccountDetail>(`/finance/accounts/${MAIN}`);
    expect(main).toMatchObject({ bankFeed: false, statements: [], lines: [], account: { id: MAIN, unreconciled: 0, iban: '•••• 7890' } });
    expect(main.history.map((h) => h.action)).not.toContain('statement_imported');
    expect(Number(main.account.balance.amount)).toBeGreaterThan(0);
    // FIN-001: no statement-line figure and no link to the bank feed.
    const overview = read<FinanceOverview>('/finance/overview');
    expect(overview).toMatchObject({ bankFeed: false, unreconciled: { amount: { amount: '0.00' }, count: 0, href: '' } });
    expect(JSON.stringify(overview)).not.toContain('bank-transaction-feed');
    expect(overview.ladder.bankSettled.href).toBe('/backoffice/bank/cashbook?period=2026-10');
    // BANK-007: the cashbook stays, settled on "a statement line" without naming it; no statement comparison.
    const book = read<CashbookView>(`/finance/cashbook?account=${MAIN}&period=2026-10`);
    expect(book.bankFeed).toBe(false);
    expect(book.reconciliation).toEqual([]);
    expect(book.lines.filter((l) => l.evidence.kind === 'statement_line').length).toBeGreaterThanOrEqual(3);
    for (const l of book.lines) if (l.evidence.kind === 'statement_line') expect(Object.keys(l.evidence).sort()).toEqual(l.evidence.exception ? ['exception', 'kind'] : ['kind']);
    // BANK-006: his own deposit, settled; no candidates; the settlement names no line.
    const dep = read<TransferDetail>(`/finance/transfers/${story.deposit}`);
    expect(dep).toMatchObject({ bankFeed: false, candidates: { out: [], in: [] }, transfer: { status: 'settled', preparedByName: 'Imran Qureshi' } });
    expect(dep.settlements.find((x) => x.leg === 'in')).toMatchObject({ evidenceType: 'statement_line', settledOn: '2026-10-26' });
    expect(dep.settlements.find((x) => x.leg === 'in')!.bankTxnId).toBeUndefined();
    // His second deposit: the exception waiting on its line keeps who, what is missing and why, not the line.
    const partial = read<TransferDetail>(`/finance/transfers/${story.partialDeposit}`);
    expect(partial.transfer.legs[1]).toMatchObject({ status: 'exception_pending', exception: { requestedByName: 'Saba Javed', missing: expect.arrayContaining(['reference']) } });
    expect(Object.keys(partial.transfer.legs[1]!.exception!)).not.toContain('bankLineId');
    // The cheque reversal waiting for approval: its approval names no bank line.
    const reversal = read<ApprovalDetail>(`/approvals/${story.reversalApproval}`);
    expect(reversal.subject.facts.map((f) => f.key)).not.toContain('bankLine');
    expect(read<ChequeDetail>(`/cheques/${story.cheque}`).cheque.reversal).toMatchObject({ reason: 'Returned after clearing: account closed' });
    // BANK-008: the reconciliation check is an outcome only.
    const close = read<CloseChecklist>('/finance/periods/2026-10/checklist');
    expect(close.checks.find((c) => c.key === 'unreconciled_lines')).toEqual({ key: 'unreconciled_lines', outcome: 'blocking', count: 0, restricted: true });
    // FIN-008/009: no candidates, no match signal, the exception names no line; the payee masked.
    const komal = read<SubmissionDetail>(`/payment-submissions/${story.komal}`);
    expect(komal).toMatchObject({ bankFeed: false, candidates: [], submission: { state: 'exception_pending', exception: { missing: ['name'], requestedByName: 'Saba Javed' } } });
    expect(komal.beneficiary?.iban).toBe('•••• 7890');
    expect(read<SubmissionQueue>('/payment-submissions').items.every((r) => r.match === undefined)).toBe(true);
    // FIN-006: a bank-matched payment without its line.
    const payments = read<PaymentList>('/payments').items.filter((p) => p.verification === 'bank_matched');
    expect(payments.length).toBeGreaterThan(0);
    for (const p of payments) expect(read<PaymentDetail>(`/payments/${p.id}`)).toMatchObject({ bankFeed: false, payment: { id: p.id } });
    // The cheque: cleared (its event kept), no candidate and no bank id.
    const cheque = read<ChequeDetail>(`/cheques/${story.cheque}`);
    expect(cheque).toMatchObject({ bankFeed: false, candidates: [], cheque: { status: 'cleared' } });
    expect(cheque.cheque.history.map((h) => h.action)).toContain('cleared');
    expect(read<ChequeDetail>(`/cheques/${story.waitingCheque}`)).toMatchObject({ bankFeed: false, candidates: [], cheque: { status: 'deposited' } });
    // History: no statement or line event at all.
    expect(read<SocietyAuditEntry[]>('/society/audit').some((e) => e.target.kind === 'bank')).toBe(false);
    // Direct calls to the bank feed itself stay refused.
    for (const path of ['/bank/feed', '/bank/reconciliation']) expect(await refusal(s.as(IMRAN).get(path)), path).toMatchObject({ status: 403 });
    expect(await refusal(s.get('/finance/demo-statement', { account: MAIN }))).toMatchObject({ status: 403 });
  });

  it('the finance roles keep the whole flow: Ayesha (bank.view) and Saba (bank.view, bank.reconcile) see lines, candidates, bank ids and counts', async () => {
    const s = session();
    const story = await bankStoryline(s);
    for (const persona of [AYESHA, SABA, RABIA]) {
      const main = await s.as(persona).get<FinanceAccountDetail>(`/finance/accounts/${MAIN}`);
      expect(main.bankFeed, persona).toBe(true);
      expect(main.lines.length, persona).toBeGreaterThan(10);
      expect(main.statements.length, persona).toBeGreaterThanOrEqual(2);
      expect(main.account.iban, persona).toBe('PK36DEMO0000001234567890');
      expect(main.history.map((h) => h.action), persona).toContain('statement_imported');
      const overview = await s.get<FinanceOverview>('/finance/overview');
      expect(overview.bankFeed, persona).toBe(true);
      expect(overview.unreconciled.count, persona).toBeGreaterThan(0);
      const book = await s.get<CashbookView>('/finance/cashbook', { account: MAIN });
      expect(book.reconciliation.length, persona).toBe(1);
      expect(book.lines.some((l) => l.evidence.kind === 'statement_line' && l.evidence.bankTxnId?.startsWith('DEMO-')), persona).toBe(true);
      const dep = await s.get<TransferDetail>(`/finance/transfers/${story.deposit}`);
      expect(dep.settlements.find((x) => x.leg === 'in')!.bankTxnId, persona).toMatch(/^DEMO-/);
      expect((await s.get<TransferDetail>(`/finance/transfers/${story.partialDeposit}`)).transfer.legs[1]!.exception?.bankTxnId, persona).toMatch(/^DEMO-/);
      expect((await s.get<ApprovalDetail>(`/approvals/${story.reversalApproval}`)).subject.facts.map((f) => f.key), persona).toContain('bankLine');
      expect((await s.get<ChequeDetail>(`/cheques/${story.cheque}`)).cheque.history.find((h) => h.action === 'cleared')?.note, persona).toMatch(/^DEMO-/);
      expect((await s.get<ChequeDetail>(`/cheques/${story.waitingCheque}`)).candidates.length, persona).toBeGreaterThan(0);
      const komal = await s.get<SubmissionDetail>(`/payment-submissions/${story.komal}`);
      expect(komal.candidates.length, persona).toBeGreaterThan(0);
      expect(komal.submission.exception?.bankTxnId, persona).toBe(story.otherLine.bankTxnId);
      expect((await s.get<SubmissionQueue>('/payment-submissions')).items.every((r) => r.match !== undefined), persona).toBe(true);
      const close = await s.get<CloseChecklist>('/finance/periods/2026-10/checklist');
      expect(close.checks.find((c) => c.key === 'unreconciled_lines')!.count, persona).toBeGreaterThan(0);
      expect((await s.get<SocietyAuditEntry[]>('/society/audit')).some((e) => e.target.kind === 'bank'), persona).toBe(true);
    }
    // The reconciler (bank.reconcile) still matches and clears: a second deposit settles on its line.
    const dep2 = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', { kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '1000', purpose: 'Second deposit of the week' });
    await approve(s, AYESHA, dep2.transfer.approvalId!);
    await s.as(IMRAN).post(`/finance/transfers/${dep2.transfer.id}/legs/out/slip`, { slipNo: 'DS-0413', on: '2026-10-26' });
    await s.as(AYESHA).post(`/finance/transfers/${dep2.transfer.id}/legs/out/witness`);
    await importSample(s, MAIN, () => 'full');
    const pending = await s.as(SABA).get<TransferDetail>(`/finance/transfers/${dep2.transfer.id}`);
    const settled = await s.post<TransferDetail>(`/finance/transfers/${dep2.transfer.id}/legs/in/match`, { bankLineId: pending.candidates.in.find((c) => c.strength === 'full')!.bankLine.id });
    expect(settled.transfer.status).toBe('settled');
  });

  it('bank.reconcile alone is the justified exception: a reconciler without bank.view sees the lines of S.1', async () => {
    const s = session(changed({ [IMRAN]: { add: ['bank.reconcile'] } }));
    await bankStoryline(s);
    const main = await s.as(IMRAN).get<FinanceAccountDetail>(`/finance/accounts/${MAIN}`);
    expect([main.bankFeed, main.lines.length > 10]).toEqual([true, true]);
  });

  it('no line-id oracle: a proof reviewer or cheque officer without the bank feed is answered the same for a real line and one never issued, and nothing changes', async () => {
    const s = session(changed({ [IMRAN]: { add: ['finance.evidence.review', 'cheque.manage'] } }));
    const story = await bankStoryline(s);
    // A real line (the other payer's transfer the exception names), an unclaimed line, and one never issued.
    const unclaimed = (await s.as(SABA).get<BankFeed>('/bank/feed', { state: 'unmatched' })).lines.find((l) => !l.heldFor && !l.heldBy)!;
    const queue = await s.as(SABA).get<SubmissionQueue>('/payment-submissions');
    const a305 = queue.items.find((r) => r.flats[0] === 'A-305' && r.state === 'submitted')!;
    const never = await refusedUnchanged(s, () => s.as(IMRAN).post(`/payment-submissions/${a305.id}/verify`, { bankLineId: 'bnl_anr_9999', amount: '8400' }));
    expect(never).toMatchObject({ status: 404, code: 'not_found' });
    for (const line of [story.otherLine.id, unclaimed.id]) {
      expect(await refusedUnchanged(s, () => s.as(IMRAN).post(`/payment-submissions/${a305.id}/verify`, { bankLineId: line, amount: '8400' })), line).toEqual(never);
      expect(await refusedUnchanged(s, () => s.as(IMRAN).post(`/payment-submissions/${a305.id}/exception`, { bankLineId: line, reason: 'A reason long enough for an exception.' })), line).toEqual(never);
    }
    // The cleared cheque's reversal on a bank debit line (the storyline's request rejected first, so
    // the cheque can be asked about again): every line is unknown without the feed.
    await s.as(AYESHA).post(`/approvals/${story.reversalApproval}/decide`, { decision: 'reject', reason: 'The bank confirmed the cheque was not returned.' });
    const debit = (await s.as(SABA).get<ChequeDetail>(`/cheques/${story.cheque}`)).candidates.find((c) => c.reasons.includes('amount'))!.bankLine.id;
    const unknownLine = await refusedUnchanged(s, () => s.as(IMRAN).post(`/cheques/${story.cheque}/reversal-request`, { bankLineId: 'bnl_anr_9999', reason: 'Returned after clearing' }));
    expect(unknownLine).toMatchObject({ status: 409, code: 'line_unknown' });
    for (const line of [debit, unclaimed.id]) expect(await refusedUnchanged(s, () => s.as(IMRAN).post(`/cheques/${story.cheque}/reversal-request`, { bankLineId: line, reason: 'Returned after clearing' })), line).toEqual(unknownLine);
    // Saba (the feed) may still ask, on the same debit line.
    expect((await s.as(SABA).post<ChequeDetail>(`/cheques/${story.cheque}/reversal-request`, { bankLineId: debit, reason: 'Returned after clearing: account closed' })).cheque.reversal?.bankLineId).toBe(debit);
    // The reviewer still sees proofs, without candidates.
    expect((await s.as(IMRAN).get<SubmissionDetail>(`/payment-submissions/${a305.id}`)).candidates).toEqual([]);
  });

  it('exports: the bank-lines dataset needs bank.view, and the audit dataset leaves out statement and line events and full IBANs', async () => {
    const s = session(changed({ [IMRAN]: { add: ['data_export.request', 'admin.view'] } }));
    await bankStoryline(s);
    const secrets = await bankSecrets(s);
    const req = await s.as(IMRAN).post<ExportRequest>('/data-exports', { datasets: ['bank_lines', 'audit', 'payments'], purpose: 'Committee year-end pack for the auditor', format: 'csv' });
    expect(req.datasets.find((d) => d.dataset === 'bank_lines')).toMatchObject({ included: false, reason: 'permission_missing' });
    await s.as(AYESHA).post(`/data-exports/${req.id}/decide`, { decision: 'approve' });
    const file = await s.as(IMRAN).post<ExportFile>(`/data-exports/${req.id}/download`);
    expect(file.content).toContain('# audit (');
    for (const secret of secrets) expect(file.content, secret).not.toContain(secret);
  });

  it('grant revocation: a finance reader who loses bank.view stops receiving lines at once', async () => {
    let revoked = false;
    const s = session(changed({ [AYESHA]: () => (revoked ? { remove: ['bank.view'] } : {}) }));
    await bankStoryline(s);
    expect((await s.as(AYESHA).get<FinanceAccountDetail>(`/finance/accounts/${MAIN}`)).lines.length).toBeGreaterThan(10);
    revoked = true;
    const after = await s.get<FinanceAccountDetail>(`/finance/accounts/${MAIN}`);
    expect([after.bankFeed, after.lines, after.statements]).toEqual([false, [], []]);
    expect(await refusal(s.get('/bank/feed'))).toMatchObject({ status: 403 });
  });
});

// ---------------------------------------------------------------------------------------------
// FIN-02
// ---------------------------------------------------------------------------------------------

const voucher = (body: Record<string, unknown> = {}) => ({
  accountId: PETTY,
  direction: 'payment',
  category: 'cleaning',
  amount: '1,200',
  onDate: '2026-10-25',
  purpose: 'Cleaning supplies for the lobby',
  counterparty: 'Demo Cleaning Store',
  evidence: { name: 'receipt-0042.pdf', kind: 'receipt', size: 12000 },
  submit: true,
  ...body,
});
const deposit = (body: Record<string, unknown> = {}) => ({ kind: 'deposit', fromAccountId: OFFICE, toAccountId: MAIN, amount: '2000', purpose: 'Bank the office cash', ...body });

describe('Issue #18 FIN-02: an idempotency key replays only the exact same request', { timeout: 30_000 }, () => {
  it('voucher: another amount, account, category or submit choice with the same key is refused unchanged; the identical retry (amount written differently) replays once; a second create with a new key is a second voucher', async () => {
    const s = session();
    const first = await s.as(SABA).post<VoucherDetail>('/finance/vouchers', voucher(), { key: 'k-v1' });
    const count = () => s.state().finance.vouchers.length;
    const n = count();
    for (const change of [{ amount: '1,300' }, { accountId: OFFICE }, { category: 'repairs' }, { submit: false }, { purpose: 'Something else entirely' }]) {
      expect(await refusedUnchanged(s, () => s.post('/finance/vouchers', voucher(change), { key: 'k-v1' })), JSON.stringify(change)).toEqual(REUSED);
    }
    // The same key in the body (the S.1 contract) is the same key.
    expect(await refusedUnchanged(s, () => s.post('/finance/vouchers', { ...voucher({ amount: '999' }), idempotencyKey: 'k-v1' }))).toEqual(REUSED);
    const retry = await s.post<VoucherDetail>('/finance/vouchers', voucher({ amount: '1200.00' }), { key: 'k-v1' });
    expect([retry.voucher.id, retry.voucher.ref, count()]).toEqual([first.voucher.id, first.voucher.ref, n]);
    expect(s.state().finance.approvals.filter((a) => a.subjectId === first.voucher.id)).toHaveLength(1);
    const second = await s.post<VoucherDetail>('/finance/vouchers', voucher({ amount: '800', purpose: 'Second purchase of cleaning supplies' }), { key: 'k-v2' });
    expect(second.voucher.id).not.toBe(first.voucher.id);
    expect([second.voucher.amount.amount, count()]).toEqual(['800.00', n + 1]);
  });

  it('the same key on another endpoint (transfer, office cash, collection, cheque, society transfer) is refused unchanged, whichever came first', async () => {
    const s = session();
    await enableOfficeMethods(s);
    const a101 = await payerOf(s, 'A-101');
    await s.as(SABA).post('/finance/vouchers', voucher(), { key: 'k-shared' });
    const others: Array<[string, unknown, string]> = [
      ['/finance/transfers', deposit(), SABA],
      ['/payments/office', { accountId: a101.accountId, payerPartyId: a101.partyId, amount: '500', note: '' }, SABA],
      ['/office-collections', {}, SABA],
      ['/cheques', { accountId: a101.accountId, payerPartyId: a101.partyId, amount: '5200', drawerBank: 'Demo Bank', number: '004777', date: '2026-10-26' }, SABA],
      ['/ownership-transfers', { flatId: 'unt_anr_b403', toName: 'Nadia Farooq', toPhone: '+92 399 555 0142', effectiveOn: '2026-12-01', reason: 'Sale deed registered on 20 October 2026' }, IMRAN],
    ];
    for (const [path, body, who] of others) expect(await refusedUnchanged(s, () => s.as(who).post(path, body, { key: 'k-shared' })), path).toEqual(REUSED);
    // The other way round: a transfer key on the voucher endpoint.
    await s.as(SABA).post('/finance/transfers', deposit(), { key: 'k-trf' });
    expect(await refusedUnchanged(s, () => s.post('/finance/vouchers', voucher(), { key: 'k-trf' }))).toEqual(REUSED);
    // A key stored before Issue #18 (an id alone, never bound to a request) replays nothing.
    s.state().finance.idempotency['k-legacy'] = s.state().finance.vouchers[0]!.id;
    expect(await refusedUnchanged(s, () => s.post('/finance/vouchers', voucher(), { key: 'k-legacy' }))).toEqual(REUSED);
  });

  it('transfer: another person (keys are per principal) or target is refused without returning the first record; another entity’s account is refused like one never issued, before any replay; the first preparer’s retry replays once', async () => {
    const s = session();
    const mine = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', deposit(), { key: 'k-dep' });
    // Saba (also funds_transfer.create): the identical body with Imran's key.
    const cross = await refusedUnchanged(s, () => s.as(SABA).post('/finance/transfers', deposit(), { key: 'k-dep' }));
    expect(cross).toEqual(REUSED);
    expect(JSON.stringify(cross)).not.toMatch(/trf_|ANR-|Imran/);
    // Imran: same key, another target (the committee account) or amount.
    for (const change of [{ toAccountId: COMMITTEE }, { amount: '2500' }, { kind: 'cash_transfer', toAccountId: PETTY }]) {
      expect(await refusedUnchanged(s, () => s.as(IMRAN).post('/finance/transfers', deposit(change), { key: 'k-dep' })), JSON.stringify(change)).toEqual(REUSED);
    }
    // Another legal entity's account (the platform's): the same answer as an account never issued.
    const never = await refusedUnchanged(s, () => s.as(IMRAN).post('/finance/transfers', deposit({ kind: 'transfer', fromAccountId: MAIN, toAccountId: 'ben_none' }), { key: 'k-x' }));
    expect(never).toMatchObject({ status: 422, code: 'account_unknown' });
    expect(await refusedUnchanged(s, () => s.as(IMRAN).post('/finance/transfers', deposit({ kind: 'transfer', fromAccountId: MAIN, toAccountId: 'ben_platform_saas' }), { key: 'k-dep' }))).toEqual(never);
    // Imran's own identical retry (amount written another way): the same instruction, once.
    const retry = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', deposit({ amount: '2,000.00' }), { key: 'k-dep' });
    expect([retry.transfer.id, s.state().finance.transfers.length, s.state().finance.approvals.filter((a) => a.subjectId === mine.transfer.id).length]).toEqual([mine.transfer.id, 1, 1]);
    // A second legitimate deposit in the same session (a new key) is a second instruction with its own reference.
    const second = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', deposit({ amount: '1500', purpose: 'Second deposit of the week' }), { key: 'k-dep-2' });
    expect(second.transfer.ref).not.toBe(mine.transfer.ref);
    expect(s.state().finance.transfers).toHaveLength(2);
  });

  it('grant revocation: a retry after the preparer lost the permission is refused and returns nothing of the record', async () => {
    let revoked = false;
    const s = session(changed({ [IMRAN]: () => (revoked ? { remove: ['funds_transfer.create'] } : {}) }));
    const mine = await s.as(IMRAN).post<TransferDetail>('/finance/transfers', deposit(), { key: 'k-rev' });
    revoked = true;
    const r = await refusedUnchanged(s, () => s.as(IMRAN).post('/finance/transfers', deposit(), { key: 'k-rev' }));
    expect(r).toMatchObject({ status: 403 });
    expect(JSON.stringify(r)).not.toContain(mine.transfer.ref);
  });

  it('office cash, collections, cheques and society transfers: another payer, flat, cheque or collector is refused unchanged; the identical retry replays even where a fresh request would now be refused as a duplicate', async () => {
    const s = session();
    await enableOfficeMethods(s);
    const [a101, b204] = [await payerOf(s, 'A-101'), await payerOf(s, 'B-204')];
    // FIN-007 office cash.
    const cash = { accountId: a101.accountId, payerPartyId: a101.partyId, amount: '500', note: '' };
    const recorded = await s.as(SABA).post<OfficeCashRecorded>('/payments/office', cash, { key: 'k-cash' });
    for (const change of [{ accountId: b204.accountId, payerPartyId: b204.partyId }, { amount: '600' }, { note: 'Another note' }]) {
      expect(await refusedUnchanged(s, () => s.post('/payments/office', { ...cash, ...change }, { key: 'k-cash' })), JSON.stringify(change)).toEqual(REUSED);
    }
    const cashAgain = await s.post<OfficeCashRecorded>('/payments/office', cash, { key: 'k-cash' });
    expect([cashAgain.batch.id, cashAgain.replayed]).toEqual([recorded.batch.id, true]);
    // FIN-013 a collection started: another collector (Ayesha also receives payments) with the key is refused.
    const batch = await s.as(SABA).post<BatchDetail>('/office-collections', {}, { key: 'k-batch' });
    expect(await refusedUnchanged(s, () => s.as(AYESHA).post('/office-collections', {}, { key: 'k-batch' }))).toEqual(REUSED);
    expect((await s.as(SABA).post<BatchDetail>('/office-collections', {}, { key: 'k-batch' })).batch.id).toBe(batch.batch.id);
    const second = await s.post<BatchDetail>('/office-collections', {}, { key: 'k-batch-2' });
    expect(second.batch.id).not.toBe(batch.batch.id);
    // A cheque: the retry replays, although the same cheque again would be a duplicate.
    const chq = { accountId: a101.accountId, payerPartyId: a101.partyId, amount: '5200', drawerBank: 'Demo Bank', number: '004888', date: '2026-10-26' };
    const c = await s.post<ChequeDetail>('/cheques', chq, { key: 'k-chq' });
    for (const change of [{ number: '004889' }, { amount: '5300' }, { accountId: b204.accountId, payerPartyId: b204.partyId }]) {
      expect(await refusedUnchanged(s, () => s.post('/cheques', { ...chq, ...change }, { key: 'k-chq' })), JSON.stringify(change)).toEqual(REUSED);
    }
    expect((await s.post<ChequeDetail>('/cheques', chq, { key: 'k-chq' })).cheque.id).toBe(c.cheque.id);
    expect(await refusal(s.post('/cheques', chq, { key: 'k-chq-2' }))).toMatchObject({ code: 'cheque_duplicate' });
    // OWN-003: another flat with the key is refused; the retry replays although the flat now has an open transfer.
    const own = { flatId: 'unt_anr_b403', toName: 'Nadia Farooq', toPhone: '+92 399 555 0142', effectiveOn: '2026-12-01', reason: 'Sale deed registered on 20 October 2026' };
    const t = await s.as(IMRAN).post<OwnershipTransferDetail>('/ownership-transfers', own, { key: 'k-own' });
    for (const change of [{ flatId: 'unt_anr_a102' }, { toName: 'Someone Else' }, { effectiveOn: '2027-01-01' }]) {
      expect(await refusedUnchanged(s, () => s.post('/ownership-transfers', { ...own, ...change }, { key: 'k-own' })), JSON.stringify(change)).toEqual(REUSED);
    }
    // Rabia (also transfer.review) with Imran's key and his exact request: keys are per person.
    expect(await refusedUnchanged(s, () => s.as(RABIA).post('/ownership-transfers', own, { key: 'k-own' }))).toEqual(REUSED);
    expect((await s.as(IMRAN).post<OwnershipTransferDetail>('/ownership-transfers', own, { key: 'k-own' })).transfer.id).toBe(t.transfer.id);
    expect(s.state().finance.ownership).toHaveLength(1);
  });

  it('the stored binding decides: an entry for another operation, or a record that no longer fits the request, never replays', async () => {
    const s = session();
    const a = await s.as(SABA).post<VoucherDetail>('/finance/vouchers', voucher(), { key: 'k-bound' });
    const b = await s.post<VoucherDetail>('/finance/vouchers', voucher({ accountId: OFFICE, purpose: 'Office cleaning supplies' }), { key: 'k-other' });
    const map = s.state().finance.idempotency;
    const entry = map['k-bound'] as { op: string; recordId: string };
    // Another operation with otherwise the same principal, target and input: refused.
    entry.op = 'transfer.create';
    expect(await refusedUnchanged(s, () => s.post('/finance/vouchers', voucher(), { key: 'k-bound' }))).toEqual(REUSED);
    entry.op = 'voucher.create';
    // The stored record no longer fits the request (it names the office voucher): not found, never that voucher.
    entry.recordId = b.voucher.id;
    const r = await refusedUnchanged(s, () => s.post('/finance/vouchers', voucher(), { key: 'k-bound' }));
    expect(r).toMatchObject({ status: 404, code: 'not_found' });
    expect(JSON.stringify(r)).not.toContain(b.voucher.ref);
    entry.recordId = a.voucher.id;
    expect((await s.post<VoucherDetail>('/finance/vouchers', voucher(), { key: 'k-bound' })).voucher.id).toBe(a.voucher.id);
  });

  it('the refusal says nothing about what the key was used for, in either language', async () => {
    const s = session();
    await s.as(SABA).post('/finance/vouchers', voucher(), { key: 'k-quiet' });
    const r = await refusedUnchanged(s, () => s.as(IMRAN).post('/finance/transfers', deposit(), { key: 'k-quiet' }));
    expect(r).toEqual(REUSED);
    const en = (await import('../../../../i18n/locales/en-PK/finance.json')).default as { problems: Record<string, string> };
    const ur = (await import('../../../../i18n/locales/ur-PK/finance.json')).default as { problems: Record<string, string> };
    expect(en.problems.idempotencyKeyReused).toMatch(/Nothing was changed/);
    expect(ur.problems.idempotencyKeyReused).toBeTruthy();
  });
});
