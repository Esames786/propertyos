import type { EffectiveAccess, PayBreakdown, PayInstructionView, PayPeriodView, PayRunView, Persona } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { addFictionalSites, type Fixture } from '../hr/multisite.fixture';
import { effectiveAccessFor } from '../tenant-directory';
import { paySession, refusal, type PaySession } from './pay-test-kit';
import { DEMO_BANK } from './state';

/**
 * Gate S.2b closure (GitHub Issue #16), on S.2a's fictional multi-site fixture: Al-Noor's employer
 * has the main site and Block C (Omer Farooq works at Block C only; Rashid Latif at both); the
 * annexe is another legal entity.
 * - **P0-1.** A payroll reader with the main site only must receive nothing of Block C's people from
 *   any endpoint: no name, code, id, account, amount, note, version net or count, event total or
 *   instruction total. A reader with every site keeps the full audit.
 * - **P0-2.** An idempotency key replays only the exact same request (operation, principal, target,
 *   input), after the authority checks; anything else is one non-disclosing refusal, and nothing
 *   changes.
 */
const RUN = 'prn_anr_0001';
const OCT = 'ppd_anr_2026_10';
const SABA = 'alnoor_accounts';
const AYESHA = 'alnoor_treasurer';
const IMRAN = 'alnoor_manager';
const E = { shahid: 'emp_anr_001', asif: 'emp_anr_002', tariq: 'emp_anr_007', rukhsana: 'emp_anr_011' };
const REASON = 'Paper attendance register for 1 to 18 October checked.';
const MAIN = 'site_alnoor';
const BLOCK_C = 'site_anc_demo';
const ANNEXE = 'site_anx_demo';

/** Access as configured, with per-persona changes (`null` scope: as configured). */
function access(rules: Record<string, { add?: EffectiveAccess['permissions']; sites?: () => string[] | null }>) {
  return (p: Persona): EffectiveAccess | null => {
    const a = effectiveAccessFor(p);
    const r = rules[p.id];
    if (!a || !r) return a;
    const sites = r.sites?.() ?? null;
    return { ...a, permissions: [...a.permissions, ...(r.add ?? [])], ...(sites ? { scopes: [{ type: 'site' as const, ids: sites }] } : {}) };
  };
}

async function refusedUnchanged(api: PaySession, request: () => Promise<unknown>) {
  const before = api.snapshot();
  const r = await refusal(request());
  expect(api.snapshot()).toBe(before);
  return r;
}

/** Seeds payroll, then adds the fictional sites (Block C and the annexe) to the HR state. */
async function withSites(api: PaySession): Promise<Fixture> {
  await api.as(AYESHA).get('/payroll/dashboard');
  return addFictionalSites(api.hr());
}

describe('Issue #16 P0-1: history and financial metadata projected for a site-limited reader', () => {
  it('a main-site-only payroll reader gets no Block C person, wage, count, total or note from any endpoint; a full reader keeps the audit', async () => {
    // Imran stands in as a payroll reader limited to the main site (test-only access).
    const api = paySession({ accessFor: access({ [IMRAN]: { add: ['payroll.view'], sites: () => [MAIN] } }) });
    const fx = await withSites(api);
    // Fictional pay terms for Omer (Block C only), so his pay is calculated and instructed.
    api.pay().terms.push({ employeeId: fx.omer.id, from: '2025-01-01', basis: 'monthly', rate: { amount: '47000.00', currency: 'PKR' }, allowances: [], method: 'bank', account: { bankName: DEMO_BANK, last4: '0977', verified: true }, recordedByName: 'Saba Javed', recordedAt: '2026-10-15T09:30:00+05:00' });
    // A second fictional Block C worker joins the run, then moves to the annexe's employer: the run's
    // history records that he left it (an event about one person).
    api.hr().employees.push({ ...structuredClone(fx.omer), id: 'emp_anc_zahid', code: 'ANC-E-099', name: 'Zahid Mir', personal: { cnic: '35202-9000099-9', phone: '+92 300 0000999', address: 'House 99, Lahore (Demo)' } });
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    const zahid = api.hr().employees.find((e) => e.id === 'emp_anc_zahid')!;
    Object.assign(zahid, { legalEntityId: fx.annexe.legalEntityId, sites: [{ siteId: ANNEXE, from: '2025-01-01' }] });
    // The full manager (Saba, every site): recalculate, a bonus for Omer, Rashid excluded, days confirmed.
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${fx.omer.id}/bonuses`, { label: 'Block C night cover', amount: '3,333.33', reason: 'Covered the Block C nights in October.' });
    await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${fx.rashid.id}/exclude`, { reason: 'Pay terms still to be agreed by the committee.' });
    for (const [id, days] of [[E.tariq, 23], [E.rukhsana, 26]] as const) await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${id}/days`, { days, reason: REASON });
    await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    await api.as(AYESHA).post(`/payroll/runs/${RUN}/return`, { note: 'Check Omer Farooq’s Block C bonus of 3,333.33.' });
    await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    const approved = await api.as(AYESHA).post<PayRunView>(`/payroll/runs/${RUN}/approve`, { acknowledge: true, note: 'Approved; Omer Farooq’s cover checked.' });
    const first = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    await api.as(AYESHA).post(`/payroll/instructions/${first.id}/cancel`, { reason: 'Omer Farooq’s account ending 0977 to be checked.' });
    const ins = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    await api.as(AYESHA).post(`/payroll/instructions/${ins.id}/approve`);
    await api.as(SABA).post(`/payroll/instructions/${ins.id}/sent`);

    // The full reader (Ayesha, every site) keeps the audit: names, version nets and counts, totals and notes.
    const full = await api.as(AYESHA).get<PayRunView>(`/payroll/runs/${RUN}`);
    const fullNet = full.totals.net.amount;
    const fullGross = full.totals.gross.amount;
    expect(full.lines.map((l) => l.employeeId)).toContain(fx.omer.id);
    expect(full.versions.some((v) => v.about === fx.omer.name && v.net && v.included !== undefined)).toBe(true);
    expect(full.history.find((h) => h.action === 'run_approved')!.values!.net).toBe(fullNet);
    expect(full.history.some((h) => h.note?.includes('Omer Farooq'))).toBe(true);
    expect(full.history.find((h) => h.action === 'line_removed')).toMatchObject({ values: { name: 'Zahid Mir' } });
    expect(full.approvalNote).toContain('Omer Farooq');
    const fullDisb = JSON.stringify(await api.as(AYESHA).get('/payroll/disbursements'));
    expect(fullDisb).toContain(fx.omer.name);
    expect(fullDisb).toContain('0977');
    expect(approved.state).toBe('approved');

    // The limited reader: every endpoint, serialised in full.
    const reads: Array<[string, unknown]> = [];
    for (const path of ['/payroll/dashboard', '/payroll/periods', '/payroll/runs', `/payroll/runs/${RUN}`, `/payroll/runs/${RUN}/export`, `/payroll/runs/${RUN}/lines/${E.shahid}`, `/payroll/employees/${E.shahid}/latest`, '/payroll/disbursements', '/payroll/accounting', `/payroll/accounting?run=${RUN}`]) {
      const [p, query] = path.split('?');
      reads.push([path, await api.as(IMRAN).get(p!, query ? Object.fromEntries(new URLSearchParams(query)) : undefined)]);
    }
    const text = JSON.stringify(reads);
    for (const secret of [fx.omer.name, 'Omer', 'Farooq', fx.omer.code, fx.omer.id, 'Zahid', 'ANC-E-099', 'emp_anc_zahid', '0977', '47000', '3333.33', '3,333.33', 'Block C', fullNet, fullGross, first.total.amount, ins.total.amount]) expect(text, secret).not.toContain(secret);
    // Nothing of Omer is reachable directly either: the same "not found" as an id never issued.
    const unknown = await refusal(api.as(IMRAN).get(`/payroll/runs/${RUN}/lines/emp_none_999`));
    expect(await refusal(api.as(IMRAN).get(`/payroll/runs/${RUN}/lines/${fx.omer.id}`))).toEqual(unknown);
    expect(await refusal(api.as(IMRAN).get(`/payroll/employees/${fx.omer.id}/latest`))).toEqual(unknown);

    const limited = reads.find(([p]) => p === `/payroll/runs/${RUN}`)![1] as PayRunView;
    expect(limited.scopeLimited).toBe(true);
    // Every list showing amounts says they are limited; for the full reader they are not.
    for (const path of ['/payroll/dashboard', '/payroll/periods', '/payroll/runs', '/payroll/disbursements']) {
      expect((reads.find(([p]) => p === path)![1] as { scopeLimited: boolean }).scopeLimited, path).toBe(true);
      expect((await api.as(AYESHA).get<{ scopeLimited: boolean }>(path)).scopeLimited, `full ${path}`).toBe(false);
    }
    // Versions: number, time, author and reason only; Omer's bonus reads "changed"; no net or count.
    expect(limited.versions.map((v) => v.n)).toEqual(full.versions.map((v) => v.n));
    for (const v of limited.versions) {
      expect(v.net, `v${v.n} net`).toBeUndefined();
      expect(v.included, `v${v.n} count`).toBeUndefined();
    }
    const bonusV = full.versions.find((v) => v.reason === 'bonus_added')!;
    expect(limited.versions.find((v) => v.n === bonusV.n)).toEqual({ n: bonusV.n, at: bonusV.at, byName: bonusV.byName, reason: 'changed' });
    // Rashid (visible: the main site too) is still named on his own change.
    const rashidV = full.versions.find((v) => v.reason === 'line_excluded')!;
    expect(limited.versions.find((v) => v.n === rashidV.n)).toMatchObject({ reason: 'line_excluded', about: fx.rashid.name });
    // Events: no amount (only a version or reference), no note; the approval's own note left out.
    for (const h of limited.history) {
      expect(h.note, h.action).toBeUndefined();
      expect(Object.keys(h.values ?? {}).every((k) => k === 'version' || k === 'ref'), h.action).toBe(true);
    }
    expect(limited.history.map((h) => h.action)).toContain('run_approved_limited');
    expect(limited.approvalNote).toBeUndefined();
    // Instructions: the total and lines over the reader's people, history without the total, no cancel note.
    const disb = reads.find(([p]) => p === '/payroll/disbursements')![1] as { runs: Array<{ instruction?: PayInstructionView }>; cancelled: PayInstructionView[] };
    const shown = disb.runs[0]!.instruction!;
    expect(shown.scopeLimited).toBe(true);
    expect(shown.history.every((h) => !h.values || Object.keys(h.values).every((k) => k === 'version' || k === 'ref'))).toBe(true);
    expect(disb.cancelled[0]!.cancelReason).toBeUndefined();
    expect(Number(shown.total.amount)).toBe(shown.lines.reduce((s, l) => s + Number(l.amount.amount), 0));
    // The breakdown of a visible person is unchanged.
    const shahid = reads.find(([p]) => p === `/payroll/runs/${RUN}/lines/${E.shahid}`)![1] as PayBreakdown;
    expect(shahid.employee.name).toBe('Shahid Hussain');
  });
});

describe('Issue #16 P0-2: idempotency keys bound to the exact request', () => {
  it('a key one employer’s preparer used never returns that employer’s period to a preparer of another employer', async () => {
    // Saba limited to the annexe; Imran a preparer limited to Al-Noor (main and Block C).
    const api = paySession({ accessFor: access({ [SABA]: { sites: () => [ANNEXE] }, [IMRAN]: { add: ['payroll.view', 'payroll.prepare'], sites: () => [MAIN, BLOCK_C] } }) });
    await withSites(api);
    const anx = await api.as(SABA).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-10', payDate: '2026-10-31' }, { key: 'k-shared' });
    expect(anx.ref).toBe('ANX-PP-2026-10');
    const r = await refusedUnchanged(api, () => api.as(IMRAN).post('/payroll/periods', { legalEntityId: 'le_alnoor', month: '2026-12', payDate: '2026-12-31' }, { key: 'k-shared' }));
    expect(r).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(JSON.stringify(r)).not.toMatch(/ANX|anx|Annexe/);
    // The same body as Saba's (the annexe) is refused like an employer never issued, before any replay.
    const unknownEntity = await refusedUnchanged(api, () => api.as(IMRAN).post('/payroll/periods', { legalEntityId: 'le_none', month: '2026-10', payDate: '2026-10-31' }, { key: 'k-other' }));
    expect(await refusedUnchanged(api, () => api.as(IMRAN).post('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-10', payDate: '2026-10-31' }, { key: 'k-shared' }))).toEqual(unknownEntity);
    // Saba's own identical replay still returns her period, once.
    const again = await api.as(SABA).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-10', payDate: '2026-10-31' }, { key: 'k-shared' });
    expect([again.id, api.pay().periods.filter((p) => p.legalEntityId === 'le_anx_demo').length]).toEqual([anx.id, 1]);
  });

  it('the same key with another month, pay date, endpoint, run, employee or amount is refused, never a silent success; the identical request replays once', async () => {
    const api = paySession({ accessFor: access({ [IMRAN]: { add: ['payroll.view', 'payroll.prepare'] } }) });
    await withSites(api);
    const make = (body: Record<string, string>, key: string, who = SABA) => api.as(who).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_alnoor', month: '2026-12', payDate: '2026-12-31', ...body }, { key });
    const dec = await make({}, 'k-dec');
    for (const body of [{ month: '2027-01', payDate: '2027-01-31' }, { payDate: '2026-12-30' }] as Array<Record<string, string>>) expect(await refusedUnchanged(api, () => make(body, 'k-dec')), JSON.stringify(body)).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // Another person with the same key and the same request: refused (keys are per person).
    expect(await refusedUnchanged(api, () => make({}, 'k-dec', IMRAN))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect((await make({}, 'k-dec')).id).toBe(dec.id);
    // The period key on other operations.
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${OCT}/runs`, {}, { key: 'k-dec' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.shahid}/bonuses`, { label: 'Festival bonus', amount: '500', reason: 'Agreed by the committee for October.' }, { key: 'k-dec' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/instructions`, {}, { key: 'k-dec' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // A bonus key: another amount, label, reason or employee is refused; the bonus is never silently skipped or doubled.
    const bonus = (id: string, body: Record<string, string>) => api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${id}/bonuses`, { label: 'Festival bonus', amount: '5,000', reason: 'Agreed by the committee for October.', ...body }, { key: 'k-bonus' });
    const b = await bonus(E.shahid, {});
    expect(b.bonuses.map((x) => x.amount.amount)).toEqual(['5000.00']);
    for (const [id, body] of [[E.shahid, { amount: '6000' }], [E.shahid, { label: 'Another bonus' }], [E.shahid, { reason: 'A different reason for it.' }], [E.asif, {}]] as const) {
      expect(await refusedUnchanged(api, () => bonus(id, body)), `${id} ${JSON.stringify(body)}`).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    }
    // The same request written the same way after normalising (5000 for 5,000) replays once.
    expect((await bonus(E.shahid, { amount: '5000' })).bonuses).toHaveLength(1);
    expect((await api.as(SABA).get<PayRunView>(`/payroll/runs/${RUN}`)).version).toBe(3);
  });

  it('an instruction key never returns another employer’s instruction; a replay after access is narrowed is refused like an unknown record', async () => {
    let narrowed = false;
    const api = paySession({ accessFor: access({ [SABA]: { sites: () => (narrowed ? [MAIN] : null) }, [IMRAN]: { add: ['payroll.view', 'payroll.prepare'], sites: () => [ANNEXE] } }) });
    await withSites(api);
    // Al-Noor's run approved and its instruction prepared by Saba with key I.
    for (const [id, days] of [[E.tariq, 23], [E.rukhsana, 26]] as const) await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${id}/days`, { days, reason: REASON });
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    // Block C's people have no pay terms: excluded with a reason so the run can be submitted.
    const run = await api.as(SABA).get<PayRunView>(`/payroll/runs/${RUN}`);
    for (const l of run.lines.filter((x) => x.blockers.includes('missing_pay'))) await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${l.employeeId}/exclude`, { reason: 'Pay terms still to be agreed by the committee.' });
    await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    await api.as(AYESHA).post(`/payroll/runs/${RUN}/approve`, { acknowledge: true });
    const ins = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`, {}, { key: 'k-ins' });
    // An annexe run (a draft is enough: the key is checked before the run's state).
    await api.as(SABA).post('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-10', payDate: '2026-10-31' });
    await api.as(SABA).post('/payroll/periods/ppd_anx_2026_10/open');
    const anxRun = await api.as(SABA).post<PayRunView>('/payroll/periods/ppd_anx_2026_10/runs');
    // Imran (annexe only) reuses Saba's key on the annexe run: refused, nothing of Al-Noor returned.
    const r = await refusedUnchanged(api, () => api.as(IMRAN).post(`/payroll/runs/${anxRun.id}/instructions`, {}, { key: 'k-ins' }));
    expect(r).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(JSON.stringify(r)).not.toMatch(/ANR|Al-Noor|Shahid/);
    // Saba herself, same key, another run: refused too.
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${anxRun.id}/instructions`, {}, { key: 'k-ins' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // The identical request replays the same instruction, once.
    const same = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`, {}, { key: 'k-ins' });
    expect([same.id, api.pay().instructions.length]).toEqual([ins.id, 1]);
    // Saba's period key for the annexe, then her access narrowed to the main site: the replay is
    // refused exactly like an employer never issued, and nothing of the annexe comes back.
    await api.as(SABA).post('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-11', payDate: '2026-11-30' }, { key: 'k-anx-nov' });
    narrowed = true;
    const unknownEntity = await refusedUnchanged(api, () => api.as(SABA).post('/payroll/periods', { legalEntityId: 'le_none', month: '2026-11', payDate: '2026-11-30' }, { key: 'k-x' }));
    const replay = await refusedUnchanged(api, () => api.as(SABA).post('/payroll/periods', { legalEntityId: 'le_anx_demo', month: '2026-11', payDate: '2026-11-30' }, { key: 'k-anx-nov' }));
    expect(replay).toEqual(unknownEntity);
    // Her instruction replay on the annexe run: the run is no longer hers to see, "not found".
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${anxRun.id}/instructions`, {}, { key: 'k-ins' }))).toMatchObject({ status: 404, code: 'not_found' });
  });
});
