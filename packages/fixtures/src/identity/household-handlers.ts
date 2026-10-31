import type { AddHouseholdInput, FlatHousehold, HouseholdPerson, HouseholdRelationship, HouseholdRequest, MyProperty, PartyLink, PortalRole, PropertyDetail } from '@repo/contracts';
import { normalizePkPhone } from '@repo/i18n/format';
import { authorize, forbid, invalid, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { fromPaisa } from '../portal';
import { linesOf } from '../society/allocate';
import { problem, recordOf, society, type Society } from '../society/handlers';
import { factOn } from '../society/model';
import { maskPhone } from './portal-access-handlers';
import { identityOf, nextSeq, nowStamp, type IdentityState } from './state';

/**
 * Households and properties (Gate D.1: PORTAL-025 household, PORTAL-002 my properties, PORTAL-003
 * Property 360, RES-004 household members). A resident sees the people linked to their own flats by
 * name and role only (no contact details, no sign-in activity: D-27), and may ask the office to add a
 * household member; the office verifies the request. Everything is limited to the resident's verified
 * links in force today, and each flat is checked against its site's licence (rule R).
 */
const RELATIONSHIPS: readonly HouseholdRelationship[] = ['spouse', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'];

const money = (paisa: bigint) => fromPaisa(paisa);

function myLinks(ctx: HandlerContext): PartyLink[] {
  const persona = ctx.persona;
  if (!persona || persona.app !== 'customer' || !persona.partyId) forbid(ctx);
  const scope = ctx.access?.scopes.find((x) => x.type === 'party');
  const links = scope && scope.type === 'party' ? scope.links.filter((l) => l.verified && l.from <= ctx.at && (!l.to || ctx.at < l.to)) : [];
  if (!links.length) notFound(ctx);
  return links;
}

/** The people of one flat today: owners, occupants and the payer from the register, plus verified household members. */
function peopleOfFlat(s: Society, state: IdentityState, flatId: string, today: string, me?: string): HouseholdPerson[] {
  const byParty = new Map<string, HouseholdPerson>();
  for (const f of s.view.model.facts) {
    if (f.flatId !== flatId || !factOn(f, today)) continue;
    const role: PortalRole = f.role === 'payer' ? 'payer' : f.role === 'owner' ? 'owner' : 'occupant';
    if (f.role === 'occupant' && f.occupancyKind === 'association') continue;
    const existing = byParty.get(f.partyId);
    // One line per person: owner before occupant before payer.
    const rank = { owner: 0, occupant: 1, payer: 2, household: 3 } as const;
    if (!existing || rank[role] < rank[existing.role]) byParty.set(f.partyId, { id: f.partyId, name: f.partyName, role, since: f.from, verified: true, ...(f.partyId === me ? { isYou: true } : {}) });
  }
  const members = state.household.members.filter((m) => m.flatId === flatId).map((m): HouseholdPerson => ({ id: m.id, name: m.name, role: 'household', relationship: m.relationship, since: m.addedOn, verified: m.verified }));
  return [...byParty.values(), ...members];
}

function householdOf(s: Society, state: IdentityState, flatId: string, today: string, me?: string): FlatHousehold {
  const flat = s.view.model.flats.find((f) => f.id === flatId)!;
  return {
    flatId,
    flatCode: flat.code,
    buildingName: s.view.model.buildings.find((b) => b.id === flat.buildingId)?.name ?? '',
    occupancy: flat.occupancy,
    people: peopleOfFlat(s, state, flatId, today, me),
  };
}

function propertyOf(ctx: HandlerContext, s: Society, link: PartyLink): MyProperty {
  const partyId = ctx.persona!.partyId!;
  const flat = s.view.model.flats.find((f) => f.id === link.unitId)!;
  const type = s.view.model.types.find((t) => t.id === flat.typeId);
  const roles = [...new Set(s.view.model.facts.filter((f) => f.flatId === flat.id && f.partyId === partyId && factOn(f, ctx.at)).map((f): PortalRole => (f.role === 'payer' ? 'payer' : f.role === 'owner' ? 'owner' : 'occupant')))];
  const mine = linesOf(s.view.invoices).filter((l) => l.unitId === flat.id && l.payerPartyId === partyId);
  const open = mine.reduce((sum, l) => sum + l.open, 0n);
  const overdue = mine.some((l) => l.open > 0n && l.dueOn < ctx.at);
  const credit = s.state.payments.filter((p) => p.payerPartyId === partyId && p.billingAccountId === flat.billingAccountId && !p.reversal).reduce((sum, p) => sum + BigInt(Math.round(Number(p.unapplied.amount) * 100)), 0n);
  return {
    flatId: flat.id,
    flatCode: flat.code,
    siteName: 'Al-Noor Residency',
    buildingName: s.view.model.buildings.find((b) => b.id === flat.buildingId)?.name ?? '',
    floor: s.view.model.floors.find((f) => f.id === flat.floorId)?.level ?? 0,
    typeName: type?.name ?? '',
    areaSqft: flat.areaSqft,
    roles,
    since: link.from,
    accountNo: s.view.model.accounts.find((a) => a.id === flat.billingAccountId)?.accountNo ?? flat.billingAccountId,
    balance: money(open),
    balanceState: open > 0n ? (overdue ? 'overdue' : 'due') : credit > 0n ? 'credit' : 'paid_up',
  };
}

export const HOUSEHOLD_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/portal\/properties$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): MyProperty[] => {
      const s = society(ctx);
      return myLinks(ctx)
        .filter((l) => {
          authorize(ctx, 'resident_portal', recordOf(s, { unitId: l.unitId }));
          return s.view.model.flats.some((f) => f.id === l.unitId);
        })
        .map((l) => propertyOf(ctx, s, l));
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/properties\/(?<flatId>[\w-]+)$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): PropertyDetail => {
      const s = society(ctx);
      const link = myLinks(ctx).find((l) => l.unitId === ctx.params.flatId);
      if (!link) notFound(ctx);
      authorize(ctx, 'resident_portal', recordOf(s, { unitId: link.unitId }));
      const base = propertyOf(ctx, s, link);
      const flat = s.view.model.flats.find((f) => f.id === link.unitId)!;
      const partyId = ctx.persona!.partyId!;
      const lines = linesOf(s.view.invoices).filter((l) => l.unitId === flat.id && l.payerPartyId === partyId);
      const byInvoice = new Map<string, typeof lines>();
      for (const l of lines) byInvoice.set(l.invoiceId, [...(byInvoice.get(l.invoiceId) ?? []), l]);
      const bills = [...byInvoice.entries()].map(([invoiceId, ls]) => {
        const inv = s.view.invoices.find((i) => i.id === invoiceId)!;
        const total = inv.lines.filter((x) => ls.some((l) => l.lineId === x.id)).reduce((sum, x) => sum + BigInt(Math.round(Number(x.amount.amount) * 100)), 0n);
        const open = ls.reduce((sum, l) => sum + l.open, 0n);
        const state = open === 0n ? 'paid' : open < total ? 'partly_paid' : inv.dueOn < ctx.at ? 'overdue' : 'due';
        return { invoiceId, reference: inv.ref, period: inv.period, amount: money(total), state } as const;
      });
      return { ...base, occupancy: flat.occupancy, household: peopleOfFlat(s, identityOf(ctx), flat.id, ctx.at, partyId), bills: bills.sort((a, b) => b.period.localeCompare(a.period)) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/household$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): { flats: FlatHousehold[]; requests: HouseholdRequest[] } => {
      const s = society(ctx);
      const state = identityOf(ctx);
      const partyId = ctx.persona!.partyId!;
      const links = myLinks(ctx);
      for (const l of links) authorize(ctx, 'resident_portal', recordOf(s, { unitId: l.unitId }));
      const flatIds = [...new Set(links.map((l) => l.unitId))].filter((id) => s.view.model.flats.some((f) => f.id === id));
      return {
        flats: flatIds.map((id) => householdOf(s, state, id, ctx.at, partyId)),
        requests: state.household.requests.filter((r) => r.requestedByPartyId === partyId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/household\/requests$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): HouseholdRequest => {
      const s = society(ctx);
      const input = (ctx.req.body ?? {}) as AddHouseholdInput;
      const partyId = ctx.persona!.partyId!;
      const link = myLinks(ctx).find((l) => l.unitId === input.flatId);
      if (!link) invalid(ctx, 'flatId', 'forms:errors.selectOne');
      authorize(ctx, 'resident_portal', recordOf(s, { unitId: link.unitId }));
      // Only someone who owns or lives in the flat can ask to add a member of its household.
      const roles = s.view.model.facts.filter((f) => f.flatId === link.unitId && f.partyId === partyId && factOn(f, ctx.at)).map((f) => f.role);
      if (!roles.includes('owner') && !roles.includes('occupant')) problem(ctx, 403, 'not_household', 'identity:household.errors.notHousehold');
      const name = String(input.name ?? '').trim();
      if (name.length < 2) invalid(ctx, 'name', 'forms:errors.required');
      if (!RELATIONSHIPS.includes(input.relationship)) invalid(ctx, 'relationship', 'forms:errors.selectOne');
      const phone = input.phone?.trim() ? normalizePkPhone(input.phone) : undefined;
      if (input.phone?.trim() && !phone) invalid(ctx, 'phone', 'forms:errors.phoneInvalid');
      const state = identityOf(ctx);
      const flat = s.view.model.flats.find((f) => f.id === link.unitId)!;
      const request: HouseholdRequest = {
        id: nextSeq(state, 'hhr'),
        flatId: flat.id,
        flatCode: flat.code,
        name,
        relationship: input.relationship,
        ...(phone ? { phoneMasked: maskPhone(phone)! } : {}),
        requestedByName: ctx.persona!.displayName,
        requestedByPartyId: partyId,
        requestedAt: nowStamp(ctx),
        state: 'pending',
      };
      state.household.requests.unshift(request);
      ctx.demo.save();
      return request;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/household\/requests\/(?<id>[\w-]+)\/withdraw$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): HouseholdRequest => {
      const state = identityOf(ctx);
      const r = state.household.requests.find((x) => x.id === ctx.params.id && x.requestedByPartyId === ctx.persona?.partyId);
      if (!r) notFound(ctx);
      if (r.state !== 'pending') invalid(ctx, 'request', 'identity:household.errors.notPending');
      r.state = 'withdrawn';
      r.decidedAt = nowStamp(ctx);
      ctx.demo.save();
      return r;
    },
  },
  // ---------------------------------------------------------------- RES-004: the office
  {
    method: 'GET',
    pattern: /^\/households$/,
    access: requires('residents', 'residents.view', 'history_read'),
    handle: (ctx): { flats: FlatHousehold[]; requests: HouseholdRequest[]; buildings: Array<{ id: string; name: string }> } => {
      const s = society(ctx);
      authorize(ctx, 'residents', recordOf(s));
      const state = identityOf(ctx);
      const q = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const needle = (q.q ?? '').trim().toLowerCase();
      const flats = s.view.model.flats
        .filter((f) => !q.building || f.buildingId === q.building)
        .filter((f) => !q.occupancy || f.occupancy === q.occupancy)
        .map((f) => householdOf(s, state, f.id, ctx.at))
        .filter((h) => !needle || h.flatCode.toLowerCase().includes(needle) || h.people.some((p) => p.name.toLowerCase().includes(needle)));
      const order = { pending: 0, approved: 1, rejected: 2, withdrawn: 3 } as const;
      return {
        flats,
        requests: [...state.household.requests].sort((a, b) => order[a.state] - order[b.state] || b.requestedAt.localeCompare(a.requestedAt)),
        buildings: s.view.model.buildings.map((b) => ({ id: b.id, name: b.name })),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/household-requests\/(?<id>[\w-]+)\/(?<decision>approve|reject)$/,
    access: requires('residents', 'site.manage', 'operational'),
    handle: (ctx): HouseholdRequest => {
      const s = society(ctx);
      authorize(ctx, 'residents', recordOf(s));
      const state = identityOf(ctx);
      const r = state.household.requests.find((x) => x.id === ctx.params.id);
      if (!r) notFound(ctx);
      if (r.state !== 'pending') invalid(ctx, 'request', 'identity:household.errors.notPending');
      const note = String((ctx.req.body as { note?: string } | undefined)?.note ?? '').trim();
      if (ctx.params.decision === 'reject' && note.length < 5) invalid(ctx, 'note', 'forms:errors.reasonRequired');
      const at = nowStamp(ctx);
      const approved = ctx.params.decision === 'approve';
      Object.assign(r, { state: approved ? 'approved' : 'rejected', decidedByName: ctx.persona!.displayName, decidedAt: at, ...(note ? { note } : {}) });
      if (approved) state.household.members.push({ id: nextSeq(state, 'hhm'), flatId: r.flatId, name: r.name, relationship: r.relationship, addedOn: ctx.at, verified: true });
      ctx.demo.save();
      return r;
    },
  },
];
