import {
  ApiError,
  isMoneyAmount,
  PAYMENT_METHODS,
  SERVICE_CATEGORIES,
  VISITOR_PURPOSES,
  type CreateServiceRequestInput,
  type CreateVisitorPassInput,
  type InstalmentItem,
  type PaymentMethod,
  type PaymentProof,
  type ServiceRequest,
  type SubmitProofInput,
  type VisitorPass,
} from '@repo/contracts';
import { normalizePkPhone } from '@repo/i18n/format';
import { authorize, forbid, invalid, notFound, permits, requires, type Handler, type HandlerContext } from './handler-types';
import {
  buildPortalHome,
  buildPortalPayments,
  emptyPortalSession,
  isPayable,
  liabilityRecord,
  passCode,
  portalDocuments,
  portalSchedule,
  portalServices,
  portfolioFor,
  PORTAL_SECTION,
  receiptDetail,
  type Portfolio,
  type PortalSessionState,
} from './portal';
import { pad } from './seed';

/**
 * Customer portal endpoints (Stage 1.5R). Owned by the portal slice; state lives in
 * `ctx.demo.section('portal:<billing account>', …)`. Proof uploads end at "Awaiting verification",
 * never "Paid". Only a customer-app persona linked to a party (the resident) may call them, and only
 * for the flat and billing account a verified link in force covers (CP2 security correction 3):
 * every record is checked against the full liability (flat, account, site and legal entity) on the
 * record's own date. Payments and history stay readable while the organisation is suspended;
 * settling issued instalments follows its suspension policy; everything else is paused.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function owner(ctx: HandlerContext): { p: Portfolio; session: PortalSessionState } {
  const persona = ctx.persona;
  if (!persona || persona.app !== 'customer' || !persona.partyId) forbid(ctx);
  const partyId = persona.partyId;
  // The liability in force today that the resident's verified links reach (unverified or ended links never do).
  const link = ctx.data.partyLinks.filter((l) => l.partyId === partyId).find((l) => permits(ctx, 'resident_portal', liabilityRecord(l, ctx.at)));
  if (!link) notFound(ctx);
  const base = portfolioFor(ctx.data, partyId, link);
  if (!base) notFound(ctx);
  if (!ctx.allowsProject(base.property.projectId)) forbid(ctx);
  // Effective-dated: only instalments dated inside the liability period are the resident's.
  const p = { ...base, schedule: base.schedule.filter((i) => permits(ctx, 'resident_portal', liabilityRecord(link, i.dueDate))) };
  return { p, session: ctx.demo.section<PortalSessionState>(`${PORTAL_SECTION}:${link.billingAccountId}`, emptyPortalSession) };
}

/** The resident's flat as an access record today (for module checks such as maintenance or visitors). */
const flatToday = (ctx: HandlerContext, p: Portfolio) => liabilityRecord(p.link, ctx.at);

function payableInstalment(ctx: HandlerContext, p: Portfolio, session: PortalSessionState): InstalmentItem {
  const item = portalSchedule(p, session).find((i) => i.id === ctx.params.id);
  if (!item) notFound(ctx);
  if (!isPayable(item.status)) {
    throw new ApiError({
      status: 409,
      code: 'not_payable',
      messageKey: 'portal:errors.notPayable',
      correlationId: ctx.correlationId,
      changed: false,
    });
  }
  return item;
}

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<T>;

export const PORTAL_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/portal\/home$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx) => {
      const { p, session } = owner(ctx);
      return buildPortalHome(p, session);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/payments$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx) => {
      const { p, session } = owner(ctx);
      return buildPortalPayments(p, session);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/instalments\/(?<id>[\w-]+)\/proof$/,
    access: requires('resident_portal', 'portal.use', 'settlement'),
    handle: (ctx): InstalmentItem => {
      const { p, session } = owner(ctx);
      const item = payableInstalment(ctx, p, session);
      const input = body<SubmitProofInput>(ctx);
      // Untrusted body: the simulation's method is not accepted here.
      const method = input.method as PaymentMethod | undefined;
      if (!method || method === 'online_simulated' || !PAYMENT_METHODS.includes(method)) invalid(ctx, 'method', 'forms:errors.selectOne');
      const amount = String(input.amount ?? '');
      if (!isMoneyAmount(amount) || Number(amount) <= 0) invalid(ctx, 'amount', 'forms:errors.amountPositive');
      const paidOn = String(input.paidOn ?? '');
      if (!CALENDAR_DATE.test(paidOn)) invalid(ctx, 'paidOn', 'forms:errors.dateRequired');
      const reference = String(input.reference ?? '').trim();
      if (reference.length < 4) invalid(ctx, 'reference', 'forms:errors.required');
      const proof: PaymentProof = {
        submittedAt: new Date().toISOString(),
        method: method as SubmitProofInput['method'],
        amount: { amount, currency: 'PKR' },
        reference,
        paidOn,
        ...(input.fileName ? { fileName: String(input.fileName) } : {}),
        simulated: false,
      };
      session.proofs[item.id] = proof;
      ctx.demo.save();
      return portalSchedule(p, session).find((i) => i.id === item.id)!;
    },
  },
  {
    // Labelled simulation: no gateway is contacted and the instalment is NOT marked paid.
    method: 'POST',
    pattern: /^\/portal\/instalments\/(?<id>[\w-]+)\/simulate-online$/,
    access: requires('resident_portal', 'portal.use', 'settlement'),
    handle: (ctx): InstalmentItem => {
      const { p, session } = owner(ctx);
      // The simulation stands in for online payments, which are licensed per site.
      authorize(ctx, 'online_payments', flatToday(ctx, p));
      const item = payableInstalment(ctx, p, session);
      const now = new Date();
      session.proofs[item.id] = {
        submittedAt: now.toISOString(),
        method: 'online_simulated',
        amount: item.amount,
        reference: `SIM-${pad(ctx.demo.counter + 1, 4)}-${item.ref}`,
        paidOn: now.toISOString().slice(0, 10),
        simulated: true,
      };
      ctx.demo.nextId('sim');
      ctx.demo.save();
      return portalSchedule(p, session).find((i) => i.id === item.id)!;
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/receipts\/(?<id>[\w-]+)$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx) => {
      const { p, session } = owner(ctx);
      return receiptDetail(p, session, ctx.params.id!) ?? notFound(ctx);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/construction$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { p } = owner(ctx);
      authorize(ctx, 'construction', flatToday(ctx, p));
      return p.construction;
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/documents$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx) => {
      const { p } = owner(ctx);
      return portalDocuments(p);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/services$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { p, session } = owner(ctx);
      return portalServices(p, session);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/service-requests$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ServiceRequest => {
      const { p, session } = owner(ctx);
      authorize(ctx, 'maintenance', flatToday(ctx, p));
      const input = body<CreateServiceRequestInput>(ctx);
      if (!input.category || !SERVICE_CATEGORIES.includes(input.category)) invalid(ctx, 'category', 'forms:errors.selectOne');
      const description = String(input.description ?? '').trim();
      if (description.length < 5) invalid(ctx, 'description', 'forms:errors.required');
      const preferredDate = input.preferredDate ? String(input.preferredDate) : undefined;
      if (preferredDate && !CALENDAR_DATE.test(preferredDate)) invalid(ctx, 'preferredDate', 'forms:errors.dateRequired');
      const id = ctx.demo.nextId('srq');
      const request: ServiceRequest = {
        id,
        ref: `SR-2026-${pad(500 + ctx.demo.counter, 4)}`,
        category: input.category,
        description: description.slice(0, 500),
        ...(preferredDate ? { preferredDate } : {}),
        status: 'submitted',
        createdAt: new Date().toISOString(),
        createdInSession: true,
      };
      session.requests.unshift(request);
      ctx.demo.save();
      return request;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/visitor-passes$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): VisitorPass => {
      const { p, session } = owner(ctx);
      authorize(ctx, 'visitors', flatToday(ctx, p));
      const input = body<CreateVisitorPassInput>(ctx);
      const visitorName = String(input.visitorName ?? '').trim();
      if (visitorName.length < 2) invalid(ctx, 'visitorName', 'forms:errors.required');
      if (!input.purpose || !VISITOR_PURPOSES.includes(input.purpose)) invalid(ctx, 'purpose', 'forms:errors.selectOne');
      const visitDate = String(input.visitDate ?? '');
      if (!CALENDAR_DATE.test(visitDate)) invalid(ctx, 'visitDate', 'forms:errors.dateRequired');
      let phone: string | undefined;
      if (input.phone && String(input.phone).trim()) {
        phone = normalizePkPhone(String(input.phone)) ?? undefined;
        if (!phone) invalid(ctx, 'phone', 'forms:errors.phoneInvalid');
      }
      const id = ctx.demo.nextId('vps');
      const pass: VisitorPass = {
        id,
        ref: `VP-2026-${pad(100 + ctx.demo.counter, 4)}`,
        code: passCode(ctx.demo.counter),
        visitorName: visitorName.slice(0, 80),
        ...(phone ? { phone } : {}),
        purpose: input.purpose,
        visitDate,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdInSession: true,
      };
      session.passes.unshift(pass);
      ctx.demo.save();
      return pass;
    },
  },
];
