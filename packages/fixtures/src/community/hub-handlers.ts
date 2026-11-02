import { PROVIDER_CATEGORIES, RESOURCE_CATEGORIES, type ChatAudience, type CommunityHome, type CommunityTab, type FeatureKey, type Permission, type PollOffice, type PollResident, type PollsOffice, type PollsResident, type PollState, type ProviderCategory, type ProviderStatus, type ResourceOffice, type ResourceResident, type ResourcesOffice, type ServiceDirectoryOffice, type ServiceDirectoryResident, type ServiceProviderOffice } from '@repo/contracts';
import { authorize, matches, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { members } from '../operations/audience';
import { invalid, notify, opsOf } from '../operations/common';
import { residentNoticeList } from '../operations/notices-handlers';
import { opsSite, residentOps, serviceAllows, siteRecord, type OpsSite, type ResidentOps } from '../operations/site';
import { problem } from '../society/handlers';
import { readAudience, residentChatSummary } from './chat-handlers';
import { audienceCodes } from './groups';
import { pollResults } from './polls';
import { communityEvent as ev, communityStamp, communityState, nextCommunity, type CommunityState, type StoredPoll, type StoredProvider, type StoredResource } from './state';

/**
 * Gate D.3 Community hub (PORTAL-036 Community home, CMTY-001 local services, CMTY-002/004 polls,
 * DOC-001 "Published to residents"). The Community home itself needs only the resident app (rule R):
 * its notices summary works without any add-on (D-49). Each hub tab also needs `community_hub` and
 * its feature for the resident's site; the chat card needs `community_chat`. Residents see only what
 * is vetted, published and meant for them (re-checked on every read); staff need the module, the
 * feature and their permission. Everything is fictional and stays in this browser.
 */

const now = (ctx: HandlerContext) => communityStamp(ctx);
const HUB = 'community_hub' as const;
const FEATURE = { services: 'community_hub.services_directory', polls: 'community_hub.polls', resources: 'community_hub.resources' } as const satisfies Record<string, FeatureKey>;

/** Staff: office app, community_hub licensed for the site with the feature, and the permission. */
function office(ctx: HandlerContext, feature: FeatureKey, permission: Permission): { site: OpsSite; state: CommunityState } {
  if (ctx.persona?.app !== 'backoffice') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const site = opsSite(ctx);
  authorize(ctx, HUB, siteRecord(site), permission);
  if (!ctx.access?.features.includes(feature)) problem(ctx, 403, 'feature_not_licensed', 'errors:access.feature_not_licensed');
  return { site, state: communityState(ctx, site) };
}

/** Residents: rule R, then the hub and the tab's feature for the same site and flat. */
function resident(ctx: HandlerContext, feature: FeatureKey): { res: ResidentOps; state: CommunityState } {
  const res = residentOps(ctx, { module: HUB, feature });
  return { res, state: communityState(ctx, res.site) };
}

const text = (ctx: HandlerContext, field: string, raw: unknown, min: number, max: number): string => {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v.length < min) invalid(ctx, field, min <= 1 ? 'forms:errors.required' : 'community:errors.minLength', { min: String(min) });
  if (v.length > max) invalid(ctx, field, 'community:errors.maxLength', { max: String(max) });
  return v;
};

const audienceLabel = (site: OpsSite, a: ChatAudience) => ({ ...a, label: audienceCodes(site, a) });
const inAudience = (site: OpsSite, a: ChatAudience, partyId: string, on: string) => members(site, site.society?.view.facts ?? [], a, on).some((m) => m.partyId === partyId);

// ---------------------------------------------------------------------------------------------
// Local services (CMTY-001)
// ---------------------------------------------------------------------------------------------

function providerOffice(ctx: HandlerContext, p: StoredProvider): ServiceProviderOffice {
  const me = ctx.persona!.principalId;
  return {
    id: p.id,
    ref: p.ref,
    name: p.name,
    category: p.category,
    description: p.description,
    serves: p.serves,
    phone: p.phone,
    consent: p.consent,
    status: p.status,
    addedByName: p.addedByName,
    addedAt: p.addedAt,
    ...(p.vettedByName ? { vettedByName: p.vettedByName, vettedAt: p.vettedAt! } : {}),
    ...(p.reason ? { reason: p.reason } : {}),
    recommendations: p.recommenders.length,
    reports: p.reports.map((r) => ({ id: r.id, reason: r.reason, at: r.at, state: r.state })),
    history: p.history,
    // Vetting is independent: whoever added a provider does not list it.
    actions: { vet: p.status === 'pending' && p.addedBy !== me, reject: p.status === 'pending', suspend: p.status === 'listed', reinstate: p.status === 'suspended' },
  };
}

const categoriesOf = (list: readonly StoredProvider[]) => PROVIDER_CATEGORIES.map((key) => ({ key, listed: list.filter((p) => p.status === 'listed' && p.category === key).length }));

function findProvider(ctx: HandlerContext, state: CommunityState): StoredProvider {
  const p = state.providers.find((x) => x.id === ctx.params.id);
  if (!p) notFound(ctx);
  return p;
}

function decideProvider(ctx: HandlerContext, action: 'vet' | 'reject' | 'suspend' | 'reinstate') {
  const { state } = office(ctx, FEATURE.services, 'directory.manage');
  const p = findProvider(ctx, state);
  const from: Record<typeof action, ProviderStatus> = { vet: 'pending', reject: 'pending', suspend: 'listed', reinstate: 'suspended' };
  if (p.status !== from[action]) problem(ctx, 409, 'state_changed', 'community:errors.stateChanged');
  const me = ctx.persona!;
  if (action === 'vet' && p.addedBy === me.principalId) problem(ctx, 409, 'separation_of_duties', 'community:errors.vetOwn');
  const note = text(ctx, 'note', (ctx.req.body as { note?: unknown } | undefined)?.note, action === 'vet' ? 0 : action === 'reinstate' ? 5 : 10, 400);
  const at = now(ctx);
  p.status = action === 'vet' || action === 'reinstate' ? 'listed' : action === 'reject' ? 'rejected' : 'suspended';
  if (action === 'vet' || action === 'reject') {
    p.vettedByName = me.displayName;
    p.vettedAt = at;
  }
  if (action === 'reject' || action === 'suspend') p.reason = note;
  else delete p.reason;
  // Suspending acts on the open reports about it.
  if (action === 'suspend') for (const r of p.reports.filter((x) => x.state === 'open')) r.state = 'actioned';
  p.history.push(ev(at, me.displayName, 'staff', action === 'vet' ? 'listed' : action === 'reject' ? 'rejected' : action === 'suspend' ? 'suspended' : 'reinstated', note ? { note } : {}));
  ctx.demo.save();
  return providerOffice(ctx, p);
}

const DIRECTORY_HANDLERS: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/community\/services$/,
    access: requires(HUB, 'directory.manage', 'operational', FEATURE.services),
    handle: (ctx): ServiceDirectoryOffice => {
      const { state } = office(ctx, FEATURE.services, 'directory.manage');
      const status = String(ctx.req.query?.status ?? 'listed');
      const category = String(ctx.req.query?.category ?? '');
      const q = String(ctx.req.query?.q ?? '').trim();
      const counts = Object.fromEntries((['pending', 'listed', 'rejected', 'suspended'] as const).map((s) => [s, state.providers.filter((p) => p.status === s).length])) as ServiceDirectoryOffice['counts'];
      counts.reports = state.providers.reduce((n, p) => n + p.reports.filter((r) => r.state === 'open').length, 0);
      const items = state.providers
        .filter((p) => (status === 'reports' ? p.reports.some((r) => r.state === 'open') : status === 'all' || p.status === status) && (!category || p.category === category) && (!q || matches(q, p.name, p.description, p.serves, p.ref)))
        .map((p) => providerOffice(ctx, p))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { items, counts, categories: categoriesOf(state.providers) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/community\/services$/,
    access: requires(HUB, 'directory.manage', 'operational', FEATURE.services),
    handle: (ctx): ServiceProviderOffice => {
      const { site, state } = office(ctx, FEATURE.services, 'directory.manage');
      const b = (ctx.req.body ?? {}) as Record<string, unknown>;
      const name = text(ctx, 'name', b.name, 3, 80);
      if (state.providers.some((p) => p.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en') && p.status !== 'rejected')) invalid(ctx, 'name', 'community:errors.providerExists');
      if (!PROVIDER_CATEGORIES.includes(b.category as ProviderCategory)) invalid(ctx, 'category', 'forms:errors.required');
      const description = text(ctx, 'description', b.description, 12, 400);
      const serves = text(ctx, 'serves', b.serves, 3, 80);
      const phone = typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : null;
      if (phone && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(phone)) invalid(ctx, 'phone', 'community:errors.phone');
      const consent = (b.consent ?? {}) as { showContact?: unknown; method?: unknown };
      if (consent.method !== 'written' && consent.method !== 'verbal' && consent.method !== 'form') invalid(ctx, 'consentMethod', 'community:errors.consentMethod');
      const showContact = consent.showContact === true;
      if (showContact && !phone) invalid(ctx, 'phone', 'community:errors.phoneForConsent');
      const me = ctx.persona!;
      const at = now(ctx);
      const { id, ref } = nextCommunity(state, site, 'provider');
      const p: StoredProvider = {
        id,
        ref,
        name,
        category: b.category as ProviderCategory,
        description,
        serves,
        // D-32: without consent to show it, the number is not kept in the directory at all.
        phone: showContact ? phone : null,
        consent: { showContact, method: consent.method as 'written' | 'verbal' | 'form', recordedAt: at, recordedByName: me.displayName },
        status: 'pending',
        addedBy: me.principalId,
        addedByName: me.displayName,
        addedAt: at,
        recommenders: [],
        reports: [],
        history: [ev(at, me.displayName, 'staff', 'added')],
      };
      state.providers.push(p);
      ctx.demo.save();
      return providerOffice(ctx, p);
    },
  },
  { method: 'POST', pattern: /^\/ops\/community\/services\/(?<id>[\w-]+)\/vet$/, access: requires(HUB, 'directory.manage', 'operational', FEATURE.services), handle: (ctx) => decideProvider(ctx, 'vet') },
  { method: 'POST', pattern: /^\/ops\/community\/services\/(?<id>[\w-]+)\/reject$/, access: requires(HUB, 'directory.manage', 'operational', FEATURE.services), handle: (ctx) => decideProvider(ctx, 'reject') },
  { method: 'POST', pattern: /^\/ops\/community\/services\/(?<id>[\w-]+)\/suspend$/, access: requires(HUB, 'directory.manage', 'operational', FEATURE.services), handle: (ctx) => decideProvider(ctx, 'suspend') },
  { method: 'POST', pattern: /^\/ops\/community\/services\/(?<id>[\w-]+)\/reinstate$/, access: requires(HUB, 'directory.manage', 'operational', FEATURE.services), handle: (ctx) => decideProvider(ctx, 'reinstate') },
  {
    method: 'POST',
    pattern: /^\/ops\/community\/services\/(?<id>[\w-]+)\/reports\/(?<reportId>[\w-]+)\/dismiss$/,
    access: requires(HUB, 'directory.manage', 'operational', FEATURE.services),
    handle: (ctx): ServiceProviderOffice => {
      const { state } = office(ctx, FEATURE.services, 'directory.manage');
      const p = findProvider(ctx, state);
      const r = p.reports.find((x) => x.id === ctx.params.reportId && x.state === 'open');
      if (!r) notFound(ctx);
      const note = text(ctx, 'note', (ctx.req.body as { note?: unknown } | undefined)?.note, 5, 400);
      r.state = 'dismissed';
      p.history.push(ev(now(ctx), ctx.persona!.displayName, 'staff', 'report_dismissed', { note }));
      ctx.demo.save();
      return providerOffice(ctx, p);
    },
  },
  // Residents ---------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/community\/services$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ServiceDirectoryResident => {
      const { res, state } = resident(ctx, FEATURE.services);
      const category = String(ctx.req.query?.category ?? '');
      const q = String(ctx.req.query?.q ?? '').trim();
      if (category && !PROVIDER_CATEGORIES.includes(category as ProviderCategory)) invalid(ctx, 'category', 'community:errors.invalid');
      // D-32: vetted (listed) providers only; never pending, rejected or suspended ones.
      const items = state.providers
        .filter((p) => p.status === 'listed' && (!category || p.category === category) && (!q || matches(q, p.name, p.description, p.serves)))
        .sort((a, b) => b.recommenders.length - a.recommenders.length || a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, name: p.name, category: p.category, description: p.description, serves: p.serves, phone: p.consent.showContact ? p.phone : null, recommendations: p.recommenders.length, recommendedByMe: p.recommenders.includes(res.partyId), reportedByMe: p.reports.some((r) => r.by === res.partyId && r.state === 'open') }));
      return { items, categories: categoriesOf(state.providers) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/community\/services\/(?<id>[\w-]+)\/recommend$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { res, state } = resident(ctx, FEATURE.services);
      const p = state.providers.find((x) => x.id === ctx.params.id && x.status === 'listed');
      if (!p) notFound(ctx);
      const on = (ctx.req.body as { on?: unknown } | undefined)?.on;
      if (typeof on !== 'boolean') invalid(ctx, 'on', 'forms:errors.required');
      p.recommenders = on ? [...new Set([...p.recommenders, res.partyId])] : p.recommenders.filter((x) => x !== res.partyId);
      ctx.demo.save();
      return { recommendations: p.recommenders.length, recommendedByMe: on };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/community\/services\/(?<id>[\w-]+)\/report$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx) => {
      const { res, state } = resident(ctx, FEATURE.services);
      const p = state.providers.find((x) => x.id === ctx.params.id && x.status === 'listed');
      if (!p) notFound(ctx);
      const reason = text(ctx, 'reason', (ctx.req.body as { reason?: unknown } | undefined)?.reason, 10, 400);
      if (!p.reports.some((r) => r.by === res.partyId && r.state === 'open')) {
        const n = p.reports.length + 1;
        p.reports.push({ id: `${p.id.replace('lsp_', 'lsr_')}_${n}`, by: res.partyId, reason, at: now(ctx), state: 'open' });
        p.history.push(ev(now(ctx), '', 'resident', 'reported'));
        ctx.demo.save();
      }
      return { reported: true };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Polls (CMTY-002, CMTY-004, PORTAL-039)
// ---------------------------------------------------------------------------------------------

/** Eligible people (unit person) or flats (unit flat) today, and households per block (for D-47). */
function eligibility(site: OpsSite, p: Pick<StoredPoll, 'audience' | 'unit'>, on: string) {
  const list = members(site, site.society?.view.facts ?? [], p.audience, on);
  const flats = new Map<string, string>();
  for (const m of list) m.flatIds.forEach((id) => flats.set(id, site.flats.find((f) => f.id === id)?.buildingCode ?? ''));
  const blocks: Record<string, number> = {};
  for (const code of flats.values()) blocks[code] = (blocks[code] ?? 0) + 1;
  return { people: list, count: p.unit === 'person' ? list.length : flats.size, households: { site: flats.size, blocks } };
}

/** A poll past its last day closes on the next read (the demo has no background jobs). */
function closeDue(ctx: HandlerContext, site: OpsSite, state: CommunityState) {
  let changed = false;
  for (const p of state.polls.filter((x) => x.state === 'open' && ctx.at > x.closesOn)) {
    close(site, p, ctx.at, now(ctx));
    p.history.push(ev(now(ctx), '', 'system', 'closed'));
    changed = true;
  }
  if (changed) ctx.demo.save();
}

function close(site: OpsSite, p: StoredPoll, on: string, _at: string) {
  p.state = 'closed';
  p.audienceAtClose = eligibility(site, p, on).households;
}

function pollOffice(ctx: HandlerContext, site: OpsSite, p: StoredPoll): PollOffice {
  const after = p.state === 'closed' || p.state === 'published';
  const totals = p.options.map((o) => ({ ...o, count: Object.values(p.tally).reduce((n, byOption) => n + (byOption[o.id] ?? 0), 0) }));
  return {
    id: p.id,
    ref: p.ref,
    title: p.title,
    question: p.question,
    options: p.options,
    audience: audienceLabel(site, p.audience),
    unit: p.unit,
    anonymous: p.anonymous,
    closesOn: p.closesOn,
    state: p.state,
    eligible: eligibility(site, p, ctx.at).count,
    responses: p.voters.length,
    createdByName: p.createdByName,
    createdAt: p.createdAt,
    ...(p.withdrawnReason ? { withdrawnReason: p.withdrawnReason } : {}),
    // No running tally: how people answered appears only after the poll closes.
    ...(after ? { totals } : {}),
    ...(after && !p.anonymous ? { respondents: p.named.map((n) => ({ ...n })).map(({ partyId: _p, ...n }) => n) } : {}),
    ...(p.published ? { published: p.published } : {}),
    history: p.history,
    actions: { edit: p.state === 'draft', open: p.state === 'draft', close: p.state === 'open', publish: p.state === 'closed', withdraw: p.state === 'draft' || p.state === 'open' },
  };
}

function readPoll(ctx: HandlerContext, site: OpsSite, today: string) {
  const b = (ctx.req.body ?? {}) as Record<string, unknown>;
  const title = text(ctx, 'title', b.title, 5, 80);
  const question = text(ctx, 'question', b.question, 10, 200);
  const raw = Array.isArray(b.options) ? b.options.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : [];
  if (raw.length < 2) invalid(ctx, 'options', 'community:errors.twoOptions');
  if (raw.length > 6) invalid(ctx, 'options', 'community:errors.sixOptions');
  if (raw.some((x) => x.length > 60)) invalid(ctx, 'options', 'community:errors.maxLength', { max: '60' });
  if (new Set(raw.map((x) => x.toLocaleLowerCase('en'))).size !== raw.length) invalid(ctx, 'options', 'community:errors.sameOption');
  const audience = readAudience(ctx, site, b.audience);
  if (b.unit !== 'person' && b.unit !== 'flat') invalid(ctx, 'unit', 'forms:errors.required');
  if (typeof b.anonymous !== 'boolean') invalid(ctx, 'anonymous', 'forms:errors.required');
  const closesOn = typeof b.closesOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.closesOn) ? b.closesOn : '';
  if (!closesOn) invalid(ctx, 'closesOn', 'forms:errors.required');
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 90);
  if (closesOn < today) invalid(ctx, 'closesOn', 'community:errors.closesInPast');
  if (closesOn > max.toISOString().slice(0, 10)) invalid(ctx, 'closesOn', 'community:errors.closesTooLate', { max: '90' });
  return { title, question, options: raw.map((label, i) => ({ id: `opt_${i + 1}`, label })), audience, unit: b.unit as 'person' | 'flat', anonymous: b.anonymous as boolean, closesOn };
}

function findPoll(ctx: HandlerContext, state: CommunityState): StoredPoll {
  const p = state.polls.find((x) => x.id === ctx.params.id);
  if (!p) notFound(ctx);
  return p;
}

function pollAction(ctx: HandlerContext, action: 'open' | 'close' | 'publish' | 'withdraw'): PollOffice {
  const { site, state } = office(ctx, FEATURE.polls, 'polls.manage');
  closeDue(ctx, site, state);
  const p = findPoll(ctx, state);
  const allowed: Record<typeof action, PollState[]> = { open: ['draft'], close: ['open'], publish: ['closed'], withdraw: ['draft', 'open'] };
  if (!allowed[action].includes(p.state)) problem(ctx, 409, 'state_changed', 'community:errors.stateChanged');
  const me = ctx.persona!.displayName;
  const at = now(ctx);
  if (action === 'open') {
    if (p.closesOn < ctx.at) problem(ctx, 409, 'closes_in_past', 'community:errors.closesInPast');
    const e = eligibility(site, p, ctx.at);
    if (!e.count) problem(ctx, 409, 'no_audience', 'community:errors.noAudience');
    p.state = 'open';
    p.history.push(ev(at, me, 'staff', 'opened'));
    notify(ctx, { site, ops: opsOf(ctx, site) }, { partyIds: e.people.map((m) => m.partyId), module: HUB, kind: 'poll', key: 'pollOpened', values: { title: p.title }, href: '/customer/portal/community?tab=polls' });
  } else if (action === 'close') {
    close(site, p, ctx.at, at);
    p.history.push(ev(at, me, 'staff', 'closed'));
  } else if (action === 'publish') {
    // Frozen at publication: what residents see never moves afterwards (D-47).
    p.published = pollResults(p.tally, p.options, p.audienceAtClose ?? eligibility(site, p, ctx.at).households);
    p.state = 'published';
    p.history.push(ev(at, me, 'staff', 'published', p.published.shown ? {} : { values: { reason: p.published.reason } }));
  } else {
    const reason = text(ctx, 'reason', (ctx.req.body as { reason?: unknown } | undefined)?.reason, 10, 400);
    p.state = 'withdrawn';
    p.withdrawnReason = reason;
    p.history.push(ev(at, me, 'staff', 'withdrawn', { note: reason }));
  }
  ctx.demo.save();
  return pollOffice(ctx, site, p);
}

/** What a resident may do with a poll today: answer for themselves, or for flats of theirs in its audience. */
function residentPoll(ctx: HandlerContext, res: ResidentOps, p: StoredPoll): PollResident | null {
  const me = members(res.site, res.s.view.facts, p.audience, ctx.at).find((m) => m.partyId === res.partyId);
  if (!me) return null;
  // Only flats the resident holds a verified link to (rule R) count.
  const mine = me.flatIds.filter((id) => res.flats.some((f) => f.flat.id === id));
  if (!mine.length) return null;
  const answered: PollResident['answered'] =
    p.unit === 'person'
      ? p.voters.filter((v) => v.key === res.partyId).map(() => ({ byMe: true, ...(!p.anonymous ? { optionId: p.named.find((n) => n.partyId === res.partyId)?.optionId } : {}) }))
      : p.voters.filter((v) => mine.includes(v.key)).map((v) => ({ flatCode: v.flatCode ?? '', byMe: v.by === res.partyId, ...(!p.anonymous && v.by === res.partyId ? { optionId: p.named.find((n) => n.partyId === res.partyId && n.flat === v.flatCode)?.optionId } : {}) }));
  const answerable =
    p.state !== 'open'
      ? []
      : p.unit === 'person'
        ? p.voters.some((v) => v.key === res.partyId)
          ? []
          : [{}]
        : mine.filter((id) => !p.voters.some((v) => v.key === id)).map((id) => ({ flatId: id, flatCode: res.site.flats.find((f) => f.id === id)?.code ?? '' }));
  return {
    id: p.id,
    title: p.title,
    question: p.question,
    options: p.options,
    unit: p.unit,
    anonymous: p.anonymous,
    closesOn: p.closesOn,
    state: p.state as PollResident['state'],
    answerable,
    answered: answered.map((a) => (a.optionId === undefined ? (({ optionId: _o, ...rest }) => rest)(a) : a)),
    ...(p.withdrawnReason ? { withdrawnReason: p.withdrawnReason } : {}),
    ...(p.state === 'published' && p.published ? { results: p.published } : {}),
  };
}

const POLL_HANDLERS: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/community\/polls$/,
    access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls),
    handle: (ctx): PollsOffice => {
      const { site, state } = office(ctx, FEATURE.polls, 'polls.manage');
      closeDue(ctx, site, state);
      const status = String(ctx.req.query?.status ?? 'open');
      const all = state.polls.map((p) => pollOffice(ctx, site, p)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const counts = Object.fromEntries((['draft', 'open', 'closed', 'published', 'withdrawn'] as const).map((s) => [s, all.filter((p) => p.state === s).length])) as PollsOffice['counts'];
      const items = status === 'closed' ? all.filter((p) => p.state === 'closed' || p.state === 'published' || p.state === 'withdrawn') : all.filter((p) => p.state === status);
      return { items, counts, blocks: site.buildings.map((b) => ({ id: b.id, code: b.code })) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)$/,
    access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls),
    handle: (ctx): PollOffice => {
      const { site, state } = office(ctx, FEATURE.polls, 'polls.manage');
      closeDue(ctx, site, state);
      return pollOffice(ctx, site, findPoll(ctx, state));
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/community\/polls$/,
    access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls),
    handle: (ctx): PollOffice => {
      const { site, state } = office(ctx, FEATURE.polls, 'polls.manage');
      const input = readPoll(ctx, site, ctx.at);
      const me = ctx.persona!;
      const at = now(ctx);
      const { id, ref } = nextCommunity(state, site, 'poll');
      const p: StoredPoll = { id, ref, ...input, state: 'draft', createdBy: me.principalId, createdByName: me.displayName, createdAt: at, voters: [], tally: {}, named: [], history: [ev(at, me.displayName, 'staff', 'created')] };
      state.polls.push(p);
      ctx.demo.save();
      return pollOffice(ctx, site, p);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)$/,
    access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls),
    handle: (ctx): PollOffice => {
      const { site, state } = office(ctx, FEATURE.polls, 'polls.manage');
      const p = findPoll(ctx, state);
      // Once open, the question, options and audience never change (answers were given to them).
      if (p.state !== 'draft') problem(ctx, 409, 'state_changed', 'community:errors.onlyDraft');
      Object.assign(p, readPoll(ctx, site, ctx.at));
      p.history.push(ev(now(ctx), ctx.persona!.displayName, 'staff', 'edited'));
      ctx.demo.save();
      return pollOffice(ctx, site, p);
    },
  },
  { method: 'POST', pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)\/open$/, access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls), handle: (ctx) => pollAction(ctx, 'open') },
  { method: 'POST', pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)\/close$/, access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls), handle: (ctx) => pollAction(ctx, 'close') },
  { method: 'POST', pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)\/publish$/, access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls), handle: (ctx) => pollAction(ctx, 'publish') },
  { method: 'POST', pattern: /^\/ops\/community\/polls\/(?<id>[\w-]+)\/withdraw$/, access: requires(HUB, 'polls.manage', 'operational', FEATURE.polls), handle: (ctx) => pollAction(ctx, 'withdraw') },
  // Residents ---------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/community\/polls$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): PollsResident => {
      const { res, state } = resident(ctx, FEATURE.polls);
      closeDue(ctx, res.site, state);
      const order: Record<string, number> = { open: 0, published: 1, closed: 2, withdrawn: 3 };
      const items = state.polls
        .filter((p) => p.state !== 'draft')
        .map((p) => residentPoll(ctx, res, p))
        .filter((p): p is PollResident => !!p)
        .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || b.closesOn.localeCompare(a.closesOn));
      return { items };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/community\/polls\/(?<id>[\w-]+)\/respond$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): PollResident => {
      const { res, state } = resident(ctx, FEATURE.polls);
      closeDue(ctx, res.site, state);
      const p = state.polls.find((x) => x.id === ctx.params.id && x.state !== 'draft');
      const view = p ? residentPoll(ctx, res, p) : null;
      if (!p || !view) notFound(ctx);
      if (p.state !== 'open') problem(ctx, 409, 'poll_closed', 'community:errors.pollClosed');
      const b = (ctx.req.body ?? {}) as { optionId?: unknown; flatId?: unknown };
      if (!p.options.some((o) => o.id === b.optionId)) invalid(ctx, 'optionId', 'forms:errors.required');
      let key = res.partyId;
      let flatCode = '';
      if (p.unit === 'flat') {
        const choice = view.answerable.find((a) => a.flatId === b.flatId) ?? (view.answerable.length === 1 && b.flatId === undefined ? view.answerable[0] : undefined);
        // One answer per flat: the household already answered, or the flat is not in this poll.
        if (!choice?.flatId) problem(ctx, 409, 'already_answered', 'community:errors.alreadyAnswered');
        key = choice.flatId;
        flatCode = choice.flatCode ?? '';
      } else if (!view.answerable.length) problem(ctx, 409, 'already_answered', 'community:errors.alreadyAnswered');
      const flat = p.unit === 'flat' ? res.site.flats.find((f) => f.id === key)! : res.site.flats.find((f) => members(res.site, res.s.view.facts, p.audience, ctx.at).find((m) => m.partyId === res.partyId)?.flatIds.includes(f.id))!;
      p.voters.push({ key, by: res.partyId, at: now(ctx), ...(flatCode ? { flatCode } : {}) });
      const optionId = b.optionId as string;
      if (p.anonymous) {
        // Only a count per block and option: nothing links this answer to the person.
        p.tally[flat.buildingCode] ??= {};
        p.tally[flat.buildingCode]![optionId] = (p.tally[flat.buildingCode]![optionId] ?? 0) + 1;
      } else {
        p.named.push({ partyId: res.partyId, name: res.name, flat: flat.code, optionId });
        p.tally[flat.buildingCode] ??= {};
        p.tally[flat.buildingCode]![optionId] = (p.tally[flat.buildingCode]![optionId] ?? 0) + 1;
      }
      ctx.demo.save();
      return residentPoll(ctx, res, p)!;
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Resources published to residents (DOC-001)
// ---------------------------------------------------------------------------------------------

const MAX_FILE = 10 * 1024 * 1024;

function resourceOffice(ctx: HandlerContext, site: OpsSite, r: StoredResource): ResourceOffice {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    category: r.category,
    description: r.description,
    file: r.file,
    audience: audienceLabel(site, r.audience),
    state: r.state,
    publishedAt: r.publishedAt,
    publishedByName: r.publishedByName,
    ...(r.withdrawn ? { withdrawn: r.withdrawn } : {}),
    reach: members(site, site.society?.view.facts ?? [], r.audience, ctx.at).length,
  };
}

const RESOURCE_HANDLERS: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ops\/community\/resources$/,
    access: requires(HUB, 'resources.publish', 'operational', FEATURE.resources),
    handle: (ctx): ResourcesOffice => {
      const { site, state } = office(ctx, FEATURE.resources, 'resources.publish');
      return { items: state.resources.map((r) => resourceOffice(ctx, site, r)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), blocks: site.buildings.map((b) => ({ id: b.id, code: b.code })) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/community\/resources$/,
    access: requires(HUB, 'resources.publish', 'operational', FEATURE.resources),
    handle: (ctx): ResourceOffice => {
      const { site, state } = office(ctx, FEATURE.resources, 'resources.publish');
      const b = (ctx.req.body ?? {}) as Record<string, unknown>;
      const title = text(ctx, 'title', b.title, 3, 120);
      if (!RESOURCE_CATEGORIES.includes(b.category as (typeof RESOURCE_CATEGORIES)[number])) invalid(ctx, 'category', 'forms:errors.required');
      const description = text(ctx, 'description', b.description, 0, 400);
      const f = (b.file ?? {}) as { name?: unknown; type?: unknown; sizeBytes?: unknown };
      if (typeof f.name !== 'string' || !f.name.trim()) invalid(ctx, 'file', 'community:errors.fileRequired');
      if (f.type !== 'application/pdf') invalid(ctx, 'file', 'community:errors.fileType');
      if (typeof f.sizeBytes !== 'number' || f.sizeBytes <= 0 || f.sizeBytes > MAX_FILE) invalid(ctx, 'file', 'community:errors.fileSize', { max: '10' });
      const audience = readAudience(ctx, site, b.audience);
      const { id, ref } = nextCommunity(state, site, 'resource');
      const r: StoredResource = { id, ref, title, category: b.category as StoredResource['category'], description, file: { name: (f.name as string).trim(), type: 'application/pdf', sizeBytes: f.sizeBytes as number }, audience, state: 'published', publishedAt: now(ctx), publishedByName: ctx.persona!.displayName };
      state.resources.push(r);
      ctx.demo.save();
      return resourceOffice(ctx, site, r);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ops\/community\/resources\/(?<id>[\w-]+)\/withdraw$/,
    access: requires(HUB, 'resources.publish', 'operational', FEATURE.resources),
    handle: (ctx): ResourceOffice => {
      const { site, state } = office(ctx, FEATURE.resources, 'resources.publish');
      const r = state.resources.find((x) => x.id === ctx.params.id);
      if (!r) notFound(ctx);
      if (r.state !== 'published') problem(ctx, 409, 'state_changed', 'community:errors.stateChanged');
      const reason = text(ctx, 'reason', (ctx.req.body as { reason?: unknown } | undefined)?.reason, 5, 400);
      r.state = 'withdrawn';
      r.withdrawn = { at: now(ctx), byName: ctx.persona!.displayName, reason };
      ctx.demo.save();
      return resourceOffice(ctx, site, r);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/community\/resources$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): { items: ResourceResident[] } => {
      const { res, state } = resident(ctx, FEATURE.resources);
      const items = state.resources
        .filter((r) => r.state === 'published' && inAudience(res.site, r.audience, res.partyId, ctx.at))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .map((r) => ({ id: r.id, title: r.title, category: r.category, description: r.description, file: r.file, publishedAt: r.publishedAt }));
      return { items };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Community home (PORTAL-036)
// ---------------------------------------------------------------------------------------------

const HOME: Handler = {
  method: 'GET',
  pattern: /^\/portal\/community\/home$/,
  access: requires('resident_portal', 'portal.use', 'operational'),
  handle: (ctx): CommunityHome => {
    // Rule R only: the home and its notices summary need no add-on (D-49).
    const res = residentOps(ctx);
    const notices = residentNoticeList(ctx);
    const allows = (module: 'community_chat' | 'community_hub' | 'maintenance', feature?: FeatureKey) => res.flats.some((f) => serviceAllows(ctx, { module, ...(feature ? { feature } : {}) }, f));
    const tabs: CommunityTab[] = ['notices'];
    const state = communityState(ctx, res.site);
    let polls: CommunityHome['polls'] = null;
    let services: CommunityHome['services'] = null;
    let resources: CommunityHome['resources'] = null;
    if (allows(HUB, FEATURE.polls)) {
      tabs.push('polls');
      closeDue(ctx, res.site, state);
      const mine = state.polls.filter((p) => p.state === 'open').map((p) => residentPoll(ctx, res, p)).filter((p): p is PollResident => !!p);
      polls = { open: mine.length, toAnswer: mine.filter((p) => p.answerable.length > 0).length };
    }
    if (allows(HUB, FEATURE.services)) {
      tabs.push('services');
      services = { listed: state.providers.filter((p) => p.status === 'listed').length };
    }
    if (allows(HUB, FEATURE.resources)) {
      tabs.push('resources');
      const list = state.resources.filter((r) => r.state === 'published' && inAudience(res.site, r.audience, res.partyId, ctx.at)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      resources = { count: list.length, ...(list[0] ? { latest: { id: list[0].id, title: list[0].title } } : {}) };
    }
    let chat: CommunityHome['chat'] = null;
    if (allows('community_chat')) {
      try {
        chat = residentChatSummary(ctx);
      } catch {
        // A resident with no current occupancy has no groups: the card says so.
        chat = { available: false, unread: 0 };
      }
    }
    return {
      siteName: res.site.name,
      notices: {
        unread: notices.counts.unread,
        latest: notices.items
          .filter((n) => n.state !== 'withdrawn')
          .slice(0, 3)
          .map((n) => ({ id: n.id, title: n.title ?? '', publishedAt: n.publishedAt, needsAck: n.ackRequired && n.state !== 'acknowledged', unread: n.state === 'unread' })),
      },
      chat,
      issues: allows('maintenance', 'maintenance.community_issues'),
      tabs,
      polls,
      services,
      resources,
    };
  },
};

export const COMMUNITY_HUB_HANDLERS: readonly Handler[] = [HOME, ...DIRECTORY_HANDLERS, ...POLL_HANDLERS, ...RESOURCE_HANDLERS];
