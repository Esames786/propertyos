import {
  DEVELOPER_STATE_VERSION,
  type DevApprovalPolicyVersion,
  type DevCollectionAccount,
  type DevCostCentre,
  type DeveloperApprovalSubject,
  type DeveloperDocumentKind,
  type DeveloperState,
  type DevLegalEntity,
  type DevNumberingSeries,
  type Permission,
} from '@repo/contracts';
import type { TenantDataset } from '../dataset-types';
import type { HandlerContext } from '../handler-types';
import { formatRef } from '../society/numbering';
import { directoryTenant } from '../tenant-directory';

/**
 * Gate E.0 deliverable 1: the developer organisation's demo-store section (plan §6 E.0).
 *
 * - **Where.** One section, `developer`, in the organisation's own demo partition (`ctx.demo`), stored when
 *   first written (`developerStateForWrite`; reading never stores anything) and discarded by "Reset demo"
 *   (`/demo/reset` clears every partition). Areas keep their own
 *   mutable records in their own sections, named `developer.<area>` (for example `developer.ledger`).
 * - **Versioned.** A stored section of another `version` is re-seeded (`DEVELOPER_STATE_VERSION`).
 * - **Seeded from the existing ids.** Legal entities come from the projects' `legalEntityId`
 *   (`le_larkspur`, `le_crescent`), cost centres from the projects (`prj_heights`, `prj_gardens` …), so every
 *   current record and test keeps its ids. Nothing of the Stage 1 datasets changes.
 * - **Read-only (E-37).** Legal entities, cost centres, numbering and verified collection accounts are
 *   administration data (Gate G screens). No Gate E endpoint changes them.
 * - **Approval policies (E-27, D-29).** One illustrative version per entity for each Wave 1 subject whose
 *   approving permission exists; no amount threshold is proposed (every request needs a second person).
 *
 * Only developer organisations have this state (`developerState` answers null for any other kind).
 */

export const DEVELOPER_SECTION = 'developer';

/** Entity names and codes the administration configured (fictional). Unknown entities get a neutral fallback. */
export interface EntityProfile {
  name: string;
  code: string;
  registration: string;
  /** Last four digits of the fictional verified collection account. */
  accountLast4: string;
}

export const ENTITY_PROFILES: Readonly<Record<string, EntityProfile>> = {
  le_larkspur: { name: directoryTenant('tnt_larkspur')?.legalName ?? 'Larkspur Estates (Pvt) Ltd (Demo)', code: 'LSP', registration: 'DEMO-REG-LSP-0001', accountLast4: '4021' },
  le_crescent: { name: directoryTenant('tnt_crescent')?.legalName ?? 'Crescent Bay Developers (Pvt) Ltd (Demo)', code: 'CBD', registration: 'DEMO-REG-CBD-0001', accountLast4: '7310' },
};

/** Per-entity reference patterns (the society engine's tokens; `formatDeveloperRef`). */
export const DEVELOPER_NUMBERING: Readonly<Record<DeveloperDocumentKind, string>> = {
  instalment_invoice: '{code}-INS-{yyyymm}-{seq:4}',
  manual_invoice: '{code}-INV-{yyyy}-{seq:5}',
  receipt: '{code}-RCT-{yyyy}-{seq:5}',
  credit_note: '{code}-CN-{seq:4}',
  refund: '{code}-RFD-{yyyy}-{seq:4}',
  journal: '{code}-JV-{yyyymm}-{seq:4}',
  supplier_bill: '{code}-SB-{yyyy}-{seq:5}',
  payment_voucher: '{code}-PV-{yyyy}-{seq:4}',
  quotation: '{code}-QT-{yyyy}-{seq:5}',
  reservation: '{code}-RSV-{yyyy}-{seq:4}',
  booking: '{code}-BKG-{yyyy}-{seq:4}',
  purchase_order: '{code}-PO-{yyyy}-{seq:4}',
  bank_import: '{code}-BIM-{yyyymm}-{seq:3}',
};

/** Wave 1 subjects with an approving permission today (the other E-27 subjects arrive with their slices). */
export const WAVE1_POLICY_APPROVERS: Readonly<Partial<Record<DeveloperApprovalSubject, Permission>>> = {
  project_activation: 'project.approve',
  chart_change: 'gl.approve',
  posting_rule: 'gl.approve',
  journal: 'journal.approve',
  bank_import: 'bank.import.approve',
  document_template: 'document_template.approve',
};

const short = (projectId: string) => projectId.replace(/^prj_/, '');

/** The seed of one developer organisation, from its own records only. */
export function seedDeveloperState(data: TenantDataset, profiles: Readonly<Record<string, EntityProfile>> = ENTITY_PROFILES): DeveloperState {
  const since = directoryTenant(data.tenantId)?.licensedFrom ?? '2026-01-01';
  const entityIds = [...new Set(data.projects.map((p) => p.legalEntityId))];
  // An entity the administration has not named yet: its id stands in (unique, never shared with another entity).
  const profileOf = (id: string): EntityProfile => profiles[id] ?? { name: id, code: id.replace(/^le_/, '').replace(/[^a-z0-9]/gi, '').toUpperCase(), registration: 'DEMO-REG', accountLast4: '0000' };
  const legalEntities: DevLegalEntity[] = entityIds.map((id) => {
    const projects = data.projects.filter((p) => p.legalEntityId === id);
    const pr = profileOf(id);
    return { id, name: pr.name, code: pr.code, registration: pr.registration, currency: 'PKR', projectIds: projects.map((p) => p.id), siteIds: [...new Set(projects.map((p) => p.siteId))], source: 'administration' };
  });
  const costCentres: DevCostCentre[] = legalEntities.flatMap((e) => [
    { id: `cc_${e.code.toLowerCase()}_hq`, legalEntityId: e.id, code: `${e.code}-HQ`, name: 'Head office', kind: 'head_office' as const, source: 'administration' as const },
    { id: `cc_${e.code.toLowerCase()}_sales`, legalEntityId: e.id, code: `${e.code}-SAL`, name: 'Sales and marketing', kind: 'sales' as const, source: 'administration' as const },
    ...e.projectIds.map((pid) => {
      const project = data.projects.find((p) => p.id === pid)!;
      return { id: `cc_${short(pid)}`, legalEntityId: e.id, code: `${e.code}-${project.ref}`, name: project.name, kind: 'project' as const, projectId: pid, source: 'administration' as const };
    }),
  ]);
  const numbering: DevNumberingSeries[] = legalEntities.flatMap((e) => Object.entries(DEVELOPER_NUMBERING).map(([kind, pattern]) => ({ legalEntityId: e.id, kind: kind as DeveloperDocumentKind, pattern, source: 'administration' as const })));
  const collectionAccounts: DevCollectionAccount[] = legalEntities.map((e) => ({
    id: `dca_${e.code.toLowerCase()}_01`,
    legalEntityId: e.id,
    bankName: 'Demo Bank (fictional)',
    title: `${e.name} — collections`,
    maskedNumber: `•••• ${profileOf(e.id).accountLast4}`,
    verified: true,
    verifiedOn: since,
    sample: true,
    source: 'administration',
  }));
  const approvalPolicies: DevApprovalPolicyVersion[] = legalEntities.flatMap((e) =>
    Object.entries(WAVE1_POLICY_APPROVERS).map(([subject, approverPermission]) => ({
      id: `dap_${e.code.toLowerCase()}_${subject}_v1`,
      legalEntityId: e.id,
      subject: subject as DeveloperApprovalSubject,
      version: 1,
      state: 'approved' as const,
      effectiveFrom: since,
      approverPermission: approverPermission!,
      threshold: null,
      illustrative: true as const,
    })),
  );
  return { version: DEVELOPER_STATE_VERSION, tenantId: data.tenantId, legalEntities, costCentres, numbering, collectionAccounts, approvalPolicies };
}

const isDeveloper = (ctx: Pick<HandlerContext, 'access' | 'data'>) => ctx.access?.tenant.type === 'developer' && ctx.access.tenant.id === ctx.data.tenantId;
const current = (s: DeveloperState | undefined, tenantId: string): s is DeveloperState => !!s && s.version === DEVELOPER_STATE_VERSION && s.tenantId === tenantId;

/**
 * The signed-in developer organisation's state, for reading. Reads never write: the stored section when
 * it exists in the current version, else the seed (computed, not stored), so a read or a refusal leaves
 * the store byte-identical. Null for every other kind of organisation.
 */
export function developerState(ctx: Pick<HandlerContext, 'access' | 'data' | 'demo'>): DeveloperState | null {
  if (!isDeveloper(ctx)) return null;
  const stored = ctx.demo.peekSection<DeveloperState>(DEVELOPER_SECTION);
  return current(stored, ctx.data.tenantId) ? stored : seedDeveloperState(ctx.data);
}

/**
 * The live section for a handler that changes developer state (after every check of §4.2 has passed):
 * stored on first use, re-seeded when its version differs. Call `ctx.demo.save()` after changing it.
 * Throws for another kind of organisation (a caller bug: check `developerState` first).
 */
export function developerStateForWrite(ctx: Pick<HandlerContext, 'access' | 'data' | 'demo'>): DeveloperState {
  if (!isDeveloper(ctx)) throw new Error('developerStateForWrite: not a developer organisation');
  if (!current(ctx.demo.peekSection<DeveloperState>(DEVELOPER_SECTION), ctx.data.tenantId)) ctx.demo.resetSection(DEVELOPER_SECTION);
  return ctx.demo.section<DeveloperState>(DEVELOPER_SECTION, () => seedDeveloperState(ctx.data));
}

/** A developer document reference for an entity (e.g. "LSP-JV-202610-0001"). */
export function formatDeveloperRef(state: DeveloperState, legalEntityId: string, kind: DeveloperDocumentKind, input: { seq: number; on: string }): string {
  const entity = state.legalEntities.find((e) => e.id === legalEntityId);
  const series = state.numbering.find((n) => n.legalEntityId === legalEntityId && n.kind === kind);
  if (!entity || !series) throw new RangeError(`No ${kind} numbering for ${legalEntityId}`);
  return formatRef(series.pattern, { code: entity.code, seq: input.seq, on: input.on });
}
