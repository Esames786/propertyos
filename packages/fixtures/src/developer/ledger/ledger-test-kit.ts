import { ApiError, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import { pkt } from '../../hr/state';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS } from '../../people';
import { effectiveAccessFor } from '../../tenant-directory';
import { addJournal, approveJournal, normaliseJournal, postJournal, submitJournal } from './engine';
import { accountId, LEDGER_SECTION, LEDGER_TODAY, MEHREEN, SAAD, seedEntity, type LedgerState } from './state';

/**
 * TEST ONLY helpers for the Gate E.7 API tests: one demo session through the fail-closed mock transport,
 * as a chosen persona, with an optional access override, and the E-08 multi-entity fixture (a second,
 * test-only Larkspur legal entity with its own chart, bank account, cost centre and posted journal).
 * Demo ids never change; nothing here is reachable from the app.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

export type AccessFor = (p: Persona) => EffectiveAccess | null;

export const plus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: [...a.permissions, ...permissions] });
export const minus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: a.permissions.filter((x) => !permissions.includes(x)) });
export const entitiesOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'legal_entity', ids }] });
export const projectsOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'project', ids }] });
export const suspended = (a: EffectiveAccess): EffectiveAccess => ({ ...a, tenant: { ...a.tenant, status: 'suspended' } });

/** Access as configured, changed for the named personas only (the change may be swapped later: revocation). */
export function changing(): { accessFor: AccessFor; set: (personaIds: readonly string[], change: ((a: EffectiveAccess) => EffectiveAccess) | null) => void } {
  const changes = new Map<string, (a: EffectiveAccess) => EffectiveAccess>();
  return {
    accessFor: (p) => {
      const a = effectiveAccessFor(p);
      const c = changes.get(p.id);
      return a && c ? c(a) : a;
    },
    set: (ids, change) => {
      for (const id of ids) {
        if (change) changes.set(id, change);
        else changes.delete(id);
      }
    },
  };
}

export const SECOND = { id: 'le_lk_test2', code: 'LGD', name: 'Larkspur Gardens Development (Pvt) Ltd (Test only)', bank: 'lba_lgd_test', iban: 'PK00TEST0000000000002222', cc: 'cc_lgd_test', journalMemo: 'Test-only second entity accrual' };

/** E-08: a second legal entity for isolation tests (test only), with a posted journal and a bank account. */
export function addSecondEntity(s: LedgerState): { journalId: string; accountIds: { expense: string; accrued: string; cash: string } } {
  seedEntity(s, { id: SECOND.id, name: SECOND.name, code: SECOND.code, fiscalYearStartMonth: 7, booksFrom: '2026-07' }, {
    at: pkt('2026-07-01', '09:00'),
    by: SAAD,
    approver: MEHREEN,
    costCentres: [{ id: SECOND.cc, code: 'TG', labelKey: 'ledger:costCentres.gardens' }],
    banks: [{ id: SECOND.bank, entityId: SECOND.id, name: 'Test-only second entity account', bankName: 'Demo Bank (fictional)', iban: SECOND.iban, verified: true, glAccountId: accountId(SECOND.code, '1000') }],
  });
  const n = normaliseJournal(s, SECOND.id, { date: '2026-10-10', memo: SECOND.journalMemo, lines: [{ accountId: accountId(SECOND.code, '5300'), debit: '777777.77', costCentreId: SECOND.cc }, { accountId: accountId(SECOND.code, '2200'), credit: '777777.77' }] }, LEDGER_TODAY);
  const j = addJournal(s, n.journal!, SAAD, pkt('2026-10-10', '10:00'));
  submitJournal(j, SAAD, pkt('2026-10-10', '10:01'));
  approveJournal(j, MEHREEN, pkt('2026-10-10', '11:00'));
  postJournal(s, j, MEHREEN, pkt('2026-10-10', '11:01'));
  s.lines.push({
    id: 'bsl_lgd_test_0001',
    statementId: 'bim_lgd_test',
    beneficiaryId: SECOND.bank,
    legalEntityId: SECOND.id,
    accountIban: SECOND.iban,
    source: 'demo_bank_csv',
    bankTxnId: 'LGD-SECRET-TXN-9',
    valueDate: '2026-10-11',
    amount: { amount: '424242.42', currency: 'PKR' },
    narration: 'Test-only second entity line',
    reference: 'LGD-HIDDEN-REF',
    counterpartyName: 'Hidden Counterparty Test',
    counterpartyAccount: '',
    state: 'unmatched',
    direction: 'credit',
  });
  return { journalId: j.id, accountIds: { expense: accountId(SECOND.code, '5300'), accrued: accountId(SECOND.code, '2200'), cash: accountId(SECOND.code, '1000') } };
}

export function ledgerSession(options: { accessFor?: AccessFor; personas?: readonly Persona[] } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'lk_accounts';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}), ...(options.personas ? { personas: [...ALL_PERSONAS, ...options.personas] } : {}) });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: unknown = {}, opts: { key?: string; training?: boolean } = {}) =>
      t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}), ...(opts.training ? { training: true } : {}) }),
    /** Larkspur's stored ledger in this session (created by the first ledger request). */
    ledger: () =>
      demo.partition('tnt_larkspur').section<LedgerState>(LEDGER_SECTION, () => {
        throw new Error('ledger state not created yet');
      }),
    /** Larkspur's ledger and the partitions in use, as text: a refused request leaves them byte-identical. */
    snapshot: () => JSON.stringify({ lk: api.ledger(), partitions: demo.partitionKeys() }),
  };
  return api;
}

export type LedgerSession = ReturnType<typeof ledgerSession>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};
