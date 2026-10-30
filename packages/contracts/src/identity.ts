import type { AppId } from './persona';

/**
 * Gate D.1: identity, devices and sessions, resident portal access and invitations, the app switch,
 * households, data exports and privacy requests, and the organisation's colours. Typed mock contracts
 * (A6 §2 conventions): the Laravel API must return the same shapes. Every record is fictional.
 */

// ---------------------------------------------------------------- devices and sessions

export type DevicePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other';
export type DeviceKind = 'desktop' | 'phone' | 'tablet';

export interface DeviceInfo {
  kind: DeviceKind;
  platform: DevicePlatform;
  /** Browser family, e.g. "Chrome" (never the full user-agent string). */
  browser: string;
}

export type SessionState = 'active' | 'signed_out' | 'revoked' | 'expired';

/** How a session ended (who ended it is recorded separately, by principal). */
export type SessionEndReason = 'signed_out' | 'revoked_by_self' | 'signed_out_elsewhere' | 'revoked_by_admin' | 'portal_access_revoked' | 'expired';

export interface SessionRecord {
  id: string;
  principalId: string;
  personaId: string;
  tenantId: string;
  app: Exclude<AppId, 'public'>;
  device: DeviceInfo;
  /** An approximate place from the network (city only), when known. Never an address or coordinates. */
  approxPlace?: string;
  createdAt: string;
  lastActiveAt: string;
  state: SessionState;
  endedAt?: string;
  endReason?: SessionEndReason;
  endedByName?: string;
  /** True for the session the request came from (computed per request, never stored). */
  current: boolean;
}

export type SecurityEventKind =
  | 'signed_in'
  | 'signed_out'
  | 'session_revoked'
  | 'other_sessions_signed_out'
  | 'session_revoked_by_admin'
  | 'switched_app'
  | 'invitation_accepted'
  | 'portal_access_revoked'
  | 'code_failed'
  | 'contact_changed'
  | 'export_requested'
  | 'export_downloaded'
  | 'privacy_request_submitted';

export interface SecurityEvent {
  id: string;
  principalId: string;
  kind: SecurityEventKind;
  at: string;
  app: Exclude<AppId, 'public'>;
  /** Short description of the device, e.g. "Chrome on Windows". */
  deviceLabel?: string;
  /** Who did it when it was not the person themself (an administrator, the office). */
  byName?: string;
  /** Free detail in the person's own words or a record reference (never a secret). */
  detail?: string;
}

/** GET /me/security: the signed-in person's sessions and recent security activity. */
export interface MySecurity {
  sessions: SessionRecord[];
  events: SecurityEvent[];
}

// ---------------------------------------------------------------- profile and app switch

export type ContactChannel = 'sms' | 'whatsapp' | 'email';

export interface ContactConsent {
  channel: ContactChannel;
  /** Recorded consent for service messages on this channel (notices, reminders, invitations). */
  consented: boolean;
  updatedAt?: string;
}

export interface SignInMethod {
  kind: 'password' | 'sms_code' | 'passkey';
  enabled: boolean;
  /** Prototype: every method is simulated; the product uses the identity provider of Gate H. */
  lastUsedAt?: string;
}

/** The other app this person can switch to, when they hold both a staff membership and a verified resident link. */
export interface AppSwitchTarget {
  app: 'backoffice' | 'customer';
  personaId: string;
  /** Translation key of the role on the other side (resident, owner-resident, administrator …). */
  roleKey: string;
}

export interface MyProfile {
  principalId: string;
  displayName: string;
  email: string;
  phone?: string;
  roleKey: string;
  organisation: string;
  /** Resident app: the flats this person's verified links reach (codes only). */
  flats?: string[];
  consents: ContactConsent[];
  signInMethods: SignInMethod[];
  switchTo?: AppSwitchTarget;
}

export interface UpdateContactInput {
  phone?: string;
  email?: string;
  consents?: ContactConsent[];
}

/**
 * A one-time switch to the other app (GLOBAL-015). Created by POST /me/app-switch in one app and
 * redeemed once by POST /app-switch/:token in the other: it carries no data except who and where,
 * expires after two minutes, and the other app starts its own session with its own cache.
 */
export interface AppSwitchTicket {
  token: string;
  app: 'backoffice' | 'customer';
  expiresAt: string;
}

export interface AppSwitchRedeemed {
  personaId: string;
  app: 'backoffice' | 'customer';
  fromApp: 'backoffice' | 'customer';
  /** The person's shared language (D.1 closure), so the other app greets them in it at once. */
  locale?: 'en-PK' | 'ur-PK';
}

// ---------------------------------------------------------------- shared accessibility (D.1 closure)

/**
 * The accessibility essentials kept with the person in an organisation: the same in the office app
 * and the resident app (owner, D.1 closure). Theme, colours, spacing, sounds and tours stay with each
 * app. GET /me/preferences reads them; PATCH /me/preferences keeps the newer change.
 */
export interface SharedAccessibility {
  textScale: number;
  contrast: 'system' | 'standard' | 'more' | 'high';
  motion: 'system' | 'reduce' | 'full';
  reading: boolean;
  fontLatin: 'geist' | 'system' | 'readable';
  fontUrdu: 'naskh' | 'nastaliq';
  locale?: 'en-PK' | 'ur-PK';
}

export interface SharedAccessibilityRecord {
  essentials: SharedAccessibility;
  /** When any of them last changed; the newer change wins across apps. */
  changedAt: string;
  /** When the person chose a text size, so neither app asks again. */
  chosenAt?: string;
}

// ---------------------------------------------------------------- staff users and their sessions (ADM-003)

/** One staff member of the caller's organisation, as an administrator sees them. */
export interface StaffUserRow {
  principalId: string;
  personaId: string;
  name: string;
  email: string;
  roleKey: string;
  activeSessions: number;
  lastActiveAt?: string;
  /** The person also holds a verified resident link in this organisation (they can switch apps). */
  alsoResident: boolean;
}

export interface StaffUserDetail extends StaffUserRow {
  permissions: number;
  sessions: SessionRecord[];
  events: SecurityEvent[];
  canManageSessions: boolean;
  isYou: boolean;
}

// ---------------------------------------------------------------- resident portal access and invitations

export const PORTAL_STATUSES = ['active', 'inactive', 'invited', 'expired', 'not_invited', 'revoked', 'unverified'] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];
export type PortalRole = 'owner' | 'occupant' | 'payer' | 'household';
export type InvitationChannel = ContactChannel | 'printed_code';
export type InvitationState = 'sent' | 'accepted' | 'expired' | 'revoked';

export interface PortalPersonFlat {
  flatId: string;
  flatCode: string;
  roles: PortalRole[];
}

/** One person in RES-007: their verified links, portal status and (for permitted staff) last sign-in. */
export interface PortalAccessRow {
  partyId: string;
  name: string;
  /** Contact shown masked to staff (+92 399 *** 1234), never to residents. */
  phoneMasked?: string;
  emailMasked?: string;
  flats: PortalPersonFlat[];
  buildingIds: string[];
  verified: boolean;
  status: PortalStatus;
  /** Date of the last sign-in (date granularity, D-27), when the person has signed in. */
  lastSignInOn?: string;
  /** Device family of the last sign-in, e.g. "Android phone" (no browser details for residents). */
  lastDevice?: string;
  activeSessions: number;
  invitation?: InvitationSummary;
  consents: ContactConsent[];
}

export interface InvitationSummary {
  id: string;
  channel: InvitationChannel;
  state: InvitationState;
  sentAt: string;
  expiresAt: string;
  sentByName: string;
  resendCount: number;
  /** The demo shows the link a real message would carry (prototype only; nothing is sent). */
  demoLink?: string;
  demoCode?: string;
}

export interface PortalAccessSummary {
  people: number;
  active: number;
  inactive: number;
  invited: number;
  expired: number;
  notInvited: number;
  revoked: number;
  unverified: number;
  /** People who have never signed in (not invited, invited or expired). */
  neverSignedIn: number;
  flats: number;
  vacantFlats: number;
  /** Adoption: flats with at least one active portal user ÷ occupied flats. */
  flatsWithActiveUser: number;
  occupiedFlats: number;
}

export interface PortalAccessList {
  summary: PortalAccessSummary;
  rows: PortalAccessRow[];
  buildings: Array<{ id: string; name: string }>;
  vacant: Array<{ flatId: string; flatCode: string; buildingId: string }>;
}

export interface InviteInput {
  partyIds: string[];
  channel: InvitationChannel;
  /** The flat the invitation is for (optional when the person has one flat). */
  flatId?: string;
}

/** Result per person: invitations are never sent without a verified link and consent for the channel. */
export interface InviteResult {
  sent: Array<{ partyId: string; invitation: InvitationSummary; message: string }>;
  skipped: Array<{ partyId: string; reason: 'not_verified' | 'no_consent' | 'no_contact' | 'already_active' | 'resend_limit' | 'revoked' }>;
}

/** GET /invitations/:token (before sign-in): only what the invitee needs to recognise it. */
export interface InvitationView {
  state: InvitationState | 'not_found';
  organisation?: string;
  site?: string;
  flatCode?: string;
  /** First name only; the full name appears after the code is confirmed. */
  firstName?: string;
  channel?: InvitationChannel;
  /** Masked destination of the confirmation code, e.g. "+92 399 *** 1234". */
  codeSentTo?: string;
  expiresAt?: string;
}

export interface InvitationAccepted {
  personaId: string;
  tenantId: string;
  flatCode: string;
  name: string;
}

// ---------------------------------------------------------------- customer portal sign-in (AUTH-006)

export interface SignInCodeRequest {
  phone: string;
}

/** The code is "sent" (simulated): the prototype shows it on screen, clearly labelled. */
export interface SignInCodeSent {
  challengeId: string;
  sentTo: string;
  demoCode: string;
  expiresAt: string;
  attemptsLeft: number;
}

// ---------------------------------------------------------------- households

export type HouseholdRelationship = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'domestic_staff' | 'other';
export type HouseholdRequestState = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface HouseholdPerson {
  /** A society party, or a household member added by the office. */
  id: string;
  name: string;
  role: PortalRole;
  relationship?: HouseholdRelationship;
  since?: string;
  verified: boolean;
  /** Only for the person themself and permitted staff. */
  isYou?: boolean;
}

export interface FlatHousehold {
  flatId: string;
  flatCode: string;
  buildingName: string;
  occupancy: 'owner_occupied' | 'tenant_occupied' | 'vacant' | 'association_use';
  people: HouseholdPerson[];
}

export interface HouseholdRequest {
  id: string;
  flatId: string;
  flatCode: string;
  name: string;
  relationship: HouseholdRelationship;
  phoneMasked?: string;
  requestedByName: string;
  requestedByPartyId: string;
  requestedAt: string;
  state: HouseholdRequestState;
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
}

export interface AddHouseholdInput {
  flatId: string;
  name: string;
  relationship: HouseholdRelationship;
  phone?: string;
}

// ---------------------------------------------------------------- resident properties (PORTAL-002/003)

export interface MyProperty {
  flatId: string;
  flatCode: string;
  siteName: string;
  buildingName: string;
  floor: number;
  typeName: string;
  areaSqft: number;
  roles: PortalRole[];
  since: string;
  accountNo: string;
  /** What this person owes for this flat now (their own liability), as a decimal string. */
  balance: string;
  balanceState: 'paid_up' | 'due' | 'overdue' | 'credit';
}

export interface PropertyDetail extends MyProperty {
  occupancy: FlatHousehold['occupancy'];
  household: HouseholdPerson[];
  /** Recent bills for this flat that this person is liable for. */
  bills: Array<{ invoiceId: string; reference: string; period: string; amount: string; state: 'paid' | 'partly_paid' | 'due' | 'overdue' }>;
}

// ---------------------------------------------------------------- data exports and privacy requests

export const EXPORT_DATASETS = ['people', 'flats', 'invoices', 'payments', 'bank_lines', 'portal_access', 'audit'] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export type ExportState = 'awaiting_approval' | 'approved' | 'rejected' | 'ready' | 'downloaded' | 'expired' | 'cancelled';

/** Why a dataset is (not) in an export: the requester's own access decides, never the approver's. */
export interface ExportDatasetPreview {
  dataset: ExportDataset;
  included: boolean;
  reason?: 'module_not_licensed' | 'permission_missing' | 'outside_scope' | 'removed_by_approver';
  /** Rows within the requester's scope. */
  rows: number;
  personalData: boolean;
  financialData: boolean;
}

export interface ExportPreview {
  datasets: ExportDatasetPreview[];
  sites: Array<{ id: string; name: string; included: boolean }>;
  personalData: boolean;
  needsApproval: boolean;
}

export interface ExportRequest {
  id: string;
  reference: string;
  requestedByName: string;
  requestedByPrincipal: string;
  requestedAt: string;
  purpose: string;
  format: 'csv' | 'json';
  datasets: ExportDatasetPreview[];
  state: ExportState;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  expiresAt?: string;
  downloadedAt?: string;
  rows: number;
  /** Whether the person asking may approve it (never their own request). */
  canDecide: boolean;
  canDownload: boolean;
}

export interface NewExportInput {
  datasets: ExportDataset[];
  siteIds?: string[];
  purpose: string;
  format: 'csv' | 'json';
}

export interface ExportDecisionInput {
  decision: 'approve' | 'reject';
  /** Approval may only remove datasets (narrow), never add. */
  keep?: ExportDataset[];
  note?: string;
}

/** The simulated file: the rows the requester may see, labelled as demo data. */
export interface ExportFile {
  fileName: string;
  mime: 'text/csv' | 'application/json';
  content: string;
}

export type PrivacyRequestKind = 'access' | 'correction' | 'deletion';
export type PrivacyRequestState = 'submitted' | 'in_review' | 'completed' | 'rejected';

export interface PrivacyRequest {
  id: string;
  reference: string;
  kind: PrivacyRequestKind;
  partyId: string;
  personName: string;
  flatCodes: string[];
  details: string;
  submittedAt: string;
  submittedVia: 'resident_app' | 'office';
  state: PrivacyRequestState;
  /** For deletion: what the law requires to keep (financial records are anonymised, not deleted). */
  retentionOutcome?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  dueBy: string;
}

export interface NewPrivacyRequestInput {
  kind: PrivacyRequestKind;
  details: string;
}

export interface PrivacyDecisionInput {
  decision: 'complete' | 'reject';
  note: string;
}

// ---------------------------------------------------------------- organisation colours (ADM-022)

export type OrgPaletteKey = 'evergreen' | 'ocean' | 'indigo' | 'warm' | 'brand';

export interface OrgAppearanceSettings {
  palette: OrgPaletteKey;
  /** Custom brand colours (white label). Validated against every contrast pair before saving. */
  brand?: { primary: string; primaryHover: string; primarySoft: string; darkPrimary: string; darkPrimaryHover: string; darkPrimarySoft: string };
  /** Whether the organisation licenses the white-label add-on (custom brand colour). */
  whiteLabel: boolean;
  updatedAt?: string;
  updatedByName?: string;
}

export interface UpdateOrgAppearanceInput {
  palette: OrgPaletteKey;
  brandPrimary?: string;
}
