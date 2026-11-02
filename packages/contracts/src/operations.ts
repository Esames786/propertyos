import type { Money } from './money';

/**
 * Gate D.2: resident operations and society maintenance (V3.2 F04, F15 notices, F19). One request
 * entity for flat repairs and community issues (D-28); visitors and the gate; vehicles; official
 * notices that need no community add-on (D-49); occupancy changes with effective dates. Prototype
 * contracts: the mock server enforces every rule, the backend decides the final shape at Gate H.
 */

// ---------------------------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------------------------

/** Who did something: office staff, a resident, a technician, or the scheduled job (simulated). */
export type OpsActorKind = 'staff' | 'resident' | 'technician' | 'system';

export interface OpsEvent {
  at: string;
  byName: string;
  byKind: OpsActorKind;
  /** Key of the event in the screen's namespace (e.g. `submitted`, `assigned`, `checked_in`). */
  action: string;
  /** Free text exactly as typed (never translated). */
  note?: string;
  values?: Record<string, string>;
}

/** A fictional photo or document kept in the demo session (never uploaded anywhere). */
export interface OpsFile {
  id: string;
  name: string;
  type: string;
  sizeBytes: number;
  /** What the photo shows, for screen readers (asked when a photo is added). */
  alt: string;
}

/** A flat as the operations screens show it. */
export interface OpsFlat {
  id: string;
  code: string;
  buildingId: string;
  buildingCode: string;
  floor: number;
}

/** A shared place of the site (lobby, lift, water tank …), optionally in one block. */
export interface CommonArea {
  id: string;
  /** Key under `operations:area.*`. */
  key: string;
  buildingId?: string;
  buildingCode?: string;
}

// ---------------------------------------------------------------------------------------------
// Requests: flat repairs and community issues (MNT-001…013, PORTAL-018, PORTAL-034/035)
// ---------------------------------------------------------------------------------------------

export const REQUEST_KINDS = ['repair', 'community_issue'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_CATEGORIES = ['plumbing', 'electrical', 'carpentry', 'civil', 'lift', 'water', 'cleaning', 'security', 'pest_control', 'common_area', 'other'] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

/** How urgent the resident says it is (triage sets the priority). */
export const REQUEST_URGENCIES = ['low', 'normal', 'urgent', 'emergency'] as const;
export type RequestUrgency = (typeof REQUEST_URGENCIES)[number];

/** Triage priority: decides the service levels (response and resolution targets). */
export const REQUEST_PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const REQUEST_STATES = ['submitted', 'triaged', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed', 'resolved', 'cancelled', 'merged', 'hidden'] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

/** States in which the request still needs someone's work (SLA clocks run). */
export const OPEN_REQUEST_STATES: readonly RequestState[] = ['submitted', 'triaged', 'assigned', 'in_progress', 'on_hold', 'completed'];

export const FLAT_ROOMS = ['kitchen', 'bathroom', 'bedroom', 'living_room', 'balcony', 'whole_flat', 'other'] as const;
export type FlatRoom = (typeof FLAT_ROOMS)[number];

export const CONTACT_PREFERENCES = ['app', 'phone', 'whatsapp'] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const ENTRY_PERMISSIONS = ['when_home', 'call_first', 'with_guard'] as const;
export type EntryPermission = (typeof ENTRY_PERMISSIONS)[number];

/** Service levels for a priority (illustrative defaults; the society sets its own). */
export interface SlaTarget {
  priority: RequestPriority;
  respondHours: number;
  resolveHours: number;
}

export type SlaStatus = 'on_track' | 'at_risk' | 'breached' | 'met' | 'missed' | 'paused';

export interface RequestSla {
  priority: RequestPriority;
  respondBy: string;
  resolveBy: string;
  respondedAt?: string;
  /** Response target (triage): status now or how it ended. */
  response: SlaStatus;
  /** Resolution target (work completed): status now or how it ended. */
  resolution: SlaStatus;
}

/**
 * public: the resident(s) see it; internal: the office only; assignee: the office and the technician or
 * contractor assigned now (owner ruling, Issue #8: a contractor sees only what was shared with them).
 */
export type RequestCommentVisibility = 'public' | 'internal' | 'assignee';

export interface RequestComment {
  id: string;
  at: string;
  byName: string;
  byKind: OpsActorKind;
  visibility: RequestCommentVisibility;
  text: string;
  /** Moderated (community issues): hidden from residents with a reason; staff still see it. */
  hidden?: { at: string; byName: string; reason: string };
}

export const WORK_ORDER_STATES = ['assigned', 'accepted', 'in_progress', 'on_hold', 'done', 'cancelled'] as const;
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number];

export const TECHNICIAN_TRADES = ['electrical', 'plumbing', 'carpentry', 'civil', 'lift', 'general'] as const;
export type TechnicianTrade = (typeof TECHNICIAN_TRADES)[number];

export interface Technician {
  id: string;
  name: string;
  trade: TechnicianTrade;
  /** Staff technician (has a sign-in) or an outside vendor (the office updates their jobs). */
  kind: 'staff' | 'vendor';
  principalId?: string;
  vendorName?: string;
  /** Open work orders now. */
  load: number;
  available: boolean;
}

export interface WorkOrder {
  id: string;
  ref: string;
  requestId: string;
  requestRef: string;
  technicianId: string;
  technicianName: string;
  state: WorkOrderState;
  /** Visit booked with the resident (calendar date and time window). */
  scheduledOn?: string;
  slot?: 'morning' | 'afternoon' | 'evening';
  instructions?: string;
  assignedAt: string;
  assignedByName: string;
  completion?: { at: string; byName: string; note: string; files: OpsFile[] };
  history: OpsEvent[];
}

export type ResidentConfirmation = 'awaiting' | 'confirmed' | 'reopened' | 'closed_by_office';

export interface MaintenanceRequest {
  id: string;
  ref: string;
  kind: RequestKind;
  category: RequestCategory;
  title: string;
  description: string;
  siteId: string;
  /** A repair's flat. */
  flat?: OpsFlat;
  room?: FlatRoom;
  /** A community issue's place. */
  area?: CommonArea;
  urgency: RequestUrgency;
  state: RequestState;
  sla?: RequestSla;
  /** Who raised it (staff see the name; residents see only their own). */
  raisedBy: { kind: 'resident' | 'staff'; name: string; partyId?: string };
  contact?: { preference: ContactPreference; entry: EntryPermission; preferredOn?: string };
  files: OpsFile[];
  createdAt: string;
  updatedAt: string;
  assignee?: { technicianId: string; name: string };
  confirmation?: ResidentConfirmation;
  reopenCount: number;
  /** Community issue: merged into another (its affirmations moved there). */
  mergedInto?: { id: string; ref: string };
  mergedFrom?: Array<{ id: string; ref: string }>;
  /** Community issue: summary shown to residents (moderated), and who may see it. */
  publicSummary?: string;
  visibility?: 'site' | 'block';
  hidden?: { at: string; byName: string; reason: string };
  /** Satisfaction given at confirmation (1–5), optional. */
  rating?: number;
}

/** A row of the request list (MNT-002). */
export interface RequestRow {
  id: string;
  ref: string;
  kind: RequestKind;
  category: RequestCategory;
  title: string;
  state: RequestState;
  urgency: RequestUrgency;
  priority?: RequestPriority;
  where: string;
  flatId?: string;
  createdAt: string;
  assigneeName?: string;
  sla?: Pick<RequestSla, 'response' | 'resolution' | 'resolveBy'>;
  confirmation?: ResidentConfirmation;
  reopenCount: number;
  /** Community issue: affected households (staff count, live). */
  affected?: number;
}

export interface RequestList {
  items: RequestRow[];
  counts: Record<'all' | 'open' | 'unassigned' | 'breached' | 'awaiting_confirmation' | 'closed', number>;
  kindCounts: Record<RequestKind, number>;
}

export interface RequestActions {
  triage: boolean;
  assign: boolean;
  /** The signed-in technician's own work order may move on. */
  progress: boolean;
  complete: boolean;
  closeForResident: boolean;
  cancel: boolean;
  comment: boolean;
  commentInternal: boolean;
  /** Share a comment with the assigned technician or contractor (the office, while a job is assigned). */
  commentAssignee: boolean;
  merge: boolean;
  moderate: boolean;
  resolve: boolean;
  /** Why the main action is not offered (suspended, not licensed, not yours …). */
  reason?: string;
}

/** Affected households of a community issue (staff view: live, with who; D-47 for residents). */
export interface IssueAffected {
  live: { site: number; blocks: Record<string, number> };
  audience: { site: number; blocks: Record<string, number> };
  /** Staff only: who said "this affects me too" (never shown to residents). */
  households: Array<{ flatCode: string; name: string; at: string; withdrawnAt?: string; fromMerge?: string }>;
  /** What residents currently see (the last scheduled snapshot, after the threshold rules). */
  residentView: ResidentCount;
  snapshotAt?: string;
}

/** A count as residents see it (D-47): a number only when every rule allows, otherwise "Reported". */
export type ResidentCount =
  | { shown: false; reason: 'below_threshold' | 'audience_too_small' | 'no_snapshot' }
  | { shown: true; site: number; blocks: Array<{ code: string; count: number }>; asOf: string };

export interface RequestDetail {
  request: MaintenanceRequest;
  workOrders: WorkOrder[];
  comments: RequestComment[];
  history: OpsEvent[];
  actions: RequestActions;
  affected?: IssueAffected;
  /** Linked records the person may open (Flat 360, account, earlier requests of the flat). */
  related: Array<{ kind: 'flat' | 'request' | 'issue' | 'person'; id: string; label: string }>;
  technicians?: Technician[];
}

export interface NewRequestInput {
  kind: RequestKind;
  category: RequestCategory;
  title: string;
  description: string;
  flatId?: string;
  room?: FlatRoom;
  areaId?: string;
  urgency: RequestUrgency;
  contact?: { preference: ContactPreference; entry: EntryPermission; preferredOn?: string };
  files?: Array<Omit<OpsFile, 'id'>>;
  /** Staff raising for a resident: the resident's party (optional). */
  onBehalfOf?: string;
  idempotencyKey?: string;
}

export interface MaintenanceDashboard {
  asOf: string;
  open: number;
  unassigned: number;
  breached: number;
  atRisk: number;
  awaitingConfirmation: number;
  reopened: number;
  closedThisWeek: number;
  communityIssues: number;
  byCategory: Array<{ category: RequestCategory; open: number }>;
  byTechnician: Array<{ technicianId: string; name: string; open: number; trade: TechnicianTrade }>;
  needsAttention: RequestRow[];
  slaTargets: SlaTarget[];
  /** Resident confirmation (MNT-008): first-time fix and satisfaction. */
  confirmation: { confirmed: number; reopened: number; awaiting: number; averageRating?: string };
}

export interface SlaDashboard {
  asOf: string;
  targets: SlaTarget[];
  response: Record<SlaStatus, number>;
  resolution: Record<SlaStatus, number>;
  byPriority: Array<{ priority: RequestPriority; open: number; breached: number; atRisk: number; met: number; missed: number }>;
  breaches: RequestRow[];
  atRisk: RequestRow[];
}

export interface TechnicianBoard {
  asOf: string;
  technicians: Array<Technician & { jobs: Array<WorkOrder & { flatCode?: string; areaKey?: string; title: string; priority?: RequestPriority; sla?: Pick<RequestSla, 'resolution' | 'resolveBy'> }> }>;
  /** Only the signed-in technician's own jobs (technicians see nobody else's). */
  ownOnly: boolean;
}

// Resident side ---------------------------------------------------------------------------------

/** A resident's view of a request: public comments only, no internal notes, no other resident. */
export interface ResidentRequest {
  id: string;
  ref: string;
  kind: RequestKind;
  category: RequestCategory;
  title: string;
  description: string;
  flatCode?: string;
  room?: FlatRoom;
  area?: CommonArea;
  urgency: RequestUrgency;
  state: RequestState;
  createdAt: string;
  updatedAt: string;
  files: OpsFile[];
  visit?: { on?: string; slot?: WorkOrder['slot']; technicianName: string };
  completion?: { at: string; note: string; files: OpsFile[] };
  confirmation?: ResidentConfirmation;
  reopenCount: number;
  comments: Array<Pick<RequestComment, 'id' | 'at' | 'byKind' | 'text'> & { byName: string }>;
  timeline: Array<Pick<OpsEvent, 'at' | 'action'>>;
  canConfirm: boolean;
  canCancel: boolean;
  canComment: boolean;
}

/** MNT-004: the flats a request can be raised for, with who lives in or owns each today (names only). */
export interface OpsFlatPeople {
  siteId: string;
  flats: Array<{ id: string; code: string; people: Array<{ partyId: string; partyName: string; role: 'owner' | 'occupant' }> }>;
}

export interface ResidentRequests {
  asOf: string;
  flats: Array<{ id: string; code: string; roles: Array<'owner' | 'occupant' | 'payer'> }>;
  /** Flats the resident may raise a repair for (owner or occupant today). */
  canRaiseFor: string[];
  items: ResidentRequest[];
  areas: CommonArea[];
}

/** A community issue as a resident sees it (PORTAL-034): never who else is affected. */
export interface ResidentIssue {
  id: string;
  ref: string;
  category: RequestCategory;
  title: string;
  summary: string;
  area?: CommonArea;
  state: RequestState;
  createdAt: string;
  updatedAt: string;
  /** "Reported" or a scheduled snapshot count (D-47). */
  count: ResidentCount;
  /** The resident's own "this affects me too" (shown at once). */
  affirmed: boolean;
  following: boolean;
  /** The resident raised it. */
  mine: boolean;
  nearMe: boolean;
  mergedInto?: { id: string; ref: string };
  comments: Array<{ id: string; at: string; byKind: OpsActorKind; byName: string; text: string }>;
}

export interface ResidentIssues {
  asOf: string;
  /** When resident-visible counts were last refreshed (scheduled, simulated). */
  snapshotAt?: string;
  refresh: string;
  items: ResidentIssue[];
  areas: CommonArea[];
}

// ---------------------------------------------------------------------------------------------
// Visitors and the gate (VIS-001…007, PORTAL-015 visitors tab, PORTAL-040)
// ---------------------------------------------------------------------------------------------

export const GATE_PURPOSES = ['guest', 'family', 'delivery', 'service', 'cab', 'other'] as const;
export type GatePurpose = (typeof GATE_PURPOSES)[number];

export const PASS_STATES = ['scheduled', 'active', 'checked_in', 'checked_out', 'expired', 'cancelled'] as const;
export type PassState = (typeof PASS_STATES)[number];

export interface GatePass {
  id: string;
  ref: string;
  /** Code the visitor shows at the gate (Latin digits). */
  code: string;
  siteId: string;
  flat: OpsFlat;
  hostPartyId: string;
  hostName: string;
  visitorName: string;
  visitorPhone?: string;
  purpose: GatePurpose;
  vehiclePlate?: string;
  from: string;
  to: string;
  entries: 'single' | 'multiple';
  state: PassState;
  createdAt: string;
  /** Number of times this pass was used to come in. */
  usedCount: number;
  note?: string;
  history: OpsEvent[];
}

export const GATE_REQUEST_STATES = ['waiting', 'approved', 'denied', 'expired', 'withdrawn'] as const;
export type GateRequestState = (typeof GATE_REQUEST_STATES)[number];

/** A visitor at the gate without a pass: the occupants of the flat are asked (PORTAL-040). */
export interface GateRequest {
  id: string;
  ref: string;
  siteId: string;
  flat: OpsFlat;
  visitorName: string;
  purpose: GatePurpose;
  vehiclePlate?: string;
  state: GateRequestState;
  createdAt: string;
  expiresAt: string;
  guardName: string;
  /** How many current occupants were asked (staff see the number, never phone numbers). */
  askedCount: number;
  decidedAt?: string;
  decidedByName?: string;
  /** "Ask the guard to call me" was pressed. */
  callRequested?: boolean;
  history: OpsEvent[];
}

export const VISIT_OUTCOMES = ['inside', 'left', 'refused'] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const REFUSAL_REASONS = ['unknown_code', 'expired', 'not_yet_valid', 'already_used', 'cancelled', 'denied_by_resident', 'request_expired', 'host_not_resident', 'other_site'] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/** One arrival at the gate (VIS-005 history). */
export interface GateVisit {
  id: string;
  ref: string;
  siteId: string;
  flatCode: string;
  visitorName: string;
  purpose: GatePurpose;
  vehiclePlate?: string;
  passId?: string;
  passRef?: string;
  gateRequestId?: string;
  outcome: VisitOutcome;
  refusal?: RefusalReason;
  checkedInAt?: string;
  checkedOutAt?: string;
  at: string;
  guardName: string;
}

export interface GateQueue {
  asOf: string;
  /** "Updated hh:mm · refreshes every 15 s (simulated)". */
  refreshedAt: string;
  refreshSeconds: number;
  waiting: GateRequest[];
  expected: GatePass[];
  inside: GateVisit[];
  recent: GateVisit[];
  /** The live queue needs the visitors.live_queue feature. */
  liveQueue: boolean;
  /** Flats the guard may name for a walk-in (codes only: the gate never sees who pays). */
  flats: Array<{ id: string; code: string }>;
}

export type CheckInResult =
  | { ok: true; visit: GateVisit; pass: GatePass }
  | { ok: false; refusal: RefusalReason; visit: GateVisit; pass?: Pick<GatePass, 'id' | 'ref' | 'visitorName' | 'flat' | 'from' | 'to' | 'state'> };

export interface VisitorDashboard {
  asOf: string;
  expectedToday: number;
  inside: number;
  waiting: number;
  refusedToday: number;
  passesActive: number;
  visitsThisWeek: number;
  byPurpose: Array<{ purpose: GatePurpose; count: number }>;
  recent: GateVisit[];
}

export interface PassList {
  items: GatePass[];
  counts: Record<'all' | PassState, number>;
}

export interface ResidentVisitors {
  asOf: string;
  /** Flats where the resident lives today (only occupants invite and are asked at the gate). */
  flats: Array<{ id: string; code: string }>;
  passes: GatePass[];
  requests: GateRequest[];
  visits: GateVisit[];
  liveQueue: boolean;
}

export interface NewPassInput {
  flatId: string;
  visitorName: string;
  visitorPhone?: string;
  purpose: GatePurpose;
  vehiclePlate?: string;
  from: string;
  to: string;
  entries: 'single' | 'multiple';
  note?: string;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------------------------
// Vehicles and parking (PARK-005, PARK-007, PORTAL-021, PORTAL-026)
// ---------------------------------------------------------------------------------------------

export const VEHICLE_KINDS = ['car', 'motorbike', 'other'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const VEHICLE_STATES = ['pending', 'approved', 'rejected', 'retired'] as const;
export type VehicleState = (typeof VEHICLE_STATES)[number];

export interface Vehicle {
  id: string;
  ref: string;
  /** Normalised plate (upper case, single spaces), shown as entered. */
  plate: string;
  kind: VehicleKind;
  make: string;
  colour: string;
  siteId: string;
  flat: OpsFlat;
  ownerPartyId: string;
  ownerName: string;
  state: VehicleState;
  slot?: string;
  submittedAt: string;
  decidedAt?: string;
  decidedByName?: string;
  reason?: string;
  history: OpsEvent[];
}

export interface VehicleList {
  items: Vehicle[];
  counts: Record<'all' | VehicleState, number>;
}

/** What the approver checks before deciding (PARK-007). */
export interface VehicleCheck {
  vehicle: Vehicle;
  /** Another approved vehicle has this plate. */
  duplicateOf?: { id: string; ref: string; flatCode: string };
  /** Pending submissions with the same plate. */
  pendingSame: number;
  /** The owner still lives in (or owns) the flat today. */
  linkInForce: boolean;
  /** Approved vehicles of the flat and the flat's allowance. */
  flatVehicles: number;
  allowance: number;
  freeSlots: string[];
  canApprove: boolean;
  reason?: 'duplicate_plate' | 'link_ended' | 'allowance_full' | 'not_pending' | 'suspended';
}

export interface ResidentParking {
  asOf: string;
  flats: Array<{ id: string; code: string; slots: string[]; allowance: number }>;
  vehicles: Vehicle[];
  visitorParking: string;
  rules: string[];
}

export interface NewVehicleInput {
  flatId: string;
  plate: string;
  kind: VehicleKind;
  make: string;
  colour: string;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------------------------
// Official notices and messages (RES-005, NOT-003, PORTAL-023/042/043)
// ---------------------------------------------------------------------------------------------

export const NOTICE_CATEGORIES = ['general', 'maintenance', 'water', 'electricity', 'security', 'meeting', 'finance', 'event'] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

export const NOTICE_STATES = ['draft', 'scheduled', 'published', 'withdrawn', 'expired'] as const;
export type NoticeState = (typeof NOTICE_STATES)[number];

export const AUDIENCE_ROLES = ['owner', 'occupant', 'payer'] as const;
export type AudienceRole = (typeof AUDIENCE_ROLES)[number];

/** Who a notice is for: a part of the site and the relationship to the flat (from verified links). */
export interface NoticeAudience {
  scope: 'site' | 'blocks' | 'floors' | 'units';
  /** Building ids (blocks), floor ids (floors) or flat ids (units). Empty for the site. */
  ids: string[];
  roles: AudienceRole[];
}

export interface NoticeVersion {
  version: number;
  title: string;
  body: string;
  category: NoticeCategory;
  at: string;
  byName: string;
  /** Recipients were notified again for this version. */
  renotified: boolean;
  changeNote?: string;
}

export type DeliveryState = 'delivered' | 'no_app_account' | 'withdrawn';
export type MessageCopyState = 'sent_simulated' | 'no_consent' | 'not_licensed' | 'not_chosen';

export interface NoticeRecipient {
  partyId: string;
  name: string;
  flatCodes: string[];
  roles: AudienceRole[];
  inApp: DeliveryState;
  sms: MessageCopyState;
  whatsapp: MessageCopyState;
  readAt?: string;
  acknowledgedAt?: string;
  acknowledgedVersion?: number;
  /** No longer in the audience (moved out, link ended): their notification is withdrawn. */
  leftAudience?: boolean;
}

export interface Notice {
  id: string;
  ref: string;
  siteId: string;
  state: NoticeState;
  current: NoticeVersion;
  versions: NoticeVersion[];
  audience: NoticeAudience;
  audienceLabel: string;
  ackRequired: boolean;
  channels: { sms: boolean; whatsapp: boolean };
  publishAt?: string;
  publishedAt?: string;
  expiresOn?: string;
  withdrawn?: { at: string; byName: string; reason: string };
  createdAt: string;
  createdByName: string;
  /** From a quick broadcast (NOT-003) posted as a notice. */
  fromMessage?: { id: string; ref: string };
  history: OpsEvent[];
}

export interface NoticeStats {
  recipients: number;
  delivered: number;
  read: number;
  acknowledged: number;
  noAppAccount: number;
  smsSent: number;
  whatsappSent: number;
  leftAudience: number;
}

export interface NoticeRow {
  id: string;
  ref: string;
  title: string;
  category: NoticeCategory;
  state: NoticeState;
  version: number;
  audienceLabel: string;
  ackRequired: boolean;
  publishedAt?: string;
  publishAt?: string;
  stats?: NoticeStats;
}

export interface NoticeList {
  items: NoticeRow[];
  counts: Record<'published' | 'scheduled' | 'draft' | 'withdrawn' | 'expired', number>;
}

export interface NoticeDetail {
  notice: Notice;
  stats?: NoticeStats;
  /** Staff only. */
  recipients: NoticeRecipient[];
  /** Flats not yet acknowledged (staff only). */
  unacknowledgedFlats: string[];
  actions: { publish: boolean; edit: boolean; withdraw: boolean; reason?: string };
}

export interface AudiencePreview {
  label: string;
  households: number;
  people: number;
  byRole: Record<AudienceRole, number>;
  withAppAccount: number;
  smsConsent: number;
  whatsappConsent: number;
  /** Flat codes in the audience (staff only, for checking). */
  flats: string[];
}

export interface NoticeInput {
  title: string;
  body: string;
  category: NoticeCategory;
  audience: NoticeAudience;
  ackRequired: boolean;
  channels: { sms: boolean; whatsapp: boolean };
  /** ISO date-time to publish later (scheduled), or absent to publish now / keep as draft. */
  publishAt?: string;
  expiresOn?: string;
  /** Edit of a published notice: notify recipients again. */
  renotify?: boolean;
  changeNote?: string;
  idempotencyKey?: string;
}

/** A quick one-way broadcast (NOT-003); optionally posted as an official notice too. */
export interface BroadcastMessage {
  id: string;
  ref: string;
  siteId: string;
  text: string;
  audience: NoticeAudience;
  audienceLabel: string;
  channels: { sms: boolean; whatsapp: boolean };
  sentAt: string;
  sentByName: string;
  notice?: { id: string; ref: string };
  totals: { recipients: number; inApp: number; noAppAccount: number; sms: number; whatsapp: number; skippedNoConsent: number };
}

export interface BroadcastInput {
  text: string;
  audience: NoticeAudience;
  channels: { sms: boolean; whatsapp: boolean };
  alsoNotice: boolean;
  noticeTitle?: string;
  idempotencyKey?: string;
}

// Resident side ---------------------------------------------------------------------------------

export type ResidentNoticeState = 'unread' | 'read' | 'acknowledged' | 'withdrawn';

export interface ResidentNotice {
  id: string;
  ref: string;
  state: ResidentNoticeState;
  /** Absent when withdrawn (tombstone: no content). */
  title?: string;
  body?: string;
  category?: NoticeCategory;
  version?: number;
  updatedOn?: string;
  publishedAt: string;
  ackRequired: boolean;
  acknowledgedAt?: string;
  withdrawn?: { at: string };
}

export interface ResidentNotices {
  asOf: string;
  items: ResidentNotice[];
  counts: { unread: number; needsAck: number };
}

/** PORTAL-043: a notice, or why it cannot be shown (the audience is checked on every open). */
export type ResidentNoticeOpen = { available: true; notice: ResidentNotice } | { available: false; reason: 'not_in_audience' | 'not_found' };

export const NOTIFICATION_KINDS = ['notice', 'message', 'request', 'gate', 'vehicle', 'booking', 'chat', 'poll'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface ResidentNotification {
  id: string;
  kind: NotificationKind;
  /** Key under `operations:notify.*` with its values (titles typed by staff stay as typed). */
  key: string;
  values: Record<string, string>;
  at: string;
  read: boolean;
  withdrawn?: boolean;
  /** Where it opens in the resident app. */
  href: string;
}

export interface ResidentNotifications {
  asOf: string;
  items: ResidentNotification[];
  unread: number;
}

// ---------------------------------------------------------------------------------------------
// Occupancy changes, residents dashboard, amenities, online gateway (sandbox)
// ---------------------------------------------------------------------------------------------

/** An effective-dated move: an occupant leaves a flat. Liability and app invitations never follow it. */
export interface MoveRecord {
  id: string;
  ref: string;
  flatId: string;
  flatCode: string;
  kind: 'move_out';
  partyId: string;
  partyName: string;
  effectiveOn: string;
  reason: string;
  recordedAt: string;
  recordedByName: string;
}

export interface MoveInput {
  flatId: string;
  partyId: string;
  effectiveOn: string;
  reason: string;
}

export interface ResidentsDashboard {
  asOf: string;
  flats: number;
  occupied: number;
  vacant: number;
  ownerOccupied: number;
  tenantOccupied: number;
  appAccounts: number;
  openRequests: number;
  communityIssues: number;
  visitorsToday: number;
  vehiclesPending: number;
  noticesAwaitingAck: number;
  bookingRequests: number;
  recentMoves: MoveRecord[];
  latestNotices: NoticeRow[];
  bookings: AmenityBooking[];
}

export const AMENITY_KINDS = ['gym', 'hall', 'pool', 'kids_play', 'bbq'] as const;
export type AmenityKind = (typeof AMENITY_KINDS)[number];

export interface Amenity {
  id: string;
  kind: AmenityKind;
  hours: string;
  booking: 'none' | 'instant' | 'request';
  /**
   * Who may book (owner ruling, Issue #8): the people who live in a flat by default; an owner who
   * lives elsewhere only where this amenity's policy allows it.
   */
  bookers: AmenityBookers;
  capacity: number;
  fee?: Money;
  rules: string[];
  slots: string[];
}

export type AmenityBookers = 'residents' | 'residents_and_owners';

export type BookingState = 'confirmed' | 'requested' | 'approved' | 'declined' | 'cancelled';

export interface AmenityBooking {
  id: string;
  ref: string;
  amenityId: string;
  amenityKind: AmenityKind;
  flatCode: string;
  name: string;
  on: string;
  slot: string;
  guests: number;
  state: BookingState;
  at: string;
  decidedByName?: string;
  reason?: string;
}

export interface ResidentAmenities {
  asOf: string;
  amenities: Amenity[];
  bookings: AmenityBooking[];
  /** The resident's flats; `lives`: they live there today (an owner who lives elsewhere does not). */
  flats: Array<{ id: string; code: string; lives: boolean }>;
  /** Booked slots per amenity and date (no names: only that a slot is taken). */
  taken: Array<{ amenityId: string; on: string; slot: string }>;
}

export const GATEWAY_EVENT_RESULTS = ['accepted_not_settled', 'refused_signature', 'refused_duplicate', 'refused_mode_off'] as const;
export type GatewayEventResult = (typeof GATEWAY_EVENT_RESULTS)[number];

/** BILL-011 (sandbox only): settings and the test events received. Nothing is ever "Paid" from here. */
export interface GatewaySettings {
  siteId: string;
  mode: 'off' | 'sandbox';
  provider: string;
  merchantId: string;
  methods: Array<'card' | 'wallet' | 'bank_account'>;
  feeBearer: 'society' | 'resident';
  updatedAt?: string;
  updatedByName?: string;
  events: Array<{ id: string; at: string; eventId: string; flatCode: string; amount: Money; signature: 'valid' | 'invalid'; result: GatewayEventResult; byName: string }>;
  canManage: boolean;
}
