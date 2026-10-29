import type {
  ContactConsent,
  DeviceInfo,
  ExportDatasetPreview,
  ExportState,
  HouseholdRelationship,
  HouseholdRequest,
  InvitationChannel,
  InvitationState,
  OrgPaletteKey,
  PrivacyRequest,
  SecurityEventKind,
  SessionEndReason,
  SessionState,
} from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import { ALL_PERSONAS, ALNOOR_RESIDENTS } from '../people';
import { pad } from '../seed';
import { alnoorRegisterPeople, invitedPrincipalId, REGISTER_TODAY } from './register-people';

/**
 * Gate D.1 identity state, kept in each organisation's demo partition (section 'identity'). For the
 * society demo that partition is shared with the resident app of this browser, so a session started
 * on the phone, an invitation accepted or a switch between apps is seen by the office at once.
 * Seeded deterministically the first time it is read; everything after that is what the visitor did.
 */
export interface StoredSession {
  id: string;
  principalId: string;
  personaId: string;
  app: 'backoffice' | 'customer' | 'platform';
  device: DeviceInfo;
  approxPlace?: string;
  createdAt: string;
  lastActiveAt: string;
  state: SessionState;
  endedAt?: string;
  endReason?: SessionEndReason;
  endedByName?: string;
  /** A fixture session (another device of the person), not this browser. */
  seeded?: boolean;
}

export interface StoredEvent {
  id: string;
  principalId: string;
  kind: SecurityEventKind;
  at: string;
  app: StoredSession['app'];
  deviceLabel?: string;
  byName?: string;
  detail?: string;
}

export interface StoredInvitation {
  id: string;
  token: string;
  partyId: string;
  flatId: string;
  channel: InvitationChannel;
  state: InvitationState;
  sentAt: string;
  expiresOn: string;
  sentBy: string;
  sentByName: string;
  resendCount: number;
  resendDates: string[];
  acceptedAt?: string;
  revokedAt?: string;
  revokedByName?: string;
}

export interface PortalAccount {
  status: 'active' | 'revoked';
  since: string;
  lastSignInAt?: string;
  lastDevice?: DeviceInfo;
  revokedAt?: string;
  revokedByName?: string;
}

export interface Challenge {
  id: string;
  kind: 'sign_in' | 'invitation';
  partyId: string;
  token?: string;
  code: string;
  expiresAtMs: number;
  attemptsLeft: number;
  verified: boolean;
}

export interface SwitchTicket {
  token: string;
  principalId: string;
  fromApp: 'backoffice' | 'customer';
  toApp: 'backoffice' | 'customer';
  personaId: string;
  expiresAtMs: number;
  used: boolean;
}

export interface StoredHouseholdMember {
  id: string;
  flatId: string;
  name: string;
  relationship: HouseholdRelationship;
  addedOn: string;
  verified: boolean;
}

export interface StoredExport {
  id: string;
  reference: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  purpose: string;
  format: 'csv' | 'json';
  siteIds: string[];
  datasets: ExportDatasetPreview[];
  state: ExportState;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  expiresOn?: string;
  downloadedAt?: string;
}

export interface IdentityState {
  version: 1;
  seq: number;
  sessions: StoredSession[];
  events: StoredEvent[];
  invitations: StoredInvitation[];
  /** Resident portal accounts by party (societies with portal access management). */
  portal: Record<string, PortalAccount>;
  challenges: Challenge[];
  switches: SwitchTicket[];
  /** Contact details and consents by principal (staff and residents edit their own). */
  contacts: Record<string, { phone?: string; email?: string; consents: ContactConsent[] }>;
  household: { members: StoredHouseholdMember[]; requests: HouseholdRequest[] };
  exports: StoredExport[];
  /** Whether the demo's example export request was added (once per organisation). */
  exportsSeeded?: boolean;
  privacy: PrivacyRequest[];
  appearance?: { palette: OrgPaletteKey; brandPrimary?: string; updatedAt: string; updatedByName: string };
}

/** Days before or after the demo's "today", as a calendar date. */
export const dayOffset = (days: number, from = REGISTER_TODAY) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const at = (days: number, time = '09:30:00') => `${dayOffset(days)}T${time}Z`;
/** The demo's date with the real time of day (the same convention as the society screens). */
export const nowStamp = (ctx: Pick<HandlerContext, 'at'>) => `${ctx.at}T${new Date().toISOString().slice(11)}`;

const DEVICES: Record<string, DeviceInfo> = {
  officePc: { kind: 'desktop', platform: 'windows', browser: 'Edge' },
  laptop: { kind: 'desktop', platform: 'macos', browser: 'Safari' },
  android: { kind: 'phone', platform: 'android', browser: 'Chrome' },
  iphone: { kind: 'phone', platform: 'ios', browser: 'Safari' },
  tablet: { kind: 'tablet', platform: 'android', browser: 'Chrome' },
};

/** Consents recorded when the register was imported (service messages only; marketing never). */
const DEFAULT_CONSENTS = (sms: boolean, whatsapp: boolean, email: boolean): ContactConsent[] => [
  { channel: 'sms', consented: sms, updatedAt: '2026-10-15T10:30:00Z' },
  { channel: 'whatsapp', consented: whatsapp, updatedAt: '2026-10-15T10:30:00Z' },
  { channel: 'email', consented: email, updatedAt: '2026-10-15T10:30:00Z' },
];

const PLACES = ['Lahore', 'Lahore', 'Islamabad', 'Karachi'];

/**
 * The first state of an organisation: other devices of its people (fixture sessions), their recent
 * security activity, and, for the society, the resident portal as it stood on the demo's "today".
 */
export function seedIdentity(tenantId: string): IdentityState {
  const s: IdentityState = { version: 1, seq: 0, sessions: [], events: [], invitations: [], portal: {}, challenges: [], switches: [], contacts: {}, household: { members: [], requests: [] }, exports: [], privacy: [] };
  const people = ALL_PERSONAS.filter((p) => p.tenantId === tenantId && !p.unlisted && p.app !== 'platform');
  people.forEach((p, i) => {
    const app = p.app as StoredSession['app'];
    const devices = app === 'customer' ? [DEVICES.android!, DEVICES.iphone!] : [DEVICES.officePc!, DEVICES.android!];
    devices.forEach((device, k) => {
      const id = `ses_seed_${p.id}_${k + 1}`;
      const last = at(-(k * 3 + (i % 3)), k ? '18:05:00' : '08:42:00');
      s.sessions.push({ id, principalId: p.principalId, personaId: p.id, app, device, approxPlace: PLACES[(i + k) % PLACES.length]!, createdAt: at(-(k * 3 + 20 + i)), lastActiveAt: last, state: 'active', seeded: true });
      s.events.push({ id: `evt_seed_${p.id}_${k + 1}`, principalId: p.principalId, kind: 'signed_in', at: last, app, deviceLabel: `${device.browser} · ${device.platform}` });
    });
    // An older laptop session the person already signed out of (history, not a live device).
    s.sessions.push({ id: `ses_seed_${p.id}_old`, principalId: p.principalId, personaId: p.id, app, device: DEVICES.laptop!, approxPlace: PLACES[0]!, createdAt: at(-40), lastActiveAt: at(-31, '20:10:00'), state: 'signed_out', endedAt: at(-31, '20:12:00'), endReason: 'signed_out', seeded: true });
    if (i % 2 === 0) s.events.push({ id: `evt_seed_${p.id}_code`, principalId: p.principalId, kind: 'code_failed', at: at(-9, '22:41:00'), app, deviceLabel: 'Chrome · android', detail: 'wrong_code' });
  });
  if (tenantId === 'tnt_alnoor') {
    seedPortal(s);
    seedHousehold(s);
  }
  return s;
}

/**
 * The society's resident portal on the demo's "today" (Al-Noor, 26 October 2026): the four
 * storyline residents use it; across the rest of the register some people are active, some have not
 * signed in for a month, some were invited (a few invitations expired) and most are not invited yet.
 */
/** Al-Noor households: Kamran's wife is on record; Rabia asked the office to add her daughter. */
function seedHousehold(s: IdentityState) {
  s.household.members.push({ id: 'hhm_anr_0001', flatId: 'unt_anr_a101', name: 'Nadia Siddiqui', relationship: 'spouse', addedOn: dayOffset(-200), verified: true });
  s.household.requests.push({
    id: 'hhr_anr_0001',
    flatId: 'unt_anr_a201',
    flatCode: 'A-201',
    name: 'Hira Hashmi',
    relationship: 'child',
    phoneMasked: '+92 399 *** 4417',
    requestedByName: 'Rabia Hashmi',
    requestedByPartyId: 'pty_anr_0010',
    requestedAt: at(-2, '20:15:00'),
    state: 'pending',
  });
}

function seedPortal(s: IdentityState) {
  const featured: Record<string, { last: number; device: DeviceInfo }> = {
    pty_anr_0001: { last: -1, device: DEVICES.android! },
    pty_anr_0003: { last: -2, device: DEVICES.iphone! },
    pty_anr_0010: { last: 0, device: DEVICES.android! },
    // Junaid has not signed in since September: an inactive account.
    pty_anr_0011: { last: -48, device: DEVICES.android! },
  };
  for (const r of ALNOOR_RESIDENTS) {
    const f = featured[r.partyId]!;
    s.portal[r.partyId] = { status: 'active', since: at(-60), lastSignInAt: at(f.last, '19:20:00'), lastDevice: f.device };
    s.contacts[r.principalId] = { email: r.email, consents: DEFAULT_CONSENTS(true, true, true) };
  }
  const people = alnoorRegisterPeople().filter((p) => !featured[p.partyId]);
  let n = 0;
  people.forEach((p, i) => {
    const consents = DEFAULT_CONSENTS(i % 6 !== 5, i % 3 !== 2, i % 4 === 0);
    s.contacts[invitedPrincipalId(p.partyId)] = { ...(p.phone ? { phone: p.phone } : {}), email: p.email, consents };
    if (!p.verified) return;
    const flat = p.flats[0]!;
    // Seeded invitations follow the same rule as new ones: only a channel the person agreed to.
    const agreed = (c: InvitationChannel) => consents.some((x) => x.channel === c && x.consented) && (c === 'email' || !!p.phone);
    const preferred: InvitationChannel = i % 2 ? 'sms' : 'whatsapp';
    const fallback = ([preferred, 'whatsapp', 'sms', 'email'] as const).find(agreed) ?? 'printed_code';
    const invite = (state: InvitationState, sentDays: number, channel: InvitationChannel = fallback) => {
      n += 1;
      const id = `inv_anr_${pad(n, 4)}`;
      s.invitations.push({
        id, token: `tnt_alnoor.${id.slice(8)}k${(i * 7919) % 100000}`, partyId: p.partyId, flatId: flat.flatId, channel, state,
        sentAt: at(sentDays, '11:15:00'), expiresOn: dayOffset(sentDays + 14), sentBy: 'usr_anr_0001', sentByName: 'Imran Qureshi', resendCount: 0, resendDates: [],
        ...(state === 'accepted' ? { acceptedAt: at(sentDays + 1, '20:02:00') } : {}),
      });
    };
    if (i % 5 === 0) {
      invite('accepted', -30 - (i % 7));
      s.portal[p.partyId] = { status: 'active', since: at(-29 - (i % 7)), lastSignInAt: at(-(i % 17), '20:45:00'), lastDevice: i % 2 ? DEVICES.android! : DEVICES.iphone! };
    } else if (i % 13 === 7) {
      invite('accepted', -80);
      s.portal[p.partyId] = { status: 'active', since: at(-79), lastSignInAt: at(-35 - (i % 40), '21:10:00'), lastDevice: DEVICES.android! };
    } else if (i % 5 === 2) {
      invite('sent', -(i % 9));
    } else if (i % 11 === 3) {
      invite('expired', -25 - (i % 10));
    }
  });
  // One account the office closed after a duplicate registration (history kept).
  const closed = people.find((p, i) => p.verified && i % 5 === 0 && i > 20);
  if (closed) s.portal[closed.partyId] = { ...s.portal[closed.partyId]!, status: 'revoked', revokedAt: at(-6, '10:05:00'), revokedByName: 'Imran Qureshi' };
}

const SECTION = 'identity';

/** The organisation's identity state (seeded on first use). */
export function identityOf(ctx: Pick<HandlerContext, 'demo' | 'tenantId'>, tenantId = ctx.tenantId): IdentityState {
  return ctx.demo.section<IdentityState>(SECTION, () => seedIdentity(tenantId ?? ''));
}

export const nextSeq = (s: IdentityState, prefix: string) => {
  s.seq += 1;
  return `${prefix}_${Date.now().toString(36)}${pad(s.seq, 3)}`;
};

export function logEvent(s: IdentityState, e: Omit<StoredEvent, 'id'>): void {
  s.events.unshift({ id: nextSeq(s, 'evt'), ...e });
  if (s.events.length > 400) s.events.length = 400;
}

/** "Chrome on Android" (no version, no user-agent string). */
export function deviceLabel(d: DeviceInfo): string {
  return `${d.browser} · ${d.platform}`;
}
