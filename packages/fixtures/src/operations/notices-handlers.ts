import {
  AUDIENCE_ROLES,
  NOTICE_CATEGORIES,
  type AudiencePreview,
  type BroadcastInput,
  type BroadcastMessage,
  type NoticeAudience,
  type NoticeDetail,
  type NoticeInput,
  type NoticeList,
  type NoticeRow,
  type NoticeStats,
  type NoticeState,
  type ResidentNotice,
  type ResidentNoticeOpen,
  type ResidentNotices,
  type ResidentNotification,
  type ResidentNotifications,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { problem } from '../society/handlers';
import { audienceLabel, inAudience, members, previewOf, recipientsOf } from './audience';
import { invalid, channelsLicensed, contactFacts, now, opsOf, save, staffOps, who, type Staff } from './common';
import { residentOps, serviceAllows, type ResidentOps } from './site';
import { nextOf, type StoredMessage, type StoredNotice } from './state';

/**
 * Official notices and quick broadcasts (Gate D.2: RES-005, NOT-003, PORTAL-023, PORTAL-042,
 * PORTAL-043; D-49). Notices need only the included modules: the office opens RES-005 with
 * `residents.view` and publishes with `notices.publish` (communications); residents read them through
 * `resident_portal` + `portal.use`. No community hub or chat grant or permission is on the path. The
 * audience comes from verified links and is checked again on every read and open; an edit is a new
 * version; a withdrawal leaves a dated tombstone and withdraws its notifications. Notices are one way:
 * there are no replies. Text messages and WhatsApp copies are simulated and need recorded consent.
 */
const ROLES = new Set<string>(AUDIENCE_ROLES);
const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as T;

function audienceOf(ctx: HandlerContext, staff: Staff, raw: unknown): NoticeAudience {
  const a = (raw ?? {}) as Partial<NoticeAudience>;
  if (!a.scope || !['site', 'blocks', 'floors', 'units'].includes(a.scope)) invalid(ctx, 'audience', 'operations:errors.audience');
  const roles = Array.isArray(a.roles) ? [...new Set(a.roles.filter((r) => ROLES.has(r)))] : [];
  if (!roles.length) invalid(ctx, 'roles', 'operations:errors.audienceRoles');
  const ids = Array.isArray(a.ids) ? [...new Set(a.ids.map(String))] : [];
  const known = a.scope === 'blocks' ? staff.site.buildings.map((b) => b.id) : a.scope === 'floors' ? staff.site.floors.map((f) => f.id) : a.scope === 'units' ? staff.site.flats.map((f) => f.id) : [];
  if (a.scope !== 'site' && (!ids.length || ids.some((id) => !known.includes(id)))) invalid(ctx, 'audience', 'operations:errors.audience');
  return { scope: a.scope, ids: a.scope === 'site' ? [] : ids, roles };
}

const facts = (staff: Staff) => staff.site.society?.view.facts ?? [];

/** A notice's state on a date: published notices past their end date read as expired. */
const stateOf = (n: StoredNotice, on: string): NoticeState => (n.state === 'published' && n.expiresOn && n.expiresOn < on ? 'expired' : n.state);

function statsOf(ctx: HandlerContext, staff: Staff, n: StoredNotice): NoticeStats | undefined {
  if (!n.publishedAt) return undefined;
  const list = n.recipients.map((r) => ({ ...r, leftAudience: !inAudience(staff.site, facts(staff), n.audience, r.partyId, ctx.at) }));
  return {
    recipients: list.length,
    delivered: list.filter((r) => r.inApp === 'delivered' || r.sms === 'sent_simulated' || r.whatsapp === 'sent_simulated').length,
    read: list.filter((r) => r.readAt).length,
    acknowledged: list.filter((r) => r.acknowledgedAt && (r.acknowledgedVersion ?? 0) >= n.current.version).length,
    noAppAccount: list.filter((r) => r.inApp === 'no_app_account').length,
    smsSent: list.filter((r) => r.sms === 'sent_simulated').length,
    whatsappSent: list.filter((r) => r.whatsapp === 'sent_simulated').length,
    leftAudience: list.filter((r) => r.leftAudience).length,
  };
}

function rowOf(ctx: HandlerContext, staff: Staff, n: StoredNotice): NoticeRow {
  const stats = statsOf(ctx, staff, n);
  return { id: n.id, ref: n.ref, title: n.current.title, category: n.current.category, state: stateOf(n, ctx.at), version: n.current.version, audienceLabel: n.audienceLabel || audienceLabel(staff.site, n.audience), ackRequired: n.ackRequired, ...(n.publishedAt ? { publishedAt: n.publishedAt } : {}), ...(n.publishAt ? { publishAt: n.publishAt } : {}), ...(stats ? { stats } : {}) };
}

function detailOf(ctx: HandlerContext, staff: Staff, n: StoredNotice): NoticeDetail {
  const state = stateOf(n, ctx.at);
  const publish = can(ctx, 'notices.publish', 'operational');
  const recipients = n.recipients.map((r) => ({ ...r, leftAudience: !inAudience(staff.site, facts(staff), n.audience, r.partyId, ctx.at) }));
  const stats = statsOf(ctx, staff, n);
  const { recipients: _r, ...notice } = n;
  return {
    notice: { ...notice, state, audienceLabel: n.audienceLabel || audienceLabel(staff.site, n.audience) },
    ...(stats ? { stats } : {}),
    recipients,
    unacknowledgedFlats: n.ackRequired ? [...new Set(recipients.filter((r) => !r.leftAudience && !(r.acknowledgedAt && (r.acknowledgedVersion ?? 0) >= n.current.version)).flatMap((r) => r.flatCodes))].sort() : [],
    actions: {
      publish: publish && (state === 'draft' || state === 'scheduled'),
      edit: publish && (state === 'draft' || state === 'scheduled' || state === 'published'),
      withdraw: publish && (state === 'published' || state === 'scheduled'),
      ...(!publish ? { reason: can(ctx, 'notices.publish', 'history_read') ? 'tenant_suspended' : 'read_only' } : {}),
    },
  };
}

function findNotice(ctx: HandlerContext, staff: Staff): StoredNotice {
  const n = staff.ops.notices.find((x) => x.id === ctx.params.id);
  if (!n) notFound(ctx);
  return n;
}

const text = (ctx: HandlerContext, field: string, v: unknown, min: number, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) invalid(ctx, field, 'operations:errors.tooShort', { min: String(min) });
  if (s.length > max) invalid(ctx, field, 'operations:errors.tooLong', { max: String(max) });
  return s;
};

/** Publication: recipients are resolved now from the verified links in force; each gets one notification. */
function publish(ctx: HandlerContext, staff: Staff, n: StoredNotice) {
  const at = now(ctx);
  const list = members(staff.site, facts(staff), n.audience, ctx.at);
  n.recipients = recipientsOf(list, n.channels, channelsLicensed(ctx), contactFacts(ctx));
  n.state = 'published';
  n.publishedAt = at;
  delete n.publishAt;
  n.current = { ...n.current, at };
  n.versions = n.versions.map((v) => (v.version === n.current.version ? n.current : v));
  n.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'published', values: { recipients: String(n.recipients.length) } });
}

const recent = new Map<string, string>();

function create(ctx: HandlerContext, staff: Staff, input: NoticeInput, action: 'draft' | 'publish' | 'schedule', fromMessage?: { id: string; ref: string }): StoredNotice {
  const key = input.idempotencyKey ? `${ctx.tenantId}:${input.idempotencyKey}` : undefined;
  if (key && recent.has(key)) {
    const done = staff.ops.notices.find((n) => n.id === recent.get(key));
    if (done) return done;
  }
  const title = text(ctx, 'title', input.title, 5, 120);
  const bodyText = text(ctx, 'body', input.body, 20, 4000);
  if (!(NOTICE_CATEGORIES as readonly string[]).includes(input.category)) invalid(ctx, 'category', 'forms:errors.required');
  const audience = audienceOf(ctx, staff, input.audience);
  if (input.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || input.expiresOn < ctx.at)) invalid(ctx, 'expiresOn', 'operations:errors.dateInPast');
  const at = now(ctx);
  if (action === 'schedule' && (!input.publishAt || !(Date.parse(input.publishAt) > Date.parse(at)))) invalid(ctx, 'publishAt', 'operations:errors.scheduleFuture');
  const { id, ref } = nextOf(staff.ops, staff.site, 'notice');
  const version = { version: 1, title, body: bodyText, category: input.category, at, byName: who(ctx), renotified: false };
  const n: StoredNotice = {
    id,
    ref,
    siteId: staff.site.siteId,
    state: action === 'schedule' ? 'scheduled' : 'draft',
    current: version,
    versions: [version],
    audience,
    audienceLabel: audienceLabel(staff.site, audience),
    ackRequired: !!input.ackRequired,
    channels: { sms: !!input.channels?.sms, whatsapp: !!input.channels?.whatsapp },
    ...(action === 'schedule' ? { publishAt: new Date(Date.parse(input.publishAt!)).toISOString() } : {}),
    ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
    createdAt: at,
    createdByName: who(ctx),
    ...(fromMessage ? { fromMessage } : {}),
    recipients: [],
    history: [{ at, byName: who(ctx), byKind: 'staff', action: action === 'schedule' ? 'scheduled' : 'drafted' }],
  };
  staff.ops.notices.push(n);
  if (action === 'publish') publish(ctx, staff, n);
  if (key) recent.set(key, n.id);
  return n;
}

// ---------------------------------------------------------------------------------------------
// Resident side
// ---------------------------------------------------------------------------------------------

const resident = (ctx: HandlerContext) => {
  // Rule R for notices: resident_portal only (no hub, no chat), with a link in force at the site.
  const res = residentOps(ctx);
  return { res, staff: { site: res.site, ops: opsOf(ctx, res.site) } satisfies Staff };
};

const readIds = (staff: Staff, partyId: string) => new Set(staff.ops.reads[partyId] ?? []);
const markRead = (staff: Staff, partyId: string, id: string) => {
  staff.ops.reads[partyId] = [...new Set([...(staff.ops.reads[partyId] ?? []), id])];
};

/** Notices this resident may see now: published (or withdrawn after publication) and they are in the audience today. */
function visibleNotices(ctx: HandlerContext, res: ResidentOps, staff: Staff): StoredNotice[] {
  return staff.ops.notices.filter((n) => n.publishedAt && (n.state === 'published' || n.state === 'withdrawn') && inAudience(staff.site, facts(staff), n.audience, res.partyId, ctx.at));
}

function residentNotice(staff: Staff, res: ResidentOps, n: StoredNotice, on: string): ResidentNotice {
  const me = n.recipients.find((r) => r.partyId === res.partyId);
  if (n.state === 'withdrawn') return { id: n.id, ref: n.ref, state: 'withdrawn', publishedAt: n.publishedAt!, ackRequired: false, withdrawn: { at: n.withdrawn!.at } };
  const acknowledged = !!me?.acknowledgedAt && (me.acknowledgedVersion ?? 0) >= n.current.version;
  const read = !!me?.readAt || readIds(staff, res.partyId).has(`ntf_${n.id}`);
  return {
    id: n.id,
    ref: n.ref,
    state: acknowledged ? 'acknowledged' : read ? 'read' : 'unread',
    title: n.current.title,
    body: n.current.body,
    category: n.current.category,
    version: n.current.version,
    ...(n.current.version > 1 ? { updatedOn: n.current.at } : {}),
    publishedAt: n.publishedAt!,
    ackRequired: n.ackRequired && stateOf(n, on) === 'published',
    ...(acknowledged ? { acknowledgedAt: me!.acknowledgedAt! } : {}),
  };
}

function noticesFor(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentNotices {
  const items = visibleNotices(ctx, res, staff)
    .map((n) => residentNotice(staff, res, n, ctx.at))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { asOf: ctx.at, items, counts: { unread: items.filter((i) => i.state === 'unread').length, needsAck: items.filter((i) => i.ackRequired && i.state !== 'acknowledged').length } };
}

/**
 * PORTAL-042: the resident's notifications, re-checked on every read: a notice's while the resident is
 * still in its audience (a withdrawn one shows as withdrawn), a broadcast's likewise, and the
 * resident's own events only while that service is licensed for the flat.
 */
function notificationsFor(ctx: HandlerContext, res: ResidentOps, staff: Staff): ResidentNotifications {
  const read = readIds(staff, res.partyId);
  const items: ResidentNotification[] = [];
  for (const n of staff.ops.notices) {
    if (!n.publishedAt || !n.recipients.some((r) => r.partyId === res.partyId)) continue;
    if (!inAudience(staff.site, facts(staff), n.audience, res.partyId, ctx.at)) continue;
    const id = `ntf_${n.id}`;
    if (n.state === 'withdrawn') items.push({ id, kind: 'notice', key: 'noticeWithdrawn', values: { ref: n.ref }, at: n.withdrawn!.at, read: true, withdrawn: true, href: `/customer/portal/community-notices/${n.id}` });
    else items.push({ id, kind: 'notice', key: n.current.version > 1 && n.current.renotified ? 'noticeUpdated' : 'noticePublished', values: { title: n.current.title }, at: n.current.renotified ? n.current.at : n.publishedAt, read: read.has(id) || !!n.recipients.find((r) => r.partyId === res.partyId)?.readAt, href: `/customer/portal/community-notices/${n.id}` });
  }
  for (const m of staff.ops.messages) {
    if (!m.recipientIds.includes(res.partyId) || !inAudience(staff.site, facts(staff), m.audience, res.partyId, ctx.at)) continue;
    const id = `ntf_${m.id}`;
    items.push({ id, kind: 'message', key: 'message', values: { text: m.text }, at: m.sentAt, read: read.has(id), href: m.notice ? `/customer/portal/community-notices/${m.notice.id}` : '/customer/portal/community-notices' });
  }
  for (const e of staff.ops.events) {
    if (!e.partyIds.includes(res.partyId)) continue;
    const flat = e.flatId ? res.flats.find((f) => f.flat.id === e.flatId) : res.flats[0];
    if (!flat || !serviceAllows(ctx, { module: e.module }, flat)) continue;
    items.push({ id: e.id, kind: e.kind, key: e.key, values: e.values, at: e.at, read: read.has(e.id), href: e.href });
  }
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { asOf: ctx.at, items, unread: items.filter((i) => !i.read && !i.withdrawn).length };
}

export const OPS_NOTICE_HANDLERS: readonly Handler[] = [
  // Staff: RES-005 ---------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/notices$/,
    access: requires('residents', 'residents.view', 'history_read'),
    handle: (ctx): NoticeList => {
      const staff = staffOps(ctx, 'residents');
      const rows = staff.ops.notices.map((n) => rowOf(ctx, staff, n));
      const status = String(ctx.req.query?.status ?? 'published');
      const q = String(ctx.req.query?.q ?? '').trim().toLowerCase();
      const counts = Object.fromEntries((['published', 'scheduled', 'draft', 'withdrawn', 'expired'] as const).map((s) => [s, rows.filter((r) => r.state === s).length])) as NoticeList['counts'];
      return { items: rows.filter((r) => (status === 'all' || r.state === status) && (!q || [r.ref, r.title].some((v) => v.toLowerCase().includes(q)))).sort((a, b) => Date.parse(b.publishedAt ?? b.publishAt ?? '2100-01-01') - Date.parse(a.publishedAt ?? a.publishAt ?? '2100-01-01')), counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/notices\/(?<id>ntc_[\w-]+)$/,
    access: requires('residents', 'residents.view', 'history_read'),
    handle: (ctx): NoticeDetail => {
      const staff = staffOps(ctx, 'residents');
      return detailOf(ctx, staff, findNotice(ctx, staff));
    },
  },
  {
    method: 'POST',
    pattern: /^\/notices\/preview$/,
    access: requires('communications', 'notices.publish', 'history_read'),
    handle: (ctx): AudiencePreview => {
      const staff = staffOps(ctx, 'residents');
      return previewOf(staff.site, facts(staff), audienceOf(ctx, staff, body<{ audience?: unknown }>(ctx).audience), ctx.at, contactFacts(ctx));
    },
  },
  {
    method: 'POST',
    pattern: /^\/notices$/,
    access: requires('communications', 'notices.publish', 'operational'),
    handle: (ctx): NoticeDetail => {
      const staff = staffOps(ctx, 'residents');
      const input = body<NoticeInput & { action?: 'draft' | 'publish' | 'schedule' }>(ctx);
      const action = input.action === 'publish' || input.action === 'schedule' ? input.action : 'draft';
      const n = create(ctx, staff, input, action);
      save(ctx);
      return detailOf(ctx, staff, n);
    },
  },
  {
    // An edit: a draft changes in place; a published notice gets a new version (notify again only if chosen).
    method: 'PATCH',
    pattern: /^\/notices\/(?<id>ntc_[\w-]+)$/,
    access: requires('communications', 'notices.publish', 'operational'),
    handle: (ctx): NoticeDetail => {
      const staff = staffOps(ctx, 'residents');
      const n = findNotice(ctx, staff);
      const state = stateOf(n, ctx.at);
      if (state === 'withdrawn' || state === 'expired') problem(ctx, 409, 'state_locked', 'operations:errors.noticeClosed');
      const input = body<NoticeInput>(ctx);
      const title = text(ctx, 'title', input.title, 5, 120);
      const bodyText = text(ctx, 'body', input.body, 20, 4000);
      if (!(NOTICE_CATEGORIES as readonly string[]).includes(input.category)) invalid(ctx, 'category', 'forms:errors.required');
      const at = now(ctx);
      if (state === 'published') {
        // The audience of a published notice never changes (a new notice is sent instead).
        const changeNote = text(ctx, 'changeNote', input.changeNote, 5, 300);
        const version = { version: n.current.version + 1, title, body: bodyText, category: input.category, at, byName: who(ctx), renotified: !!input.renotify, changeNote };
        n.versions.push(version);
        n.current = version;
        n.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'new_version', values: { version: String(version.version), renotified: String(!!input.renotify) }, note: changeNote });
        if (input.renotify) for (const r of n.recipients) delete r.readAt;
      } else {
        const audience = audienceOf(ctx, staff, input.audience);
        n.current = { ...n.current, title, body: bodyText, category: input.category, at, byName: who(ctx) };
        n.versions = [n.current];
        n.audience = audience;
        n.audienceLabel = audienceLabel(staff.site, audience);
        n.ackRequired = !!input.ackRequired;
        n.channels = { sms: !!input.channels?.sms, whatsapp: !!input.channels?.whatsapp };
        if (input.expiresOn) n.expiresOn = input.expiresOn;
        n.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'edited' });
      }
      save(ctx);
      return detailOf(ctx, staff, n);
    },
  },
  {
    method: 'POST',
    pattern: /^\/notices\/(?<id>ntc_[\w-]+)\/publish$/,
    access: requires('communications', 'notices.publish', 'operational'),
    handle: (ctx): NoticeDetail => {
      const staff = staffOps(ctx, 'residents');
      const n = findNotice(ctx, staff);
      if (n.state !== 'draft' && n.state !== 'scheduled') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      publish(ctx, staff, n);
      save(ctx);
      return detailOf(ctx, staff, n);
    },
  },
  {
    method: 'POST',
    pattern: /^\/notices\/(?<id>ntc_[\w-]+)\/withdraw$/,
    access: requires('communications', 'notices.publish', 'operational'),
    handle: (ctx): NoticeDetail => {
      const staff = staffOps(ctx, 'residents');
      const n = findNotice(ctx, staff);
      if (n.state !== 'published' && n.state !== 'scheduled') problem(ctx, 409, 'state_locked', 'operations:errors.wrongStep');
      const reason = text(ctx, 'reason', body<{ reason?: string }>(ctx).reason, 10, 300);
      const at = now(ctx);
      n.state = 'withdrawn';
      n.withdrawn = { at, byName: who(ctx), reason };
      for (const r of n.recipients) r.inApp = r.inApp === 'delivered' ? 'withdrawn' : r.inApp;
      n.history.push({ at, byName: who(ctx), byKind: 'staff', action: 'withdrawn', note: reason });
      save(ctx);
      return detailOf(ctx, staff, n);
    },
  },
  // Staff: NOT-003 quick broadcast -----------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/messages$/,
    access: requires('communications', ['messages.send', 'notices.publish', 'residents.view'], 'history_read'),
    handle: (ctx): BroadcastMessage[] => {
      const staff = staffOps(ctx, 'residents');
      return [...staff.ops.messages].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)).map(({ recipientIds: _r, ...m }) => m);
    },
  },
  {
    method: 'POST',
    pattern: /^\/messages$/,
    access: requires('communications', 'messages.send', 'operational'),
    handle: (ctx): BroadcastMessage => {
      const staff = staffOps(ctx, 'residents');
      const input = body<BroadcastInput>(ctx);
      const message = text(ctx, 'text', input.text, 5, 300);
      const audience = audienceOf(ctx, staff, input.audience);
      // Posting it as an official notice needs the notice permission too.
      if (input.alsoNotice && !can(ctx, 'notices.publish', 'operational')) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
      const channels = { sms: !!input.channels?.sms, whatsapp: !!input.channels?.whatsapp };
      const list = members(staff.site, facts(staff), audience, ctx.at);
      const recipients = recipientsOf(list, channels, channelsLicensed(ctx), contactFacts(ctx));
      const { id, ref } = nextOf(staff.ops, staff.site, 'message');
      const at = now(ctx);
      let notice: { id: string; ref: string } | undefined;
      if (input.alsoNotice) {
        const title = text(ctx, 'noticeTitle', input.noticeTitle ?? message.slice(0, 60), 5, 120);
        const n = create(ctx, staff, { title, body: message.length >= 20 ? message : `${message}\n\n${title}`, category: 'general', audience, ackRequired: false, channels: { sms: false, whatsapp: false } }, 'publish', { id, ref });
        notice = { id: n.id, ref: n.ref };
      }
      const m: StoredMessage = {
        id,
        ref,
        siteId: staff.site.siteId,
        text: message,
        audience,
        audienceLabel: audienceLabel(staff.site, audience),
        channels,
        sentAt: at,
        sentByName: who(ctx),
        ...(notice ? { notice } : {}),
        totals: {
          recipients: recipients.length,
          inApp: recipients.filter((r) => r.inApp === 'delivered').length,
          noAppAccount: recipients.filter((r) => r.inApp === 'no_app_account').length,
          sms: recipients.filter((r) => r.sms === 'sent_simulated').length,
          whatsapp: recipients.filter((r) => r.whatsapp === 'sent_simulated').length,
          skippedNoConsent: recipients.filter((r) => r.sms === 'no_consent' || r.whatsapp === 'no_consent').length,
        },
        recipientIds: recipients.map((r) => r.partyId),
      };
      staff.ops.messages.push(m);
      save(ctx);
      const { recipientIds: _ids, ...out } = m;
      return out;
    },
  },
  // Resident: PORTAL-023, PORTAL-043, PORTAL-042 ----------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/portal\/notices$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentNotices => {
      const { res, staff } = resident(ctx);
      return noticesFor(ctx, res, staff);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/notices\/(?<id>[\w-]+)$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentNoticeOpen => {
      const { res, staff } = resident(ctx);
      const n = staff.ops.notices.find((x) => x.id === ctx.params.id && x.publishedAt);
      if (!n) return { available: false, reason: 'not_found' };
      // The audience is checked on every open: a moved-out resident or another block sees nothing of it.
      if (!inAudience(staff.site, facts(staff), n.audience, res.partyId, ctx.at)) return { available: false, reason: 'not_in_audience' };
      return { available: true, notice: residentNotice(staff, res, n, ctx.at) };
    },
  },
  ...(['read', 'acknowledge'] as const).map(
    (action): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^\\/portal\\/notices\\/(?<id>[\\w-]+)\\/${action}$`),
      access: requires('resident_portal', 'portal.use', action === 'read' ? 'history_read' : 'operational'),
      handle: (ctx): ResidentNotice => {
        const { res, staff } = resident(ctx);
        const n = staff.ops.notices.find((x) => x.id === ctx.params.id && x.publishedAt);
        if (!n || !inAudience(staff.site, facts(staff), n.audience, res.partyId, ctx.at)) notFound(ctx);
        if (n.state === 'withdrawn') problem(ctx, 409, 'state_locked', 'operations:errors.noticeWithdrawn');
        const at = now(ctx);
        let me = n.recipients.find((r) => r.partyId === res.partyId);
        if (!me) {
          // In the audience now but not when it was published (moved in since): their reading is still recorded.
          me = { partyId: res.partyId, name: res.name, flatCodes: res.flats.map((f) => f.flat.code), roles: [...new Set(res.flats.flatMap((f) => f.roles))], inApp: 'delivered', sms: 'not_chosen', whatsapp: 'not_chosen' };
          n.recipients.push(me);
        }
        me.readAt ??= at;
        markRead(staff, res.partyId, `ntf_${n.id}`);
        if (action === 'acknowledge') {
          if (!n.ackRequired || stateOf(n, ctx.at) !== 'published') problem(ctx, 409, 'state_locked', 'operations:errors.noAckNeeded');
          me.acknowledgedAt = at;
          me.acknowledgedVersion = n.current.version;
          n.history.push({ at, byName: res.name, byKind: 'resident', action: 'acknowledged', values: { version: String(n.current.version) } });
        }
        save(ctx);
        return residentNotice(staff, res, n, ctx.at);
      },
    }),
  ),
  {
    method: 'GET',
    pattern: /^\/portal\/notifications$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentNotifications => {
      const { res, staff } = resident(ctx);
      return notificationsFor(ctx, res, staff);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/notifications\/read-all$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentNotifications => {
      const { res, staff } = resident(ctx);
      for (const i of notificationsFor(ctx, res, staff).items) markRead(staff, res.partyId, i.id);
      save(ctx);
      return notificationsFor(ctx, res, staff);
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal\/notifications\/(?<id>[\w-]+)\/read$/,
    access: requires('resident_portal', 'portal.use', 'history_read'),
    handle: (ctx): ResidentNotifications => {
      const { res, staff } = resident(ctx);
      const mine = notificationsFor(ctx, res, staff);
      if (!mine.items.some((i) => i.id === ctx.params.id)) notFound(ctx);
      markRead(staff, res.partyId, ctx.params.id!);
      save(ctx);
      return notificationsFor(ctx, res, staff);
    },
  },
];

