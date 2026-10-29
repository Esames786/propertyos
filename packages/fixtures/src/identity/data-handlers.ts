import {
  EXPORT_DATASETS,
  type ExportDataset,
  type ExportDatasetPreview,
  type ExportDecisionInput,
  type ExportFile,
  type ExportPreview,
  type ExportRequest,
  type ModuleKey,
  type NewExportInput,
  type NewPrivacyRequestInput,
  type Permission,
  type PrivacyDecisionInput,
  type PrivacyRequest,
  type PrivacyRequestKind,
} from '@repo/contracts';
import { decideRecord, forbid, invalid, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { pad } from '../seed';
import { linesOf } from '../society/allocate';
import { problem, recordOf, society, type Society } from '../society/handlers';
import { maskPhone, principalOfParty, statusOf } from './portal-access-handlers';
import { alnoorRegisterPeople, peopleOf } from './register-people';
import { dayOffset, identityOf, logEvent, nextSeq, nowStamp, type IdentityState, type StoredExport } from './state';

/**
 * Data exports and privacy requests (Gate D.1: ADM-024 and the resident's "My data" on PORTAL-024).
 *
 * The rule (D-40): an export holds the datasets the requester could open themselves, within their own
 * scope, re-checked when the file is generated. An approver (data_export.approve, never the requester)
 * can remove datasets but never add one. Files are simulated: they hold the fictional demo rows the
 * requester may see, labelled as demo data, and expire seven days after approval. Financial records
 * are never deleted on a privacy request; they are kept for the legal period and anonymised.
 */
const EXPORT_DAYS = 7;
const PRIVACY_DAYS = 30;

type Source = { module: ModuleKey; permission: Permission; personal: boolean; financial: boolean };
const SOURCES: Record<ExportDataset, Source> = {
  people: { module: 'residents', permission: 'residents.view', personal: true, financial: false },
  flats: { module: 'core', permission: 'site.view', personal: false, financial: false },
  invoices: { module: 'receivables', permission: 'invoice.view', personal: true, financial: true },
  payments: { module: 'receivables', permission: 'collections.view', personal: true, financial: true },
  bank_lines: { module: 'banking', permission: 'bank.view', personal: true, financial: true },
  portal_access: { module: 'resident_portal', permission: 'portal_access.view', personal: true, financial: false },
  audit: { module: 'core', permission: 'admin.view', personal: true, financial: false },
};

/** The rows of one dataset the caller could open (society organisations; other kinds have none yet). */
function rowsOf(ctx: HandlerContext, s: Society | null, dataset: ExportDataset): Array<Record<string, string>> {
  if (!s) return [];
  const m = s.view.model;
  const state = identityOf(ctx);
  switch (dataset) {
    case 'people':
      return m.people.filter((p) => p.kind === 'individual').map((p) => ({ ref: p.ref, name: p.displayName, phone: p.phone ?? '', email: p.email ?? '' }));
    case 'flats':
      return m.flats.map((f) => ({ flat: f.code, building: m.buildings.find((b) => b.id === f.buildingId)?.name ?? '', area_sqft: String(f.areaSqft), occupancy: f.occupancy }));
    case 'invoices':
      return s.view.invoices.map((i) => ({ reference: i.ref, period: i.period, flats: [...new Set(i.lines.map((l) => l.unitCode))].join(' '), total: i.total.amount, due_on: i.dueOn }));
    case 'payments':
      return s.state.payments.map((p) => ({ reference: p.ref, account: p.billingAccountId, amount: p.amount.amount, method: p.method, received_on: p.receivedOn }));
    case 'bank_lines':
      return s.state.bank.lines.map((l) => ({ bank_id: l.bankTxnId, value_date: l.valueDate, amount: l.amount.amount, reference: l.reference ?? '' }));
    case 'portal_access': {
      const unverified = new Set(alnoorRegisterPeople().filter((p) => !p.verified).map((p) => p.partyId));
      return peopleOf(m, ctx.at).map((p) => {
        const person = unverified.has(p.partyId) ? { ...p, verified: false } : p;
        return { name: p.name, flats: p.flats.map((f) => f.flatCode).join(' '), status: statusOf(person, state, ctx.at), last_sign_in: state.portal[p.partyId]?.lastSignInAt?.slice(0, 10) ?? '' };
      });
    }
    case 'audit':
      return s.state.audit.map((a) => ({ at: a.at, by: a.byName, action: a.action, target: a.target.label }));
  }
}

const societyOrNull = (ctx: HandlerContext): Society | null => (ctx.data.society ? society(ctx) : null);

/** Whether the caller could open this dataset themselves (licence for the site, permission, scope). */
function preview(ctx: HandlerContext, s: Society | null, dataset: ExportDataset): ExportDatasetPreview {
  const src = SOURCES[dataset];
  const base = { dataset, personalData: src.personal, financialData: src.financial };
  if (!s) return { ...base, included: false, reason: 'outside_scope', rows: 0 };
  const decision = decideRecord(ctx, src.module, recordOf(s), src.permission);
  if (!decision.allowed) return { ...base, included: false, reason: decision.reason === 'permission_missing' ? 'permission_missing' : decision.reason === 'out_of_scope' ? 'outside_scope' : 'module_not_licensed', rows: 0 };
  return { ...base, included: true, rows: rowsOf(ctx, s, dataset).length };
}

function previewAll(ctx: HandlerContext, datasets: readonly ExportDataset[]): ExportPreview {
  const s = societyOrNull(ctx);
  const items = datasets.map((d) => preview(ctx, s, d));
  const personal = items.some((i) => i.included && (i.personalData || i.financialData));
  return { datasets: items, sites: s ? [{ id: s.siteId, name: 'Al-Noor Residency', included: true }] : [], personalData: personal, needsApproval: personal };
}

function view(ctx: HandlerContext, e: StoredExport): ExportRequest {
  const me = ctx.persona?.principalId;
  const expired = e.state === 'ready' && !!e.expiresOn && e.expiresOn < ctx.at;
  const state = expired ? 'expired' : e.state;
  return {
    id: e.id,
    reference: e.reference,
    requestedByName: e.requestedByName,
    requestedByPrincipal: e.requestedBy,
    requestedAt: e.requestedAt,
    purpose: e.purpose,
    format: e.format,
    datasets: e.datasets,
    state,
    ...(e.decidedByName ? { decidedByName: e.decidedByName } : {}),
    ...(e.decidedAt ? { decidedAt: e.decidedAt } : {}),
    ...(e.decisionNote ? { decisionNote: e.decisionNote } : {}),
    ...(e.expiresOn ? { expiresAt: `${e.expiresOn}T23:59:59Z` } : {}),
    ...(e.downloadedAt ? { downloadedAt: e.downloadedAt } : {}),
    rows: e.datasets.filter((d) => d.included).reduce((n, d) => n + d.rows, 0),
    canDecide: state === 'awaiting_approval' && e.requestedBy !== me && !!ctx.access?.permissions.includes('data_export.approve'),
    canDownload: (state === 'ready' || state === 'downloaded') && e.requestedBy === me,
  };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function fileOf(ctx: HandlerContext, e: StoredExport, s: Society | null): ExportFile {
  // Generated now, for the requester as they are now: a dataset they can no longer open is left out.
  const blocks = e.datasets.filter((d) => d.included && preview(ctx, s, d.dataset).included).map((d) => ({ dataset: d.dataset, rows: rowsOf(ctx, s, d.dataset) }));
  const stampLine = `PropertyOS demo export ${e.reference} — fictional data, generated ${ctx.at} for ${e.requestedByName}`;
  if (e.format === 'json') {
    return { fileName: `${e.reference}.json`, mime: 'application/json', content: JSON.stringify({ note: stampLine, datasets: Object.fromEntries(blocks.map((b) => [b.dataset, b.rows])) }, null, 2) };
  }
  const parts = [`# ${stampLine}`];
  for (const b of blocks) {
    const cols = Object.keys(b.rows[0] ?? { empty: '' });
    parts.push('', `# ${b.dataset} (${b.rows.length})`, cols.join(','), ...b.rows.map((r) => cols.map((c) => csvCell(r[c] ?? '')).join(',')));
  }
  return { fileName: `${e.reference}.csv`, mime: 'text/csv', content: parts.join('\n') };
}

function seedPrivacy(state: IdentityState) {
  if (state.privacy.length || !alnoorRegisterPeople().length) return;
  const people = alnoorRegisterPeople();
  const a = people[12]!;
  const b = people[27]!;
  state.privacy.push(
    { id: 'prv_anr_0001', reference: 'PRV-2026-0001', kind: 'access', partyId: a.partyId, personName: a.name, flatCodes: a.flats.map((f) => f.flatCode), details: 'Please send me a copy of everything the society holds about me and my flat.', submittedAt: `${dayOffset(-3)}T18:20:00Z`, submittedVia: 'resident_app', state: 'submitted', dueBy: dayOffset(27) },
    { id: 'prv_anr_0002', reference: 'PRV-2026-0002', kind: 'correction', partyId: b.partyId, personName: b.name, flatCodes: b.flats.map((f) => f.flatCode), details: 'My name is spelt wrongly on the register; it should match my CNIC.', submittedAt: `${dayOffset(-8)}T11:05:00Z`, submittedVia: 'office', state: 'in_review', dueBy: dayOffset(22) },
  );
}

const privacyOf = (ctx: HandlerContext) => {
  const state = identityOf(ctx);
  if (ctx.tenantId === 'tnt_alnoor') seedPrivacy(state);
  return state;
};

/**
 * The demo's example: the committee secretary asked for a contact list for meeting notices, waiting
 * for the treasurer's decision (approver never the requester). Rows are counted from the live records.
 */
function seedExports(ctx: HandlerContext, state: IdentityState) {
  if (state.exportsSeeded || ctx.tenantId !== 'tnt_alnoor') return;
  const s = societyOrNull(ctx);
  if (!s) return;
  state.exportsSeeded = true;
  const datasets = (['people', 'portal_access'] as const).map((d) => ({ dataset: d, included: true, rows: rowsOf(ctx, s, d).length, personalData: SOURCES[d].personal, financialData: SOURCES[d].financial }));
  state.exports.push({
    id: 'dex_anr_0001',
    reference: 'DEX-2026-0001',
    requestedBy: 'usr_anr_r0003',
    requestedByName: 'Rabia Hashmi',
    requestedAt: `${dayOffset(-1)}T09:40:00Z`,
    purpose: 'Contact list for the annual general meeting notices (committee use only).',
    format: 'csv',
    siteIds: [s.siteId],
    datasets,
    state: 'awaiting_approval',
  });
}

const exportsOf = (ctx: HandlerContext) => {
  const state = identityOf(ctx);
  seedExports(ctx, state);
  return state;
};

const KINDS: readonly PrivacyRequestKind[] = ['access', 'correction', 'deletion'];

export const DATA_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/data-exports$/,
    access: requires('core', ['data_export.request', 'data_export.approve'], 'history_read'),
    handle: (ctx): ExportRequest[] => {
      const state = exportsOf(ctx);
      const me = ctx.persona!.principalId;
      const approver = !!ctx.access?.permissions.includes('data_export.approve');
      // A requester sees their own requests; an approver also sees what waits for a decision and what was decided.
      return state.exports.filter((e) => e.requestedBy === me || approver).map((e) => view(ctx, e));
    },
  },
  {
    method: 'POST',
    pattern: /^\/data-exports\/preview$/,
    access: requires('core', 'data_export.request', 'history_read'),
    handle: (ctx): ExportPreview => {
      const datasets = ((ctx.req.body as { datasets?: ExportDataset[] } | undefined)?.datasets ?? [...EXPORT_DATASETS]).filter((d) => EXPORT_DATASETS.includes(d));
      return previewAll(ctx, datasets);
    },
  },
  {
    method: 'POST',
    pattern: /^\/data-exports$/,
    access: requires('core', 'data_export.request', 'operational'),
    handle: (ctx): ExportRequest => {
      const input = (ctx.req.body ?? {}) as NewExportInput;
      const datasets = [...new Set(input.datasets ?? [])].filter((d) => EXPORT_DATASETS.includes(d));
      if (!datasets.length) invalid(ctx, 'datasets', 'forms:errors.selectOne');
      const purpose = String(input.purpose ?? '').trim();
      if (purpose.length < 10) invalid(ctx, 'purpose', 'identity:export.errors.purpose');
      if (input.format !== 'csv' && input.format !== 'json') invalid(ctx, 'format', 'forms:errors.selectOne');
      // Never trust the screen's preview: the server decides what is included, for this requester.
      const p = previewAll(ctx, datasets);
      if (!p.datasets.some((d) => d.included)) problem(ctx, 403, 'nothing_to_export', 'identity:export.errors.nothing');
      const state = exportsOf(ctx);
      const n = state.exports.length + 1;
      const record: StoredExport = {
        id: nextSeq(state, 'dex'),
        reference: `DEX-2026-${pad(n, 4)}`,
        requestedBy: ctx.persona!.principalId,
        requestedByName: ctx.persona!.displayName,
        requestedAt: nowStamp(ctx),
        purpose,
        format: input.format,
        siteIds: p.sites.map((x) => x.id),
        datasets: p.datasets,
        state: p.needsApproval ? 'awaiting_approval' : 'ready',
        ...(p.needsApproval ? {} : { expiresOn: dayOffset(EXPORT_DAYS, ctx.at) }),
      };
      state.exports.unshift(record);
      logEvent(state, { principalId: record.requestedBy, kind: 'export_requested', at: record.requestedAt, app: 'backoffice', detail: record.reference });
      ctx.demo.save();
      return view(ctx, record);
    },
  },
  {
    method: 'POST',
    pattern: /^\/data-exports\/(?<id>[\w-]+)\/decide$/,
    access: requires('core', 'data_export.approve', 'operational'),
    handle: (ctx): ExportRequest => {
      const state = exportsOf(ctx);
      const e = state.exports.find((x) => x.id === ctx.params.id);
      if (!e) notFound(ctx);
      if (e.state !== 'awaiting_approval') invalid(ctx, 'export', 'identity:export.errors.notWaiting');
      // Maker-checker by principal: nobody approves their own export.
      if (e.requestedBy === ctx.persona!.principalId) problem(ctx, 403, 'separation_of_duties', 'errors:access.separation_of_duties');
      const input = (ctx.req.body ?? {}) as ExportDecisionInput;
      const note = String(input.note ?? '').trim();
      const at = nowStamp(ctx);
      if (input.decision === 'reject') {
        if (note.length < 5) invalid(ctx, 'note', 'forms:errors.reasonRequired');
        Object.assign(e, { state: 'rejected', decidedBy: ctx.persona!.principalId, decidedByName: ctx.persona!.displayName, decidedAt: at, decisionNote: note });
      } else if (input.decision === 'approve') {
        const included = e.datasets.filter((d) => d.included).map((d) => d.dataset);
        const keep = input.keep ?? included;
        // Approval narrows only: a dataset that was not in the request can never be added.
        if (keep.some((d) => !included.includes(d))) problem(ctx, 422, 'cannot_widen', 'identity:export.errors.cannotWiden');
        if (!keep.length) invalid(ctx, 'keep', 'forms:errors.selectOne');
        e.datasets = e.datasets.map((d) => (d.included && !keep.includes(d.dataset) ? { ...d, included: false, reason: 'removed_by_approver' } : d));
        Object.assign(e, { state: 'ready', decidedBy: ctx.persona!.principalId, decidedByName: ctx.persona!.displayName, decidedAt: at, expiresOn: dayOffset(EXPORT_DAYS, ctx.at), ...(note ? { decisionNote: note } : {}) });
      } else invalid(ctx, 'decision', 'forms:errors.selectOne');
      ctx.demo.save();
      return view(ctx, e);
    },
  },
  {
    method: 'POST',
    pattern: /^\/data-exports\/(?<id>[\w-]+)\/download$/,
    access: requires('core', 'data_export.request', 'history_read'),
    handle: (ctx): ExportFile => {
      const state = exportsOf(ctx);
      const e = state.exports.find((x) => x.id === ctx.params.id && x.requestedBy === ctx.persona!.principalId);
      if (!e) notFound(ctx);
      const v = view(ctx, e);
      if (v.state === 'expired') problem(ctx, 410, 'export_expired', 'identity:export.errors.expired');
      if (!v.canDownload) invalid(ctx, 'export', 'identity:export.errors.notReady');
      const file = fileOf(ctx, e, societyOrNull(ctx));
      e.downloadedAt = nowStamp(ctx);
      e.state = 'downloaded';
      logEvent(state, { principalId: e.requestedBy, kind: 'export_downloaded', at: e.downloadedAt, app: 'backoffice', detail: e.reference });
      ctx.demo.save();
      return file;
    },
  },
  {
    method: 'POST',
    pattern: /^\/data-exports\/(?<id>[\w-]+)\/cancel$/,
    access: requires('core', 'data_export.request', 'operational'),
    handle: (ctx): ExportRequest => {
      const state = exportsOf(ctx);
      const e = state.exports.find((x) => x.id === ctx.params.id && x.requestedBy === ctx.persona!.principalId);
      if (!e) notFound(ctx);
      if (e.state !== 'awaiting_approval') invalid(ctx, 'export', 'identity:export.errors.notWaiting');
      e.state = 'cancelled';
      ctx.demo.save();
      return view(ctx, e);
    },
  },
  // ---------------------------------------------------------------- privacy requests (office)
  {
    method: 'GET',
    pattern: /^\/privacy-requests$/,
    access: requires('core', 'privacy.requests.manage', 'history_read'),
    handle: (ctx): PrivacyRequest[] => {
      const state = privacyOf(ctx);
      ctx.demo.save();
      const order = { submitted: 0, in_review: 1, completed: 2, rejected: 3 } as const;
      return [...state.privacy].sort((a, b) => order[a.state] - order[b.state] || b.submittedAt.localeCompare(a.submittedAt));
    },
  },
  {
    method: 'POST',
    pattern: /^\/privacy-requests\/(?<id>[\w-]+)\/decide$/,
    access: requires('core', 'privacy.requests.manage', 'operational'),
    handle: (ctx): PrivacyRequest => {
      const state = privacyOf(ctx);
      const r = state.privacy.find((x) => x.id === ctx.params.id);
      if (!r) notFound(ctx);
      if (r.state === 'completed' || r.state === 'rejected') invalid(ctx, 'request', 'identity:privacy.errors.closed');
      const input = (ctx.req.body ?? {}) as PrivacyDecisionInput;
      const note = String(input.note ?? '').trim();
      if (note.length < 5) invalid(ctx, 'note', 'forms:errors.reasonRequired');
      const at = nowStamp(ctx);
      if (input.decision === 'complete' && r.kind === 'deletion') {
        // Contact details and the portal account go; financial records stay for the legal period, anonymised.
        const principal = principalOfParty(r.partyId);
        state.contacts[principal] = { consents: [{ channel: 'sms', consented: false, updatedAt: at }, { channel: 'whatsapp', consented: false, updatedAt: at }, { channel: 'email', consented: false, updatedAt: at }] };
        const account = state.portal[r.partyId];
        if (account?.status === 'active') Object.assign(account, { status: 'revoked', revokedAt: at, revokedByName: ctx.persona!.displayName });
        for (const s of state.sessions.filter((x) => x.principalId === principal && x.state === 'active')) Object.assign(s, { state: 'revoked', endedAt: at, endReason: 'portal_access_revoked', endedByName: ctx.persona!.displayName });
        r.retentionOutcome = 'contacts_removed_financial_kept';
      }
      Object.assign(r, { state: input.decision === 'complete' ? 'completed' : 'rejected', decidedByName: ctx.persona!.displayName, decidedAt: at, decisionNote: note });
      ctx.demo.save();
      return r;
    },
  },
  // ---------------------------------------------------------------- the resident's own data (PORTAL-024)
  {
    method: 'GET',
    pattern: /^\/portal\/my-data$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): { requests: PrivacyRequest[]; holds: Record<string, number> } => {
      const persona = ctx.persona;
      if (!persona?.partyId) forbid(ctx);
      const state = privacyOf(ctx);
      const s = societyOrNull(ctx);
      const lines = s ? linesOf(s.view.invoices).filter((l) => l.payerPartyId === persona.partyId) : [];
      return {
        requests: state.privacy.filter((r) => r.partyId === persona.partyId),
        holds: {
          flats: s ? peopleOf(s.view.model, ctx.at).find((p) => p.partyId === persona.partyId)?.flats.length ?? 0 : 0,
          bills: new Set(lines.map((l) => l.invoiceId)).size,
          payments: s ? s.state.payments.filter((p) => p.payerPartyId === persona.partyId).length : 0,
          proofs: s ? s.state.submissions.filter((x) => x.payerPartyId === persona.partyId).length : 0,
          devices: state.sessions.filter((x) => x.principalId === persona.principalId).length,
        },
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/my-data\/export$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ExportFile => {
      const persona = ctx.persona;
      if (!persona?.partyId) forbid(ctx);
      const state = identityOf(ctx);
      const s = societyOrNull(ctx);
      const me = s ? peopleOf(s.view.model, ctx.at).find((p) => p.partyId === persona.partyId) : undefined;
      const lines = s ? linesOf(s.view.invoices).filter((l) => l.payerPartyId === persona.partyId) : [];
      const at = nowStamp(ctx);
      // Only this person's own records: never anyone else in the flat, never the society's other data.
      const content = {
        note: `PropertyOS demo export of your own data — fictional, generated ${ctx.at}`,
        you: { name: persona.displayName, email: state.contacts[persona.principalId]?.email ?? persona.email, phone: maskPhone(state.contacts[persona.principalId]?.phone ?? me?.phone) ?? '' },
        flats: me?.flats.map((f) => ({ flat: f.flatCode, roles: f.roles, since: f.from })) ?? [],
        bills: [...new Set(lines.map((l) => l.invoiceRef))],
        payments: s ? s.state.payments.filter((p) => p.payerPartyId === persona.partyId).map((p) => ({ reference: p.ref, amount: p.amount.amount, received_on: p.receivedOn })) : [],
        consents: state.contacts[persona.principalId]?.consents ?? [],
        devices: state.sessions.filter((x) => x.principalId === persona.principalId).map((x) => ({ device: `${x.device.browser} ${x.device.platform}`, first_seen: x.createdAt.slice(0, 10), state: x.state })),
      };
      logEvent(state, { principalId: persona.principalId, kind: 'export_downloaded', at, app: 'customer', detail: 'self' });
      ctx.demo.save();
      return { fileName: `my-data-${ctx.at}.json`, mime: 'application/json', content: JSON.stringify(content, null, 2) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/my-data\/requests$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): PrivacyRequest => {
      const persona = ctx.persona;
      if (!persona?.partyId) forbid(ctx);
      const input = (ctx.req.body ?? {}) as NewPrivacyRequestInput;
      if (!KINDS.includes(input.kind)) invalid(ctx, 'kind', 'forms:errors.selectOne');
      const details = String(input.details ?? '').trim();
      if (details.length < 10) invalid(ctx, 'details', 'identity:privacy.errors.details');
      const state = privacyOf(ctx);
      if (state.privacy.some((r) => r.partyId === persona.partyId && r.kind === input.kind && (r.state === 'submitted' || r.state === 'in_review'))) problem(ctx, 409, 'request_open', 'identity:privacy.errors.open');
      const s = societyOrNull(ctx);
      const me = s ? peopleOf(s.view.model, ctx.at).find((p) => p.partyId === persona.partyId) : undefined;
      const n = state.privacy.length + 1;
      const at = nowStamp(ctx);
      const r: PrivacyRequest = {
        id: nextSeq(state, 'prv'),
        reference: `PRV-2026-${pad(n, 4)}`,
        kind: input.kind,
        partyId: persona.partyId,
        personName: persona.displayName,
        flatCodes: me?.flats.map((f) => f.flatCode) ?? [],
        details,
        submittedAt: at,
        submittedVia: 'resident_app',
        state: 'submitted',
        dueBy: dayOffset(PRIVACY_DAYS, ctx.at),
      };
      state.privacy.unshift(r);
      logEvent(state, { principalId: persona.principalId, kind: 'privacy_request_submitted', at, app: 'customer', detail: r.reference });
      ctx.demo.save();
      return r;
    },
  },
];
