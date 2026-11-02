import type { ChatAudience, ChatPolicyVersion, ChatPostingPolicy, ChatReportReason, ChatReportState, OpsEvent, PollOption, PollResults, PollState, PollUnit, ProviderCategory, ProviderConsent, ProviderStatus, ResourceCategory } from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import { opsStamp } from '../operations/state';
import type { OpsSite } from '../operations/site';
import { pad } from '../seed';
import { ALNOOR_STAFF } from '../society/alnoor';

/**
 * Gate D.3: the community state of a site (chat, local services, polls, resources), kept in the
 * organisation's demo partition (shared by the office and resident apps of this browser). Seeds are
 * deterministic and fictional; names come from the society register. Nothing leaves the browser.
 */
export const COMMUNITY_STATE_VERSION = 1;
export const COMMUNITY_SECTION = 'community';

export interface StoredChatMessage {
  id: string;
  groupId: string;
  senderKind: 'resident' | 'office';
  senderName: string;
  /** The resident who wrote it (residents) or the staff sign-in (office). */
  partyId?: string;
  principalId?: string;
  text: string;
  at: string;
  clientKey?: string;
  /** Written while the device was offline and delivered on reconnect (simulated). */
  queuedAt?: string;
  removed?: { at: string; byName: string; reportId: string };
}

export interface StoredChatReport {
  id: string;
  ref: string;
  messageId: string;
  groupId: string;
  state: ChatReportState;
  reports: Array<{ by: string; reason: ChatReportReason; note?: string; at: string }>;
  decision?: { at: string; by: string; byName: string; note: string };
  history: OpsEvent[];
}

export interface StoredCustomGroup {
  id: string;
  name: string;
  audience: ChatAudience;
  postingPolicy: ChatPostingPolicy;
  createdByName: string;
  createdAt: string;
}

export interface ChatState {
  retentionDays?: number;
  etiquette: string;
  versions: ChatPolicyVersion[];
  /** Smart and custom groups switched off, and who may post (defaults: on, everyone). */
  rules: Record<string, { enabled: boolean; postingPolicy: ChatPostingPolicy }>;
  custom: StoredCustomGroup[];
  messages: StoredChatMessage[];
  reports: StoredChatReport[];
  /** `${memberKey}|${groupId}` → instant of the newest message read. */
  reads: Record<string, string>;
  /** memberKey → muted group ids. */
  mutes: Record<string, string[]>;
  /** memberKey → sender keys they blocked. */
  blocks: Record<string, string[]>;
  /** memberKey → custom groups left (and rejoined, with the new start). */
  left: Record<string, Array<{ groupId: string; at: string; rejoinedAt?: string }>>;
}

export interface StoredProvider {
  id: string;
  ref: string;
  name: string;
  category: ProviderCategory;
  description: string;
  serves: string;
  phone: string | null;
  consent: ProviderConsent;
  status: ProviderStatus;
  addedBy: string;
  addedByName: string;
  addedAt: string;
  vettedByName?: string;
  vettedAt?: string;
  reason?: string;
  /** Residents (party ids) who recommend it; only the count is ever shown. */
  recommenders: string[];
  reports: Array<{ id: string; by: string; reason: string; at: string; state: 'open' | 'dismissed' | 'actioned' }>;
  history: OpsEvent[];
}

export interface StoredPoll {
  id: string;
  ref: string;
  title: string;
  question: string;
  options: PollOption[];
  audience: ChatAudience;
  unit: PollUnit;
  anonymous: boolean;
  closesOn: string;
  state: PollState;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  withdrawnReason?: string;
  /** Who answered (party id, or flat id for a per-flat poll) and when: never what they chose. */
  voters: Array<{ key: string; by: string; at: string; flatCode?: string }>;
  /**
   * Anonymous polls keep only counts per block and option (no order, no link to a voter). Named
   * polls keep each answer with its author.
   */
  tally: Record<string, Record<string, number>>;
  named: Array<{ partyId: string; name: string; flat: string; optionId: string }>;
  /** Eligible households per block when the poll closed (for D-47). */
  audienceAtClose?: { site: number; blocks: Record<string, number> };
  published?: PollResults;
  history: OpsEvent[];
}

export interface StoredResource {
  id: string;
  ref: string;
  title: string;
  category: ResourceCategory;
  description: string;
  file: { name: string; type: string; sizeBytes: number };
  audience: ChatAudience;
  state: 'published' | 'withdrawn';
  publishedAt: string;
  publishedByName: string;
  withdrawn?: { at: string; byName: string; reason: string };
}

export interface CommunityState {
  version: typeof COMMUNITY_STATE_VERSION;
  siteId: string;
  counters: Record<string, number>;
  chat: ChatState;
  providers: StoredProvider[];
  polls: StoredPoll[];
  resources: StoredResource[];
}

export const communityStamp = opsStamp;

/** "2026-10-24 10:30" in Pakistan as a UTC stamp (seeded records are written in UTC). */
const pk = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(h - 5, m, 0, 0);
  return d.toISOString().replace('.000Z', 'Z');
};

const REF = { report: 'CR', provider: 'LS', poll: 'PL', resource: 'RS' } as const;

/** Next id and reference of a kind ("pol_anr_0004", "ANR-PL-0004"). */
export function nextCommunity(state: CommunityState, site: Pick<OpsSite, 'code'>, kind: keyof typeof REF | 'message' | 'custom'): { id: string; ref: string } {
  const seq = (state.counters[kind] ?? 0) + 1;
  state.counters[kind] = seq;
  const prefix = { report: 'crp', provider: 'lsp', poll: 'pol', resource: 'rsc', message: 'msg', custom: 'cgp' }[kind];
  const code = site.code.toLowerCase();
  return { id: `${prefix}_${code}_${pad(seq, 4)}`, ref: kind in REF ? `${site.code}-${REF[kind as keyof typeof REF]}-${pad(seq, 4)}` : '' };
}

export function communityState(ctx: HandlerContext, site: OpsSite): CommunityState {
  const state = ctx.demo.section<CommunityState>(`${COMMUNITY_SECTION}:${site.siteId}`, () => seedCommunity(site));
  if (state.version !== COMMUNITY_STATE_VERSION) Object.assign(state, seedCommunity(site));
  return state;
}

// ---------------------------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------------------------

const ETIQUETTE = 'Be kind and stay on topic. No adverts, no personal details of others, no arguments about dues: contact the office for those. Report a message that breaks these rules; the office reviews reports.';

export function seedCommunity(site: OpsSite): CommunityState {
  const state: CommunityState = { version: COMMUNITY_STATE_VERSION, siteId: site.siteId, counters: {}, chat: { etiquette: ETIQUETTE, versions: [], rules: {}, custom: [], messages: [], reports: [], reads: {}, mutes: {}, blocks: {}, left: {} }, providers: [], polls: [], resources: [] };
  // Only Al-Noor's register is known to the demo; another site starts empty (and unlicensed).
  if (site.code !== 'ANR' || !site.society) return state;
  const people = site.society.view.model.people;
  const name = (partyId: string) => people.find((p) => p.id === partyId)?.displayName ?? '';
  const block = (code: string) => site.buildings.find((b) => b.code === code)!.id;
  const office = ALNOOR_STAFF.manager;
  // The committee secretary has a staff sign-in (the administrator) and lives in A-201.
  const secretary = { principalId: 'usr_anr_r0003', name: 'Rabia Hashmi' };
  const facts = site.society.view.facts;
  const holder = (role: 'owner' | 'occupant', code: string) => facts.find((f) => f.role === role && f.flatCode === code && f.occupancyKind !== 'association' && f.from <= '2026-10-26' && (!f.to || '2026-10-26' < f.to))?.partyId ?? '';

  // Retention set by the committee secretary on the day the add-on started (D-25 (5)).
  state.chat.retentionDays = 365;
  state.chat.versions.push({ version: 1, retentionDays: 365, etiquette: ETIQUETTE, changedByName: secretary.name, changedAt: pk('2026-10-21', '09:30') });

  const msg = (groupId: string, at: string, text: string, by: { partyId: string } | { office: true; principalId: string; name: string }) => {
    const { id } = nextCommunity(state, site, 'message');
    const m: StoredChatMessage = 'office' in by ? { id, groupId, senderKind: 'office', senderName: by.name, principalId: by.principalId, text, at } : { id, groupId, senderKind: 'resident', senderName: name(by.partyId), partyId: by.partyId, text, at };
    state.chat.messages.push(m);
    return m;
  };
  const off = { office: true as const, ...office };
  const A = block('A');
  msg('site', pk('2026-10-21', '10:00'), 'Welcome to the Al-Noor community chat. Official notices stay under Notices; use this space for neighbourly questions.', off);
  msg('site', pk('2026-10-22', '18:30'), 'Does anyone know when the water tank cleaning is planned?', { partyId: 'pty_anr_0046' });
  msg('site', pk('2026-10-22', '19:05'), 'It is in the notices: Saturday morning, water off from 9 to 1.', { partyId: 'pty_anr_0001' });
  msg('site', pk('2026-10-23', '08:15'), 'Found a set of keys near the Block B parking. They are with the guard room.', { partyId: 'pty_anr_0066' });
  const spam = msg('site', pk('2026-10-24', '21:40'), 'Cheap phones and gadgets for sale!!! Message me privately for prices.', { partyId: 'pty_anr_0069' });
  msg('site', pk('2026-10-25', '11:00'), 'Sports day for the children is being planned. Volunteers welcome: reply here.', { partyId: 'pty_anr_0010' });
  msg('site', pk('2026-10-25', '19:50'), 'The generator was very noisy last night. Is maintenance aware?', { partyId: 'pty_anr_0055' });
  msg('site', pk('2026-10-25', '20:30'), 'Yes, a technician is checking the generator this morning.', off);
  msg(`block:${A}`, pk('2026-10-24', '17:20'), 'The Block A lift is making a clicking sound again.', { partyId: 'pty_anr_0003' });
  msg(`block:${A}`, pk('2026-10-25', '09:10'), 'Same here. I added myself to the community issue for it.', { partyId: 'pty_anr_0011' });
  msg(`floor:${A}:1`, pk('2026-10-23', '20:45'), 'The corridor light outside A-104 is out again.', { partyId: 'pty_anr_0005' });
  msg(`floor:${A}:2`, pk('2026-10-24', '12:00'), 'Parcel for A-205 was left at my door, I will hand it over this evening.', { partyId: 'pty_anr_0012' });
  msg('committee', pk('2026-10-22', '21:00'), 'The draft agenda for the November committee meeting is now under Resources.', { partyId: holder('owner', 'A-102') });
  msg('committee', pk('2026-10-23', '09:30'), 'Thank you. I will add the visitor parking item.', { partyId: 'pty_anr_0010' });
  msg('staff', pk('2026-10-24', '16:00'), 'Weekend guard roster confirmed. Shahid on the night shift.', off);

  // Two residents reported the advert; it waits for a moderator (and is kept past retention meanwhile).
  state.chat.reports.push({
    id: nextCommunity(state, site, 'report').id,
    ref: `${site.code}-CR-0001`,
    messageId: spam.id,
    groupId: 'site',
    state: 'open',
    reports: [
      { by: 'pty_anr_0046', reason: 'spam', note: 'Advert, not about the building.', at: pk('2026-10-24', '22:05') },
      { by: 'pty_anr_0066', reason: 'spam', at: pk('2026-10-25', '07:40') },
    ],
    history: [ev(pk('2026-10-24', '22:05'), '', 'resident', 'reported'), ev(pk('2026-10-25', '07:40'), '', 'resident', 'reported')],
  });

  // Local services (D-32: vetted only; contact details only with recorded consent).
  const consent = (showContact: boolean, method: ProviderConsent['method'], at: string): ProviderConsent => ({ showContact, method, recordedAt: at, recordedByName: office.name });
  const provider = (p: Omit<StoredProvider, 'id' | 'ref' | 'history' | 'reports' | 'recommenders'> & { recommenders?: string[] }) => {
    const { id, ref } = nextCommunity(state, site, 'provider');
    const history: OpsEvent[] = [ev(p.addedAt, p.addedByName, 'staff', 'added')];
    if (p.vettedAt) history.push(ev(p.vettedAt, p.vettedByName!, 'staff', p.status === 'rejected' ? 'rejected' : 'listed', p.status === 'rejected' && p.reason ? { note: p.reason } : {}));
    const stored: StoredProvider = { id, ref, history, reports: [], recommenders: [], ...p };
    state.providers.push(stored);
    return stored;
  };
  provider({ name: 'Demo Plumbing Team', category: 'plumbing', description: 'Leaks, taps, geysers and bathroom fittings. Works in Al-Noor regularly.', serves: 'Al-Noor Residency and nearby blocks', phone: '+92 300 0000101', consent: consent(true, 'written', pk('2026-10-21', '11:00')), status: 'listed', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-21', '11:00'), vettedByName: secretary.name, vettedAt: pk('2026-10-21', '15:00'), recommenders: ['pty_anr_0004', 'pty_anr_0013', 'pty_anr_0046', 'pty_anr_0055'] });
  provider({ name: 'Demo Electrician Desk', category: 'electrical', description: 'Wiring faults, switchboards and UPS installation.', serves: 'Lahore (Johar Town)', phone: null, consent: consent(false, 'verbal', pk('2026-10-21', '11:20')), status: 'listed', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-21', '11:20'), vettedByName: secretary.name, vettedAt: pk('2026-10-21', '15:05'), recommenders: ['pty_anr_0001', 'pty_anr_0058'] });
  const cleaners = provider({ name: 'Sparkle Home Cleaning (Demo)', category: 'cleaning', description: 'Deep cleaning before moving in or out; sofa and carpet washing.', serves: 'Al-Noor Residency', phone: '+92 300 0000103', consent: consent(true, 'form', pk('2026-10-22', '10:00')), status: 'listed', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-22', '10:00'), vettedByName: secretary.name, vettedAt: pk('2026-10-22', '16:30'), recommenders: ['pty_anr_0012'] });
  provider({ name: 'Maths and Science Tuition (Demo)', category: 'tutoring', description: 'Home tuition for grades 6 to 10, evenings.', serves: 'Al-Noor Residency', phone: '+92 300 0000104', consent: consent(true, 'written', pk('2026-10-23', '12:00')), status: 'listed', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-23', '12:00'), vettedByName: secretary.name, vettedAt: pk('2026-10-23', '18:00'), recommenders: [] });
  provider({ name: 'CoolAir AC Service (Demo)', category: 'appliance_repair', description: 'Split AC servicing, gas refill and installation.', serves: 'Lahore', phone: '+92 300 0000105', consent: consent(true, 'written', pk('2026-10-25', '14:00')), status: 'pending', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-25', '14:00') });
  const pest = provider({ name: 'QuickFix Pest Control (Demo)', category: 'pest_control', description: 'Termite and cockroach treatment.', serves: 'Lahore', phone: '+92 300 0000106', consent: consent(true, 'verbal', pk('2026-10-21', '12:00')), status: 'suspended', addedBy: office.principalId, addedByName: office.name, addedAt: pk('2026-10-21', '12:00'), vettedByName: secretary.name, vettedAt: pk('2026-10-21', '15:10'), reason: 'Two residents reported missed appointments; suspended while the office checks.' });
  pest.history.push(ev(pk('2026-10-25', '10:00'), secretary.name, 'staff', 'suspended', { note: pest.reason! }));
  cleaners.reports.push({ id: 'lsr_anr_0001', by: 'pty_anr_0048', reason: 'Asked for payment in advance and did not come on the agreed day.', at: pk('2026-10-25', '19:30'), state: 'open' });
  cleaners.history.push(ev(pk('2026-10-25', '19:30'), '', 'resident', 'reported'));

  // Polls (D-30: informal, labelled; results only after closing, D-47 thresholds).
  const poll = ({ history, ...p }: Omit<StoredPoll, 'id' | 'ref' | 'voters' | 'tally' | 'named' | 'history'> & { history?: OpsEvent[] }) => {
    const { id, ref } = nextCommunity(state, site, 'poll');
    const stored: StoredPoll = { id, ref, voters: [], tally: {}, named: [], history: history ?? [ev(p.createdAt, p.createdByName, 'staff', 'created')], ...p };
    state.polls.push(stored);
    return stored;
  };
  const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `opt_${i + 1}`, label }));
  const sports = poll({ title: 'Children’s sports day', question: 'Which Saturday suits your family for the sports day?', options: opts('8 November', '15 November', '22 November'), audience: { scope: 'site', ids: [], roles: ['occupant'] }, unit: 'flat', anonymous: true, closesOn: '2026-11-02', state: 'open', createdBy: office.principalId, createdByName: office.name, createdAt: pk('2026-10-22', '12:00'), history: [ev(pk('2026-10-22', '12:00'), office.name, 'staff', 'created'), ev(pk('2026-10-22', '12:05'), office.name, 'staff', 'opened')] });
  const vote = (p: StoredPoll, key: string, by: string, blockCode: string, optionId: string, at: string) => {
    p.voters.push({ key, by, at, flatCode: site.flats.find((f) => f.id === key)?.code ?? '' });
    p.tally[blockCode] ??= {};
    p.tally[blockCode]![optionId] = (p.tally[blockCode]![optionId] ?? 0) + 1;
  };
  // Eleven households have answered (turnout only is shown while it is open).
  ['A-103', 'A-104', 'A-203', 'A-301', 'A-405', 'B-102', 'B-104', 'B-202', 'B-205', 'B-303', 'B-305'].forEach((code, i) => {
    const flat = site.flats.find((f) => f.code === code)!;
    vote(sports, flat.id, holder('occupant', code), flat.buildingCode, `opt_${(i % 3) + 1}`, pk('2026-10-23', `${String(9 + (i % 10)).padStart(2, '0')}:00`));
  });
  const gym = poll({ title: 'Gym opening hours', question: 'Should the gym open at 5:30 instead of 6:00 on weekdays?', options: opts('Yes, open at 5:30', 'No, keep 6:00'), audience: { scope: 'site', ids: [], roles: ['occupant'] }, unit: 'person', anonymous: true, closesOn: '2026-10-20', state: 'published', createdBy: office.principalId, createdByName: office.name, createdAt: pk('2026-10-10', '10:00'), history: [ev(pk('2026-10-10', '10:00'), office.name, 'staff', 'created'), ev(pk('2026-10-10', '10:05'), office.name, 'staff', 'opened'), ev(pk('2026-10-21', '00:00'), '', 'system', 'closed'), ev(pk('2026-10-21', '10:00'), secretary.name, 'staff', 'published')] });
  // The published result (frozen when published): 31 answers; Block A and B each pass D-47.
  gym.tally = { A: { opt_1: 11, opt_2: 6 }, B: { opt_1: 9, opt_2: 5 } };
  gym.audienceAtClose = { site: 75, blocks: { A: 38, B: 37 } };
  gym.published = { shown: true, total: 31, options: [{ id: 'opt_1', label: 'Yes, open at 5:30', count: 20 }, { id: 'opt_2', label: 'No, keep 6:00', count: 11 }], blocks: [{ code: 'A', total: 17, options: [{ id: 'opt_1', count: 11 }, { id: 'opt_2', count: 6 }] }, { code: 'B', total: 14, options: [{ id: 'opt_1', count: 9 }, { id: 'opt_2', count: 5 }] }] };
  for (let i = 0; i < 31; i++) gym.voters.push({ key: `seed_${i}`, by: `seed_${i}`, at: pk('2026-10-15', '12:00') });
  const parking = poll({ title: 'Visitor parking on weekends', question: 'Should weekend visitor parking move to the rear lot?', options: opts('Yes', 'No', 'No preference'), audience: { scope: 'blocks', ids: [block('B')], roles: ['owner', 'occupant'] }, unit: 'person', anonymous: false, closesOn: '2026-10-25', state: 'closed', createdBy: office.principalId, createdByName: office.name, createdAt: pk('2026-10-18', '10:00'), history: [ev(pk('2026-10-18', '10:00'), office.name, 'staff', 'created'), ev(pk('2026-10-18', '10:10'), office.name, 'staff', 'opened'), ev(pk('2026-10-26', '00:00'), '', 'system', 'closed')] });
  parking.named.push({ partyId: 'pty_anr_0046', name: name('pty_anr_0046'), flat: 'B-102', optionId: 'opt_1' }, { partyId: 'pty_anr_0055', name: name('pty_anr_0055'), flat: 'B-202', optionId: 'opt_2' });
  for (const n of parking.named) {
    parking.voters.push({ key: n.partyId, by: n.partyId, at: pk('2026-10-20', '18:00') });
    parking.tally.B ??= {};
    parking.tally.B[n.optionId] = (parking.tally.B[n.optionId] ?? 0) + 1;
  }
  parking.audienceAtClose = { site: 37, blocks: { B: 37 } };
  poll({ title: 'Rooftop garden', question: 'Would you use a rooftop garden on Block A if the committee builds one?', options: opts('Yes, often', 'Sometimes', 'No'), audience: { scope: 'blocks', ids: [A], roles: ['owner', 'occupant'] }, unit: 'flat', anonymous: true, closesOn: '2026-11-15', state: 'draft', createdBy: office.principalId, createdByName: office.name, createdAt: pk('2026-10-26', '08:00') });

  // Resources published to residents (DOC-001 "Published to residents"; fictional files).
  const resource = (r: Omit<StoredResource, 'id' | 'ref' | 'state'>) => {
    const { id, ref } = nextCommunity(state, site, 'resource');
    state.resources.push({ id, ref, state: 'published', ...r });
  };
  resource({ title: 'Society bylaws (2026 edition)', category: 'bylaws', description: 'Rules adopted at the 2026 annual general meeting.', file: { name: 'al-noor-bylaws-2026.pdf', type: 'application/pdf', sizeBytes: 412_000 }, audience: { scope: 'site', ids: [], roles: ['owner', 'occupant', 'payer'] }, publishedAt: pk('2026-10-21', '12:00'), publishedByName: secretary.name });
  resource({ title: 'Move-in and move-out form', category: 'forms', description: 'Fill in and hand to the office three days before moving.', file: { name: 'move-form.pdf', type: 'application/pdf', sizeBytes: 96_000 }, audience: { scope: 'site', ids: [], roles: ['owner', 'occupant', 'payer'] }, publishedAt: pk('2026-10-21', '12:10'), publishedByName: secretary.name });
  resource({ title: 'Lift safety guide for Block A', category: 'guides', description: 'What to do if the lift stops between floors.', file: { name: 'block-a-lift-guide.pdf', type: 'application/pdf', sizeBytes: 180_000 }, audience: { scope: 'blocks', ids: [A], roles: ['owner', 'occupant'] }, publishedAt: pk('2026-10-22', '09:00'), publishedByName: office.name });
  resource({ title: 'Draft agenda: November committee meeting', category: 'minutes', description: 'For owners. Comments to the committee secretary.', file: { name: 'cm-agenda-nov-2026.pdf', type: 'application/pdf', sizeBytes: 64_000 }, audience: { scope: 'site', ids: [], roles: ['owner'] }, publishedAt: pk('2026-10-22', '20:30'), publishedByName: secretary.name });
  return state;
}

function ev(at: string, byName: string, byKind: OpsEvent['byKind'], action: string, extra: Partial<OpsEvent> = {}): OpsEvent {
  return { at, byName, byKind, action, ...extra };
}

export { ev as communityEvent };
