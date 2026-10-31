import {
  ApiError,
  C1_CATEGORIES,
  type AccessRecord,
  type BillingAccountDetail,
  type BillingAccountRow,
  type BillingRun,
  type BillingRunAction,
  type BillingRunDetail,
  type ChargeCategoryKey,
  type ChargeRule,
  type CreditNote,
  type Exemption,
  type FlatDetail,
  type FlatTile,
  type ImportCommitResult,
  type ImportPreview,
  type ImportRow,
  type InvoiceDetail,
  type InvoiceList,
  type LiabilityChange,
  type Money,
  type OccupancyRow,
  type OpeningBalanceBatch,
  type Permission,
  type PersonDetail,
  type PersonRow,
  type PostResult,
  type RecordAccess,
  type ResolvedCharge,
  type RuleScope,
  type RunCheck,
  type SearchRecord,
  type SetupStep,
  type SiteOverview,
  type SiteStructure,
  type SiteSummary,
  type SocietyDashboard,
  type SocietyDemoMode,
  type Statement,
} from '@repo/contracts';
import { authorize, can, decideRecord, matches, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { fromPaisa, toPaisa } from '../portal';
import { pad } from '../seed';
import { ALNOOR_ENTITY, ALNOOR_SITE, DUE_DAY, FIRST_PERIOD, ISSUE_DAY, OPENING_AS_OF, sampleFlatFile, sampleOpeningFile } from './alnoor';
import { assess, canStart, isOpen, isPosted, post, STATE_AFTER } from './billing-run';
import { collectionsSummary } from './collections-read';
import { resolveCharges } from './charges';
import { buildSocietyDashboard } from './dashboard';
import { identityDashboardExtras } from '../identity/dashboard-extras';
import { approvalItems } from './finance/approvals';
import { committable, FLAT_COLUMNS, fingerprint, OPENING_COLUMNS, rowsOf, validateFlats, validateOpening } from './import';
import { factOn, payerOn } from './model';
import { formatRef } from './numbering';
import { initialSociety } from './scenario';
import {
  balances,
  beneficiaryOn,
  flatBalances,
  nextRef,
  openingBatchOf,
  openingInvoices,
  SOCIETY_SECTION,
  SOCIETY_STATE_VERSION,
  viewOf,
  type SocietyAuditEntry,
  type SocietyState,
  type SocietyView,
  type StoredImport,
  type StoredRun,
} from './state';
import { invoiceRow, statementOf } from './statement';

/**
 * Society setup and monthly billing endpoints (Gate C.1, A6 §5.2–5.3). Every endpoint declares its
 * module, permission and suspension class; the transport refuses before the handler runs. Handlers
 * then check the record (site licence, legal entity, scope) and the workflow rules on the server:
 * one open run per period, a stale preview blocks submit, maker ≠ checker by principal, posting is
 * idempotent, and posted invoices have no edit path (credit notes correct them).
 */

export interface Society {
  state: SocietyState;
  view: SocietyView;
  siteId: string;
  legalEntityId: string;
}

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

/** Where a society demo starts when nobody chose (the C.2 storyline: November billed, payments arriving). */
export const DEFAULT_SOCIETY_MODE = 'collecting' as const;

export function society(ctx: HandlerContext): Society {
  const s = ctx.data.society;
  if (!s) notFound(ctx);
  const state = ctx.demo.section<SocietyState>(SOCIETY_SECTION, () => initialSociety(DEFAULT_SOCIETY_MODE));
  // A session saved by an earlier prototype version starts again from its own starting point.
  if (state.version !== SOCIETY_STATE_VERSION) Object.assign(state, initialSociety(state.mode ?? DEFAULT_SOCIETY_MODE));
  return { state, view: viewOf(state, ctx.at), siteId: s.siteId, legalEntityId: s.legalEntityId };
}

export const recordOf = (s: Society, extra: AccessRecord = {}): AccessRecord => ({ siteId: s.siteId, legalEntityId: s.legalEntityId, ...extra });

/** The site named in the address must be this tenant's, licensed and in scope. */
export function siteOf(ctx: HandlerContext, module: Parameters<typeof authorize>[1] = 'core'): Society {
  const s = society(ctx);
  if (ctx.params.siteId !== undefined && ctx.params.siteId !== s.siteId) notFound(ctx);
  authorize(ctx, module, recordOf(s));
  return s;
}

export function problem(ctx: HandlerContext, status: number, code: string, messageKey: string, errors?: Record<string, Array<{ code: string; params?: Record<string, string> }>>): never {
  throw new ApiError({ status, code, messageKey, ...(errors ? { errors } : {}), correlationId: ctx.correlationId, changed: false });
}

export const invalidField = (ctx: HandlerContext, field: string, code: string, params?: Record<string, string>): never =>
  problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code, ...(params ? { params } : {}) }] });

export const actor = (ctx: HandlerContext) => ({ by: ctx.persona!.principalId, byName: ctx.persona!.displayName });
/** The demo's frozen date with the real time of day, so session events keep their order. */
export const stamp = (ctx: HandlerContext) => `${ctx.at}T${new Date().toISOString().slice(11)}`;

export function log(ctx: HandlerContext, s: Society, action: string, target: SocietyAuditEntry['target'], extra: Partial<SocietyAuditEntry> = {}) {
  s.state.seq += 1;
  const { by, byName } = actor(ctx);
  s.state.audit.push({ id: `aud_anr_s${s.state.seq}`, at: stamp(ctx), by, byName, action, target, ...extra });
}

export const save = (ctx: HandlerContext) => ctx.demo.save();

const addMonths = (period: string, n: number) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}`;
};
const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** The first period that has not been posted yet (the one a new run or rule change affects). */
export function openPeriod(state: SocietyState): string {
  const posted = new Set(state.runs.filter((r) => isPosted(r.state)).map((r) => r.period));
  let p = FIRST_PERIOD;
  while (posted.has(p)) p = addMonths(p, 1);
  return p;
}

/** The period the dashboard and workspaces talk about: the latest run's, else the next to bill. */
export function currentPeriod(state: SocietyState): string {
  const latest = [...state.runs].filter((r) => isOpen(r.state)).sort((a, b) => b.period.localeCompare(a.period))[0];
  return latest?.period ?? openPeriod(state);
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------------------------
// Billing runs
// ---------------------------------------------------------------------------------------------

/** A run's reference from the numbering scheme; a period run again after a cancellation gets "-2", "-3" … */
function runRef(state: SocietyState, period: string): string {
  const base = formatRef(state.numbering.run, { code: state.numbering.code, seq: 1, on: period });
  const earlier = state.runs.filter((r) => r.period === period).length;
  return earlier ? `${base}-${earlier + 1}` : base;
}

function assessmentOf(s: Society, r: Pick<StoredRun, 'id' | 'period' | 'postingVersion'>) {
  return assess({ model: s.view.model, facts: s.view.facts, rules: s.state.rules, exemptions: s.state.exemptions, period: r.period, postingVersion: r.postingVersion, runId: r.id });
}

function isStale(s: Society, r: StoredRun): boolean {
  return (r.state === 'PREVIEWED' || r.state === 'APPROVAL_PENDING') && r.hash !== undefined && assessmentOf(s, r).hash !== r.hash;
}

function runDto(s: Society, r: StoredRun): BillingRun {
  const { hash: _hash, items: _items, invoiceIds: _ids, ...run } = r;
  return { ...run, stale: isStale(s, r) };
}

function runOf(ctx: HandlerContext, s: Society): StoredRun {
  const r = s.state.runs.find((x) => x.id === ctx.params.runId);
  if (!r) notFound(ctx);
  authorize(ctx, 'dues', recordOf(s));
  return r;
}

const ACTION_PERMISSION: Record<BillingRunAction, Permission> = {
  preview: 'billing_run.create',
  submit: 'billing_run.create',
  cancel: 'billing_run.create',
  return: 'billing_run.approve',
  approve: 'billing_run.approve',
  post: 'billing_run.post',
  notify: 'billing_run.post',
};

type ActionOutcome = BillingRunDetail['actions'][BillingRunAction];

/** What the signed-in person may do with the run now, and why not (decided here, shown in the UI). */
function actionOutcome(ctx: HandlerContext, s: Society, r: StoredRun, action: BillingRunAction): NonNullable<ActionOutcome> {
  if (!canStart(action, r.state)) return { allowed: false, reason: 'invalid_transition' };
  // Whoever prepared the run never decides on it, whatever their role holds (maker ≠ checker, I-17).
  const me = ctx.persona!.principalId;
  if ((action === 'approve' || action === 'return') && (r.createdBy === me || r.submittedBy === me)) return { allowed: false, reason: 'maker_checker_required' };
  // Posting: never the person who prepared the run, and only roles the site's posting policy names.
  if ((action === 'post' || action === 'notify') && (r.createdBy === me || r.submittedBy === me)) return { allowed: false, reason: 'maker_checker_required' };
  if (!can(ctx, ACTION_PERMISSION[action])) return { allowed: false, reason: 'permission_missing' };
  if (action === 'post' && !s.state.posting.roles.includes(ctx.persona!.roleId ?? '')) return { allowed: false, reason: 'posting_policy' };
  if ((action === 'submit' || action === 'approve') && isStale(s, r)) return { allowed: false, reason: 'stale_preview' };
  return { allowed: true };
}

function checksOf(s: Society, r: StoredRun): RunCheck[] {
  const items = r.items;
  const noPayer = items.filter((i) => !i.payerPartyId && toPaisa(i.total.amount) > 0n).length;
  const pendingOpening = s.state.openingBatches.some((b) => b.state === 'pending_approval');
  const approvedOpening = s.state.openingBatches.some((b) => b.state === 'approved');
  const hasMaintenance = s.state.rules.some((x) => x.category === 'maintenance' && x.from <= r.period && (x.to === undefined || r.period < x.to));
  const flats = s.view.model.flats.length;
  return [
    { key: 'rules', state: hasMaintenance ? 'ok' : 'block' },
    ...(items.length ? [{ key: 'flats_billed' as const, state: 'ok' as const, count: items.filter((i) => toPaisa(i.total.amount) > 0n).length }] : []),
    ...(items.length ? [{ key: 'exempt' as const, state: 'ok' as const, count: items.filter((i) => i.exempt).length }] : []),
    { key: 'no_payer', state: noPayer ? 'block' : 'ok', count: noPayer },
    { key: 'opening_balances', state: approvedOpening && !pendingOpening ? 'ok' : 'warn' },
    { key: 'declared_flats', state: flats === ALNOOR_SITE.declaredFlats ? 'ok' : 'warn', count: flats },
    ...(isStale(s, r) ? [{ key: 'stale' as const, state: 'block' as const }] : []),
  ];
}

function runDetail(ctx: HandlerContext, s: Society, r: StoredRun): BillingRunDetail {
  const actions: BillingRunDetail['actions'] = {};
  for (const a of ['preview', 'submit', 'return', 'approve', 'post', 'notify', 'cancel'] as const) actions[a] = actionOutcome(ctx, s, r, a);
  return { run: runDto(s, r), items: r.items, checks: checksOf(s, r), actions };
}

function transition(ctx: HandlerContext, s: Society, r: StoredRun, action: BillingRunAction, note?: string) {
  const from = r.state;
  r.state = STATE_AFTER[action];
  const { by, byName } = actor(ctx);
  r.history.push({ at: stamp(ctx), by, byName, action, from, to: r.state, ...(note ? { note } : {}) });
  log(ctx, s, `run_${action}`, { kind: 'run', id: r.id, label: r.ref }, note ? { values: { note } } : {});
}

/** Refuse an action the outcome does not allow, with the reason as the problem code. */
function guard(ctx: HandlerContext, s: Society, r: StoredRun, action: BillingRunAction): void {
  const o = actionOutcome(ctx, s, r, action);
  if (o.allowed) return;
  if (o.reason === 'maker_checker_required') problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
  if (o.reason === 'stale_preview') problem(ctx, 409, 'stale_preview', 'billing:errors.stalePreview');
  if (o.reason === 'permission_missing') problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
  if (o.reason === 'posting_policy') problem(ctx, 403, 'posting_policy', 'billing:errors.postingPolicy');
  problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
}

const runAction = (action: Exclude<BillingRunAction, 'post'>, handle: (ctx: HandlerContext, s: Society, r: StoredRun) => void): Handler => ({
  method: 'POST',
  pattern: new RegExp(`^/billing-runs/(?<runId>[\\w-]+)/${action}$`),
  access: requires('dues', ACTION_PERMISSION[action], 'operational'),
  handle: (ctx): BillingRunDetail => {
    const s = society(ctx);
    const r = runOf(ctx, s);
    handle(ctx, s, r);
    save(ctx);
    return runDetail(ctx, society(ctx), r);
  },
});

// ---------------------------------------------------------------------------------------------
// Sites, flats and people
// ---------------------------------------------------------------------------------------------

function checklistOf(s: Society): SetupStep[] {
  const st = s.state;
  const SITE = `/backoffice/sites/${s.siteId}`;
  const flats = s.view.model.flats.length;
  const approved = st.openingBatches.filter((b) => b.state === 'approved');
  const hasRules = st.rules.some((r) => r.category === 'maintenance');
  const posted = st.runs.some((r) => isPosted(r.state));
  const steps: SetupStep[] = [
    { key: 'site', state: 'done', href: `${SITE}?tab=overview` },
    { key: 'structure', state: 'done', href: `${SITE}/structure`, count: s.view.model.buildings.length },
    { key: 'flats', state: flats ? 'done' : 'todo', href: `${SITE}/import`, count: flats },
    { key: 'people', state: flats ? 'done' : 'blocked', waitsFor: 'flats', href: '/backoffice/cus/customers-list', count: s.view.model.people.length },
    { key: 'opening_balances', state: !flats ? 'blocked' : approved.length ? 'done' : 'todo', waitsFor: 'flats', href: `${SITE}/opening-balances`, count: approved.reduce((n, b) => n + b.accounts, 0) },
    { key: 'payee', state: 'done', href: `${SITE}?tab=collection-settings` },
    { key: 'charges', state: !flats ? 'blocked' : hasRules ? 'done' : 'todo', waitsFor: 'flats', href: '/backoffice/billing/rules', count: st.rules.length },
    { key: 'first_run', state: !hasRules ? 'blocked' : posted ? 'done' : 'todo', waitsFor: 'charges', href: '/backoffice/billing/runs' },
    { key: 'invitations', state: 'later', gate: 'D', href: '/backoffice/res/occupancy-list' },
  ];
  const next = steps.find((x) => x.state === 'todo');
  if (next) next.state = 'next';
  return steps.map((x) => (x.state === 'blocked' || x.waitsFor === undefined ? x : (({ waitsFor: _w, ...rest }) => rest)(x)));
}

function siteSummary(s: Society): SiteSummary {
  const flats = s.view.model.flats;
  const checklist = checklistOf(s);
  return {
    id: s.siteId,
    name: ALNOOR_SITE.name,
    city: ALNOOR_SITE.city,
    legalEntityName: ALNOOR_ENTITY.name,
    buildings: s.view.model.buildings.length,
    flats: flats.length,
    occupied: flats.filter((f) => f.occupancy !== 'vacant').length,
    vacant: flats.filter((f) => f.occupancy === 'vacant').length,
    eligible: flats.length,
    declaredFlats: ALNOOR_SITE.declaredFlats,
    setupDone: checklist.filter((x) => x.state === 'done').length,
    setupTotal: checklist.filter((x) => x.state !== 'later').length,
  };
}

const isExemptNow = (s: Society, flatId: string) => s.state.exemptions.some((e) => e.unitId === flatId && e.state === 'approved' && e.from <= currentPeriod(s.state) && (e.to === undefined || currentPeriod(s.state) < e.to));

function flatOf(ctx: HandlerContext, s: Society, flatId: string) {
  const flat = s.view.model.flats.find((f) => f.id === flatId);
  if (!flat) notFound(ctx);
  return flat;
}

const personRoles = (s: Society, partyId: string, on: string) => [...new Set(s.view.facts.filter((f) => f.partyId === partyId && factOn(f, on)).map((f) => f.role))];

export function accountRow(s: Society, accountId: string, today: string): BillingAccountRow {
  const a = s.view.model.accounts.find((x) => x.id === accountId)!;
  const flats = s.view.model.flats.filter((f) => f.billingAccountId === a.id);
  const invoices = s.view.invoices.filter((i) => i.billingAccountId === a.id);
  // Open charges less unapplied credit: below zero means the account is in credit.
  const balance = balances(s.view).get(a.id) ?? 0n;
  const overdue = invoices.filter((i) => i.overdue).reduce((n, i) => n + toPaisa(i.outstanding.amount), 0n);
  return {
    id: a.id,
    accountNo: a.accountNo,
    holderName: a.holderName,
    flats: flats.map((f) => ({ id: f.id, code: f.code })),
    payers: flats.flatMap((f) => {
      const p = payerOn(s.view.facts, f.id, today);
      return p ? [{ partyId: p.partyId, name: p.partyName, flatCode: f.code }] : [];
    }),
    balance: money(balance),
    overdue: money(overdue),
    openInvoices: invoices.filter((i) => toPaisa(i.outstanding.amount) > 0n).length,
    status: balance < 0n ? 'credit' : overdue > 0n ? 'arrears' : balance > 0n ? 'due' : 'clear',
  };
}

// ---------------------------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------------------------

function previewOf(s: Society, imp: StoredImport): ImportPreview {
  const rows = imp.rows;
  const counts = {
    rows: rows.length,
    valid: rows.filter((r) => r.status === 'valid').length,
    errors: rows.filter((r) => r.status === 'error').length,
    duplicates: rows.filter((r) => r.status === 'duplicate' && r.duplicateOf !== 'existing').length,
    existing: rows.filter((r) => r.duplicateOf === 'existing').length,
  };
  const alreadyCommitted = imp.kind === 'flats' ? (s.state.register?.fileHashes.includes(imp.fileHash) ?? false) : s.state.openingBatches.some((b) => b.fileHash === imp.fileHash && b.state !== 'returned');
  const total = imp.kind === 'opening_balances' ? money(rows.filter((r) => r.status === 'valid').reduce((n, r) => n + toPaisa(r.values.amount ?? '0'), 0n)) : undefined;
  return {
    importId: imp.id,
    kind: imp.kind,
    fileName: imp.fileName,
    fileHash: imp.fileHash,
    rows,
    counts,
    ...(total ? { total } : {}),
    alreadyCommitted,
    canCommit: counts.errors === 0 && counts.valid > 0 && !alreadyCommitted,
  };
}

function importOf(ctx: HandlerContext, s: Society, kind: StoredImport['kind']): StoredImport {
  const imp = s.state.imports[ctx.params.importId ?? ''];
  if (!imp || imp.kind !== kind) notFound(ctx);
  return imp;
}

const registeredCodes = (s: Society) => new Set(s.view.model.flats.map((f) => f.code));

function revalidateFlats(ctx: HandlerContext, s: Society, imp: StoredImport) {
  imp.rows = validateFlats(imp.rows.map((r) => ({ line: r.line, values: r.values })), registeredCodes(s), ctx.at);
}

function startImport(ctx: HandlerContext, s: Society, kind: StoredImport['kind']): StoredImport {
  const body = (ctx.req.body ?? {}) as { fileName?: string; content?: string; sample?: boolean };
  const file = body.sample ? (kind === 'flats' ? sampleFlatFile() : sampleOpeningFile()) : { fileName: String(body.fileName ?? '').trim(), content: String(body.content ?? '') };
  if (!file.content.trim()) invalidField(ctx, 'file', 'sites:import.problems.fileEmpty');
  if (file.content.length > 200_000) invalidField(ctx, 'file', 'sites:import.problems.fileTooLarge');
  const columns = kind === 'flats' ? FLAT_COLUMNS : OPENING_COLUMNS;
  const parsed = rowsOf(file.content, columns);
  if (parsed.missing.length) invalidField(ctx, 'file', 'sites:import.problems.columnsMissing', { columns: parsed.missing.join(', ') });
  if (!parsed.rows.length) invalidField(ctx, 'file', 'sites:import.problems.fileEmpty');
  const accounts = new Map(s.view.model.accounts.map((a) => [a.accountNo, s.view.model.flats.filter((f) => f.billingAccountId === a.id).map((f) => f.code)]));
  const rows: ImportRow[] = kind === 'flats' ? validateFlats(parsed.rows, registeredCodes(s), ctx.at) : validateOpening(parsed.rows, accounts, OPENING_AS_OF);
  s.state.seq += 1;
  const imp: StoredImport = { id: `imp_anr_s${s.state.seq}`, kind, fileName: file.fileName || 'import.csv', fileHash: fingerprint(file.content), rows, by: ctx.persona!.principalId, at: stamp(ctx) };
  s.state.imports[imp.id] = imp;
  return imp;
}

// ---------------------------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------------------------

function scopeOf(ctx: HandlerContext, s: Society, raw: unknown): { scope: RuleScope; name: string } {
  const r = (raw ?? {}) as { level?: string; id?: string };
  const m = s.view.model;
  if (r.level === 'site') return { scope: { level: 'site' }, name: ALNOOR_SITE.name };
  if (r.level === 'building') {
    const b = m.buildings.find((x) => x.id === r.id);
    if (b) return { scope: { level: 'building', id: b.id }, name: b.name };
  }
  if (r.level === 'unit_type') {
    const t = m.types.find((x) => x.id === r.id);
    if (t) return { scope: { level: 'unit_type', id: t.id }, name: t.name };
  }
  if (r.level === 'unit') {
    const f = m.flats.find((x) => x.id === r.id);
    if (f) return { scope: { level: 'unit', id: f.id }, name: f.code };
  }
  return invalidField(ctx, 'scope', 'billing:rules.problems.scope');
}

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
function amountOf(ctx: HandlerContext, field: string, raw: unknown): Money {
  const v = String(raw ?? '').trim().replace(/,/g, '');
  if (!AMOUNT.test(v) || toPaisa(v) <= 0n) invalidField(ctx, field, 'billing:rules.problems.amount');
  return money(toPaisa(v));
}

function periodFrom(ctx: HandlerContext, s: Society, raw: unknown): string {
  const p = String(raw ?? openPeriod(s.state));
  if (!PERIOD.test(p)) invalidField(ctx, 'from', 'billing:rules.problems.period');
  if (p < openPeriod(s.state)) invalidField(ctx, 'from', 'billing:rules.problems.periodPosted', { period: openPeriod(s.state) });
  return p;
}

const sameScope = (a: RuleScope, b: RuleScope) => a.level === b.level && (a.level === 'site' || (a as { id: string }).id === (b as { id: string }).id);

function addRule(ctx: HandlerContext, s: Society, category: ChargeCategoryKey, scope: { scope: RuleScope; name: string }, amount: Money, from: string): ChargeRule {
  if (s.state.rules.some((r) => r.category === category && sameScope(r.scope, scope.scope) && (r.to === undefined || r.to > from))) {
    invalidField(ctx, 'scope', 'billing:rules.problems.overlap');
  }
  s.state.seq += 1;
  const ruleId = `rul_anr_s${s.state.seq}`;
  const { by, byName } = actor(ctx);
  const rule: ChargeRule = { id: `${ruleId}_v1`, ruleId, version: 1, siteId: s.siteId, category, scope: scope.scope, scopeName: scope.name, basis: 'fixed', amount, frequency: 'monthly', from, createdBy: by, createdByName: byName, createdAt: stamp(ctx) };
  s.state.rules.push(rule);
  log(ctx, s, 'ruleCreated', { kind: 'rule', id: rule.id, label: scope.name }, { values: { category, amount: amount.amount, from }, ...(scope.scope.level === 'unit' ? { flats: [scope.name] } : {}) });
  return rule;
}

// ---------------------------------------------------------------------------------------------
// Search and record checks (used by the core handlers)
// ---------------------------------------------------------------------------------------------

/** Society records for global search, each by its own permission (never a guard's). */
export function societySearch(ctx: HandlerContext, q: string): SearchRecord[] {
  if (!ctx.data.society) return [];
  const s = society(ctx);
  const out: SearchRecord[] = [];
  if (can(ctx, 'site.view', 'operational')) {
    for (const f of s.view.model.flats.filter((x) => matches(q, x.code)).slice(0, 5)) {
      out.push({ type: 'unit', id: f.id, ref: f.code, title: f.code, subtitle: s.view.model.buildings.find((b) => b.id === f.buildingId)?.name, href: `/backoffice/sites/${s.siteId}/units/${f.id}` });
    }
    for (const p of s.view.model.people.filter((x) => matches(q, x.displayName, x.ref, x.phone)).slice(0, 5)) {
      out.push({ type: 'party', id: p.id, ref: p.ref, title: p.displayName, subtitle: p.phone, href: `/backoffice/cus/customer-360-workspace?record=${p.id}` });
    }
  }
  if (can(ctx, 'invoice.view', 'history_read')) {
    for (const i of s.view.invoices.filter((x) => matches(q, x.ref)).slice(0, 5)) {
      out.push({ type: 'invoice', id: i.id, ref: i.ref, title: i.ref, subtitle: i.accountNo, href: `/backoffice/fin/invoice-workspace?record=${i.id}` });
    }
  }
  return out;
}

/** Whether an address's `?record=` names a society record this person may open (same rules as its endpoint). */
export function societyRecordAccess(ctx: HandlerContext, id: string): RecordAccess | null {
  if (!ctx.data.society || !/^(pty_anr_|cin_|ba_anr_|unt_anr_|brn_anr_)/.test(id)) return null;
  const s = society(ctx);
  const check = (module: 'core' | 'receivables' | 'dues', exists: boolean, permission: Permission, suspension: 'operational' | 'history_read'): RecordAccess => ({
    record: true,
    module,
    decision: exists ? decideRecord({ ...ctx, suspension }, module, recordOf(s), permission) : { allowed: false, reason: 'out_of_scope' },
  });
  if (id.startsWith('pty_anr_')) return check('core', s.view.model.people.some((p) => p.id === id), 'site.view', 'operational');
  if (id.startsWith('unt_anr_')) return check('core', s.view.model.flats.some((f) => f.id === id), 'site.view', 'operational');
  if (id.startsWith('ba_anr_')) return check('receivables', s.view.model.accounts.some((a) => a.id === id), 'invoice.view', 'history_read');
  if (id.startsWith('brn_anr_')) return check('dues', s.state.runs.some((r) => r.id === id), 'billing_run.view', 'history_read');
  return check('receivables', s.view.invoices.some((i) => i.id === id), 'invoice.view', 'history_read');
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

const SITE_READERS: readonly Permission[] = ['site.view'];
const CHARGE_READERS: readonly Permission[] = ['billing_run.view', 'charges.manage'];

/** HOME-001 for a society; also the source of the approvals the S.1 inbox lists (APR-001). */
export function societyDashboardOf(ctx: HandlerContext): SocietyDashboard {
  const s = siteOf(ctx);
  const period = currentPeriod(s.state);
  const stored = [...s.state.runs].filter((r) => r.period === period && isOpen(r.state)).at(-1) ?? null;
  return buildSocietyDashboard({
    view: s.view,
    checklist: checklistOf(s),
    period,
    run: stored ? { ...stored, stale: isStale(s, stored) } : null,
    principalId: ctx.persona!.principalId,
    can: {
      manageSite: can(ctx, 'site.manage'),
      createRun: can(ctx, 'billing_run.create'),
      approveRun: can(ctx, 'billing_run.approve'),
      postRun: can(ctx, 'billing_run.post'),
      approveOpening: can(ctx, 'opening_balance.approve'),
      approveExemption: can(ctx, 'billing_run.approve'),
      seeInvoices: can(ctx, 'invoice.view'),
      reviewProofs: can(ctx, 'finance.evidence.review'),
      reconcile: can(ctx, 'bank.reconcile'),
      approveBeneficiary: can(ctx, 'beneficiary.approve'),
      approvePaymentException: can(ctx, 'payment_exception.approve'),
      approveLiability: can(ctx, 'liability.approve'),
    },
    collections: can(ctx, 'collections.view', 'history_read') ? collectionsSummary(s, ctx.at, { bank: can(ctx, 'bank.view', 'history_read') }) : null,
    today: ctx.at,
    // Gate S.1: finance approvals (APR-001) join the card beside the C.1/C.2/D.1 ones.
    extra: (({ approvals, tasks }) => ({ approvals: [...approvals, ...approvalItems(s.state, ctx.tenantId!, { principalId: ctx.persona!.principalId, permissions: ctx.persona!.permissions }, ctx.at)], tasks }))(identityDashboardExtras(ctx)),
  });
}

export const SOCIETY_HANDLERS: readonly Handler[] = [
  {
    // Prototype: how the society demo starts (Get started → society demo). Resets only this tenant's partition.
    method: 'POST',
    pattern: /^\/society\/demo$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      if (!ctx.data.society) notFound(ctx);
      const asked = (ctx.req.body as { mode?: string } | undefined)?.mode;
      const mode: SocietyDemoMode = asked === 'fresh' || asked === 'ready' || asked === 'collecting' ? asked : DEFAULT_SOCIETY_MODE;
      const fresh = initialSociety(mode);
      const state = ctx.demo.section<SocietyState>(SOCIETY_SECTION, () => fresh);
      Object.assign(state, fresh);
      save(ctx);
      return { mode };
    },
  },
  {
    method: 'GET',
    pattern: /^\/society\/dashboard$/,
    access: requires('core', ['site.view', 'billing_run.view'], 'operational'),
    handle: (ctx): SocietyDashboard => societyDashboardOf(ctx),
  },
  {
    method: 'GET',
    pattern: /^\/society\/audit$/,
    access: requires('core', SITE_READERS, 'history_read'),
    handle: (ctx): SocietyAuditEntry[] => {
      const s = siteOf(ctx);
      const { flat, run, account, invoice } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const flatCode = flat ? s.view.model.flats.find((f) => f.id === flat)?.code : undefined;
      const accountFlats = account ? s.view.model.flats.filter((f) => f.billingAccountId === account).map((f) => f.code) : [];
      return [...s.state.audit]
        .filter((e) => (!flat || e.flats?.includes(flatCode ?? '')) && (!run || e.target.id === run) && (!invoice || e.target.id === invoice) && (!account || e.target.id === account || (e.flats ?? []).some((c) => accountFlats.includes(c))))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 100);
    },
  },
  {
    method: 'GET',
    pattern: /^\/sites$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): SiteSummary[] => (ctx.data.society ? [siteSummary(siteOf(ctx))] : []),
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): SiteOverview => {
      const s = siteOf(ctx);
      const flats = s.view.model.flats;
      const inArrears = new Set(s.view.invoices.filter((i) => i.overdue).map((i) => i.billingAccountId));
      return {
        site: siteSummary(s),
        checklist: checklistOf(s),
        buildings: s.view.model.buildings.map((b) => {
          const here = flats.filter((f) => f.buildingId === b.id);
          const accounts = new Set(here.map((f) => f.billingAccountId));
          return {
            id: b.id,
            code: b.code,
            name: b.name,
            floors: b.floors,
            flats: here.length,
            occupied: here.filter((f) => f.occupancy !== 'vacant').length,
            vacant: here.filter((f) => f.occupancy === 'vacant').length,
            arrearsAccounts: [...accounts].filter((a) => inArrears.has(a)).length,
          };
        }),
        types: s.view.model.types,
        mode: s.state.mode,
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/structure$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): SiteStructure => {
      const s = siteOf(ctx);
      const m = s.view.model;
      const owing = flatBalances(s.view);
      const tile = (f: (typeof m.flats)[number]): FlatTile => {
        const owner = s.view.facts.find((x) => x.flatId === f.id && x.role === 'owner' && factOn(x, ctx.at));
        const payer = payerOn(s.view.facts, f.id, ctx.at);
        return {
          id: f.id,
          code: f.code,
          type: m.types.find((t) => t.id === f.typeId)!.code,
          occupancy: f.occupancy,
          ...(owner ? { ownerName: owner.partyName } : {}),
          ...(payer ? { payerName: payer.partyName } : {}),
          balance: money(owing.get(f.id) ?? 0n),
          exempt: isExemptNow(s, f.id),
        };
      };
      return {
        siteId: s.siteId,
        buildings: m.buildings.map((b) => ({
          ...b,
          levels: m.floors.filter((fl) => fl.buildingId === b.id).sort((a, z) => z.level - a.level).map((floor) => ({ floor, flats: m.flats.filter((f) => f.floorId === floor.id).map(tile) })),
        })),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/unit-types$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx) => siteOf(ctx).view.model.types,
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/units\/(?<flatId>[\w-]+)$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): FlatDetail => {
      const s = siteOf(ctx);
      const m = s.view.model;
      const flat = flatOf(ctx, s, ctx.params.flatId!);
      const facts = s.view.facts.filter((f) => f.flatId === flat.id).sort((a, b) => b.from.localeCompare(a.from));
      const account = m.accounts.find((a) => a.id === flat.billingAccountId)!;
      const floor = m.floors.find((f) => f.id === flat.floorId)!;
      return {
        flat,
        siteName: ALNOOR_SITE.name,
        building: m.buildings.find((b) => b.id === flat.buildingId)!,
        floor,
        type: m.types.find((t) => t.id === flat.typeId)!,
        owners: facts.filter((f) => f.role === 'owner'),
        occupants: facts.filter((f) => f.role === 'occupant'),
        payers: facts.filter((f) => f.role === 'payer'),
        account: { id: account.id, accountNo: account.accountNo, holderName: account.holderName, flats: m.flats.filter((f) => f.billingAccountId === account.id).map((f) => ({ id: f.id, code: f.code })) },
        ...((p) => (p ? { currentPayer: p } : {}))(payerOn(s.view.facts, flat.id, ctx.at)),
        balance: money(flatBalances(s.view).get(flat.id) ?? 0n),
        exempt: isExemptNow(s, flat.id),
        floorFlats: m.flats.filter((f) => f.floorId === floor.id).map((f) => ({ id: f.id, code: f.code })),
        changes: s.state.payerChanges.filter((c) => c.flatId === flat.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
        firstOpenPeriod: openPeriod(s.state),
      };
    },
  },
  {
    // Request a change of who pays for one flat from a date (A4 §8). Nothing changes until another
    // person approves it (owner decision, C.1 review): liability is financial, so it is maker-checker.
    // A correction names the change it corrects; approving it supersedes that change.
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/units\/(?<flatId>[\w-]+)\/payer$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): LiabilityChange => {
      const s = siteOf(ctx);
      const flat = flatOf(ctx, s, ctx.params.flatId!);
      const body = (ctx.req.body ?? {}) as { partyId?: string; from?: string; reason?: string; corrects?: string };
      const candidates = s.view.facts.filter((f) => f.flatId === flat.id && (f.role === 'owner' || f.role === 'occupant') && factOn(f, ctx.at)).map((f) => f.partyId);
      if (!body.partyId || !candidates.includes(body.partyId)) invalidField(ctx, 'partyId', 'sites:payer.problems.party');
      const from = String(body.from ?? '');
      if (!/^\d{4}-\d{2}-01$/.test(from)) invalidField(ctx, 'from', 'sites:payer.problems.firstOfMonth');
      // A posted period is history: liability for it cannot be rewritten.
      if (from.slice(0, 7) < openPeriod(s.state)) invalidField(ctx, 'from', 'sites:payer.problems.periodPosted', { period: openPeriod(s.state) });
      const reason = String(body.reason ?? '').trim();
      if (reason.length < 5) invalidField(ctx, 'reason', 'sites:payer.problems.reason');
      let corrects: LiabilityChange | undefined;
      if (body.corrects) {
        corrects = s.state.payerChanges.find((c) => c.id === body.corrects && c.flatId === flat.id);
        if (!corrects || corrects.state !== 'approved') invalidField(ctx, 'corrects', 'sites:payer.problems.corrects');
        if (corrects!.from.slice(0, 7) < openPeriod(s.state)) invalidField(ctx, 'corrects', 'sites:payer.problems.periodPosted', { period: openPeriod(s.state) });
      }
      if (s.state.payerChanges.some((c) => c.flatId === flat.id && c.state === 'pending_approval')) problem(ctx, 409, 'change_pending', 'sites:errors.changePending');
      const current = payerOn(s.view.facts, flat.id, from);
      if (!corrects && current?.partyId === body.partyId) invalidField(ctx, 'partyId', 'sites:payer.problems.same');
      s.state.seq += 1;
      const { by, byName } = actor(ctx);
      const person = s.view.model.people.find((p) => p.id === body.partyId)!;
      const change: LiabilityChange = {
        id: `chg_anr_s${s.state.seq}`,
        flatId: flat.id,
        flatCode: flat.code,
        ...(current ? { previousPartyId: current.partyId, previousName: current.partyName } : {}),
        partyId: person.id,
        partyName: person.displayName,
        from,
        reason,
        state: 'pending_approval',
        ...(corrects ? { corrects: corrects.id } : {}),
        requestedBy: by,
        requestedByName: byName,
        requestedAt: stamp(ctx),
      };
      s.state.payerChanges.push(change);
      log(ctx, s, corrects ? 'payerCorrectionRequested' : 'payerChangeRequested', { kind: 'payer_change', id: change.id, label: flat.code }, { flats: [flat.code], values: { from, name: person.displayName, previous: current?.partyName ?? '', reason } });
      save(ctx);
      return change;
    },
  },
  {
    method: 'GET',
    pattern: /^\/payer-changes$/,
    access: requires('core', ['site.view', 'liability.approve'], 'history_read'),
    handle: (ctx): LiabilityChange[] => {
      if (!ctx.data.society) return [];
      const s = siteOf(ctx);
      const { state, flat } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      return [...s.state.payerChanges]
        .filter((c) => (!state || state === 'all' || c.state === state) && (!flat || c.flatId === flat))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    },
  },
  {
    // The second person decides (never the requester). Approval re-checks that the period is unbilled.
    method: 'POST',
    pattern: /^\/payer-changes\/(?<changeId>[\w-]+)\/(?<decision>[\w-]+)$/,
    access: requires('receivables', 'liability.approve', 'operational'),
    handle: (ctx): LiabilityChange => {
      const s = siteOf(ctx);
      const change = s.state.payerChanges.find((c) => c.id === ctx.params.changeId);
      if (!change || !['approve', 'reject'].includes(ctx.params.decision!)) notFound(ctx);
      if (change.state !== 'pending_approval') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
      if (change.requestedBy === ctx.persona!.principalId) problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
      const note = String((ctx.req.body as { note?: string } | undefined)?.note ?? '').trim();
      const approved = ctx.params.decision === 'approve';
      if (!approved && note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
      if (approved && change.from.slice(0, 7) < openPeriod(s.state)) problem(ctx, 409, 'period_posted', 'sites:payer.problems.periodPosted', { from: [{ code: 'sites:payer.problems.periodPosted', params: { period: openPeriod(s.state) } }] });
      const { by, byName } = actor(ctx);
      Object.assign(change, { state: approved ? 'approved' : 'rejected', decidedBy: by, decidedByName: byName, decidedAt: stamp(ctx), ...(note ? { note } : {}) });
      if (approved) {
        // The corrected change, and any earlier approved change for the same flat and date, stop applying.
        for (const c of s.state.payerChanges) {
          if (c.id !== change.id && c.state === 'approved' && c.flatId === change.flatId && (c.id === change.corrects || c.from === change.from)) c.state = 'superseded';
        }
      }
      log(ctx, s, approved ? 'payerChangeApproved' : 'payerChangeRejected', { kind: 'payer_change', id: change.id, label: change.flatCode }, { flats: [change.flatCode], values: { from: change.from, name: change.partyName, ...(note ? { note } : {}) } });
      save(ctx);
      return change;
    },
  },
  {
    method: 'POST',
    pattern: /^\/payer-changes\/(?<changeId>[\w-]+)\/withdraw$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): LiabilityChange => {
      const s = siteOf(ctx);
      const change = s.state.payerChanges.find((c) => c.id === ctx.params.changeId);
      if (!change) notFound(ctx);
      if (change.state !== 'pending_approval') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
      if (change.requestedBy !== ctx.persona!.principalId) problem(ctx, 403, 'not_requester', 'sites:errors.notRequester');
      change.state = 'withdrawn';
      log(ctx, s, 'payerChangeWithdrawn', { kind: 'payer_change', id: change.id, label: change.flatCode }, { flats: [change.flatCode], values: { from: change.from, name: change.partyName } });
      save(ctx);
      return change;
    },
  },
  {
    // RES-002 units & payers roster. A guard (residents.view only) is refused: payers are finance.
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/roster$/,
    access: requires('residents', SITE_READERS, 'operational'),
    handle: (ctx): OccupancyRow[] => {
      const s = siteOf(ctx, 'residents');
      const m = s.view.model;
      return m.flats.map((f) => {
        const now = s.view.facts.filter((x) => x.flatId === f.id && factOn(x, ctx.at));
        const occupants = now.filter((x) => x.role === 'occupant');
        const payer = now.find((x) => x.role === 'payer');
        return {
          flatId: f.id,
          flatCode: f.code,
          building: m.buildings.find((b) => b.id === f.buildingId)!.name,
          occupancy: f.occupancy,
          occupantNames: occupants.map((x) => x.partyName),
          ownerNames: now.filter((x) => x.role === 'owner').map((x) => x.partyName),
          ...(occupants[0] ? { since: occupants[0].from } : {}),
          ...(payer ? { payerName: payer.partyName } : {}),
        };
      });
    },
  },
  // -------------------------------------------------------------------------------------------
  // Flat register import (SITE-004)
  // -------------------------------------------------------------------------------------------
  {
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/flat-imports$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx);
      const imp = startImport(ctx, s, 'flats');
      save(ctx);
      return previewOf(s, imp);
    },
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/flat-imports\/(?<importId>[\w-]+)$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx);
      const imp = importOf(ctx, s, 'flats');
      revalidateFlats(ctx, s, imp);
      return previewOf(s, imp);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/flat-imports\/(?<importId>[\w-]+)\/rows\/(?<line>[\w-]+)$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx);
      const imp = importOf(ctx, s, 'flats');
      const row = imp.rows.find((r) => r.line === Number(ctx.params.line));
      if (!row) notFound(ctx);
      const values = (ctx.req.body as { values?: Record<string, unknown> } | undefined)?.values ?? {};
      for (const [k, v] of Object.entries(values)) if ((FLAT_COLUMNS as readonly string[]).includes(k)) row.values[k] = String(v ?? '').trim();
      revalidateFlats(ctx, s, imp);
      save(ctx);
      return previewOf(s, imp);
    },
  },
  {
    // Applies every offered suggestion (each is shown first; nothing is fixed silently).
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/flat-imports\/(?<importId>[\w-]+)\/suggestions$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx);
      const imp = importOf(ctx, s, 'flats');
      for (const r of imp.rows) if (r.status === 'error' && r.suggestion) Object.assign(r.values, r.suggestion);
      revalidateFlats(ctx, s, imp);
      save(ctx);
      return previewOf(s, imp);
    },
  },
  {
    // All or nothing: refused while any row has an error; duplicates are skipped only when acknowledged.
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/flat-imports\/(?<importId>[\w-]+)\/commit$/,
    access: requires('core', 'site.manage', 'operational'),
    handle: (ctx): ImportCommitResult => {
      const s = siteOf(ctx);
      const imp = importOf(ctx, s, 'flats');
      revalidateFlats(ctx, s, imp);
      const preview = previewOf(s, imp);
      if (preview.alreadyCommitted || preview.counts.valid === 0) return { created: 0, unchanged: preview.counts.existing, alreadyCommitted: preview.alreadyCommitted };
      if (preview.counts.errors) problem(ctx, 422, 'import_has_errors', 'sites:errors.importHasErrors');
      if (preview.counts.duplicates && (ctx.req.body as { acknowledgeDuplicates?: boolean } | undefined)?.acknowledgeDuplicates !== true) {
        problem(ctx, 422, 'import_has_duplicates', 'sites:errors.importHasDuplicates');
      }
      const rows = committable(imp.rows);
      const { by, byName } = actor(ctx);
      const register = s.state.register;
      s.state.register = {
        rows: [...(register?.rows ?? []), ...rows],
        fileHashes: [...(register?.fileHashes ?? []), imp.fileHash],
        by: register?.by ?? by,
        byName: register?.byName ?? byName,
        at: register?.at ?? stamp(ctx),
      };
      log(ctx, s, 'flatsImported', { kind: 'import', id: imp.id, label: imp.fileName }, { values: { count: String(rows.length), skipped: String(preview.counts.duplicates + preview.counts.existing) } });
      save(ctx);
      return { created: rows.length, unchanged: preview.counts.existing, alreadyCommitted: false };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Opening balances (SITE-007): import → submit → treasurer approves → posted as opening invoices
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/opening-balances$/,
    access: requires('receivables', ['opening_balance.import', 'opening_balance.approve', 'invoice.view'], 'history_read'),
    handle: (ctx) => {
      const s = siteOf(ctx, 'receivables');
      return { batches: [...s.state.openingBatches].reverse().map(({ fileHash: _h, ...b }) => b), asOf: OPENING_AS_OF, flats: s.view.model.flats.length };
    },
  },
  {
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/opening-imports$/,
    access: requires('receivables', 'opening_balance.import', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx, 'receivables');
      if (!s.view.model.flats.length) problem(ctx, 409, 'no_flats', 'sites:errors.noFlats');
      const imp = startImport(ctx, s, 'opening_balances');
      save(ctx);
      return previewOf(s, imp);
    },
  },
  {
    method: 'GET',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/opening-imports\/(?<importId>[\w-]+)$/,
    access: requires('receivables', 'opening_balance.import', 'operational'),
    handle: (ctx): ImportPreview => {
      const s = siteOf(ctx, 'receivables');
      return previewOf(s, importOf(ctx, s, 'opening_balances'));
    },
  },
  {
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/opening-imports\/(?<importId>[\w-]+)\/submit$/,
    access: requires('receivables', 'opening_balance.import', 'operational'),
    handle: (ctx): OpeningBalanceBatch => {
      const s = siteOf(ctx, 'receivables');
      const imp = importOf(ctx, s, 'opening_balances');
      const preview = previewOf(s, imp);
      const existing = s.state.openingBatches.find((b) => b.fileHash === imp.fileHash && b.state !== 'returned');
      if (existing) return (({ fileHash: _h, ...b }) => b)(existing);
      if (preview.counts.errors) problem(ctx, 422, 'import_has_errors', 'sites:errors.importHasErrors');
      if (s.state.openingBatches.some((b) => b.state === 'pending_approval')) problem(ctx, 409, 'batch_pending', 'sites:errors.openingPending');
      const { by, byName } = actor(ctx);
      s.state.seq += 1;
      const rows = imp.rows.filter((r) => r.status === 'valid').map((r) => ({ account: r.values.account!, flat: r.values.flat!, amount: r.values.amount! }));
      const batch = { ...openingBatchOf(`obb_anr_s${s.state.seq}`, rows, { fileName: imp.fileName, importedBy: by, importedByName: byName, importedAt: stamp(ctx) }), fileHash: imp.fileHash };
      s.state.openingBatches.push(batch);
      log(ctx, s, 'openingImported', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts) } });
      save(ctx);
      return (({ fileHash: _h, ...b }) => b)(batch);
    },
  },
  {
    method: 'POST',
    pattern: /^\/opening-balances\/(?<batchId>[\w-]+)\/(?<decision>[\w-]+)$/,
    access: requires('receivables', 'opening_balance.approve', 'operational'),
    handle: (ctx): OpeningBalanceBatch => {
      const s = siteOf(ctx, 'receivables');
      const batch = s.state.openingBatches.find((b) => b.id === ctx.params.batchId);
      if (!batch || !['approve', 'return'].includes(ctx.params.decision!)) notFound(ctx);
      if (batch.state !== 'pending_approval') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
      if (batch.importedBy === ctx.persona!.principalId) problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
      const note = String((ctx.req.body as { note?: string } | undefined)?.note ?? '').trim();
      if (ctx.params.decision === 'return' && note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
      const { by, byName } = actor(ctx);
      const approved = ctx.params.decision === 'approve';
      Object.assign(batch, { state: approved ? 'approved' : 'returned', decidedBy: by, decidedByName: byName, decidedAt: stamp(ctx), ...(note ? { note } : {}) });
      if (approved) s.state.invoices.push(...openingInvoices(batch, s.view.facts, s.state.invoices.filter((i) => i.source === 'opening_balance').length, () => nextRef(s.state, 'opening', OPENING_AS_OF)));
      log(ctx, s, approved ? 'openingApproved' : 'openingReturned', { kind: 'opening_balances', id: batch.id, label: batch.fileName }, { values: { total: batch.total.amount, accounts: String(batch.accounts), ...(note ? { note } : {}) }, flats: batch.rows.map((r) => r.flatCode) });
      save(ctx);
      return (({ fileHash: _h, ...b }) => b)(batch);
    },
  },
  // -------------------------------------------------------------------------------------------
  // People and billing accounts (CUS-001/003, BILL-001/002)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/people$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): PersonRow[] => {
      if (!ctx.data.society) return [];
      const s = siteOf(ctx);
      const { q, role, building } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const buildingCode = building ? s.view.model.buildings.find((b) => b.id === building)?.code : undefined;
      return s.view.model.people
        .map((person) => {
          const facts = s.view.facts.filter((f) => f.partyId === person.id).sort((a, b) => a.flatCode.localeCompare(b.flatCode) || b.from.localeCompare(a.from));
          return { person, facts, roles: personRoles(s, person.id, ctx.at) };
        })
        .filter((r) => r.facts.length > 0)
        .filter((r) => !role || role === 'all' || r.roles.includes(role as PersonRow['roles'][number]))
        .filter((r) => !buildingCode || r.facts.some((f) => f.flatCode.startsWith(`${buildingCode}-`)))
        .filter((r) => !q || !q.trim() || matches(q.trim(), r.person.displayName, r.person.ref, r.person.phone, ...r.facts.map((f) => f.flatCode)));
    },
  },
  {
    method: 'GET',
    pattern: /^\/people\/(?<partyId>[\w-]+)$/,
    access: requires('core', SITE_READERS, 'operational'),
    handle: (ctx): PersonDetail => {
      const s = siteOf(ctx);
      const person = s.view.model.people.find((p) => p.id === ctx.params.partyId);
      if (!person) notFound(ctx);
      const facts = s.view.facts.filter((f) => f.partyId === person.id).sort((a, b) => a.flatCode.localeCompare(b.flatCode) || b.from.localeCompare(a.from));
      const accountIds = [...new Set([...s.view.model.accounts.filter((a) => a.holderPartyId === person.id).map((a) => a.id), ...facts.filter((f) => f.role === 'payer').map((f) => f.billingAccountId!)])];
      const seesMoney = can(ctx, 'invoice.view', 'history_read');
      return {
        person,
        facts,
        roles: personRoles(s, person.id, ctx.at),
        accounts: seesMoney ? accountIds.map((id) => { const r = accountRow(s, id, ctx.at); return { id, accountNo: r.accountNo, balance: r.balance }; }) : [],
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/billing-accounts$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): BillingAccountRow[] => {
      if (!ctx.data.society) return [];
      const s = siteOf(ctx, 'receivables');
      const { q, status, building } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const buildingCode = building ? s.view.model.buildings.find((b) => b.id === building)?.code : undefined;
      return s.view.model.accounts
        .map((a) => accountRow(s, a.id, ctx.at))
        .filter((r) => !status || status === 'all' || (status === 'owing' ? r.status === 'due' || r.status === 'arrears' : r.status === status))
        .filter((r) => !buildingCode || r.flats.some((f) => f.code.startsWith(`${buildingCode}-`)))
        .filter((r) => !q || !q.trim() || matches(q.trim(), r.accountNo, r.holderName, ...r.flats.map((f) => f.code), ...r.payers.map((p) => p.name)))
        .sort((a, b) => a.accountNo.localeCompare(b.accountNo));
    },
  },
  {
    method: 'GET',
    pattern: /^\/billing-accounts\/(?<accountId>[\w-]+)$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): BillingAccountDetail => {
      const s = siteOf(ctx, 'receivables');
      if (!s.view.model.accounts.some((a) => a.id === ctx.params.accountId)) notFound(ctx);
      authorize(ctx, 'receivables', recordOf(s, { billingAccountId: ctx.params.accountId! }));
      const row = accountRow(s, ctx.params.accountId!, ctx.at);
      return {
        ...row,
        kind: 'dues',
        siteId: s.siteId,
        legalEntityName: ALNOOR_ENTITY.name,
        liabilities: row.flats.map((f) => ({ flatId: f.id, flatCode: f.code, facts: s.view.facts.filter((x) => x.role === 'payer' && x.flatId === f.id).sort((a, b) => b.from.localeCompare(a.from)) })),
      };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Charges, rules and exemptions (BILL-003/004/009)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/charges\/rules$/,
    access: requires('dues', CHARGE_READERS, 'history_read'),
    handle: (ctx) => {
      if (!ctx.data.society) return { rules: [], period: FIRST_PERIOD, categories: C1_CATEGORIES };
      const s = siteOf(ctx, 'dues');
      return { rules: [...s.state.rules].sort((a, b) => a.category.localeCompare(b.category) || a.ruleId.localeCompare(b.ruleId) || b.version - a.version), period: openPeriod(s.state), categories: C1_CATEGORIES };
    },
  },
  {
    // Quick setup: site defaults for the categories offered in C.1 (blank amounts are skipped).
    method: 'POST',
    pattern: /^\/charges\/defaults$/,
    access: requires('dues', 'charges.manage', 'operational'),
    handle: (ctx): ChargeRule[] => {
      const s = siteOf(ctx, 'dues');
      const body = (ctx.req.body ?? {}) as { amounts?: Record<string, unknown>; from?: string };
      const from = periodFrom(ctx, s, body.from);
      const entries = C1_CATEGORIES.filter((c) => String(body.amounts?.[c] ?? '').trim() !== '');
      if (!entries.length) invalidField(ctx, 'amounts', 'billing:rules.problems.noAmounts');
      const amounts = entries.map((c) => [c, amountOf(ctx, `amounts.${c}`, body.amounts![c])] as const);
      const site = { scope: { level: 'site' } as RuleScope, name: ALNOOR_SITE.name };
      const created = amounts.map(([c, a]) => addRule(ctx, s, c, site, a, from));
      save(ctx);
      return created;
    },
  },
  {
    method: 'POST',
    pattern: /^\/charges\/rules$/,
    access: requires('dues', 'charges.manage', 'operational'),
    handle: (ctx): ChargeRule => {
      const s = siteOf(ctx, 'dues');
      const body = (ctx.req.body ?? {}) as { category?: string; scope?: unknown; amount?: unknown; from?: string };
      if (!C1_CATEGORIES.includes(body.category as ChargeCategoryKey)) invalidField(ctx, 'category', 'billing:rules.problems.category');
      const scope = scopeOf(ctx, s, body.scope);
      const amount = amountOf(ctx, 'amount', body.amount);
      const rule = addRule(ctx, s, body.category as ChargeCategoryKey, scope, amount, periodFrom(ctx, s, body.from));
      save(ctx);
      return rule;
    },
  },
  {
    // A new version from a period; the previous version ends there (versions are never edited).
    method: 'POST',
    pattern: /^\/charges\/rules\/(?<ruleId>[\w-]+)\/versions$/,
    access: requires('dues', 'charges.manage', 'operational'),
    handle: (ctx): ChargeRule => {
      const s = siteOf(ctx, 'dues');
      const versions = s.state.rules.filter((r) => r.ruleId === ctx.params.ruleId);
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      if (!latest) notFound(ctx);
      const body = (ctx.req.body ?? {}) as { amount?: unknown; from?: string };
      const amount = amountOf(ctx, 'amount', body.amount);
      const from = periodFrom(ctx, s, body.from);
      if (from < latest.from) invalidField(ctx, 'from', 'billing:rules.problems.beforeVersion', { period: latest.from });
      const { by, byName } = actor(ctx);
      latest.to = from;
      const next: ChargeRule = { ...latest, id: `${latest.ruleId}_v${latest.version + 1}`, version: latest.version + 1, amount, from, createdBy: by, createdByName: byName, createdAt: stamp(ctx) };
      delete next.to;
      s.state.rules.push(next);
      log(ctx, s, 'ruleVersioned', { kind: 'rule', id: next.id, label: latest.scopeName }, { values: { category: latest.category, amount: amount.amount, previous: latest.amount.amount, from } });
      save(ctx);
      return next;
    },
  },
  {
    method: 'GET',
    pattern: /^\/charges\/resolve$/,
    access: requires('dues', CHARGE_READERS, 'history_read'),
    handle: (ctx): { flatId: string; flatCode: string; period: string; lines: ResolvedCharge[]; total: Money } => {
      const s = siteOf(ctx, 'dues');
      const flat = flatOf(ctx, s, String(ctx.req.query?.flat ?? ''));
      const period = String(ctx.req.query?.period ?? currentPeriod(s.state));
      if (!PERIOD.test(period)) invalidField(ctx, 'period', 'billing:rules.problems.period');
      const lines = resolveCharges(flat, s.state.rules, s.state.exemptions, period);
      return { flatId: flat.id, flatCode: flat.code, period, lines, total: money(lines.reduce((n, l) => n + toPaisa(l.amount.amount), 0n)) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/exemptions$/,
    access: requires('dues', CHARGE_READERS, 'history_read'),
    handle: (ctx): Exemption[] => (ctx.data.society ? [...siteOf(ctx, 'dues').state.exemptions].reverse() : []),
  },
  {
    method: 'POST',
    pattern: /^\/exemptions$/,
    access: requires('dues', 'charges.manage', 'operational'),
    handle: (ctx): Exemption => {
      const s = siteOf(ctx, 'dues');
      const body = (ctx.req.body ?? {}) as { flatId?: string; categories?: unknown; percent?: unknown; reason?: string; from?: string };
      const flat = s.view.model.flats.find((f) => f.id === body.flatId);
      if (!flat) invalidField(ctx, 'flatId', 'billing:exemptions.problems.flat');
      const categories = body.categories === 'all' ? 'all' : Array.isArray(body.categories) ? (body.categories.filter((c) => C1_CATEGORIES.includes(c as ChargeCategoryKey)) as ChargeCategoryKey[]) : [];
      if (categories !== 'all' && !categories.length) invalidField(ctx, 'categories', 'billing:exemptions.problems.categories');
      const percent = Number(body.percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) invalidField(ctx, 'percent', 'billing:exemptions.problems.percent');
      const reason = String(body.reason ?? '').trim();
      if (reason.length < 5) invalidField(ctx, 'reason', 'billing:exemptions.problems.reason');
      const from = periodFrom(ctx, s, body.from);
      if (s.state.exemptions.some((e) => e.unitId === flat!.id && e.state !== 'rejected' && (e.to === undefined || e.to > from))) invalidField(ctx, 'flatId', 'billing:exemptions.problems.exists');
      s.state.seq += 1;
      const { by, byName } = actor(ctx);
      const ex: Exemption = { id: `exm_anr_s${s.state.seq}`, siteId: s.siteId, unitId: flat!.id, unitCode: flat!.code, categories, percent, reason, from, state: 'pending_approval', requestedBy: by, requestedByName: byName, requestedAt: stamp(ctx) };
      s.state.exemptions.push(ex);
      log(ctx, s, 'exemptionRequested', { kind: 'exemption', id: ex.id, label: flat!.code }, { flats: [flat!.code], values: { percent: String(percent) } });
      save(ctx);
      return ex;
    },
  },
  {
    method: 'POST',
    pattern: /^\/exemptions\/(?<exemptionId>[\w-]+)\/(?<decision>[\w-]+)$/,
    access: requires('dues', 'billing_run.approve', 'operational'),
    handle: (ctx): Exemption => {
      const s = siteOf(ctx, 'dues');
      const ex = s.state.exemptions.find((e) => e.id === ctx.params.exemptionId);
      if (!ex || !['approve', 'reject'].includes(ctx.params.decision!)) notFound(ctx);
      if (ex.state !== 'pending_approval') problem(ctx, 409, 'invalid_transition', 'billing:errors.invalidTransition');
      if (ex.requestedBy === ctx.persona!.principalId) problem(ctx, 403, 'maker_checker_required', 'billing:errors.makerChecker');
      const { by, byName } = actor(ctx);
      const approved = ctx.params.decision === 'approve';
      Object.assign(ex, { state: approved ? 'approved' : 'rejected', decidedBy: by, decidedByName: byName, decidedAt: stamp(ctx) });
      log(ctx, s, approved ? 'exemptionApproved' : 'exemptionRejected', { kind: 'exemption', id: ex.id, label: ex.unitCode }, { flats: [ex.unitCode] });
      save(ctx);
      return ex;
    },
  },
  // -------------------------------------------------------------------------------------------
  // Billing runs (BILL-005/006/007/008)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/billing-runs$/,
    access: requires('dues', 'billing_run.view', 'history_read'),
    handle: (ctx): { runs: BillingRun[]; nextPeriod: string; canCreate: boolean } => {
      if (!ctx.data.society) return { runs: [], nextPeriod: FIRST_PERIOD, canCreate: false };
      const s = siteOf(ctx, 'dues');
      return { runs: [...s.state.runs].reverse().map((r) => runDto(s, r)), nextPeriod: openPeriod(s.state), canCreate: can(ctx, 'billing_run.create') && !!s.state.register };
    },
  },
  {
    // One open run per site and period (A4 §3); a posted period is billed again only by a supplementary run (later gate).
    method: 'POST',
    pattern: /^\/billing-runs$/,
    access: requires('dues', 'billing_run.create', 'operational'),
    handle: (ctx): BillingRunDetail => {
      const s = siteOf(ctx, 'dues');
      const period = String((ctx.req.body as { period?: string } | undefined)?.period ?? '');
      if (!PERIOD.test(period)) invalidField(ctx, 'period', 'billing:runs.problems.period');
      if (period < FIRST_PERIOD) invalidField(ctx, 'period', 'billing:runs.problems.beforeGoLive', { period: FIRST_PERIOD });
      if (!s.state.register) problem(ctx, 409, 'no_flats', 'sites:errors.noFlats');
      const open = s.state.runs.find((r) => r.period === period && isOpen(r.state));
      if (open) problem(ctx, 409, 'duplicate_period', 'billing:errors.duplicatePeriod', { period: [{ code: 'billing:errors.duplicatePeriod', params: { runId: open.id, ref: open.ref } }] });
      s.state.seq += 1;
      const { by, byName } = actor(ctx);
      const id = `brn_anr_${period.replace('-', '')}_s${s.state.seq}`;
      const run: StoredRun = {
        id,
        ref: runRef(s.state, period),
        siteId: s.siteId,
        siteName: ALNOOR_SITE.name,
        period,
        state: 'DRAFT',
        postingVersion: 1,
        issueDate: `${period}-${pad(ISSUE_DAY, 2)}`,
        dueDate: `${period}-${pad(DUE_DAY, 2)}`,
        createdBy: by,
        createdByName: byName,
        totals: null,
        history: [{ at: stamp(ctx), by, byName, action: 'create', from: null, to: 'DRAFT' }],
        items: [],
      };
      s.state.runs.push(run);
      log(ctx, s, 'run_create', { kind: 'run', id, label: run.ref }, { values: { period } });
      save(ctx);
      return runDetail(ctx, s, run);
    },
  },
  {
    method: 'GET',
    pattern: /^\/billing-runs\/(?<runId>[\w-]+)$/,
    access: requires('dues', 'billing_run.view', 'history_read'),
    handle: (ctx): BillingRunDetail => {
      const s = society(ctx);
      return runDetail(ctx, s, runOf(ctx, s));
    },
  },
  runAction('preview', (ctx, s, r) => {
    guard(ctx, s, r, 'preview');
    if (!s.state.rules.some((x) => x.category === 'maintenance')) problem(ctx, 409, 'no_rules', 'billing:errors.noRules');
    const a = assessmentOf(s, r);
    r.items = a.items;
    r.totals = a.totals;
    r.hash = a.hash;
    r.previewedAt = stamp(ctx);
    transition(ctx, s, r, 'preview');
  }),
  runAction('submit', (ctx, s, r) => {
    guard(ctx, s, r, 'submit');
    if (r.items.some((i) => !i.payerPartyId && toPaisa(i.total.amount) > 0n)) problem(ctx, 409, 'no_payer', 'billing:errors.noPayer');
    r.submittedBy = ctx.persona!.principalId;
    transition(ctx, s, r, 'submit');
  }),
  runAction('return', (ctx, s, r) => {
    guard(ctx, s, r, 'return');
    const note = String((ctx.req.body as { note?: string } | undefined)?.note ?? '').trim();
    if (note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
    delete r.submittedBy;
    transition(ctx, s, r, 'return', note);
  }),
  runAction('approve', (ctx, s, r) => {
    guard(ctx, s, r, 'approve');
    r.approvedBy = ctx.persona!.principalId;
    r.approvedByName = ctx.persona!.displayName;
    transition(ctx, s, r, 'approve');
  }),
  runAction('notify', (ctx, s, r) => {
    if (r.state === 'NOTIFIED') return; // a repeated request changes nothing
    guard(ctx, s, r, 'notify');
    r.notified = { notices: r.invoiceIds?.length ?? 0, at: stamp(ctx) };
    transition(ctx, s, r, 'notify');
  }),
  runAction('cancel', (ctx, s, r) => {
    guard(ctx, s, r, 'cancel');
    const note = String((ctx.req.body as { note?: string } | undefined)?.note ?? '').trim();
    if (note.length < 3) invalidField(ctx, 'note', 'billing:errors.noteRequired');
    transition(ctx, s, r, 'cancel', note);
  }),
  {
    // Idempotent (I-7): posting an already posted run returns the same invoices and creates none.
    method: 'POST',
    pattern: /^\/billing-runs\/(?<runId>[\w-]+)\/post$/,
    access: requires('dues', 'billing_run.post', 'operational'),
    handle: (ctx): PostResult => {
      const s = society(ctx);
      const r = runOf(ctx, s);
      if (isPosted(r.state)) {
        const { by, byName } = actor(ctx);
        r.history.push({ at: stamp(ctx), by, byName, action: 'post', from: r.state, to: r.state, replay: true });
        save(ctx);
        return { run: runDto(s, r), invoiceIds: r.invoiceIds ?? [], replayed: true };
      }
      guard(ctx, s, r, 'post');
      const result = post(r.items, {
        run: { id: r.id, ref: r.ref, siteId: r.siteId, period: r.period, postingVersion: r.postingVersion, issueDate: r.issueDate, dueDate: r.dueDate },
        legalEntity: { id: s.legalEntityId, name: ALNOOR_ENTITY.name },
        posted: s.state.invoices.filter((i) => i.siteId === s.siteId),
        nextRef: () => nextRef(s.state, 'invoice', r.period),
      });
      s.state.invoices.push(...result.created);
      r.items = r.items.map((i) => (result.itemInvoices[i.id] ? { ...i, invoiceId: result.itemInvoices[i.id]!.id, invoiceRef: result.itemInvoices[i.id]!.ref } : i));
      r.invoiceIds = result.invoiceIds;
      r.postedAt = stamp(ctx);
      transition(ctx, s, r, 'post');
      s.state.audit.at(-1)!.values = { invoices: String(result.invoiceIds.length), amount: r.totals?.amount.amount ?? '0.00' };
      save(ctx);
      return { run: runDto(s, r), invoiceIds: result.invoiceIds, replayed: false };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Invoices, credit notes, statements (FIN-002/003, BILL-014)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/billing\/invoices$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): InvoiceList => {
      if (!ctx.data.society) return { items: [], total: 0, totals: { billed: money(0n), credited: money(0n), outstanding: money(0n) } };
      const s = siteOf(ctx, 'receivables');
      const { q, source, period, status, account, flat, run } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const flatCode = flat ? s.view.model.flats.find((f) => f.id === flat)?.code : undefined;
      const rows = s.view.invoices
        .filter((i) => !source || source === 'all' || i.source === source)
        .filter((i) => !period || i.period === period)
        .filter((i) => !account || i.billingAccountId === account)
        .filter((i) => !run || i.runId === run)
        .filter((i) => !flatCode || i.lines.some((l) => l.unitCode === flatCode))
        .filter((i) => !status || status === 'all' || (status === 'overdue' ? i.overdue : i.settlement === status))
        .filter((i) => !q || !q.trim() || matches(q.trim(), i.ref, i.accountNo, i.payerName, ...i.lines.map((l) => l.unitCode)))
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || a.ref.localeCompare(b.ref));
      const sum = (pick: (i: (typeof rows)[number]) => Money) => money(rows.reduce((n, i) => n + toPaisa(pick(i).amount), 0n));
      return { items: rows.map(invoiceRow), total: rows.length, totals: { billed: sum((i) => i.total), credited: sum((i) => i.credited), outstanding: sum((i) => i.outstanding) } };
    },
  },
  {
    method: 'GET',
    pattern: /^\/billing\/invoices\/(?<invoiceId>[\w-]+)$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): InvoiceDetail => {
      const s = siteOf(ctx, 'receivables');
      const invoice = s.view.invoices.find((i) => i.id === ctx.params.invoiceId);
      if (!invoice) notFound(ctx);
      authorize(ctx, 'receivables', recordOf(s, { billingAccountId: invoice.billingAccountId, asOf: invoice.issuedOn }));
      const balance = balances(s.view).get(invoice.billingAccountId) ?? 0n;
      return {
        invoice,
        creditNotes: s.state.creditNotes.filter((c) => c.invoiceId === invoice.id),
        payee: beneficiaryOn(s.state, invoice.legalEntityId, ctx.at),
        payments: s.state.payments
          .filter((p) => p.allocations.some((a) => a.invoiceId === invoice.id))
          .map((p) => ({ id: p.id, ref: p.ref, receiptId: p.receiptId, receiptRef: p.receiptRef, receivedOn: p.receivedOn, method: p.method, amount: money(p.allocations.filter((a) => a.invoiceId === invoice.id).reduce((n, a) => n + toPaisa(a.amount.amount), 0n)) })),
        accountBalance: money(balance),
        actions: { creditNote: can(ctx, 'credit_note.create') && toPaisa(invoice.outstanding.amount) > 0n, edit: false },
      };
    },
  },
  {
    // No edit path exists for a posted invoice (I-8): every attempt is refused and changes nothing.
    method: 'PATCH',
    pattern: /^\/billing\/invoices\/(?<invoiceId>[\w-]+)$/,
    access: requires('receivables', 'invoice.view', 'operational'),
    handle: (ctx) => problem(ctx, 409, 'state_locked', 'billing:errors.postedLocked'),
  },
  {
    method: 'POST',
    pattern: /^\/billing\/invoices\/(?<invoiceId>[\w-]+)\/credit-notes$/,
    access: requires('receivables', 'credit_note.create', 'operational'),
    handle: (ctx): CreditNote => {
      const s = siteOf(ctx, 'receivables');
      const invoice = s.view.invoices.find((i) => i.id === ctx.params.invoiceId);
      if (!invoice) notFound(ctx);
      authorize(ctx, 'receivables', recordOf(s, { billingAccountId: invoice.billingAccountId }), 'credit_note.create');
      const body = (ctx.req.body ?? {}) as { reason?: string; lines?: Array<{ lineId?: string; amount?: unknown }> };
      const reason = String(body.reason ?? '').trim();
      const errors: Record<string, Array<{ code: string; params?: Record<string, string> }>> = {};
      if (reason.length < 5) errors.reason = [{ code: 'billing:creditNote.problems.reason' }];
      const lines: CreditNote['lines'] = [];
      for (const l of body.lines ?? []) {
        const line = invoice.lines.find((x) => x.id === l.lineId);
        const raw = String(l.amount ?? '').trim().replace(/,/g, '');
        if (!line) continue;
        if (raw === '' || raw === '0' || raw === '0.00') continue;
        const open = toPaisa(line.amount.amount) - toPaisa(line.credited.amount);
        if (!AMOUNT.test(raw) || toPaisa(raw) <= 0n) errors[`lines.${line.id}`] = [{ code: 'billing:creditNote.problems.amount' }];
        else if (toPaisa(raw) > open) errors[`lines.${line.id}`] = [{ code: 'billing:creditNote.problems.overOpen', params: { open: fromPaisa(open) } }];
        else lines.push({ invoiceLineId: line.id, ...(line.category ? { category: line.category } : {}), unitCode: line.unitCode, amount: money(toPaisa(raw)) });
      }
      if (!lines.length && !Object.keys(errors).some((k) => k.startsWith('lines.'))) errors.lines = [{ code: 'billing:creditNote.problems.noLines' }];
      if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
      const n = s.state.creditNotes.length + 1;
      const { by, byName } = actor(ctx);
      const on = ctx.at > invoice.issuedOn ? ctx.at : invoice.issuedOn;
      const cn: CreditNote = {
        id: `crn_${s.state.numbering.code.toLowerCase()}_${pad(n, 4)}`,
        ref: nextRef(s.state, 'creditNote', on),
        invoiceId: invoice.id,
        invoiceRef: invoice.ref,
        billingAccountId: invoice.billingAccountId,
        // Never before the invoice it corrects (bills are issued ahead of their period).
        on,
        amount: money(lines.reduce((t, l) => t + toPaisa(l.amount.amount), 0n)),
        lines,
        reason,
        createdBy: by,
        createdByName: byName,
      };
      s.state.creditNotes.push(cn);
      log(ctx, s, 'creditNoteIssued', { kind: 'invoice', id: invoice.id, label: invoice.ref }, { flats: [...new Set(lines.map((l) => l.unitCode))], values: { ref: cn.ref, amount: cn.amount.amount, reason } });
      save(ctx);
      return cn;
    },
  },
  {
    method: 'GET',
    pattern: /^\/statements\/(?<accountId>[\w-]+)$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): Statement => {
      const s = siteOf(ctx, 'receivables');
      const account = s.view.model.accounts.find((a) => a.id === ctx.params.accountId);
      if (!account) notFound(ctx);
      authorize(ctx, 'receivables', recordOf(s, { billingAccountId: account.id }));
      const { from, to, payer, flat } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const period = currentPeriod(s.state);
      const party = payer ? s.view.model.people.find((p) => p.id === payer) : undefined;
      if (payer && !party) notFound(ctx);
      const unit = flat ? s.view.model.flats.find((f) => f.id === flat && f.billingAccountId === account.id) : undefined;
      if (flat && !unit) notFound(ctx);
      return statementOf({
        accountId: account.id,
        accountNo: account.accountNo,
        holderName: account.holderName,
        invoices: s.view.invoices,
        creditNotes: s.state.creditNotes,
        payments: s.state.payments,
        from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : `${period}-01`,
        to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : lastDay(period),
        ...(party ? { payer: { partyId: party.id, name: party.displayName } } : {}),
        ...(unit ? { flat: { id: unit.id, code: unit.code } } : {}),
      });
    },
  },
];
