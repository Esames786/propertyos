import {
  type AmenityBooking,
  type GatewaySettings,
  type MoveInput,
  type MoveRecord,
  type RecordAccess,
  type ResidentAmenities,
  type ResidentsDashboard,
  type SearchRecord,
} from '@repo/contracts';
import { can, decideRecord, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { log, problem, society } from '../society/handlers';
import { factOn } from '../society/model';
import { invalid, isClosed, now, opsOf, rowOf, save, staffOps, who, notify, type Staff } from './common';
import { opsSite, residentOps, siteRecord, type ResidentOps } from './site';
import { passState } from './visitors-handlers';
import { nextOf, type StoredBooking } from './state';

/**
 * Gate D.2: the residents dashboard (RES-001), effective-dated moves, amenity bookings (PORTAL-022),
 * the online gateway's sandbox settings (BILL-011) and the operations tab of Flat 360. A move ends an
 * occupant's period on its date; it never changes who is liable for the flat (a payer change does
 * that, BILL-017) and never sends an app invitation. The gateway is a sandbox: a verified test event is
 * accepted and recorded, and still nothing is paid, allocated or receipted from it.
 */
const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as T;
const DAY = 86400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function moves(ctx: HandlerContext): MoveRecord[] {
  const s = society(ctx);
  return [...(s.state.occupancy ?? [])].sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn));
}

function residentsDashboard(ctx: HandlerContext, staff: Staff): ResidentsDashboard {
  const s = society(ctx);
  const flats = s.view.model.flats;
  const at = now(ctx);
  const rows = staff.ops.requests.map((r) => rowOf(r, staff.ops.sla, at));
  const identity = Object.values((ctx.demo.section<{ portal?: Record<string, { status: string }> }>('identity', () => ({})).portal) ?? {});
  const notices = staff.ops.notices.filter((n) => n.state === 'published' && n.ackRequired);
  const awaitingAck = notices.reduce((sum, n) => sum + n.recipients.filter((r) => !(r.acknowledgedAt && (r.acknowledgedVersion ?? 0) >= n.current.version)).length, 0);
  return {
    asOf: ctx.at,
    flats: flats.length,
    occupied: flats.filter((f) => f.occupancy === 'owner_occupied' || f.occupancy === 'tenant_occupied').length,
    vacant: flats.filter((f) => f.occupancy === 'vacant').length,
    ownerOccupied: flats.filter((f) => f.occupancy === 'owner_occupied').length,
    tenantOccupied: flats.filter((f) => f.occupancy === 'tenant_occupied').length,
    appAccounts: identity.filter((a) => a.status === 'active').length,
    openRequests: rows.filter((r) => r.kind === 'repair' && !['closed', 'cancelled'].includes(r.state)).length,
    communityIssues: rows.filter((r) => r.kind === 'community_issue' && !['resolved', 'merged', 'hidden'].includes(r.state)).length,
    visitorsToday: staff.ops.visits.filter((v) => v.outcome !== 'refused' && new Date(Date.parse(v.at) + 5 * 3600_000).toISOString().slice(0, 10) === ctx.at).length,
    vehiclesPending: staff.ops.vehicles.filter((v) => v.state === 'pending').length,
    noticesAwaitingAck: awaitingAck,
    bookingRequests: staff.ops.bookings.filter((b) => b.state === 'requested').length,
    recentMoves: moves(ctx).slice(0, 5),
    latestNotices: staff.ops.notices
      .filter((n) => n.state === 'published')
      .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
      .slice(0, 3)
      .map((n) => ({ id: n.id, ref: n.ref, title: n.current.title, category: n.current.category, state: n.state, version: n.current.version, audienceLabel: n.audienceLabel, ackRequired: n.ackRequired, publishedAt: n.publishedAt! })),
    bookings: staff.ops.bookings.filter((b) => b.state === 'requested' || (b.state === 'approved' && b.on >= ctx.at)).map(publicBooking),
  };
}

const publicBooking = ({ partyId: _p, flatId: _f, ...b }: StoredBooking): AmenityBooking => b;

// ---------------------------------------------------------------------------------------------
// Amenities (resident side PORTAL-022; the office decides requests on RES-001)
// ---------------------------------------------------------------------------------------------

const AMENITIES = { module: 'amenities' as const };

function amenitiesFor(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentAmenities {
  const ids = new Set(res.flats.map((f) => f.flat.id));
  return {
    asOf: ctx.at,
    amenities: staff.ops.amenities,
    bookings: staff.ops.bookings.filter((b) => ids.has(b.flatId) && b.partyId === res.partyId).map(publicBooking),
    flats: res.flats.filter((f) => f.roles.includes('occupant') || f.roles.includes('owner')).map((f) => ({ id: f.flat.id, code: f.flat.code })),
    // Taken slots carry no names: only that the slot is no longer free.
    taken: staff.ops.bookings.filter((b) => ['confirmed', 'requested', 'approved'].includes(b.state) && b.on >= ctx.at).map((b) => ({ amenityId: b.amenityId, on: b.on, slot: b.slot })),
  };
}

// ---------------------------------------------------------------------------------------------
// Online gateway, sandbox only (BILL-011)
// ---------------------------------------------------------------------------------------------

function gatewayOf(ctx: HandlerContext, staff: Staff): GatewaySettings {
  return { ...staff.ops.gateway, canManage: can(ctx, 'merchant.manage', 'operational') };
}

// ---------------------------------------------------------------------------------------------
// Global search and addresses (`?record=`) for D.2 records
// ---------------------------------------------------------------------------------------------

/** What a D.2 record id needs (the same layers as its own endpoint); null when the id is not one. */
export function operationsRecordAccess(ctx: HandlerContext, id: string): RecordAccess | null {
  const kind = /^req_/.test(id) ? 'maintenance' : /^(gps|gvs|gtr)_/.test(id) ? 'visitors' : /^veh_/.test(id) ? 'parking' : /^ntc_/.test(id) ? 'residents' : null;
  if (!kind) return null;
  const site = (() => {
    try {
      return opsSite(ctx);
    } catch {
      return null;
    }
  })();
  if (!site) return { record: true, module: kind, decision: { allowed: false, reason: 'out_of_scope' } };
  const ops = opsOf(ctx, site);
  const exists = kind === 'maintenance' ? ops.requests.some((r) => r.id === id) : kind === 'visitors' ? ops.passes.some((p) => p.id === id) || ops.visits.some((v) => v.id === id) || ops.gateRequests.some((r) => r.id === id) : kind === 'parking' ? ops.vehicles.some((v) => v.id === id) : ops.notices.some((n) => n.id === id);
  if (!exists) return { record: true, module: kind, decision: { allowed: false, reason: 'out_of_scope' } };
  const permission = kind === 'maintenance' ? 'operations.view' : kind === 'visitors' ? (can(ctx, 'visitors.view', 'history_read') ? 'visitors.view' : 'visitors.manage') : kind === 'parking' ? (can(ctx, 'parking.view', 'history_read') ? 'parking.view' : 'vehicles.approve') : 'residents.view';
  return { record: true, module: kind, decision: decideRecord({ ...ctx, suspension: 'history_read' }, kind, siteRecord(site), permission) };
}

/** Requests, passes, vehicles and notices for the header search (each by its own permission). */
export function operationsSearch(ctx: HandlerContext, q: string): SearchRecord[] {
  if (ctx.persona?.app !== 'backoffice') return [];
  let site;
  try {
    site = opsSite(ctx);
  } catch {
    return [];
  }
  const ops = opsOf(ctx, site);
  const out: SearchRecord[] = [];
  const has = (...v: Array<string | undefined>) => v.some((x) => x && x.toLowerCase().includes(q.toLowerCase()));
  const allowed = (module: Parameters<typeof decideRecord>[1], permission: Parameters<typeof can>[1]) => can(ctx, permission, 'history_read') && decideRecord({ ...ctx, suspension: 'history_read' }, module, siteRecord(site)).allowed;
  if (allowed('maintenance', 'operations.view') && can(ctx, 'maintenance.manage', 'history_read')) {
    for (const r of ops.requests.filter((r) => (r.kind === 'repair' || can(ctx, 'issues.view', 'history_read')) && has(r.ref, r.title, r.flat?.code)).slice(0, 5)) out.push({ type: 'maintenance', id: r.id, ref: r.ref, title: r.title, subtitle: r.flat?.code ?? r.state, href: `/backoffice/mnt/maintenance-360-workspace?record=${r.id}` });
  }
  if (allowed('visitors', 'visitors.view')) {
    for (const p of ops.passes.filter((p) => has(p.ref, p.visitorName, p.vehiclePlate)).slice(0, 5)) out.push({ type: 'pass', id: p.id, ref: p.ref, title: p.visitorName, subtitle: p.flat.code, href: `/backoffice/vis/pass-detail?record=${p.id}` });
  }
  if (allowed('parking', 'parking.view')) {
    for (const v of ops.vehicles.filter((v) => has(v.ref, v.plate)).slice(0, 5)) out.push({ type: 'vehicle', id: v.id, ref: v.plate, title: `${v.plate} · ${v.make}`, subtitle: v.flat.code, href: `/backoffice/park/vehicle-registry?record=${v.id}` });
  }
  if (allowed('residents', 'residents.view')) {
    for (const n of ops.notices.filter((n) => has(n.ref, n.current.title)).slice(0, 5)) out.push({ type: 'notice', id: n.id, ref: n.ref, title: n.current.title, href: `/backoffice/res/community-announcements?record=${n.id}` });
  }
  return out;
}

export const OPS_RESIDENT_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/residents\/dashboard$/,
    access: requires('residents', 'residents.view', 'history_read'),
    handle: (ctx): ResidentsDashboard => residentsDashboard(ctx, staffOps(ctx, 'residents')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/moves$/,
    access: requires('residents', 'residents.view', 'history_read'),
    handle: (ctx): MoveRecord[] => {
      staffOps(ctx, 'residents');
      return moves(ctx);
    },
  },
  {
    // Record that an occupant moved out (effective-dated). Liability and invitations do not follow.
    method: 'POST',
    pattern: /^\/ops\/moves$/,
    access: requires('residents', 'site.manage', 'operational'),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'residents');
      const s = society(ctx);
      const input = body<MoveInput>(ctx);
      const flat = s.view.model.flats.find((f) => f.id === input.flatId);
      if (!flat) invalid(ctx, 'flatId', 'forms:errors.required');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveOn))) invalid(ctx, 'effectiveOn', 'forms:errors.required');
      if (input.effectiveOn < addDays(ctx.at, -30) || input.effectiveOn > addDays(ctx.at, 90)) invalid(ctx, 'effectiveOn', 'operations:errors.moveDate');
      const reason = String(input.reason ?? '').trim();
      if (reason.length < 5) invalid(ctx, 'reason', 'operations:errors.tooShort', { min: '5' });
      // The person must be living in the flat on the day before the move (an earlier move is not undone).
      const before = addDays(input.effectiveOn, -1);
      const living = s.view.facts.find((f) => f.role === 'occupant' && f.flatId === flat.id && f.partyId === input.partyId && f.occupancyKind !== 'association' && factOn(f, before));
      if (!living) invalid(ctx, 'partyId', 'operations:errors.notOccupant');
      const { id, ref } = nextOf(staff.ops, staff.site, 'move');
      const record: MoveRecord = { id, ref, flatId: flat.id, flatCode: flat.code, kind: 'move_out', partyId: input.partyId, partyName: living.partyName, effectiveOn: input.effectiveOn, reason: reason.slice(0, 300), recordedAt: now(ctx), recordedByName: who(ctx) };
      s.state.occupancy = [...(s.state.occupancy ?? []), record];
      log(ctx, s, 'occupantMovedOut', { kind: 'flat', id: flat.id, label: flat.code }, { flats: [flat.code], values: { name: living.partyName, effectiveOn: input.effectiveOn } });
      save(ctx);
      const stillLiable = s.view.facts.some((f) => f.role === 'payer' && f.flatId === flat.id && f.partyId === input.partyId && factOn(f, input.effectiveOn));
      return { move: record, stillLiable };
    },
  },
  // Amenities -----------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/ops\/bookings$/,
    access: requires('amenities', ['amenities.manage', 'residents.view'], 'history_read'),
    handle: (ctx): AmenityBooking[] => {
      const staff = staffOps(ctx, 'amenities');
      return staff.ops.bookings.map(publicBooking).sort((a, b) => a.on.localeCompare(b.on));
    },
  },
  ...(['approve', 'decline'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/ops\\/bookings\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('amenities', 'amenities.manage', 'operational'),
      handle: (ctx): AmenityBooking => {
        const staff = staffOps(ctx, 'amenities');
        const b = staff.ops.bookings.find((x) => x.id === ctx.params.id);
        if (!b) notFound(ctx);
        if (b.state !== 'requested') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
        const reason = String(body<{ reason?: string }>(ctx).reason ?? '').trim();
        if (action === 'decline' && reason.length < 10) invalid(ctx, 'reason', 'operations:errors.tooShort', { min: '10' });
        b.state = action === 'approve' ? 'approved' : 'declined';
        b.decidedByName = who(ctx);
        if (reason) b.reason = reason.slice(0, 300);
        notify(ctx, staff, { partyIds: [b.partyId], flatId: b.flatId, module: 'amenities', kind: 'booking', key: action === 'approve' ? 'bookingApproved' : 'bookingDeclined', values: { amenity: b.amenityKind, date: b.on }, href: '/customer/portal/amenities' });
        save(ctx);
        return publicBooking(b);
      },
    }),
  ),
  {
    method: 'GET',
    pattern: /^\/portal\/amenities$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentAmenities => {
      const res = residentOps(ctx, AMENITIES);
      return amenitiesFor(ctx, res, { site: res.site, ops: opsOf(ctx, res.site) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/bookings$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): AmenityBooking => {
      const res = residentOps(ctx, AMENITIES);
      const staff: Staff = { site: res.site, ops: opsOf(ctx, res.site) };
      const input = body<{ amenityId?: string; flatId?: string; on?: string; slot?: string; guests?: number }>(ctx);
      const a = staff.ops.amenities.find((x) => x.id === input.amenityId);
      if (!a) invalid(ctx, 'amenityId', 'forms:errors.required');
      if (a.booking === 'none') problem(ctx, 409, 'no_booking', 'operations:errors.noBooking');
      const home = res.flats.find((f) => f.flat.id === input.flatId && (f.roles.includes('occupant') || f.roles.includes('owner')));
      if (!home) invalid(ctx, 'flatId', 'operations:errors.flatNotYours');
      if (!input.on || !/^\d{4}-\d{2}-\d{2}$/.test(input.on) || input.on < ctx.at || input.on > addDays(ctx.at, 30)) invalid(ctx, 'on', 'operations:errors.bookingDate');
      if (!input.slot || !a.slots.includes(input.slot)) invalid(ctx, 'slot', 'forms:errors.required');
      const guests = Math.max(0, Math.round(Number(input.guests ?? 0)));
      if (guests > a.capacity) invalid(ctx, 'guests', 'operations:errors.capacity', { max: String(a.capacity) });
      if (staff.ops.bookings.some((b) => b.amenityId === a.id && b.on === input.on && b.slot === input.slot && ['confirmed', 'requested', 'approved'].includes(b.state))) problem(ctx, 409, 'slot_taken', 'operations:errors.slotTaken');
      const { id, ref } = nextOf(staff.ops, staff.site, 'booking');
      const b: StoredBooking = { id, ref, amenityId: a.id, amenityKind: a.kind, flatCode: home.flat.code, flatId: home.flat.id, partyId: res.partyId, name: res.name, on: input.on, slot: input.slot, guests, state: a.booking === 'instant' ? 'confirmed' : 'requested', at: now(ctx) };
      staff.ops.bookings.push(b);
      save(ctx);
      return publicBooking(b);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/bookings\/(?<id>[\w-]+)\/cancel$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): AmenityBooking => {
      const res = residentOps(ctx, AMENITIES);
      const staff: Staff = { site: res.site, ops: opsOf(ctx, res.site) };
      const b = staff.ops.bookings.find((x) => x.id === ctx.params.id && x.partyId === res.partyId);
      if (!b) notFound(ctx);
      if (!['confirmed', 'requested', 'approved'].includes(b.state) || b.on < ctx.at) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      b.state = 'cancelled';
      save(ctx);
      return publicBooking(b);
    },
  },
  // Online gateway (sandbox) ---------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/ops\/gateway$/,
    access: requires('online_payments', ['merchant.manage', 'payment_methods.manage'], 'history_read'),
    handle: (ctx): GatewaySettings => gatewayOf(ctx, staffOps(ctx, 'online_payments')),
  },
  {
    method: 'PATCH',
    pattern: /^\/ops\/gateway$/,
    access: requires('online_payments', 'merchant.manage', 'operational'),
    handle: (ctx): GatewaySettings => {
      const staff = staffOps(ctx, 'online_payments');
      const input = body<Partial<GatewaySettings>>(ctx);
      if (input.mode !== 'off' && input.mode !== 'sandbox') invalid(ctx, 'mode', 'forms:errors.required');
      const merchant = String(input.merchantId ?? '').trim();
      if (!/^DEMO-[A-Z0-9-]{3,20}$/.test(merchant)) invalid(ctx, 'merchantId', 'operations:errors.merchantId');
      const methods = (input.methods ?? []).filter((m) => ['card', 'wallet', 'bank_account'].includes(m));
      if (input.mode === 'sandbox' && !methods.length) invalid(ctx, 'methods', 'forms:errors.required');
      staff.ops.gateway = { ...staff.ops.gateway, mode: input.mode, merchantId: merchant, methods, feeBearer: input.feeBearer === 'resident' ? 'resident' : 'society', updatedAt: now(ctx), updatedByName: who(ctx) };
      save(ctx);
      return gatewayOf(ctx, staff);
    },
  },
  {
    // A simulated "payment succeeded" event from the sandbox: only a verified signature is accepted,
    // and even then nothing is paid: settlement still needs a matched statement line (C.2 ruling).
    method: 'POST',
    pattern: /^\/ops\/gateway\/test-event$/,
    access: requires('online_payments', 'merchant.manage', 'operational'),
    handle: (ctx): GatewaySettings => {
      const staff = staffOps(ctx, 'online_payments');
      const input = body<{ flatId?: string; amount?: string; signature?: 'valid' | 'invalid'; eventId?: string }>(ctx);
      const flat = staff.site.flats.find((f) => f.id === input.flatId);
      if (!flat) invalid(ctx, 'flatId', 'forms:errors.required');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(input.amount ?? ''))) invalid(ctx, 'amount', 'operations:errors.amount');
      const { id, ref } = nextOf(staff.ops, staff.site, 'gatewayEvent');
      const eventId = String(input.eventId ?? '').trim() || `evt_sandbox_${ref.toLowerCase()}`;
      const result = staff.ops.gateway.mode !== 'sandbox' ? 'refused_mode_off' : input.signature !== 'valid' ? 'refused_signature' : staff.ops.gateway.events.some((e) => e.eventId === eventId && e.result === 'accepted_not_settled') ? 'refused_duplicate' : 'accepted_not_settled';
      staff.ops.gateway.events.unshift({ id, at: now(ctx), eventId, flatCode: flat.code, amount: { amount: Number(input.amount).toFixed(2), currency: 'PKR' }, signature: input.signature === 'valid' ? 'valid' : 'invalid', result, byName: who(ctx) });
      save(ctx);
      return gatewayOf(ctx, staff);
    },
  },
  // Flat 360: requests, visitors, vehicles and moves of one flat ---------------------------------
  {
    method: 'GET',
    pattern: /^\/ops\/flats\/(?<flatId>[\w-]+)\/services$/,
    access: requires('residents', ['operations.view', 'visitors.view', 'visitors.manage', 'parking.view', 'residents.view'], 'history_read'),
    handle: (ctx) => {
      const site = opsSite(ctx);
      const flat = site.flats.find((f) => f.id === ctx.params.flatId);
      if (!flat) notFound(ctx);
      const ops = opsOf(ctx, site);
      const at = now(ctx);
      const module = (m: Parameters<typeof decideRecord>[1]) => decideRecord({ ...ctx, suspension: 'history_read' }, m, siteRecord(site)).allowed;
      const requests = can(ctx, 'operations.view', 'history_read') && module('maintenance') ? ops.requests.filter((r) => r.flat?.id === flat.id).map((r) => rowOf(r, ops.sla, at)) : null;
      const visitors = (can(ctx, 'visitors.view', 'history_read') || can(ctx, 'visitors.manage', 'history_read')) && module('visitors');
      const vehicles = (can(ctx, 'parking.view', 'history_read') || can(ctx, 'vehicles.approve', 'history_read')) && module('parking') ? ops.vehicles.filter((v) => v.flat.id === flat.id) : null;
      return {
        flat,
        requests,
        openRequests: requests ? requests.filter((r) => !isClosed(ops.requests.find((x) => x.id === r.id)!)).length : null,
        passes: visitors ? ops.passes.filter((p) => p.flat.id === flat.id).map((p) => ({ ...p, state: passState(p, at) })) : null,
        visits: visitors ? ops.visits.filter((v) => v.flatCode === flat.code).slice(0, 10) : null,
        vehicles,
        slots: ops.slots.filter((s) => s.flatId === flat.id).map((s) => s.code),
        moves: can(ctx, 'residents.view', 'history_read') ? moves(ctx).filter((m) => m.flatId === flat.id) : null,
      };
    },
  },
];
