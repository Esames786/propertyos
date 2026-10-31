import type { FeatureKey, ModuleKey, NotificationKind, RequestRow, ResidentRequest, SlaTarget } from '@repo/contracts';
import { authorize, can, type HandlerContext } from '../handler-types';
import { identityOf } from '../identity/state';
import { principalOfParty } from '../identity/portal-access-handlers';
import { problem } from '../society/handlers';
import { audienceLabel, members, recipientsOf, type ContactFacts } from './audience';
import { opsSite, siteRecord, type OpsSite } from './site';
import { slaOf } from './sla';
import { opsStamp, opsState, type OpsState, type StoredRequest } from './state';

/**
 * Shared pieces of the D.2 endpoints: the staff gate (module licensed for the site, then the
 * permission the transport already checked), contact facts for simulated messages (consent per
 * channel, from D.1's records), request views with service levels, and residents' notifications.
 */
export interface Staff {
  site: OpsSite;
  ops: OpsState;
}

/** A staff endpoint: the module (and feature) must be licensed for the organisation's site. */
export function staffOps(ctx: HandlerContext, module: ModuleKey, feature?: FeatureKey): Staff {
  if (ctx.persona?.app === 'customer') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const site = opsSite(ctx);
  authorize(ctx, module, siteRecord(site));
  if (feature && !ctx.access?.features.includes(feature)) problem(ctx, 403, 'feature_not_licensed', 'errors:access.feature_not_licensed');
  return { site, ops: opsOf(ctx, site) };
}

/**
 * The operations state of the site. Seeded notices are given their recipients the first time they
 * are read (who had the app and consented to messages comes from D.1's records); some of the
 * register's other residents have read or acknowledged them, the featured demo residents have not.
 */
export function opsOf(ctx: HandlerContext, site: OpsSite): OpsState {
  const ops = opsState(ctx, site);
  if (!ops.recipientsSeeded) {
    ops.recipientsSeeded = true;
    const contacts = contactFacts(ctx);
    const featured = new Set(['pty_anr_0001', 'pty_anr_0003', 'pty_anr_0010', 'pty_anr_0011']);
    for (const n of ops.notices.filter((x) => x.publishedAt && !x.recipients.length)) {
      const on = n.publishedAt!.slice(0, 10);
      n.recipients = recipientsOf(members(site, site.society?.view.facts ?? [], n.audience, on), n.channels, channelsLicensed(ctx), contacts);
      n.audienceLabel = audienceLabel(site, n.audience);
      n.recipients.forEach((r, i) => {
        if (featured.has(r.partyId) || r.inApp !== 'delivered' || i % 3 === 0) return;
        r.readAt = new Date(Date.parse(n.publishedAt!) + (i + 2) * 3_600_000).toISOString().replace('.000Z', 'Z');
        if (n.ackRequired && i % 2 === 0) {
          r.acknowledgedAt = r.readAt;
          r.acknowledgedVersion = n.current.version;
        }
      });
      n.history.push({ at: n.publishedAt!, byName: n.createdByName, byKind: 'staff', action: 'published', values: { recipients: String(n.recipients.length) } });
    }
    for (const n of ops.notices.filter((x) => x.state !== 'published' && !x.audienceLabel)) n.audienceLabel = audienceLabel(site, n.audience);
    for (const n of ops.notices.filter((x) => x.withdrawn && !x.history.some((h) => h.action === 'withdrawn'))) n.history.push({ at: n.withdrawn!.at, byName: n.withdrawn!.byName, byKind: 'staff', action: 'withdrawn', note: n.withdrawn!.reason });
    ctx.demo.save();
  }
  return ops;
}

export const save = (ctx: HandlerContext) => ctx.demo.save();
export const now = opsStamp;
export const who = (ctx: HandlerContext) => ctx.persona!.displayName;

/** Contact facts of the society's people (D.1): an active app account, and consent per channel. */
export function contactFacts(ctx: HandlerContext): ContactFacts {
  const identity = identityOf(ctx);
  return {
    hasAccount: (partyId) => identity.portal[partyId]?.status === 'active',
    consented: (partyId, channel) => (identity.contacts[principalOfParty(partyId)]?.consents ?? []).some((c) => c.channel === channel && c.consented),
  };
}

/** Message copies are simulated, and only where the metered channel is licensed. */
export const channelsLicensed = (ctx: HandlerContext) => ({ sms: !!ctx.access?.features.includes('communications.sms'), whatsapp: !!ctx.access?.features.includes('communications.whatsapp') });

export const isClosed = (r: StoredRequest) => r.state === 'closed' || r.state === 'resolved' || r.state === 'cancelled' || r.state === 'merged' || r.state === 'hidden';

export function requestSla(r: StoredRequest, targets: readonly SlaTarget[], at: string) {
  return slaOf(
    {
      urgency: r.urgency,
      createdAt: r.createdAt,
      ...(r.priority ? { priority: r.priority } : {}),
      ...(r.respondedAt ? { respondedAt: r.respondedAt } : {}),
      ...(r.completedAt ? { doneAt: r.completedAt } : r.state === 'resolved' && r.closedAt ? { doneAt: r.closedAt } : {}),
      stopped: r.state === 'cancelled' || r.state === 'merged' || r.state === 'hidden',
    },
    targets,
    at,
  );
}

export function rowOf(r: StoredRequest, targets: readonly SlaTarget[], at: string): RequestRow {
  const sla = requestSla(r, targets, at);
  const affected = r.kind === 'community_issue' ? new Set(r.affirmations.filter((a) => !a.withdrawnAt).map((a) => a.flatId)).size : undefined;
  return {
    id: r.id,
    ref: r.ref,
    kind: r.kind,
    category: r.category,
    title: r.title,
    state: r.state,
    urgency: r.urgency,
    ...(r.priority ? { priority: r.priority } : {}),
    where: r.flat?.code ?? r.area?.key ?? '',
    ...(r.flat ? { flatId: r.flat.id } : {}),
    createdAt: r.createdAt,
    ...(r.assignee ? { assigneeName: r.assignee.name } : {}),
    sla: { response: sla.response, resolution: sla.resolution, resolveBy: sla.resolveBy },
    ...(r.confirmation ? { confirmation: r.confirmation } : {}),
    reopenCount: r.reopenCount,
    ...(affected !== undefined ? { affected } : {}),
  };
}

/** A repair as its resident sees it: public comments only; no internal note or other resident. */
export function residentRequestOf(r: StoredRequest, ops: OpsState): ResidentRequest {
  const order = [...ops.workOrders].reverse().find((w) => w.requestId === r.id && w.state !== 'cancelled');
  return {
    id: r.id,
    ref: r.ref,
    kind: r.kind,
    category: r.category,
    title: r.title,
    description: r.description,
    ...(r.flat ? { flatCode: r.flat.code } : {}),
    ...(r.room ? { room: r.room } : {}),
    ...(r.area ? { area: r.area } : {}),
    urgency: r.urgency,
    state: r.state,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    files: r.files,
    ...(order ? { visit: { ...(order.scheduledOn ? { on: order.scheduledOn } : {}), ...(order.slot ? { slot: order.slot } : {}), technicianName: order.technicianName } } : {}),
    ...(order?.completion ? { completion: { at: order.completion.at, note: order.completion.note, files: order.completion.files } } : {}),
    ...(r.confirmation ? { confirmation: r.confirmation } : {}),
    reopenCount: r.reopenCount,
    comments: r.comments.filter((c) => c.visibility === 'public' && !c.hidden).map((c) => ({ id: c.id, at: c.at, byKind: c.byKind, byName: c.byKind === 'resident' ? c.byName : c.byKind === 'technician' ? c.byName : '', text: c.text })),
    timeline: r.history.map((h) => ({ at: h.at, action: h.action })),
    canConfirm: r.state === 'completed',
    canCancel: r.state === 'submitted' || r.state === 'triaged',
    canComment: !isClosed(r),
  };
}

/** A notification for residents about something of theirs (re-checked against the module on read). */
export function notify(ctx: HandlerContext, staff: Staff, e: { partyIds: string[]; flatId?: string; module: ModuleKey; kind: NotificationKind; key: string; values: Record<string, string>; href: string }) {
  if (!e.partyIds.length) return;
  staff.ops.seq += 1;
  staff.ops.events.unshift({ id: `evt_${staff.site.code.toLowerCase()}_${staff.ops.seq}`, at: now(ctx), ...e });
}

/** A field the server refuses (422), as a declared function so the checker narrows after it. */
export function invalid(ctx: HandlerContext, field: string, code: string, params?: Record<string, string>): never {
  problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code, ...(params ? { params } : {}) }] });
}

/** Staff may change a technician's work order: their own, or any with maintenance.manage. */
export const managesMaintenance = (ctx: HandlerContext) => can(ctx, 'maintenance.manage');
