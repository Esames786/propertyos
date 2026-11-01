import type {
  Amenity,
  AmenityBooking,
  AudienceRole,
  BroadcastMessage,
  GatePass,
  GateRequest,
  GateVisit,
  GatewaySettings,
  MaintenanceRequest,
  ModuleKey,
  Notice,
  NoticeRecipient,
  NotificationKind,
  OpsEvent,
  RequestComment,
  RequestPriority,
  SlaTarget,
  TechnicianTrade,
  Vehicle,
  WorkOrder,
} from '@repo/contracts';
import { zonedStamp } from '../clock';
import type { HandlerContext } from '../handler-types';
import { pad } from '../seed';
import { timeZoneOf } from '../tenant-directory';
import { factOn } from '../society/model';
import type { OpsSite } from './site';
import { householdsOn } from './site';

/**
 * Gate D.2 operations state, kept in the organisation's demo partition (section 'operations'). For
 * the society demo that partition is shared with the resident app of this browser, so a repair raised
 * on the phone, a guest at the gate or an acknowledged notice is seen by the office at once. Seeded
 * deterministically the first time it is read (fictional people and places only); everything after
 * that is what the visitor did. "Reset demo" and choosing a society demo start it again.
 */
export const OPS_SECTION = 'operations';
export const OPS_STATE_VERSION = 3;

export interface Affirmation {
  partyId: string;
  flatId: string;
  flatCode: string;
  buildingCode: string;
  name: string;
  at: string;
  withdrawnAt?: string;
  /** Kept from a duplicate merged into this issue. */
  fromMerge?: string;
}

/** Counts published to residents at the last scheduled refresh (D-47: they move only by the threshold). */
export interface PublishedCounts {
  at: string;
  site: number;
  blocks: Record<string, number>;
}

export interface StoredRequest extends MaintenanceRequest {
  priority?: RequestPriority;
  respondedAt?: string;
  completedAt?: string;
  closedAt?: string;
  comments: RequestComment[];
  history: OpsEvent[];
  affirmations: Affirmation[];
  followers: string[];
  published?: PublishedCounts;
}

export interface TechnicianRecord {
  id: string;
  name: string;
  trade: TechnicianTrade;
  kind: 'staff' | 'vendor';
  principalId?: string;
  vendorName?: string;
  available: boolean;
}

export interface StoredGateRequest extends GateRequest {
  /** Occupants asked (parties); never shown to staff or other residents. */
  askedPartyIds: string[];
}

export interface StoredNotice extends Notice {
  recipients: NoticeRecipient[];
}

export interface StoredMessage extends BroadcastMessage {
  /** Who it reached when sent (never shown to residents). */
  recipientIds: string[];
}

/** A resident's notification about something of theirs (request, gate, vehicle, booking). */
export interface ResidentEvent {
  id: string;
  partyIds: string[];
  flatId?: string;
  module: ModuleKey;
  kind: NotificationKind;
  key: string;
  values: Record<string, string>;
  at: string;
  href: string;
}

export interface StoredBooking extends AmenityBooking {
  partyId: string;
  flatId: string;
}

export interface OpsState {
  version: typeof OPS_STATE_VERSION;
  seq: number;
  counters: Record<string, number>;
  requests: StoredRequest[];
  workOrders: WorkOrder[];
  technicians: TechnicianRecord[];
  sla: SlaTarget[];
  /** When resident-visible issue counts were last refreshed (scheduled job, simulated). */
  snapshotAt?: string;
  passes: GatePass[];
  gateRequests: StoredGateRequest[];
  visits: GateVisit[];
  vehicles: Vehicle[];
  /** Parking slots of the site: allocated to a flat, or visitor/spare. */
  slots: Array<{ code: string; flatId?: string }>;
  notices: StoredNotice[];
  messages: StoredMessage[];
  /** Seeded notices get their recipients on first read (they need the people's consent records). */
  recipientsSeeded?: boolean;
  /** Notification ids each resident has read (by party). */
  reads: Record<string, string[]>;
  events: ResidentEvent[];
  amenities: Amenity[];
  bookings: StoredBooking[];
  gateway: Omit<GatewaySettings, 'canManage'>;
}

/** Illustrative service levels (the society sets its own; shown as such on the SLA dashboard). */
export const DEFAULT_SLA: readonly SlaTarget[] = [
  { priority: 'p1', respondHours: 1, resolveHours: 24 },
  { priority: 'p2', respondHours: 4, resolveHours: 48 },
  { priority: 'p3', respondHours: 24, resolveHours: 120 },
  { priority: 'p4', respondHours: 48, resolveHours: 240 },
];

const REF_PREFIX = { request: 'MR', issue: 'CI', workOrder: 'WO', pass: 'VP', gateRequest: 'GR', visit: 'GV', vehicle: 'VH', notice: 'NT', message: 'BC', booking: 'BK', move: 'MV', gatewayEvent: 'GE' } as const;
const ID_PREFIX = { request: 'req', issue: 'req', workOrder: 'wo', pass: 'gps', gateRequest: 'gtr', visit: 'gvs', vehicle: 'veh', notice: 'ntc', message: 'bcm', booking: 'bkg', move: 'mov', gatewayEvent: 'gwe' } as const;
export type OpsKind = keyof typeof REF_PREFIX;

/** Next id and reference of a kind ("req_anr_0007", "ANR-MR-0007"); sequences only move forward. */
export function nextOf(state: Pick<OpsState, 'counters'>, site: Pick<OpsSite, 'code'>, kind: OpsKind): { id: string; ref: string } {
  const key = kind === 'issue' ? 'request' : kind;
  const seq = (state.counters[key] ?? 0) + 1;
  state.counters[key] = seq;
  const refSeq = (state.counters[`ref:${kind}`] ?? 0) + 1;
  state.counters[`ref:${kind}`] = refSeq;
  return { id: `${ID_PREFIX[kind]}_${site.code.toLowerCase()}_${pad(seq, 4)}`, ref: `${site.code}-${REF_PREFIX[kind]}-${pad(refSeq, 4)}` };
}

/** An action's time: the demo's business date at the organisation's wall-clock time (with offset). */
export const opsStamp = (ctx: Pick<HandlerContext, 'at' | 'tenantId'>) => zonedStamp(ctx.at, timeZoneOf(ctx.tenantId));

export function opsState(ctx: HandlerContext, site: OpsSite): OpsState {
  const state = ctx.demo.section<OpsState>(OPS_SECTION, () => seedOps(site));
  if (state.version !== OPS_STATE_VERSION) Object.assign(state, seedOps(site));
  return state;
}

// ---------------------------------------------------------------------------------------------
// Seeds (deterministic, fictional)
// ---------------------------------------------------------------------------------------------

/** "2026-10-24 10:30" in Pakistan as a UTC stamp (seeded records are written in UTC). */
const pk = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(h - 5, m, 0, 0);
  return d.toISOString().replace('.000Z', 'Z');
};

const ev = (at: string, byName: string, byKind: OpsEvent['byKind'], action: string, extra: Partial<OpsEvent> = {}): OpsEvent => ({ at, byName, byKind, action, ...extra });

function technicians(site: OpsSite): TechnicianRecord[] {
  if (site.code === 'SHC') {
    return [
      { id: 'tech_shc_irfan', name: 'Irfan Masih', trade: 'general', kind: 'staff', available: true },
      { id: 'tech_shc_flow', name: 'FlowFix Plumbing (Demo)', trade: 'plumbing', kind: 'vendor', vendorName: 'FlowFix Plumbing (Demo)', available: true },
      { id: 'tech_shc_volt', name: 'Voltline Electric (Demo)', trade: 'electrical', kind: 'vendor', vendorName: 'Voltline Electric (Demo)', available: true },
    ];
  }
  return [
    { id: 'tech_anr_waqas', name: 'Waqas Ali', trade: 'electrical', kind: 'staff', principalId: 'usr_anr_0006', available: true },
    { id: 'tech_anr_bilal', name: 'Bilal Khan', trade: 'plumbing', kind: 'staff', available: true },
    { id: 'tech_anr_lift', name: 'LiftCare Services (Demo)', trade: 'lift', kind: 'vendor', vendorName: 'LiftCare Services (Demo)', available: true },
    { id: 'tech_anr_wood', name: 'Fine Woodworks (Demo)', trade: 'carpentry', kind: 'vendor', vendorName: 'Fine Woodworks (Demo)', available: true },
    { id: 'tech_anr_civil', name: 'Haider Builders (Demo)', trade: 'civil', kind: 'vendor', vendorName: 'Haider Builders (Demo)', available: false },
  ];
}

function amenities(): Amenity[] {
  return [
    { id: 'amn_gym', kind: 'gym', hours: '06:00–22:00', booking: 'instant', bookers: 'residents', capacity: 6, rules: ['gym1', 'gym2'], slots: ['06:00', '08:00', '18:00', '20:00'] },
    { id: 'amn_hall', kind: 'hall', hours: '10:00–23:00', booking: 'request', bookers: 'residents_and_owners', capacity: 80, fee: { amount: '5000.00', currency: 'PKR' }, rules: ['hall1', 'hall2', 'hall3'], slots: ['12:00–16:00', '18:00–23:00'] },
    { id: 'amn_kids', kind: 'kids_play', hours: '08:00–20:00', booking: 'none', bookers: 'residents', capacity: 20, rules: ['kids1', 'kids2'], slots: [] },
    { id: 'amn_bbq', kind: 'bbq', hours: '17:00–23:00', booking: 'request', bookers: 'residents', capacity: 15, rules: ['bbq1', 'bbq2'], slots: ['17:00–20:00', '20:00–23:00'] },
  ];
}

const emptyState = (site: OpsSite): OpsState => ({
  version: OPS_STATE_VERSION,
  seq: 0,
  counters: {},
  requests: [],
  workOrders: [],
  technicians: technicians(site),
  sla: DEFAULT_SLA.map((s) => ({ ...s })),
  passes: [],
  gateRequests: [],
  visits: [],
  vehicles: [],
  slots: [],
  notices: [],
  messages: [],
  reads: {},
  events: [],
  amenities: site.society ? amenities() : [],
  bookings: [],
  gateway: { siteId: site.siteId, mode: 'off', provider: 'Demo gateway (sandbox)', merchantId: `DEMO-${site.code}-0001`, methods: ['card', 'wallet'], feeBearer: 'society', events: [] },
});

export function seedOps(site: OpsSite): OpsState {
  const s = emptyState(site);
  if (site.code === 'SHC') return seedShalimar(s, site);
  if (!site.society || !site.flats.length) return s;
  seedRequests(s, site);
  seedVisitors(s, site);
  seedVehicles(s, site);
  seedNotices(s, site);
  seedBookings(s, site);
  return s;
}

const TODAY = '2026-10-26';

/** The register's people on a flat (seeds are written for the demo's "today"). */
function who(site: OpsSite, code: string) {
  const flat = site.flats.find((f) => f.code === code)!;
  const facts = site.society!.view.facts.filter((f) => f.flatId === flat.id && factOn(f, TODAY));
  const occupant = facts.find((f) => f.role === 'occupant' && f.occupancyKind !== 'association');
  const owner = facts.find((f) => f.role === 'owner');
  return { flat, occupant, owner, resident: occupant ?? owner! };
}

interface RequestSeed {
  kind: 'repair' | 'community_issue';
  flat?: string;
  area?: string;
  category: MaintenanceRequest['category'];
  title: string;
  description: string;
  room?: MaintenanceRequest['room'];
  urgency: MaintenanceRequest['urgency'];
  priority?: RequestPriority;
  created: string;
  responded?: string;
  state: MaintenanceRequest['state'];
  tech?: string;
  scheduledOn?: string;
  slot?: WorkOrder['slot'];
  completed?: string;
  closed?: string;
  confirmation?: MaintenanceRequest['confirmation'];
  rating?: number;
  reopened?: string;
  completionNote?: string;
  /** Community issue: households that said it affects them (flat codes). */
  affirm?: string[];
  summary?: string;
  hidden?: string;
  mergedInto?: number;
  comments?: Array<{ at: string; by: 'resident' | 'staff' | 'technician'; text: string; internal?: boolean }>;
  files?: Array<{ name: string; alt: string }>;
}

const MANAGER = 'Imran Qureshi';
const SUPERVISOR = 'Naveed Anjum';

function seedRequests(s: OpsState, site: OpsSite) {
  // Times are Pakistan time. SLA states are chosen to be stable on the whole demo day (26 Oct).
  const seeds: RequestSeed[] = [
    // A-101: last fix confirmed (the reference flow raises a new one).
    { kind: 'repair', flat: 'A-101', category: 'plumbing', room: 'bathroom', title: 'Bathroom tap dripping', description: 'The hot water tap in the main bathroom keeps dripping at night.', urgency: 'normal', priority: 'p3', created: pk('2026-10-08', '09:10'), responded: pk('2026-10-08', '11:00'), state: 'closed', tech: 'tech_anr_bilal', scheduledOn: '2026-10-09', slot: 'morning', completed: pk('2026-10-09', '11:40'), closed: pk('2026-10-09', '19:05'), confirmation: 'confirmed', rating: 5, completionNote: 'Washer and cartridge replaced; no drip after 30 minutes.' },
    // A-102: socket sparks, urgent, assigned to Waqas, visit tomorrow morning.
    { kind: 'repair', flat: 'A-102', category: 'electrical', room: 'bedroom', title: 'Socket sparks when the heater is plugged in', description: 'The socket beside the bed sparked twice. We have stopped using it.', urgency: 'urgent', priority: 'p2', created: pk('2026-10-25', '20:15'), responded: pk('2026-10-25', '21:00'), state: 'assigned', tech: 'tech_anr_waqas', scheduledOn: '2026-10-27', slot: 'morning', files: [{ name: 'socket-scorch.jpg', alt: 'Wall socket with a dark scorch mark on its left side' }] },
    // A-202: balcony lock fixed by the carpenter; Junaid has not confirmed yet.
    { kind: 'repair', flat: 'A-202', category: 'carpentry', room: 'balcony', title: 'Balcony door lock broken', description: 'The balcony door does not lock any more; the handle turns freely.', urgency: 'normal', priority: 'p3', created: pk('2026-10-22', '18:30'), responded: pk('2026-10-23', '09:15'), state: 'completed', tech: 'tech_anr_wood', scheduledOn: '2026-10-25', slot: 'afternoon', completed: pk('2026-10-25', '15:20'), confirmation: 'awaiting', completionNote: 'Lock body replaced; door locks from inside and outside.' },
    // B-306: seepage, triaged, nobody assigned yet (civil vendor not available).
    { kind: 'repair', flat: 'B-306', category: 'civil', room: 'bathroom', title: 'Water seepage in the bathroom ceiling', description: 'A damp patch on the ceiling is growing; it may come from the flat above.', urgency: 'normal', priority: 'p3', created: pk('2026-10-24', '10:00'), responded: pk('2026-10-24', '12:30'), state: 'triaged', comments: [{ at: pk('2026-10-24', '12:35'), by: 'staff', text: 'B-406 to be checked first; civil contractor busy until Wednesday.', internal: true }] },
    // A-305: geyser, raised this morning, not triaged yet.
    { kind: 'repair', flat: 'A-305', category: 'plumbing', room: 'bathroom', title: 'Geyser not heating', description: 'No hot water since yesterday evening. The pilot light is on.', urgency: 'normal', created: pk('2026-10-26', '08:40'), state: 'submitted' },
    // B-204: exhaust fan, low, waiting since the 21st: response target missed.
    { kind: 'repair', flat: 'B-204', category: 'electrical', room: 'kitchen', title: 'Kitchen exhaust fan very noisy', description: 'The exhaust fan rattles loudly at full speed.', urgency: 'low', created: pk('2026-10-21', '17:00'), state: 'submitted' },
    // B-402: door frame on hold for parts; resolution target passed.
    { kind: 'repair', flat: 'B-402', category: 'carpentry', room: 'whole_flat', title: 'Main door frame cracked', description: 'The frame of the main door is cracked near the hinge and the door drags.', urgency: 'normal', priority: 'p3', created: pk('2026-10-17', '11:00'), responded: pk('2026-10-17', '15:00'), state: 'on_hold', tech: 'tech_anr_wood', comments: [{ at: pk('2026-10-20', '10:00'), by: 'staff', text: 'New frame ordered; the supplier delivers on 29 October.' }] },
    // A-404: AC drain, reopened once, Waqas working on it.
    { kind: 'repair', flat: 'A-404', category: 'plumbing', room: 'living_room', title: 'AC drain leaking onto the floor', description: 'Water drips from the indoor AC unit onto the floor.', urgency: 'normal', priority: 'p3', created: pk('2026-10-19', '13:00'), responded: pk('2026-10-19', '16:00'), state: 'in_progress', tech: 'tech_anr_waqas', scheduledOn: '2026-10-26', slot: 'afternoon', reopened: pk('2026-10-23', '20:00'), comments: [{ at: pk('2026-10-23', '20:00'), by: 'resident', text: 'Still leaking after the first visit, a bit less than before.' }] },
    // A-503: closed by the office after no answer for a week.
    { kind: 'repair', flat: 'A-503', category: 'electrical', room: 'living_room', title: 'Ceiling light flickers', description: 'The living room light flickers when the fan is on.', urgency: 'low', priority: 'p4', created: pk('2026-10-05', '19:00'), responded: pk('2026-10-06', '10:00'), state: 'closed', tech: 'tech_anr_waqas', scheduledOn: '2026-10-07', slot: 'evening', completed: pk('2026-10-07', '19:30'), closed: pk('2026-10-14', '10:00'), confirmation: 'closed_by_office', completionNote: 'Loose connection in the fan regulator tightened.' },
    // B-501: at risk all day (resolution due early on 27 Oct).
    { kind: 'repair', flat: 'B-501', category: 'plumbing', room: 'kitchen', title: 'Kitchen sink drains slowly', description: 'Water stays in the sink for several minutes after washing up.', urgency: 'normal', priority: 'p3', created: pk('2026-10-22', '03:00'), responded: pk('2026-10-22', '10:00'), state: 'assigned', tech: 'tech_anr_bilal', scheduledOn: '2026-10-27', slot: 'morning' },
    // Community issues (kind = community_issue): one request model, affected households opt in.
    { kind: 'community_issue', area: 'area_anr_a_lift', category: 'lift', title: 'Block A lift stops between floors', description: 'The lift in Block A sometimes stops between the 3rd and 4th floor for a few seconds.', urgency: 'urgent', priority: 'p2', created: pk('2026-10-23', '08:00'), responded: pk('2026-10-23', '09:00'), state: 'assigned', tech: 'tech_anr_lift', scheduledOn: '2026-10-27', slot: 'morning', summary: 'LiftCare will inspect the Block A lift on Tuesday morning. Please use the stairs if the lift stops.', affirm: ['A-101', 'A-102', 'A-201', 'A-204', 'A-301', 'A-302', 'A-401', 'A-402', 'A-501', 'A-502'] },
    { kind: 'community_issue', area: 'area_anr_water_tank', category: 'water', title: 'Low water pressure on top floors', description: 'Water pressure on the 4th and 5th floors is very low in the mornings.', urgency: 'normal', priority: 'p3', created: pk('2026-10-24', '07:30'), responded: pk('2026-10-24', '10:00'), state: 'triaged', summary: 'The pump timer is being checked.', affirm: ['A-401', 'A-402', 'A-501', 'B-401', 'B-502'] },
    { kind: 'community_issue', area: 'area_anr_main_gate', category: 'security', title: 'Stray dogs near the main gate', description: 'A few stray dogs sleep near the main gate at night.', urgency: 'normal', created: pk('2026-10-25', '21:30'), state: 'submitted', affirm: ['B-201', 'B-305'] },
    { kind: 'community_issue', area: 'area_anr_generator', category: 'common_area', title: 'Generator very loud at night', description: 'The generator runs after 11 pm and is very loud on the garden side.', urgency: 'normal', priority: 'p3', created: pk('2026-10-20', '23:30'), responded: pk('2026-10-21', '10:00'), state: 'in_progress', summary: 'An exhaust silencer is being fitted; the generator will not run after 11 pm except in a power cut.', affirm: ['A-103', 'A-104', 'B-102', 'B-103'] },
    { kind: 'community_issue', area: 'area_anr_generator', category: 'common_area', title: 'Generator noise after 11 pm', description: 'Noise from the generator late at night.', urgency: 'low', created: pk('2026-10-22', '23:45'), state: 'merged', mergedInto: 13, affirm: ['B-104', 'B-105'] },
    { kind: 'community_issue', area: 'area_anr_b_corridor', category: 'other', title: 'Complaint about a neighbour', description: 'Names a neighbour and their guests.', urgency: 'low', created: pk('2026-10-25', '22:10'), state: 'hidden', hidden: 'Names a resident; handled privately by the manager.' },
  ];
  const areas = new Map(site.areas.map((a) => [a.id, a]));
  const created: StoredRequest[] = [];
  for (const seed of seeds) {
    const { id, ref } = nextOf(s, site, seed.kind === 'repair' ? 'request' : 'issue');
    const flatInfo = seed.flat ? who(site, seed.flat) : undefined;
    const raiser = flatInfo ? { kind: 'resident' as const, name: flatInfo.resident.partyName, partyId: flatInfo.resident.partyId } : seed.affirm?.length ? (() => { const w = who(site, seed.affirm![0]!); return { kind: 'resident' as const, name: w.resident.partyName, partyId: w.resident.partyId }; })() : { kind: 'staff' as const, name: MANAGER };
    const r: StoredRequest = {
      id,
      ref,
      kind: seed.kind,
      category: seed.category,
      title: seed.title,
      description: seed.description,
      siteId: site.siteId,
      ...(flatInfo ? { flat: flatInfo.flat } : {}),
      ...(seed.room ? { room: seed.room } : {}),
      ...(seed.area ? { area: areas.get(seed.area)! } : {}),
      urgency: seed.urgency,
      state: seed.state,
      raisedBy: raiser,
      ...(seed.kind === 'repair' ? { contact: { preference: 'app' as const, entry: 'when_home' as const } } : {}),
      files: (seed.files ?? []).map((f, i) => ({ id: `fil_${id}_${i + 1}`, name: f.name, type: 'image/jpeg', sizeBytes: 182_000 + i * 31_000, alt: f.alt })),
      createdAt: seed.created,
      updatedAt: seed.closed ?? seed.completed ?? seed.reopened ?? seed.responded ?? seed.created,
      reopenCount: seed.reopened ? 1 : 0,
      ...(seed.priority ? { priority: seed.priority } : {}),
      ...(seed.responded ? { respondedAt: seed.responded } : {}),
      ...(seed.completed ? { completedAt: seed.completed } : {}),
      ...(seed.closed ? { closedAt: seed.closed } : {}),
      ...(seed.confirmation ? { confirmation: seed.confirmation } : {}),
      ...(seed.rating ? { rating: seed.rating } : {}),
      ...(seed.summary ? { publicSummary: seed.summary } : {}),
      ...(seed.kind === 'community_issue' ? { visibility: seed.area && areas.get(seed.area)?.buildingId ? ('block' as const) : ('site' as const) } : {}),
      ...(seed.hidden ? { hidden: { at: pk('2026-10-26', '08:00'), byName: MANAGER, reason: seed.hidden } } : {}),
      comments: [],
      history: [ev(seed.created, raiser.name, raiser.kind, 'submitted')],
      affirmations: [],
      followers: raiser.partyId ? [raiser.partyId] : [],
    };
    if (seed.responded) r.history.push(ev(seed.responded, SUPERVISOR, 'staff', 'triaged', { values: { priority: seed.priority ?? 'p3' } }));
    if (seed.tech) {
      const tech = s.technicians.find((t) => t.id === seed.tech)!;
      const wo = nextOf(s, site, 'workOrder');
      const at = seed.responded ?? seed.created;
      const order: WorkOrder = {
        id: wo.id,
        ref: wo.ref,
        requestId: id,
        requestRef: ref,
        technicianId: tech.id,
        technicianName: tech.name,
        state: seed.state === 'closed' || seed.state === 'completed' ? 'done' : seed.state === 'in_progress' ? 'in_progress' : seed.state === 'on_hold' ? 'on_hold' : 'assigned',
        ...(seed.scheduledOn ? { scheduledOn: seed.scheduledOn } : {}),
        ...(seed.slot ? { slot: seed.slot } : {}),
        assignedAt: at,
        assignedByName: SUPERVISOR,
        ...(seed.completed ? { completion: { at: seed.completed, byName: tech.name, note: seed.completionNote ?? '', files: [{ id: `fil_${wo.id}_1`, name: 'after.jpg', type: 'image/jpeg', sizeBytes: 204_800, alt: 'The repaired fitting after the work' }] } } : {}),
        history: [ev(at, SUPERVISOR, 'staff', 'assigned', { values: { technician: tech.name } })],
      };
      if (seed.completed) order.history.push(ev(seed.completed, tech.name, 'technician', 'done'));
      s.workOrders.push(order);
      r.assignee = { technicianId: tech.id, name: tech.name };
      r.history.push(ev(at, SUPERVISOR, 'staff', 'assigned', { values: { technician: tech.name, workOrder: wo.ref } }));
      if (seed.state === 'in_progress') r.history.push(ev(at, tech.name, 'technician', 'started'));
      if (seed.state === 'on_hold') r.history.push(ev(pk('2026-10-20', '10:00'), SUPERVISOR, 'staff', 'on_hold'));
      if (seed.completed) r.history.push(ev(seed.completed, tech.name, 'technician', 'completed'));
    }
    if (seed.reopened) r.history.push(ev(seed.reopened, raiser.name, 'resident', 'reopened'));
    if (seed.closed) r.history.push(ev(seed.closed, seed.confirmation === 'closed_by_office' ? MANAGER : raiser.name, seed.confirmation === 'closed_by_office' ? 'staff' : 'resident', seed.confirmation === 'closed_by_office' ? 'closed_by_office' : 'confirmed'));
    for (const c of seed.comments ?? []) {
      r.comments.push({ id: `cmt_${id}_${r.comments.length + 1}`, at: c.at, byName: c.by === 'resident' ? raiser.name : c.by === 'technician' ? (r.assignee?.name ?? '') : SUPERVISOR, byKind: c.by, visibility: c.internal ? 'internal' : 'public', text: c.text });
    }
    for (const [i, code] of (seed.affirm ?? []).entries()) {
      const w = who(site, code);
      r.affirmations.push({ partyId: w.resident.partyId, flatId: w.flat.id, flatCode: code, buildingCode: w.flat.buildingCode, name: w.resident.partyName, at: new Date(Date.parse(seed.created) + i * 47 * 60_000).toISOString().replace('.000Z', 'Z') });
      if (!r.followers.includes(w.resident.partyId)) r.followers.push(w.resident.partyId);
    }
    if (seed.mergedInto !== undefined) {
      const target = created[seed.mergedInto]!;
      r.mergedInto = { id: target.id, ref: target.ref };
      target.mergedFrom = [...(target.mergedFrom ?? []), { id: r.id, ref: r.ref }];
      for (const a of r.affirmations) if (!target.affirmations.some((x) => x.flatId === a.flatId)) target.affirmations.push({ ...a, fromMerge: r.ref });
      r.history.push(ev(pk('2026-10-23', '10:00'), MANAGER, 'staff', 'merged', { values: { into: target.ref } }));
      target.history.push(ev(pk('2026-10-23', '10:00'), MANAGER, 'staff', 'merged_from', { values: { from: r.ref } }));
    }
    if (seed.hidden) r.history.push(ev(pk('2026-10-26', '08:00'), MANAGER, 'staff', 'hidden'));
    created.push(r);
  }
  s.requests = created;
  // This morning's scheduled refresh of resident-visible counts (06:00 Pakistan time).
  s.snapshotAt = pk(TODAY, '06:00');
  for (const r of s.requests) if (r.kind === 'community_issue') r.published = liveCounts(r, site, s.snapshotAt);
}

/** Households affected now: distinct flats with an affirmation not withdrawn (by block). */
export function liveCounts(r: Pick<StoredRequest, 'affirmations'>, site: Pick<OpsSite, 'buildings'>, at: string): PublishedCounts {
  const active = r.affirmations.filter((a) => !a.withdrawnAt && Date.parse(a.at) <= Date.parse(at));
  const flats = new Map(active.map((a) => [a.flatId, a.buildingCode]));
  const blocks: Record<string, number> = Object.fromEntries(site.buildings.map((b) => [b.code, 0]));
  for (const code of flats.values()) blocks[code] = (blocks[code] ?? 0) + 1;
  return { at, site: flats.size, blocks };
}

/** Eligible audience (households living on the site, per block) on a date. */
export function audienceCounts(site: OpsSite, on: string): { site: number; blocks: Record<string, number> } {
  const homes = site.society ? householdsOn(site.society.view.facts, on) : new Map<string, string>();
  const blocks: Record<string, number> = Object.fromEntries(site.buildings.map((b) => [b.code, 0]));
  for (const flatId of homes.keys()) {
    const f = site.flats.find((x) => x.id === flatId);
    if (f) blocks[f.buildingCode] = (blocks[f.buildingCode] ?? 0) + 1;
  }
  return { site: homes.size, blocks };
}

function seedVisitors(s: OpsState, site: OpsSite) {
  const guard = 'Shahid Hussain';
  const pass = (code: string, flat: string, visitorName: string, purpose: GatePass['purpose'], from: string, to: string, state: GatePass['state'], entries: GatePass['entries'] = 'single', extra: Partial<GatePass> = {}) => {
    const w = who(site, flat);
    const { id, ref } = nextOf(s, site, 'pass');
    const createdAt = new Date(Date.parse(from) - 26 * 3600_000).toISOString().replace('.000Z', 'Z');
    const p: GatePass = { id, ref, code, siteId: site.siteId, flat: w.flat, hostPartyId: w.resident.partyId, hostName: w.resident.partyName, visitorName, purpose, from, to, entries, state, createdAt, usedCount: 0, history: [ev(createdAt, w.resident.partyName, 'resident', 'created')], ...extra };
    s.passes.push(p);
    return p;
  };
  const visit = (p: GatePass | null, flat: string, visitorName: string, purpose: GatePass['purpose'], at: string, outcome: GateVisit['outcome'], extra: Partial<GateVisit> = {}) => {
    const { id, ref } = nextOf(s, site, 'visit');
    const v: GateVisit = { id, ref, siteId: site.siteId, flatCode: flat, visitorName, purpose, outcome, at, guardName: guard, ...(p ? { passId: p.id, passRef: p.ref } : {}), ...(outcome !== 'refused' ? { checkedInAt: at } : {}), ...extra };
    s.visits.push(v);
    if (p && outcome !== 'refused') {
      p.usedCount += 1;
      p.history.push(ev(at, guard, 'staff', 'checked_in'));
      if (v.checkedOutAt) p.history.push(ev(v.checkedOutAt, guard, 'staff', 'checked_out'));
    }
    return v;
  };
  // Today's expected guest for Kamran (A-101), an evening window.
  pass('482913', 'A-101', 'Ahmed Raza', 'guest', pk(TODAY, '16:00'), pk(TODAY, '23:00'), 'active', 'single', { vehiclePlate: 'LEA-2741' });
  pass('615204', 'A-101', 'Nadia Siddiqui', 'family', pk('2026-10-28', '11:00'), pk('2026-10-28', '20:00'), 'scheduled');
  // Junaid's cook comes every day this week (multiple entries).
  const cook = pass('730518', 'A-202', 'Rashid Mehmood', 'service', pk('2026-10-20', '08:00'), pk('2026-10-31', '20:00'), 'active', 'multiple');
  visit(cook, 'A-202', 'Rashid Mehmood', 'service', pk('2026-10-24', '08:10'), 'left', { checkedOutAt: pk('2026-10-24', '13:05') });
  visit(cook, 'A-202', 'Rashid Mehmood', 'service', pk('2026-10-25', '08:05'), 'left', { checkedOutAt: pk('2026-10-25', '12:50') });
  visit(cook, 'A-202', 'Rashid Mehmood', 'service', pk(TODAY, '08:02'), 'inside');
  cook.state = 'active';
  // Sana's courier: the pass expired yesterday unused.
  pass('904417', 'A-102', 'Swift Couriers (Demo)', 'delivery', pk('2026-10-25', '10:00'), pk('2026-10-25', '14:00'), 'expired');
  // B-306 guest inside now (single entry).
  const inside = pass('228640', 'B-306', 'Farhan Akhtar', 'guest', pk(TODAY, '09:00'), pk(TODAY, '21:00'), 'checked_in', 'single', { vehiclePlate: 'LEB-9302' });
  visit(inside, 'B-306', 'Farhan Akhtar', 'guest', pk(TODAY, '10:12'), 'inside', { vehiclePlate: 'LEB-9302' });
  // B-105 plumber yesterday, checked in and out.
  const plumber = pass('337051', 'B-105', 'Hamid Plumbing (Demo)', 'service', pk('2026-10-25', '09:00'), pk('2026-10-25', '18:00'), 'checked_out');
  visit(plumber, 'B-105', 'Hamid Plumbing (Demo)', 'service', pk('2026-10-25', '11:30'), 'left', { checkedOutAt: pk('2026-10-25', '13:10') });
  // Refusals this week: an expired pass shown again, an unknown code, a visitor the resident turned away.
  visit(s.passes.find((p) => p.code === '904417')!, 'A-102', 'Swift Couriers (Demo)', 'delivery', pk(TODAY, '09:20'), 'refused', { refusal: 'expired' });
  visit(null, '—', 'Unknown visitor', 'other', pk('2026-10-24', '22:40'), 'refused', { refusal: 'unknown_code' });
  // Walk-in visitors asked through the live queue earlier.
  const req = (flat: string, visitorName: string, purpose: GatePass['purpose'], at: string, state: StoredGateRequest['state'], decidedBy?: string) => {
    const w = who(site, flat);
    const { id, ref } = nextOf(s, site, 'gateRequest');
    const asked = w.occupant ? [w.occupant.partyId] : [];
    const decidedAt = state === 'expired' ? new Date(Date.parse(at) + 5 * 60_000).toISOString().replace('.000Z', 'Z') : new Date(Date.parse(at) + 90_000).toISOString().replace('.000Z', 'Z');
    const r: StoredGateRequest = { id, ref, siteId: site.siteId, flat: w.flat, visitorName, purpose, state, createdAt: at, expiresAt: new Date(Date.parse(at) + 5 * 60_000).toISOString().replace('.000Z', 'Z'), guardName: guard, askedCount: asked.length, askedPartyIds: asked, ...(state !== 'waiting' ? { decidedAt, ...(decidedBy ? { decidedByName: decidedBy } : {}) } : {}), history: [ev(at, guard, 'staff', 'asked')] };
    if (state === 'approved' || state === 'denied') r.history.push(ev(decidedAt, decidedBy ?? '', 'resident', state));
    if (state === 'expired') r.history.push(ev(decidedAt, 'PropertyOS', 'system', 'expired'));
    s.gateRequests.push(r);
    if (state === 'approved') visit(null, flat, visitorName, purpose, decidedAt, 'left', { gateRequestId: id, checkedOutAt: new Date(Date.parse(decidedAt) + 40 * 60_000).toISOString().replace('.000Z', 'Z') });
    if (state === 'denied') visit(null, flat, visitorName, purpose, decidedAt, 'refused', { gateRequestId: id, refusal: 'denied_by_resident' });
    if (state === 'expired') visit(null, flat, visitorName, purpose, decidedAt, 'refused', { gateRequestId: id, refusal: 'request_expired' });
    return r;
  };
  const kamran = who(site, 'A-101').resident.partyName;
  req('A-101', 'FoodPanda rider (Demo)', 'delivery', pk('2026-10-25', '20:10'), 'approved', kamran);
  req('B-204', 'Unnamed salesman', 'other', pk('2026-10-25', '16:45'), 'denied', who(site, 'B-204').resident.partyName);
  req('A-306', 'Cab driver', 'cab', pk('2026-10-24', '23:05'), 'expired');
  s.visits.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function seedVehicles(s: OpsState, site: OpsSite) {
  // One allocated slot per flat (two for the penthouse floor), and eight visitor bays.
  for (const f of site.flats) {
    s.slots.push({ code: `P${f.code.replace('-', '')}`, flatId: f.id });
    if (f.floor === 5) s.slots.push({ code: `P${f.code.replace('-', '')}B`, flatId: f.id });
  }
  for (let i = 1; i <= 8; i++) s.slots.push({ code: `V${pad(i, 2)}` });
  const add = (flat: string, plate: string, kind: Vehicle['kind'], make: string, colour: string, state: Vehicle['state'], submitted: string, extra: Partial<Vehicle> = {}) => {
    const w = who(site, flat);
    const owner = w.occupant ?? w.owner!;
    const { id, ref } = nextOf(s, site, 'vehicle');
    const v: Vehicle = { id, ref, plate, kind, make, colour, siteId: site.siteId, flat: w.flat, ownerPartyId: owner.partyId, ownerName: owner.partyName, state, submittedAt: submitted, history: [ev(submitted, owner.partyName, 'resident', 'submitted')], ...extra };
    if (state === 'approved' || state === 'rejected') {
      const at = new Date(Date.parse(submitted) + 20 * 3600_000).toISOString().replace('.000Z', 'Z');
      v.decidedAt = at;
      v.decidedByName = MANAGER;
      v.history.push(ev(at, MANAGER, 'staff', state, extra.reason ? { note: extra.reason } : {}));
      if (state === 'approved') v.slot = `P${flat.replace('-', '')}`;
    }
    s.vehicles.push(v);
    return v;
  };
  add('A-101', 'LEC-4415', 'car', 'Suzuki Cultus', 'Silver', 'approved', pk('2026-10-02', '10:00'));
  add('A-102', 'LED-1180', 'car', 'Toyota Corolla', 'White', 'approved', pk('2026-10-03', '18:00'));
  add('A-201', 'LEA-3390', 'car', 'Honda City', 'Grey', 'approved', pk('2026-10-02', '12:00'));
  add('A-202', 'LEF-7702', 'motorbike', 'Honda CD 70', 'Red', 'approved', pk('2026-10-04', '09:30'));
  add('A-305', 'LEB-5521', 'car', 'Suzuki Alto', 'White', 'approved', pk('2026-10-05', '11:00'));
  add('B-102', 'LEC-6604', 'car', 'Kia Picanto', 'Blue', 'approved', pk('2026-10-05', '15:00'));
  add('B-306', 'LEE-2219', 'car', 'Toyota Yaris', 'Black', 'approved', pk('2026-10-06', '10:15'));
  add('B-501', 'LEA-9001', 'car', 'Honda Civic', 'White', 'approved', pk('2026-10-06', '19:40'));
  add('A-501', 'LED-8810', 'car', 'Hyundai Tucson', 'Grey', 'approved', pk('2026-10-07', '08:20'));
  // Waiting: a new car for B-204, and a plate that is already registered to A-102 (must be refused).
  add('B-204', 'LEG-3307', 'car', 'Changan Alsvin', 'White', 'pending', pk('2026-10-25', '19:00'));
  add('B-405', 'LED-1180', 'car', 'Toyota Corolla', 'White', 'pending', pk('2026-10-26', '07:45'));
  add('A-404', 'LEH-6021', 'motorbike', 'Yamaha YBR', 'Blue', 'pending', pk('2026-10-24', '21:10'));
  add('B-301', 'ABC-123', 'car', 'Unknown', 'Unknown', 'rejected', pk('2026-10-12', '13:00'), { reason: 'The registration book was not readable; please submit a clear copy.' });
  const retired = add('A-305', 'LEB-1102', 'car', 'Suzuki Mehran', 'Green', 'approved', pk('2026-03-01', '10:00'));
  retired.state = 'retired';
  retired.slot = undefined;
  retired.history.push(ev(pk('2026-10-05', '11:05'), MANAGER, 'staff', 'retired', { note: 'Sold; replaced by LEB-5521.' }));
}

const AUD_ALL: AudienceRole[] = ['owner', 'occupant'];

function seedNotices(s: OpsState, site: OpsSite) {
  // Recipients are resolved when the notice is published (audience.ts); the seed only sets the record.
  const n = (seed: Omit<StoredNotice, 'id' | 'ref' | 'siteId' | 'recipients' | 'history' | 'versions' | 'audienceLabel' | 'createdByName'> & { versions?: StoredNotice['versions']; createdByName?: string }) => {
    const { id, ref } = nextOf(s, site, 'notice');
    const notice: StoredNotice = { id, ref, siteId: site.siteId, audienceLabel: '', createdByName: seed.createdByName ?? MANAGER, recipients: [], history: [ev(seed.createdAt, seed.createdByName ?? MANAGER, 'staff', 'drafted')], versions: seed.versions ?? [seed.current], ...seed } as StoredNotice;
    s.notices.push(notice);
    return notice;
  };
  const v = (version: number, title: string, body: string, category: StoredNotice['current']['category'], at: string, renotified = false, changeNote?: string) => ({ version, title, body, category, at, byName: MANAGER, renotified, ...(changeNote ? { changeNote } : {}) });
  n({ state: 'published', current: v(1, 'Water tank cleaning on Tuesday 28 October', 'The overhead water tanks of both blocks will be cleaned on Tuesday 28 October from 10:00 to 14:00. Please store water the night before. Supply returns by 15:00.', 'water', pk('2026-10-20', '11:00')), audience: { scope: 'site', ids: [], roles: ['occupant'] }, ackRequired: false, channels: { sms: true, whatsapp: false }, publishedAt: pk('2026-10-20', '11:05'), createdAt: pk('2026-10-20', '10:40') });
  const agmV1 = v(1, 'Annual general meeting on Sunday 9 November', 'The annual general meeting of the owners’ association is on Sunday 9 November at 11:00 in the community hall. The agenda is attached at the office. Please confirm you have read this notice.', 'meeting', pk('2026-10-22', '16:00'));
  const agmV2 = v(2, 'Annual general meeting on Sunday 9 November (new time)', 'The annual general meeting of the owners’ association is on Sunday 9 November at 16:00 (changed from 11:00) in the community hall. The agenda is available at the office. Please confirm you have read this notice.', 'meeting', pk('2026-10-24', '12:00'), true, 'Time changed from 11:00 to 16:00.');
  n({ state: 'published', current: agmV2, versions: [agmV1, agmV2], audience: { scope: 'site', ids: [], roles: ['owner'] }, ackRequired: true, channels: { sms: true, whatsapp: true }, publishedAt: pk('2026-10-22', '16:05'), createdAt: pk('2026-10-22', '15:30') });
  const blockA = site.buildings.find((b) => b.code === 'A')!;
  n({ state: 'scheduled', current: v(1, 'Block A lift maintenance on Thursday 30 October', 'The Block A lift will be out of service on Thursday 30 October from 09:00 to 13:00 for its annual maintenance. Please use the stairs or the Block B lift.', 'maintenance', pk('2026-10-25', '18:00')), audience: { scope: 'blocks', ids: [blockA.id], roles: AUD_ALL }, ackRequired: false, channels: { sms: false, whatsapp: false }, publishAt: pk('2026-10-28', '09:00'), createdAt: pk('2026-10-25', '17:40') });
  n({ state: 'draft', current: v(1, 'Parking stickers for 2027', 'New parking stickers for 2027 will be issued at the office from 1 December. Bring your vehicle registration book.', 'general', pk('2026-10-26', '09:30')), audience: { scope: 'site', ids: [], roles: AUD_ALL }, ackRequired: false, channels: { sms: false, whatsapp: false }, createdAt: pk('2026-10-26', '09:30') });
  n({ state: 'withdrawn', current: v(1, 'Generator fuel contribution', 'Each flat is asked to contribute towards generator fuel for November.', 'finance', pk('2026-10-21', '12:00')), audience: { scope: 'site', ids: [], roles: ['payer'] }, ackRequired: false, channels: { sms: false, whatsapp: false }, publishedAt: pk('2026-10-21', '12:05'), withdrawn: { at: pk('2026-10-22', '09:00'), byName: MANAGER, reason: 'Issued in error; the committee will decide fuel costs at the AGM.' }, createdAt: pk('2026-10-21', '11:50') });
  n({ state: 'published', current: v(1, 'Office timings during Chehlum holidays', 'The society office will be closed on 13 and 14 October. The guard room stays open.', 'general', pk('2026-10-10', '10:00')), audience: { scope: 'site', ids: [], roles: AUD_ALL }, ackRequired: false, channels: { sms: false, whatsapp: false }, publishedAt: pk('2026-10-10', '10:05'), expiresOn: '2026-10-15', createdAt: pk('2026-10-10', '09:45') });
}

function seedBookings(s: OpsState, site: OpsSite) {
  const book = (amenityId: string, flat: string, on: string, slot: string, state: StoredBooking['state'], at: string, guests = 0, extra: Partial<StoredBooking> = {}) => {
    const w = who(site, flat);
    const a = s.amenities.find((x) => x.id === amenityId)!;
    const { id, ref } = nextOf(s, site, 'booking');
    s.bookings.push({ id, ref, amenityId, amenityKind: a.kind, flatCode: flat, flatId: w.flat.id, partyId: w.resident.partyId, name: w.resident.partyName, on, slot, guests, state, at, ...extra });
  };
  book('amn_hall', 'B-306', '2026-11-02', '18:00–23:00', 'requested', pk('2026-10-25', '13:00'), 45);
  book('amn_hall', 'A-201', '2026-10-31', '12:00–16:00', 'approved', pk('2026-10-20', '10:00'), 30, { decidedByName: MANAGER });
  book('amn_gym', 'A-101', '2026-10-27', '06:00', 'confirmed', pk('2026-10-25', '22:00'));
  book('amn_bbq', 'A-404', '2026-10-29', '17:00–20:00', 'declined', pk('2026-10-23', '12:00'), 12, { decidedByName: MANAGER, reason: 'The rooftop is closed for waterproofing until 1 November.' });
}

function seedShalimar(s: OpsState, site: OpsSite) {
  // A maintenance-only client: requests are raised by its staff (no residents in PropertyOS yet).
  const facility = 'Saima Akram';
  const mk = (title: string, category: MaintenanceRequest['category'], where: { flat?: string; area?: string }, created: string, state: MaintenanceRequest['state'], priority: RequestPriority, tech?: string) => {
    const { id, ref } = nextOf(s, site, 'request');
    const flat = where.flat ? site.flats.find((f) => f.code === where.flat) : undefined;
    const area = where.area ? site.areas.find((a) => a.id === where.area) : undefined;
    const r: StoredRequest = {
      id, ref, kind: 'repair', category, title, description: title, siteId: site.siteId, ...(flat ? { flat } : {}), ...(area ? { area } : {}),
      urgency: priority === 'p2' ? 'urgent' : 'normal', state, priority, respondedAt: created, raisedBy: { kind: 'staff', name: facility }, files: [], createdAt: created, updatedAt: created, reopenCount: 0,
      comments: [], history: [ev(created, facility, 'staff', 'submitted'), ev(created, facility, 'staff', 'triaged', { values: { priority } })], affirmations: [], followers: [],
    };
    if (tech) {
      const t = s.technicians.find((x) => x.id === tech)!;
      const wo = nextOf(s, site, 'workOrder');
      s.workOrders.push({ id: wo.id, ref: wo.ref, requestId: id, requestRef: ref, technicianId: t.id, technicianName: t.name, state: state === 'in_progress' ? 'in_progress' : 'assigned', assignedAt: created, assignedByName: facility, history: [ev(created, facility, 'staff', 'assigned', { values: { technician: t.name } })] });
      r.assignee = { technicianId: t.id, name: t.name };
      r.history.push(ev(created, facility, 'staff', 'assigned', { values: { technician: t.name, workOrder: wo.ref } }));
    }
    s.requests.push(r);
  };
  mk('Water pump making grinding noise', 'water', { area: 'area_shc_water_tank' }, pk('2026-10-24', '09:00'), 'assigned', 'p2', 'tech_shc_flow');
  mk('Lobby lights not working, Block N', 'electrical', { area: 'area_shc_n_lobby' }, pk('2026-10-25', '18:20'), 'in_progress', 'p3', 'tech_shc_volt');
  mk('Seepage in N-304 kitchen wall', 'civil', { flat: 'N-304' }, pk('2026-10-26', '08:30'), 'triaged', 'p3');
  return s;
}
