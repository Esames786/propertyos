import {
  GATE_PURPOSES,
  type CheckInResult,
  type GatePass,
  type GateQueue,
  type GateVisit,
  type NewPassInput,
  type PassList,
  type PassState,
  type RefusalReason,
  type ResidentVisitors,
  type VisitorDashboard,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { problem } from '../society/handlers';
import { invalid, notify, now, opsOf, save, staffOps, who, type Staff } from './common';
import { occupantsOf, residentOps, rolesOn, type ResidentOps } from './site';
import { nextOf, type StoredGateRequest } from './state';

/**
 * Visitors and the gate (Gate D.2: VIS-001…007, PORTAL-015 visitors tab, PORTAL-040). A resident who
 * lives in a flat invites a guest for an access window; the guard checks the code at the gate and the
 * server refuses an unknown, early, expired, cancelled or already-used pass, or a host who no longer
 * lives there. A walk-in visitor is asked about through the live queue: only the flat's current
 * occupants are asked (never an owner who lives elsewhere), the request expires, and the first answer
 * is final. Refreshing is simulated in the browser: there is no real security feed.
 */

const VISITORS = { module: 'visitors' as const };
const LIVE = { module: 'visitors' as const, feature: 'visitors.live_queue' as const };
const LIVE_FEATURE = 'visitors.live_queue' as const;
const REQUEST_MINUTES = 5;
const REFRESH_SECONDS = 15;
const GRACE_MINUTES = 30;

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as T;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const plateOf = (raw: unknown) => (typeof raw === 'string' ? raw.trim().toUpperCase().replace(/\s+/g, ' ') : '');

/** A pass's state now: cancelled and single-entry use are recorded; the window decides the rest. */
export function passState(p: GatePass, at: string): PassState {
  if (p.state === 'cancelled') return 'cancelled';
  if (p.entries === 'single' && (p.state === 'checked_in' || p.state === 'checked_out')) return p.state;
  const t = Date.parse(at);
  if (t < Date.parse(p.from)) return 'scheduled';
  if (t > Date.parse(p.to)) return 'expired';
  return 'active';
}

const withState = (p: GatePass, at: string): GatePass => ({ ...p, state: passState(p, at) });

/** Waiting walk-in requests past their time expire (recorded the first time anyone reads them). */
function expireRequests(staff: Staff, at: string) {
  for (const r of staff.ops.gateRequests) {
    if (r.state === 'waiting' && Date.parse(at) > Date.parse(r.expiresAt)) {
      r.state = 'expired';
      r.decidedAt = r.expiresAt;
      r.history.push({ at: r.expiresAt, byName: 'PropertyOS', byKind: 'system', action: 'expired' });
      logVisit(staff, { flatCode: r.flat.code, visitorName: r.visitorName, purpose: r.purpose, ...(r.vehiclePlate ? { vehiclePlate: r.vehiclePlate } : {}), gateRequestId: r.id, outcome: 'refused', refusal: 'request_expired', at: r.expiresAt, guardName: r.guardName });
    }
  }
}

function logVisit(staff: Staff, v: Omit<GateVisit, 'id' | 'ref' | 'siteId'>): GateVisit {
  const { id, ref } = nextOf(staff.ops, staff.site, 'visit');
  const visit: GateVisit = { id, ref, siteId: staff.site.siteId, ...v };
  staff.ops.visits.unshift(visit);
  return visit;
}

const publicRequest = ({ askedPartyIds: _asked, ...r }: StoredGateRequest) => r;

function dashboard(ctx: HandlerContext, staff: Staff): VisitorDashboard {
  const at = now(ctx);
  expireRequests(staff, at);
  const passes = staff.ops.passes.map((p) => withState(p, at));
  const today = ctx.at;
  const weekAgo = Date.parse(at) - 7 * 86400_000;
  const todays = staff.ops.visits.filter((v) => v.at.slice(0, 10) === today || new Date(Date.parse(v.at) + 5 * 3600_000).toISOString().slice(0, 10) === today);
  const purposes = new Map<string, number>();
  for (const v of staff.ops.visits.filter((x) => Date.parse(x.at) >= weekAgo && x.outcome !== 'refused')) purposes.set(v.purpose, (purposes.get(v.purpose) ?? 0) + 1);
  return {
    asOf: today,
    expectedToday: passes.filter((p) => (p.state === 'active' || p.state === 'scheduled') && p.from.slice(0, 10) <= today && p.to.slice(0, 10) >= today).length,
    inside: staff.ops.visits.filter((v) => v.outcome === 'inside').length,
    waiting: staff.ops.gateRequests.filter((r) => r.state === 'waiting').length,
    refusedToday: todays.filter((v) => v.outcome === 'refused').length,
    passesActive: passes.filter((p) => p.state === 'active').length,
    visitsThisWeek: staff.ops.visits.filter((v) => Date.parse(v.at) >= weekAgo && v.outcome !== 'refused').length,
    byPurpose: [...purposes].map(([purpose, count]) => ({ purpose: purpose as GatePass['purpose'], count })).sort((a, b) => b.count - a.count),
    recent: staff.ops.visits.slice(0, 8),
  };
}

function queue(ctx: HandlerContext, staff: Staff): GateQueue {
  const at = now(ctx);
  expireRequests(staff, at);
  const today = ctx.at;
  return {
    asOf: today,
    refreshedAt: at,
    refreshSeconds: REFRESH_SECONDS,
    waiting: staff.ops.gateRequests.filter((r) => r.state === 'waiting').map(publicRequest),
    expected: staff.ops.passes
      .map((p) => withState(p, at))
      .filter((p) => (p.state === 'active' || p.state === 'scheduled') && p.from.slice(0, 10) <= today && p.to.slice(0, 10) >= today)
      .sort((a, b) => Date.parse(a.from) - Date.parse(b.from)),
    inside: staff.ops.visits.filter((v) => v.outcome === 'inside'),
    recent: staff.ops.visits.filter((v) => v.outcome !== 'inside').slice(0, 6),
    liveQueue: !!ctx.access?.features.includes(LIVE_FEATURE),
  };
}

/** Whether the host still lives in (or owns) the flat today: a moved-out host's pass no longer opens the gate. */
const hostStillThere = (staff: Staff, p: GatePass, on: string) => !staff.site.society || rolesOn(staff.site.society.view.facts, p.hostPartyId, p.flat.id, on).includes('occupant');

function checkIn(ctx: HandlerContext, staff: Staff): CheckInResult {
  const at = now(ctx);
  const code = String(body<{ code?: string }>(ctx).code ?? '').replace(/\D/g, '');
  if (code.length !== 6) invalid(ctx, 'code', 'operations:errors.codeFormat');
  const p = staff.ops.passes.find((x) => x.code === code);
  const refuse = (refusal: RefusalReason): CheckInResult => {
    const visit = logVisit(staff, { flatCode: p?.flat.code ?? '—', visitorName: p?.visitorName ?? 'Unknown visitor', purpose: p?.purpose ?? 'other', ...(p ? { passId: p.id, passRef: p.ref } : {}), outcome: 'refused', refusal, at, guardName: who(ctx) });
    if (p) p.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'refused', values: { reason: refusal } });
    save(ctx);
    return { ok: false, refusal, visit, ...(p ? { pass: { id: p.id, ref: p.ref, visitorName: p.visitorName, flat: p.flat, from: p.from, to: p.to, state: passState(p, at) } } : {}) };
  };
  if (!p) return refuse('unknown_code');
  const state = passState(p, at);
  if (state === 'cancelled') return refuse('cancelled');
  if (state === 'checked_in' || state === 'checked_out' || (p.entries === 'single' && p.usedCount > 0)) return refuse('already_used');
  if (state === 'expired') return refuse('expired');
  if (Date.parse(at) < Date.parse(p.from) - GRACE_MINUTES * 60_000) return refuse('not_yet_valid');
  if (!hostStillThere(staff, p, ctx.at)) return refuse('host_not_resident');
  const plate = plateOf(body<{ plate?: string }>(ctx).plate) || p.vehiclePlate;
  const visit = logVisit(staff, { flatCode: p.flat.code, visitorName: p.visitorName, purpose: p.purpose, ...(plate ? { vehiclePlate: plate } : {}), passId: p.id, passRef: p.ref, outcome: 'inside', checkedInAt: at, at, guardName: who(ctx) });
  p.usedCount += 1;
  if (p.entries === 'single') p.state = 'checked_in';
  p.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'checked_in' });
  notify(ctx, staff, { partyIds: [p.hostPartyId], flatId: p.flat.id, module: 'visitors', kind: 'gate', key: 'passArrived', values: { name: p.visitorName, flat: p.flat.code }, href: '/customer/portal/services-home?tab=visitors' });
  save(ctx);
  return { ok: true, visit, pass: withState(p, at) };
}

// ---------------------------------------------------------------------------------------------
// Resident side
// ---------------------------------------------------------------------------------------------

const livesIn = (res: ResidentOps) => res.flats.filter((f) => f.roles.includes('occupant'));

function residentView(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentVisitors {
  const at = now(ctx);
  expireRequests(staff, at);
  const homes = livesIn(res);
  const ids = new Set(homes.map((f) => f.flat.id));
  const codes = new Set(homes.map((f) => f.flat.code));
  return {
    asOf: ctx.at,
    flats: homes.map((f) => ({ id: f.flat.id, code: f.flat.code })),
    passes: staff.ops.passes.filter((p) => ids.has(p.flat.id)).map((p) => withState(p, at)).sort((a, b) => Date.parse(b.from) - Date.parse(a.from)),
    // A walk-in request reaches the occupants it asked, while they still live there.
    requests: staff.ops.gateRequests.filter((r) => ids.has(r.flat.id) && r.askedPartyIds.includes(res.partyId)).map(publicRequest).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    visits: staff.ops.visits.filter((v) => codes.has(v.flatCode)).slice(0, 20),
    liveQueue: !!ctx.access?.features.includes(LIVE_FEATURE),
  };
}

function nextCode(staff: Staff): string {
  for (let i = staff.ops.passes.length + 1; ; i++) {
    const code = String(100000 + ((i * 7919 + 4243) % 900000));
    if (!staff.ops.passes.some((p) => p.code === code)) return code;
  }
}

const resident = (ctx: HandlerContext, gate = VISITORS) => {
  const res = residentOps(ctx, gate);
  return { res, staff: { site: res.site, ops: opsOf(ctx, res.site) } satisfies Staff };
};

export const OPS_VISITOR_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/visitors\/dashboard$/,
    access: requires('visitors', ['visitors.view', 'visitors.manage'], 'history_read'),
    handle: (ctx): VisitorDashboard => dashboard(ctx, staffOps(ctx, 'visitors')),
  },
  {
    method: 'GET',
    pattern: /^\/ops\/passes$/,
    access: requires('visitors', ['visitors.view', 'visitors.manage'], 'history_read'),
    handle: (ctx): PassList => {
      const staff = staffOps(ctx, 'visitors');
      const at = now(ctx);
      const q = String(ctx.req.query?.q ?? '').trim().toLowerCase();
      const status = String(ctx.req.query?.status ?? 'all');
      const all = staff.ops.passes.map((p) => withState(p, at)).filter((p) => !q || [p.ref, p.code, p.visitorName, p.flat.code, p.hostName, p.vehiclePlate ?? ''].some((v) => v.toLowerCase().includes(q)));
      const counts = Object.fromEntries(['all', 'scheduled', 'active', 'checked_in', 'checked_out', 'expired', 'cancelled'].map((s) => [s, s === 'all' ? all.length : all.filter((p) => p.state === s).length])) as PassList['counts'];
      return { items: all.filter((p) => status === 'all' || p.state === status).sort((a, b) => Date.parse(b.from) - Date.parse(a.from)), counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/passes\/(?<id>[\w-]+)$/,
    access: requires('visitors', ['visitors.view', 'visitors.manage'], 'history_read'),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'visitors');
      const p = staff.ops.passes.find((x) => x.id === ctx.params.id);
      if (!p) notFound(ctx);
      const at = now(ctx);
      return { pass: withState(p, at), visits: staff.ops.visits.filter((v) => v.passId === p.id), canCancel: can(ctx, 'visitors.manage', 'operational') && ['scheduled', 'active'].includes(passState(p, at)), hostLivesThere: hostStillThere(staff, p, ctx.at) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/passes\/(?<id>[\w-]+)\/cancel$/,
    access: requires('visitors', 'visitors.manage', 'operational'),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'visitors');
      const p = staff.ops.passes.find((x) => x.id === ctx.params.id);
      if (!p) notFound(ctx);
      if (!['scheduled', 'active'].includes(passState(p, now(ctx)))) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = String(body<{ reason?: string }>(ctx).reason ?? '').trim();
      if (reason.length < 5) invalid(ctx, 'reason', 'operations:errors.tooShort', { min: '5' });
      p.state = 'cancelled';
      p.history.push({ at: now(ctx), byName: who(ctx), byKind: 'staff', action: 'cancelled', note: reason });
      notify(ctx, staff, { partyIds: [p.hostPartyId], flatId: p.flat.id, module: 'visitors', kind: 'gate', key: 'passCancelled', values: { name: p.visitorName }, href: '/customer/portal/services-home?tab=visitors' });
      save(ctx);
      return withState(p, now(ctx));
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/gate\/queue$/,
    access: requires('visitors', 'visitors.manage', 'history_read'),
    handle: (ctx): GateQueue => {
      const staff = staffOps(ctx, 'visitors');
      const q = queue(ctx, staff);
      save(ctx);
      return q;
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/gate\/check-in$/,
    access: requires('visitors', 'visitors.manage', 'operational'),
    handle: (ctx): CheckInResult => checkIn(ctx, staffOps(ctx, 'visitors')),
  },
  {
    method: 'POST',
    pattern: /^\/ops\/gate\/visits\/(?<id>[\w-]+)\/check-out$/,
    access: requires('visitors', 'visitors.manage', 'operational'),
    handle: (ctx): GateVisit => {
      const staff = staffOps(ctx, 'visitors');
      const v = staff.ops.visits.find((x) => x.id === ctx.params.id);
      if (!v) notFound(ctx);
      if (v.outcome !== 'inside') problem(ctx, 409, 'state_locked', 'operations:errors.notInside');
      const at = now(ctx);
      v.outcome = 'left';
      v.checkedOutAt = at;
      const p = v.passId ? staff.ops.passes.find((x) => x.id === v.passId) : undefined;
      if (p) {
        if (p.entries === 'single') p.state = 'checked_out';
        p.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'checked_out' });
      }
      save(ctx);
      return v;
    },
  },
  {
    // VIS-007: a visitor without a pass: the flat's current occupants are asked in their app.
    method: 'POST',
    pattern: /^\/ops\/gate\/requests$/,
    access: requires('visitors', 'visitors.manage', 'operational', LIVE_FEATURE),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'visitors', LIVE_FEATURE);
      const input = body<{ flatId?: string; visitorName?: string; purpose?: string; plate?: string }>(ctx);
      const flat = staff.site.flats.find((f) => f.id === input.flatId);
      if (!flat) invalid(ctx, 'flatId', 'forms:errors.required');
      const name = String(input.visitorName ?? '').trim();
      if (name.length < 2) invalid(ctx, 'visitorName', 'operations:errors.tooShort', { min: '2' });
      if (!(GATE_PURPOSES as readonly string[]).includes(String(input.purpose))) invalid(ctx, 'purpose', 'forms:errors.required');
      const asked = staff.site.society ? occupantsOf(staff.site.society.view.facts, flat.id, ctx.at) : [];
      if (!asked.length) invalid(ctx, 'flatId', 'operations:errors.nobodyHome');
      const at = now(ctx);
      if (staff.ops.gateRequests.some((r) => r.state === 'waiting' && r.flat.id === flat.id && r.visitorName.toLowerCase() === name.toLowerCase())) problem(ctx, 409, 'duplicate', 'operations:errors.alreadyAsked');
      const { id, ref } = nextOf(staff.ops, staff.site, 'gateRequest');
      const plate = plateOf(input.plate);
      const r: StoredGateRequest = { id, ref, siteId: staff.site.siteId, flat, visitorName: name.slice(0, 80), purpose: input.purpose as StoredGateRequest['purpose'], ...(plate ? { vehiclePlate: plate } : {}), state: 'waiting', createdAt: at, expiresAt: iso(Date.parse(at) + REQUEST_MINUTES * 60_000), guardName: who(ctx), askedCount: asked.length, askedPartyIds: asked, history: [{ at, byName: who(ctx), byKind: 'staff', action: 'asked' }] };
      staff.ops.gateRequests.push(r);
      notify(ctx, staff, { partyIds: asked, flatId: flat.id, module: 'visitors', kind: 'gate', key: 'gateWaiting', values: { name: r.visitorName, flat: flat.code }, href: '/customer/portal/services-home?tab=visitors' });
      save(ctx);
      return publicRequest(r);
    },
  },
  ...(['admit', 'withdraw'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/ops\\/gate\\/requests\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('visitors', 'visitors.manage', 'operational', LIVE_FEATURE),
      handle: (ctx) => {
        const staff = staffOps(ctx, 'visitors', LIVE_FEATURE);
        expireRequests(staff, now(ctx));
        const r = staff.ops.gateRequests.find((x) => x.id === ctx.params.id);
        if (!r) notFound(ctx);
        const at = now(ctx);
        if (action === 'admit') {
          // Only a request the occupant approved lets the visitor in.
          if (r.state !== 'approved') problem(ctx, 409, 'state_locked', r.state === 'denied' ? 'operations:errors.denied' : 'operations:errors.notApproved');
          if (staff.ops.visits.some((v) => v.gateRequestId === r.id && v.outcome !== 'refused')) problem(ctx, 409, 'state_locked', 'operations:errors.alreadyAdmitted');
          const visit = logVisit(staff, { flatCode: r.flat.code, visitorName: r.visitorName, purpose: r.purpose, ...(r.vehiclePlate ? { vehiclePlate: r.vehiclePlate } : {}), gateRequestId: r.id, outcome: 'inside', checkedInAt: at, at, guardName: who(ctx) });
          r.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'admitted' });
          save(ctx);
          return { request: publicRequest(r), visit };
        }
        if (r.state !== 'waiting') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
        r.state = 'withdrawn';
        r.decidedAt = at;
        r.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'withdrawn' });
        save(ctx);
        return { request: publicRequest(r) };
      },
    }),
  ),
  {
    method: 'POST',
    pattern: /^\/ops\/gate\/requests\/(?<id>[\w-]+)\/turn-away$/,
    access: requires('visitors', 'visitors.manage', 'operational', LIVE_FEATURE),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'visitors', LIVE_FEATURE);
      expireRequests(staff, now(ctx));
      const r = staff.ops.gateRequests.find((x) => x.id === ctx.params.id);
      if (!r) notFound(ctx);
      if (r.state !== 'denied' && r.state !== 'expired') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      if (r.state === 'denied' && !staff.ops.visits.some((v) => v.gateRequestId === r.id)) logVisit(staff, { flatCode: r.flat.code, visitorName: r.visitorName, purpose: r.purpose, gateRequestId: r.id, outcome: 'refused', refusal: 'denied_by_resident', at: now(ctx), guardName: who(ctx) });
      r.history.push({ at: now(ctx), byName: who(ctx), byKind: 'staff', action: 'turned_away' });
      save(ctx);
      return { request: publicRequest(r) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/visits$/,
    access: requires('visitors', ['visitors.view', 'visitors.manage'], 'history_read'),
    handle: (ctx) => {
      const staff = staffOps(ctx, 'visitors');
      expireRequests(staff, now(ctx));
      const q = String(ctx.req.query?.q ?? '').trim().toLowerCase();
      const outcome = String(ctx.req.query?.outcome ?? 'all');
      const items = staff.ops.visits.filter((v) => (outcome === 'all' || v.outcome === outcome) && (!q || [v.ref, v.visitorName, v.flatCode, v.vehiclePlate ?? '', v.passRef ?? ''].some((x) => x.toLowerCase().includes(q))));
      return { items, counts: { all: staff.ops.visits.length, inside: staff.ops.visits.filter((v) => v.outcome === 'inside').length, left: staff.ops.visits.filter((v) => v.outcome === 'left').length, refused: staff.ops.visits.filter((v) => v.outcome === 'refused').length } };
    },
  },
  // Resident: guests, passes and the visitor at the gate (PORTAL-015 visitors tab, PORTAL-040) -----
  {
    method: 'GET',
    pattern: /^\/portal\/visitors$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentVisitors => {
      const { res, staff } = resident(ctx);
      const view = residentView(ctx, res, staff);
      save(ctx);
      return view;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/passes$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): GatePass => {
      const { res, staff } = resident(ctx);
      const input = body<NewPassInput>(ctx);
      const home = livesIn(res).find((f) => f.flat.id === input.flatId);
      if (!home) invalid(ctx, 'flatId', 'operations:errors.onlyOccupants');
      const name = String(input.visitorName ?? '').trim();
      if (name.length < 2 || name.length > 80) invalid(ctx, 'visitorName', 'operations:errors.tooShort', { min: '2' });
      if (!(GATE_PURPOSES as readonly string[]).includes(String(input.purpose))) invalid(ctx, 'purpose', 'forms:errors.required');
      const phone = String(input.visitorPhone ?? '').replace(/[\s-]/g, '');
      if (phone && !/^\+?\d{10,13}$/.test(phone)) invalid(ctx, 'visitorPhone', 'operations:errors.phone');
      const plate = plateOf(input.vehiclePlate);
      if (plate && !/^[A-Z]{2,4}[- ]?\d{1,4}$/.test(plate)) invalid(ctx, 'vehiclePlate', 'operations:errors.plate');
      const from = Date.parse(String(input.from));
      const to = Date.parse(String(input.to));
      const at = Date.parse(now(ctx));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) invalid(ctx, 'to', 'operations:errors.window');
      if (to <= at) invalid(ctx, 'to', 'operations:errors.windowPast');
      if (from > at + 30 * 86400_000) invalid(ctx, 'from', 'operations:errors.windowTooFar');
      const entries = input.entries === 'multiple' ? 'multiple' : 'single';
      if (to - from > (entries === 'single' ? 24 : 31 * 24) * 3600_000) invalid(ctx, 'to', entries === 'single' ? 'operations:errors.windowSingle' : 'operations:errors.windowMultiple');
      const { id, ref } = nextOf(staff.ops, staff.site, 'pass');
      const stamp = now(ctx);
      const p: GatePass = { id, ref, code: nextCode(staff), siteId: staff.site.siteId, flat: home.flat, hostPartyId: res.partyId, hostName: res.name, visitorName: name, ...(phone ? { visitorPhone: phone } : {}), purpose: input.purpose, ...(plate ? { vehiclePlate: plate } : {}), from: iso(from), to: iso(to), entries, state: 'active', createdAt: stamp, usedCount: 0, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 300) } : {}), history: [{ at: stamp, byName: res.name, byKind: 'resident', action: 'created' }] };
      staff.ops.passes.push(p);
      save(ctx);
      return withState(p, stamp);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/passes\/(?<id>[\w-]+)\/cancel$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): GatePass => {
      const { res, staff } = resident(ctx);
      const ids = new Set(livesIn(res).map((f) => f.flat.id));
      const p = staff.ops.passes.find((x) => x.id === ctx.params.id && ids.has(x.flat.id));
      if (!p) notFound(ctx);
      if (!['scheduled', 'active'].includes(passState(p, now(ctx)))) problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      p.state = 'cancelled';
      p.history.push({ at: now(ctx), byName: res.name, byKind: 'resident', action: 'cancelled' });
      save(ctx);
      return withState(p, now(ctx));
    },
  },
  {
    // PORTAL-040: walk-in visitors waiting for this resident (polled by the app; simulated refresh).
    method: 'GET',
    pattern: /^\/portal\/gate-requests$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx) => {
      const { res, staff } = resident(ctx, LIVE);
      expireRequests(staff, now(ctx));
      const ids = new Set(livesIn(res).map((f) => f.flat.id));
      save(ctx);
      return { refreshSeconds: REFRESH_SECONDS, items: staff.ops.gateRequests.filter((r) => r.state === 'waiting' && ids.has(r.flat.id) && r.askedPartyIds.includes(res.partyId)).map(publicRequest) };
    },
  },
  ...(['approve', 'deny', 'call'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/portal\\/gate-requests\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('resident_portal', 'portal.use', 'operational'),
      handle: (ctx) => {
        const { res, staff } = resident(ctx, LIVE);
        const at = now(ctx);
        expireRequests(staff, at);
        // Asked, and still living there today (a moved-out occupant can no longer answer).
        const ids = new Set(livesIn(res).map((f) => f.flat.id));
        const r = staff.ops.gateRequests.find((x) => x.id === ctx.params.id && ids.has(x.flat.id) && x.askedPartyIds.includes(res.partyId));
        if (!r) notFound(ctx);
        if (r.state !== 'waiting') problem(ctx, 409, 'state_locked', r.state === 'expired' ? 'operations:errors.requestExpired' : 'operations:errors.alreadyDecided');
        if (action === 'call') {
          r.callRequested = true;
          r.history.push({ at, byName: res.name, byKind: 'resident', action: 'call_requested' });
        } else {
          r.state = action === 'approve' ? 'approved' : 'denied';
          r.decidedAt = at;
          r.decidedByName = res.name;
          r.history.push({ at, byName: res.name, byKind: 'resident', action: r.state });
        }
        save(ctx);
        return publicRequest(r);
      },
    }),
  ),
];
