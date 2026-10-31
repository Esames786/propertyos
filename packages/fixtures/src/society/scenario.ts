import type { BankLine, BankStatement, Beneficiary, Money, ProofFile, SocietyDemoMode } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { pad } from '../seed';
import { ALNOOR_ENTITY, ALNOOR_OLD_PAYEE, ALNOOR_PAYEE, ALNOOR_SITE, ALNOOR_STAFF, DUE_DAY, FIRST_PERIOD, ISSUE_DAY } from './alnoor';
import { allocateOldestFirst, linesOf, openLinesFor } from './allocate';
import { assess, post } from './billing-run';
import { createSubmission, proofFile, recordPayment } from './collections';
import { fingerprint } from './import';
import { auditEntry, emptySociety, nextRef, readySociety, viewOf, type SocietyState, type StoredRun } from './state';
import { seedFinance } from './finance/seed';

/**
 * The "collecting" demo (A7 §C.2 fixture): setup as in "ready", the November run prepared by the
 * building manager, approved and posted by the treasurer on 21 October and the notices sent; then
 * the association's bank statements and residents' proofs arrive.
 *
 * Bank feed: 12 incoming transfers on two statements. Three settle earlier verified payments (A-103,
 * A-204, B-301). A-101's own 5,200 is waiting for its proof. Four belong to proofs in the queue
 * (A-305, B-102, B-405, A-102). B-406's tenant and A-202's tenant paid without sending proof yet;
 * B-406's transfer carries the same words as B-405's ("MAINTENANCE NOV") and is a different transfer.
 * Two are unidentified (a cash-machine deposit and an unknown sender).
 *
 * Proof queue: 6 submissions. Two clean matches (A-305, B-102); A-204 sending again the transfer
 * already verified (refused when matched, rejected as a copy); B-405 sharing its reference with
 * B-406's genuine transfer (accepted); A-102's blurred photo (needs information, then resubmitted);
 * B-207 paying into an account that is not the association's (rejected with the reason).
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const { manager, treasurer, accounts } = ALNOOR_STAFF;
const PERIOD = FIRST_PERIOD;

interface LineSeed {
  txn: string;
  on: string;
  amount: string;
  narration: string;
  reference: string;
  name: string;
  account: string;
}

const STATEMENT_1: LineSeed[] = [
  { txn: 'DEMO-TXN-26102201', on: '2026-10-22', amount: '4200.00', narration: 'IBFT CR ADEEL KHAN ANR-A103-2026-11', reference: 'ANR-A103-2026-11', name: 'ADEEL KHAN', account: '****4410' },
  { txn: 'DEMO-TXN-26102207', on: '2026-10-22', amount: '4200.00', narration: 'IBFT CR RABIA QURESHI ANR-A204-2026-11', reference: 'ANR-A204-2026-11', name: 'RABIA QURESHI', account: '****7782' },
  { txn: 'DEMO-TXN-26102315', on: '2026-10-23', amount: '4200.00', narration: 'RAAST CR ZARA IQBAL B301 NOV', reference: 'B301 NOV', name: 'ZARA IQBAL', account: '****1029' },
];

const STATEMENT_2: LineSeed[] = [
  { txn: 'DEMO-TXN-26102402', on: '2026-10-24', amount: '8400.00', narration: 'IBFT CR AMNA CHAUDHRY ANR-A305-2026-11', reference: 'ANR-A305-2026-11', name: 'AMNA CHAUDHRY', account: '****5531' },
  { txn: 'DEMO-TXN-26102409', on: '2026-10-24', amount: '6700.00', narration: 'IBFT CR MARYAM HUSSAIN B102', reference: 'B102', name: 'MARYAM HUSSAIN', account: '****2290' },
  { txn: 'DEMO-TXN-26102411', on: '2026-10-24', amount: '4200.00', narration: 'IBFT CR KOMAL MIRZA MAINTENANCE NOV', reference: 'MAINTENANCE NOV', name: 'KOMAL MIRZA', account: '****8817' },
  { txn: 'DEMO-TXN-26102518', on: '2026-10-25', amount: '4200.00', narration: 'IBFT CR IMRAN HUSSAIN MAINTENANCE NOV', reference: 'MAINTENANCE NOV', name: 'IMRAN HUSSAIN', account: '****6634' },
  { txn: 'DEMO-TXN-26102520', on: '2026-10-25', amount: '4200.00', narration: 'RAAST CR SANA IQBAL A102', reference: 'A102', name: 'SANA IQBAL', account: '****3305' },
  { txn: 'DEMO-TXN-26102522', on: '2026-10-25', amount: '4200.00', narration: 'IBFT CR JUNAID AKHTAR A202 NOV', reference: 'A202 NOV', name: 'JUNAID AKHTAR', account: '****9921' },
  { txn: 'DEMO-TXN-26102604', on: '2026-10-26', amount: '5200.00', narration: 'IBFT CR KAMRAN SIDDIQUI ANR-A101-2026-11', reference: 'ANR-A101-2026-11', name: 'KAMRAN SIDDIQUI', account: '****4471' },
  { txn: 'DEMO-TXN-26102607', on: '2026-10-26', amount: '3000.00', narration: 'CASH DEPOSIT CDM 0412', reference: 'CDM 0412', name: 'CASH DEPOSIT', account: '—' },
  { txn: 'DEMO-TXN-26102611', on: '2026-10-26', amount: '1250.00', narration: 'IBFT CR M ALI REF 778812', reference: '778812', name: 'M ALI', account: '****0057' },
];

/** The same day's later statement: A-101's transfers of 6,000 and 3,000 (the over- and part-payment cases). */
const STATEMENT_3: LineSeed[] = [
  { txn: 'DEMO-TXN-26102615', on: '2026-10-26', amount: '6000.00', narration: 'IBFT CR KAMRAN SIDDIQUI A101 ALL DUES', reference: 'A101 ALL DUES', name: 'KAMRAN SIDDIQUI', account: '****4471' },
  { txn: 'DEMO-TXN-26102616', on: '2026-10-26', amount: '3000.00', narration: 'IBFT CR KAMRAN SIDDIQUI A101 PART', reference: 'A101 PART', name: 'KAMRAN SIDDIQUI', account: '****4471' },
];

/**
 * The old committee account (retired on 12 October): a resident paid it by mistake on 20 October.
 * Its transaction id is the same as a line on the association's account: another account, another
 * transaction (not a duplicate), and money that never reached the account in force.
 */
const STATEMENT_4: LineSeed[] = [
  { txn: 'DEMO-TXN-26102201', on: '2026-10-20', amount: '5200.00', narration: 'IBFT CR KAMRAN SIDDIQUI ANR-A101-2026-11', reference: 'ANR-A101-2026-11', name: 'KAMRAN SIDDIQUI', account: '****4471' },
];

/**
 * The sample statements (CSV) the accounts officer imports. Each file says which account it is for
 * (`#account=` line, as banks print the account on the statement); the import binds it to the
 * verified account the officer chooses and refuses a file of another account.
 */
export const BANK_STATEMENT_COLUMNS = ['txn_id', 'value_date', 'amount', 'narration', 'reference', 'counterparty', 'counterparty_account'] as const;
export const STATEMENT_SOURCE = 'demo_bank_csv' as const;
const csv = (iban: string, rows: readonly LineSeed[]) =>
  [`#account=${iban}`, BANK_STATEMENT_COLUMNS.join(','), ...rows.map((r) => [r.txn, r.on, r.amount, r.narration, r.reference, r.name, r.account].map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))].join('\n');

export interface StatementFile {
  fileName: string;
  from: string;
  to: string;
  content: string;
}

export const sampleBankStatements = (): Array<StatementFile & { iban: string }> => [
  { fileName: 'demo-bank-statement-2026-10-20-to-23.csv', from: '2026-10-20', to: '2026-10-23', iban: ALNOOR_PAYEE.iban, content: csv(ALNOOR_PAYEE.iban, STATEMENT_1) },
  { fileName: 'demo-bank-statement-2026-10-24-to-26.csv', from: '2026-10-24', to: '2026-10-26', iban: ALNOOR_PAYEE.iban, content: csv(ALNOOR_PAYEE.iban, STATEMENT_2) },
  { fileName: 'demo-bank-statement-2026-10-26-afternoon.csv', from: '2026-10-26', to: '2026-10-26', iban: ALNOOR_PAYEE.iban, content: csv(ALNOOR_PAYEE.iban, STATEMENT_3) },
  { fileName: 'committee-account-statement-2026-10-13-to-26.csv', from: '2026-10-13', to: '2026-10-26', iban: ALNOOR_OLD_PAYEE.iban, content: csv(ALNOOR_OLD_PAYEE.iban, STATEMENT_4) },
];

/** The account a statement file declares (`#account=`), if any. */
export const declaredAccount = (content: string): string | null => /^#account=([A-Z0-9]+)\s*$/m.exec(content)?.[1] ?? null;

/** Builds a statement and its lines from the sample (or an uploaded) file's rows, bound to the chosen account. */
export function statementFrom(state: SocietyState, file: StatementFile, account: Beneficiary, at: string, by: { principalId: string; name: string }): { statement: BankStatement; lines: BankLine[] } {
  const rows = file.content
    .split(/\r?\n/)
    .filter((r) => r.trim() && !r.startsWith('#'))
    .slice(1);
  const parse = (row: string) => {
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]!;
      if (quoted && ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  };
  const id = `bst_anr_${pad(state.bank.statements.length + 1, 4)}`;
  let n = state.bank.lines.length;
  const lines: BankLine[] = rows.map((r) => {
    const [txn = '', on = '', amount = '0', narration = '', reference = '', name = '', counterparty = ''] = parse(r);
    n += 1;
    // Gate S.1: a negative amount is money leaving the account (a debit); C.2's statements have none.
    const raw = amount.trim() || '0';
    const debit = raw.startsWith('-');
    return {
      id: `bnl_anr_${pad(n, 4)}`,
      statementId: id,
      beneficiaryId: account.id,
      legalEntityId: account.legalEntityId,
      accountIban: account.iban,
      source: STATEMENT_SOURCE,
      bankTxnId: txn.trim(),
      valueDate: on.trim(),
      amount: money(toPaisa(debit ? raw.slice(1) : raw)),
      ...(debit ? { direction: 'debit' as const } : {}),
      narration,
      reference,
      counterpartyName: name,
      counterpartyAccount: counterparty,
      state: 'unmatched',
    };
  });
  const statement: BankStatement = {
    id,
    fileName: file.fileName,
    fileHash: fingerprint(file.content),
    beneficiaryId: account.id,
    legalEntityId: account.legalEntityId,
    iban: account.iban,
    source: STATEMENT_SOURCE,
    from: file.from,
    to: file.to,
    lines: lines.length,
    credits: money(lines.filter((l) => l.direction !== 'debit').reduce((s, l) => s + toPaisa(l.amount.amount), 0n)),
    importedBy: by.principalId,
    importedByName: by.name,
    importedAt: at,
  };
  return { statement, lines };
}

const file = (name: string, size: number, look: ProofFile['look'], type = 'image/jpeg') => ({ name, type, size, look });

/** Posts November as the treasurer did on 21 Oct (the same engine and numbering as the live path). */
function postNovember(s: SocietyState): StoredRun {
  const view = viewOf(s, '2026-10-21');
  const id = `brn_anr_${PERIOD.replace('-', '')}_s${s.seq + 1}`;
  s.seq += 1;
  const a = assess({ model: view.model, facts: view.facts, rules: s.rules, exemptions: s.exemptions, period: PERIOD, postingVersion: 1, runId: id });
  const at = (h: string) => `2026-10-${h}Z`;
  const ev = (t: string, who: { principalId: string; name: string }, action: StoredRun['history'][number]['action'], from: StoredRun['state'] | null, to: StoredRun['state']) => ({ at: at(t), by: who.principalId, byName: who.name, action, from, to });
  const run: StoredRun = {
    id,
    ref: nextRef(s, 'run', PERIOD),
    siteId: ALNOOR_SITE.id,
    siteName: ALNOOR_SITE.name,
    period: PERIOD,
    state: 'NOTIFIED',
    postingVersion: 1,
    issueDate: `${PERIOD}-${pad(ISSUE_DAY, 2)}`,
    dueDate: `${PERIOD}-${pad(DUE_DAY, 2)}`,
    createdBy: manager.principalId,
    createdByName: manager.name,
    submittedBy: manager.principalId,
    approvedBy: treasurer.principalId,
    approvedByName: treasurer.name,
    previewedAt: at('20T09:05:00'),
    totals: a.totals,
    history: [
      ev('20T09:00:00', manager, 'create', null, 'DRAFT'),
      ev('20T09:05:00', manager, 'preview', 'DRAFT', 'PREVIEWED'),
      ev('20T09:12:00', manager, 'submit', 'PREVIEWED', 'APPROVAL_PENDING'),
      ev('21T10:00:00', treasurer, 'approve', 'APPROVAL_PENDING', 'APPROVED'),
      ev('21T10:04:00', treasurer, 'post', 'APPROVED', 'POSTED'),
      ev('21T10:30:00', treasurer, 'notify', 'POSTED', 'NOTIFIED'),
    ],
    items: a.items,
    hash: a.hash,
  };
  const result = post(a.items, {
    run: { id, ref: run.ref, siteId: ALNOOR_SITE.id, period: PERIOD, postingVersion: 1, issueDate: run.issueDate, dueDate: run.dueDate },
    legalEntity: { id: ALNOOR_ENTITY.id, name: ALNOOR_ENTITY.name },
    posted: s.invoices,
    nextRef: () => nextRef(s, 'invoice', PERIOD),
  });
  s.invoices.push(...result.created);
  run.items = run.items.map((i) => (result.itemInvoices[i.id] ? { ...i, invoiceId: result.itemInvoices[i.id]!.id, invoiceRef: result.itemInvoices[i.id]!.ref } : i));
  run.invoiceIds = result.invoiceIds;
  run.postedAt = at('21T10:04:00');
  run.notified = { notices: result.invoiceIds.length, at: at('21T10:30:00') };
  s.runs.push(run);
  return run;
}

/** November billed, payments arriving (see the module comment). Deterministic. */
export function collectingSociety(): SocietyState {
  const s = readySociety();
  s.mode = 'collecting';
  const run = postNovember(s);
  let n = s.audit.length;
  const log = (at: string, who: { principalId: string; name: string }, action: string, target: Parameters<typeof auditEntry>[4], extra: Parameters<typeof auditEntry>[5] = {}) => s.audit.push(auditEntry(++n, at, who, action, target, extra));
  log('2026-10-20T09:00:00Z', manager, 'run_create', { kind: 'run', id: run.id, label: run.ref }, { values: { period: PERIOD } });
  log('2026-10-20T09:05:00Z', manager, 'run_preview', { kind: 'run', id: run.id, label: run.ref });
  log('2026-10-20T09:12:00Z', manager, 'run_submit', { kind: 'run', id: run.id, label: run.ref });
  log('2026-10-21T10:00:00Z', treasurer, 'run_approve', { kind: 'run', id: run.id, label: run.ref });
  log('2026-10-21T10:04:00Z', treasurer, 'run_post', { kind: 'run', id: run.id, label: run.ref }, { values: { invoices: String(run.invoiceIds!.length), amount: run.totals!.amount.amount } });
  log('2026-10-21T10:30:00Z', treasurer, 'run_notify', { kind: 'run', id: run.id, label: run.ref });

  const [first, second] = sampleBankStatements();
  const accountsOfficer = { principalId: accounts.principalId, name: accounts.name };
  const importStatement = (f: NonNullable<typeof first>, at: string) => {
    const { statement, lines } = statementFrom(s, f, s.beneficiaries.find((b) => b.id === ALNOOR_PAYEE.id)!, at, accountsOfficer);
    s.bank.statements.push(statement);
    s.bank.lines.push(...lines);
    log(at, accountsOfficer, 'bankStatementImported', { kind: 'bank', id: statement.id, label: statement.fileName }, { values: { lines: String(statement.lines), credits: statement.credits.amount } });
    return lines;
  };

  const model = viewOf(s, '2026-10-26').model;
  const accountOf = (code: string) => {
    const flat = model.flats.find((f) => f.code === code)!;
    const account = model.accounts.find((a) => a.id === flat.billingAccountId)!;
    return { flat, account: { id: account.id, accountNo: account.accountNo } };
  };
  const payerOfFlat = (code: string) => {
    const view = viewOf(s, '2026-10-26');
    const { flat } = accountOf(code);
    const p = view.facts.find((f) => f.role === 'payer' && f.flatId === flat.id && f.from <= '2026-11-01' && (f.to === undefined || '2026-11-01' < f.to))!;
    return { partyId: p.partyId, name: p.partyName };
  };

  // Earlier proofs, verified on 24 October against the first statement.
  const firstLines = importStatement(first!, '2026-10-24T08:40:00Z');
  const earlier: Array<{ flat: string; line: number; on: string; ref: string; file: ReturnType<typeof file> }> = [
    { flat: 'A-103', line: 0, on: '2026-10-22', ref: 'ANR-A103-2026-11', file: file('adeel-transfer.jpg', 182_400, 'transfer_slip') },
    { flat: 'A-204', line: 1, on: '2026-10-22', ref: 'ANR-A204-2026-11', file: file('IMG_20261022_1915.jpg', 241_310, 'transfer_slip') },
    { flat: 'B-301', line: 2, on: '2026-10-23', ref: 'B301 NOV', file: file('raast-receipt.pdf', 96_200, 'document', 'application/pdf') },
  ];
  for (const [i, e] of earlier.entries()) {
    const { account } = accountOf(e.flat);
    const payer = payerOfFlat(e.flat);
    const submittedAt = `${e.on}T${pad(18 + i, 2)}:20:00Z`;
    const sub = createSubmission(s, { at: submittedAt, account, payer, flats: [e.flat], version: { amount: { amount: '4200.00', currency: 'PKR' }, transferDate: e.on, bankReference: e.ref, file: proofFile(e.file, e.file.look) } });
    const verifiedAt = `2026-10-24T09:${pad(10 + i * 7, 2)}:00Z`;
    sub.history.push({ at: verifiedAt, by: accounts.principalId, byName: accounts.name, byKind: 'staff', action: 'review_started' });
    const view = viewOf(s, '2026-10-24');
    const open = openLinesFor(linesOf(view.invoices), { partyId: payer.partyId, legalEntityId: ALNOOR_ENTITY.id, billingAccountId: account.id });
    const { allocations, unapplied } = allocateOldestFirst(toPaisa('4200.00'), open);
    const line = firstLines[e.line]!;
    const { payment, receipt } = recordPayment(s, {
      at: verifiedAt,
      receivedOn: line.valueDate,
      by: accountsOfficer,
      account,
      payer,
      flats: [e.flat],
      method: 'bank_transfer',
      amount: toPaisa('4200.00'),
      allocations,
      unapplied,
      source: { kind: 'submission', submissionId: sub.id, submissionRef: sub.ref },
      verification: 'bank_matched',
      bankLine: line,
      bankReference: e.ref,
    });
    Object.assign(sub, { state: 'verified', paymentId: payment.id, paymentRef: payment.ref, receiptId: receipt.id, receiptRef: receipt.ref });
    sub.history.push({ at: verifiedAt, by: accounts.principalId, byName: accounts.name, byKind: 'staff', action: 'verified' });
    log(submittedAt, { principalId: payer.partyId, name: payer.name }, 'proofSubmitted', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: [e.flat], values: { amount: '4200.00' } });
    log(verifiedAt, accountsOfficer, 'proofVerified', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: [e.flat], values: { amount: payment.amount.amount, payment: payment.ref, receipt: receipt.ref, bank: line.bankTxnId } });
  }

  importStatement(second!, '2026-10-26T08:30:00Z');

  // Proofs waiting in the queue (all "submitted": nobody has opened them yet today).
  const queue: Array<{ flat: string; at: string; amount: string; on: string; ref: string; file: ReturnType<typeof file>; note?: string; fileLike?: string }> = [
    { flat: 'A-305', at: '2026-10-24T19:05:00Z', amount: '8400.00', on: '2026-10-24', ref: 'ANR-A305-2026-11', file: file('amna-ibft.jpg', 205_870, 'transfer_slip'), note: 'October arrears and November together.' },
    { flat: 'B-102', at: '2026-10-24T20:40:00Z', amount: '6700.00', on: '2026-10-24', ref: 'B102', file: file('transfer-b102.png', 318_442, 'transfer_slip', 'image/png') },
    // A-204 sends again the slip of the transfer already verified on 24 Oct (same file).
    { flat: 'A-204', at: '2026-10-25T08:15:00Z', amount: '4200.00', on: '2026-10-22', ref: 'ANR-A204-2026-11', file: file('IMG_20261022_1915.jpg', 241_310, 'transfer_slip'), note: 'Did you receive this? Sending again to be safe.' },
    { flat: 'B-405', at: '2026-10-25T10:02:00Z', amount: '4200.00', on: '2026-10-24', ref: 'MAINTENANCE NOV', file: file('komal-nov.jpg', 176_005, 'transfer_slip') },
    { flat: 'A-102', at: '2026-10-25T21:47:00Z', amount: '4200.00', on: '2026-10-25', ref: 'A102', file: file('IMG_2041.jpg', 1_204_112, 'blurry') },
    { flat: 'B-207', at: '2026-10-26T07:55:00Z', amount: '4200.00', on: '2026-10-25', ref: 'B207 NOVEMBER', file: file('screenshot-transfer.png', 402_118, 'other_account', 'image/png') },
  ];
  for (const q of queue) {
    const { account } = accountOf(q.flat);
    const payer = payerOfFlat(q.flat);
    const sub = createSubmission(s, { at: q.at, account, payer, flats: [q.flat], version: { amount: { amount: q.amount, currency: 'PKR' }, transferDate: q.on, bankReference: q.ref, file: proofFile(q.file, q.file.look), ...(q.note ? { note: q.note } : {}) } });
    log(q.at, { principalId: payer.partyId, name: payer.name }, 'proofSubmitted', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: [q.flat], values: { amount: q.amount } });
  }
  s.seq = n;
  return s;
}

export function initialSociety(mode: SocietyDemoMode): SocietyState {
  const s = mode === 'fresh' ? emptySociety('fresh') : mode === 'collecting' ? collectingSociety() : readySociety();
  // Gate S.1: handover balances, the committee, approval and reminder policies, October's vouchers.
  seedFinance(s);
  return s;
}
