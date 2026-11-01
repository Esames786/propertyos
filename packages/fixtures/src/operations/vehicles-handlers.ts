import { VEHICLE_KINDS, type NewVehicleInput, type ResidentParking, type Vehicle, type VehicleCheck, type VehicleList } from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { problem } from '../society/handlers';
import { invalid, notify, now, opsOf, save, staffOps, who, type Staff } from './common';
import { residentOps, rolesOn, type ResidentOps } from './site';
import { nextOf } from './state';

/**
 * Vehicles and parking (Gate D.2: PARK-005 registry with its approvals tab, PARK-007 approval drawer,
 * PORTAL-021 parking, PORTAL-026 vehicles). A resident who lives in a flat submits a vehicle; someone
 * with `vehicles.approve` decides. The server refuses an approval when another approved vehicle has the
 * same plate, when the owner no longer lives in (or owns) the flat, or when the flat's allowance is
 * used; nothing is approved by the resident's own say-so.
 */
const PARKING = { module: 'parking' as const };
const APPROVALS = 'parking.vehicle_approvals' as const;

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as T;
/** "lec 4415" → "LEC-4415"; the form a plate is compared in (spaces and dashes do not make it new). */
export const normalisePlate = (raw: unknown) => {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[\s-]+/g, '') : '';
  const m = /^([A-Z]{2,4})(\d{1,4})$/.exec(s);
  return m ? `${m[1]}-${m[2]}` : '';
};

const allowanceOf = (staff: Staff, flatId: string) => staff.ops.slots.filter((s) => s.flatId === flatId).length;
const takenSlots = (staff: Staff) => new Set(staff.ops.vehicles.filter((v) => v.state === 'approved' && v.slot).map((v) => v.slot!));

function check(ctx: HandlerContext, staff: Staff, v: Vehicle): VehicleCheck {
  const plate = normalisePlate(v.plate) || v.plate;
  const duplicate = staff.ops.vehicles.find((x) => x.id !== v.id && x.state === 'approved' && (normalisePlate(x.plate) || x.plate) === plate);
  const facts = staff.site.society?.view.facts ?? [];
  const roles = rolesOn(facts, v.ownerPartyId, v.flat.id, ctx.at);
  const linkInForce = roles.includes('occupant') || roles.includes('owner');
  const flatVehicles = staff.ops.vehicles.filter((x) => x.flat.id === v.flat.id && x.state === 'approved').length;
  const allowance = allowanceOf(staff, v.flat.id);
  const taken = takenSlots(staff);
  const freeSlots = staff.ops.slots.filter((s) => s.flatId === v.flat.id && !taken.has(s.code)).map((s) => s.code);
  const suspended = !can(ctx, 'vehicles.approve', 'operational');
  const reason: VehicleCheck['reason'] = suspended ? 'suspended' : v.state !== 'pending' ? 'not_pending' : duplicate ? 'duplicate_plate' : !linkInForce ? 'link_ended' : flatVehicles >= allowance ? 'allowance_full' : undefined;
  return {
    vehicle: v,
    ...(duplicate ? { duplicateOf: { id: duplicate.id, ref: duplicate.ref, flatCode: duplicate.flat.code } } : {}),
    pendingSame: staff.ops.vehicles.filter((x) => x.id !== v.id && x.state === 'pending' && (normalisePlate(x.plate) || x.plate) === plate).length,
    linkInForce,
    flatVehicles,
    allowance,
    freeSlots,
    canApprove: !reason,
    ...(reason ? { reason } : {}),
  };
}

function findVehicle(ctx: HandlerContext, staff: Staff): Vehicle {
  const v = staff.ops.vehicles.find((x) => x.id === ctx.params.id);
  if (!v) notFound(ctx);
  return v;
}

const decision = (ctx: HandlerContext, staff: Staff, v: Vehicle, state: 'approved' | 'rejected' | 'retired', reason?: string) => {
  const at = now(ctx);
  v.state = state;
  v.decidedAt = at;
  v.decidedByName = who(ctx);
  if (reason) v.reason = reason;
  v.history.push({ at, byName: who(ctx), byKind: 'staff', action: state, ...(reason ? { note: reason } : {}) });
  notify(ctx, staff, { partyIds: [v.ownerPartyId], flatId: v.flat.id, module: 'parking', kind: 'vehicle', key: state === 'approved' ? 'vehicleApproved' : state === 'rejected' ? 'vehicleRejected' : 'vehicleRetired', values: { plate: v.plate }, href: '/customer/portal/vehicles' });
};

const livesIn = (res: ResidentOps) => res.flats.filter((f) => f.roles.includes('occupant'));

function parkingOf(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentParking {
  const homes = livesIn(res);
  const ids = new Set(homes.map((f) => f.flat.id));
  const taken = new Map(staff.ops.vehicles.filter((v) => v.state === 'approved' && v.slot).map((v) => [v.slot!, v]));
  return {
    asOf: ctx.at,
    flats: homes.map((f) => ({ id: f.flat.id, code: f.flat.code, slots: staff.ops.slots.filter((s) => s.flatId === f.flat.id).map((s) => s.code), allowance: allowanceOf(staff, f.flat.id) })),
    // The household's vehicles (another flat's vehicles are never listed).
    vehicles: staff.ops.vehicles.filter((v) => ids.has(v.flat.id)).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)),
    visitorParking: `${staff.ops.slots.filter((s) => !s.flatId).length - [...taken.keys()].filter((k) => k.startsWith('V')).length}`,
    rules: ['sticker', 'visitor', 'noBlocking'],
  };
}

const resident = (ctx: HandlerContext) => {
  const res = residentOps(ctx, PARKING);
  return { res, staff: { site: res.site, ops: opsOf(ctx, res.site) } satisfies Staff };
};

export const OPS_VEHICLE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/vehicles$/,
    access: requires('parking', ['parking.view', 'vehicles.approve'], 'operational'),
    handle: (ctx): VehicleList => {
      const staff = staffOps(ctx, 'parking');
      const q = String(ctx.req.query?.q ?? '').trim().toLowerCase();
      const status = String(ctx.req.query?.status ?? 'all');
      const all = staff.ops.vehicles.filter((v) => !q || [v.ref, v.plate, v.flat.code, v.ownerName, v.make].some((x) => x.toLowerCase().includes(q)));
      const counts = Object.fromEntries(['all', 'pending', 'approved', 'rejected', 'retired'].map((s) => [s, s === 'all' ? all.length : all.filter((v) => v.state === s).length])) as VehicleList['counts'];
      return { items: all.filter((v) => status === 'all' || v.state === status).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt)), counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/vehicles\/(?<id>[\w-]+)\/check$/,
    access: requires('parking', ['parking.view', 'vehicles.approve'], 'operational'),
    handle: (ctx): VehicleCheck => {
      const staff = staffOps(ctx, 'parking');
      return check(ctx, staff, findVehicle(ctx, staff));
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/vehicles\/(?<id>[\w-]+)\/approve$/,
    access: requires('parking', 'vehicles.approve', 'operational', APPROVALS),
    handle: (ctx): VehicleCheck => {
      const staff = staffOps(ctx, 'parking', APPROVALS);
      const v = findVehicle(ctx, staff);
      const c = check(ctx, staff, v);
      if (!c.canApprove) problem(ctx, c.reason === 'not_pending' ? 409 : 422, c.reason ?? 'refused', `operations:vehicle.refusal.${c.reason}`);
      const slot = String(body<{ slot?: string }>(ctx).slot ?? '') || c.freeSlots[0];
      if (!slot || !c.freeSlots.includes(slot)) invalid(ctx, 'slot', 'operations:errors.slot');
      v.slot = slot;
      decision(ctx, staff, v, 'approved');
      save(ctx);
      return check(ctx, staff, v);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/vehicles\/(?<id>[\w-]+)\/reject$/,
    access: requires('parking', 'vehicles.approve', 'operational', APPROVALS),
    handle: (ctx): VehicleCheck => {
      const staff = staffOps(ctx, 'parking', APPROVALS);
      const v = findVehicle(ctx, staff);
      if (v.state !== 'pending') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = String(body<{ reason?: string }>(ctx).reason ?? '').trim();
      if (reason.length < 10) invalid(ctx, 'reason', 'operations:errors.tooShort', { min: '10' });
      decision(ctx, staff, v, 'rejected', reason.slice(0, 300));
      save(ctx);
      return check(ctx, staff, v);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/vehicles\/(?<id>[\w-]+)\/retire$/,
    access: requires('parking', 'vehicles.approve', 'operational'),
    handle: (ctx): VehicleCheck => {
      const staff = staffOps(ctx, 'parking');
      const v = findVehicle(ctx, staff);
      if (v.state !== 'approved') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = String(body<{ reason?: string }>(ctx).reason ?? '').trim();
      if (reason.length < 5) invalid(ctx, 'reason', 'operations:errors.tooShort', { min: '5' });
      delete v.slot;
      decision(ctx, staff, v, 'retired', reason.slice(0, 300));
      save(ctx);
      return check(ctx, staff, v);
    },
  },
  // Resident: parking (PORTAL-021) and vehicles (PORTAL-026) --------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/parking$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ResidentParking => {
      const { res, staff } = resident(ctx);
      return parkingOf(ctx, res, staff);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/vehicles$/,
    access: requires('resident_portal', 'portal.use', 'operational', APPROVALS),
    handle: (ctx): Vehicle => {
      const { res, staff } = resident(ctx);
      const input = body<NewVehicleInput>(ctx);
      const home = livesIn(res).find((f) => f.flat.id === input.flatId);
      if (!home) invalid(ctx, 'flatId', 'operations:errors.onlyOccupants');
      const plate = normalisePlate(input.plate);
      if (!plate) invalid(ctx, 'plate', 'operations:errors.plate');
      if (!(VEHICLE_KINDS as readonly string[]).includes(String(input.kind))) invalid(ctx, 'kind', 'forms:errors.required');
      const make = String(input.make ?? '').trim();
      const colour = String(input.colour ?? '').trim();
      if (make.length < 2) invalid(ctx, 'make', 'operations:errors.tooShort', { min: '2' });
      if (colour.length < 3) invalid(ctx, 'colour', 'operations:errors.tooShort', { min: '3' });
      if (staff.ops.vehicles.some((v) => v.flat.id === home.flat.id && (v.state === 'pending' || v.state === 'approved') && (normalisePlate(v.plate) || v.plate) === plate)) invalid(ctx, 'plate', 'operations:errors.plateAlreadyYours');
      const { id, ref } = nextOf(staff.ops, staff.site, 'vehicle');
      const at = now(ctx);
      const v: Vehicle = { id, ref, plate, kind: input.kind, make: make.slice(0, 60), colour: colour.slice(0, 30), siteId: staff.site.siteId, flat: home.flat, ownerPartyId: res.partyId, ownerName: res.name, state: 'pending', submittedAt: at, history: [{ at, byName: res.name, byKind: 'resident', action: 'submitted' }] };
      staff.ops.vehicles.push(v);
      save(ctx);
      return v;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/vehicles\/(?<id>[\w-]+)\/retire$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): Vehicle => {
      const { res, staff } = resident(ctx);
      const ids = new Set(livesIn(res).map((f) => f.flat.id));
      const v = staff.ops.vehicles.find((x) => x.id === ctx.params.id && ids.has(x.flat.id) && x.ownerPartyId === res.partyId);
      if (!v) notFound(ctx);
      if (v.state !== 'approved' && v.state !== 'pending') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const at = now(ctx);
      v.state = 'retired';
      delete v.slot;
      v.history.push({ at, byName: res.name, byKind: 'resident', action: 'retired' });
      save(ctx);
      return v;
    },
  },
];
