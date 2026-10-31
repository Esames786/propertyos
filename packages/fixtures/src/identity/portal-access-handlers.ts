import type {
  ContactConsent,
  InvitationAccepted,
  InvitationChannel,
  InvitationSummary,
  InvitationView,
  InviteInput,
  InviteResult,
  PortalAccessList,
  PortalAccessRow,
  PortalRole,
  PortalStatus,
  SignInCodeSent,
} from '@repo/contracts';
import { normalizePkPhone } from '@repo/i18n/format';
import { isAfter } from '../clock';
import { authorize, invalid, notFound, publicFor, requires, type Handler, type HandlerContext } from '../handler-types';
import { ALNOOR_RESIDENTS } from '../people';
import { ALNOOR_SITE } from '../society/alnoor';
import { problem, recordOf, society } from '../society/handlers';
import { PORTAL_MANAGED_TENANTS } from './gate';
import { endSession, tenantOfToken } from './me-handlers';
import { alnoorRegisterPeople, invitedPersonaId, invitedPrincipalId, peopleOf, type RegisterPerson } from './register-people';
import { dayOffset, identityOf, logEvent, nextSeq, nowStamp, type IdentityState, type StoredInvitation } from './state';

/**
 * Resident portal access and invitations (Gate D.1: RES-007, RES-009, SITE-009, AUTH-007) and the
 * resident's phone sign-in (AUTH-006). An invitation is bound to the organisation, the site, the flat
 * and a verified person: it is refused without a verified link or recorded consent for the channel,
 * and acceptance re-checks the link (a person who has moved out cannot accept). Messages are simulated:
 * the prototype shows the link and the one-time code a real message would carry.
 */
const ACTIVE_DAYS = 30;
const INVITE_DAYS = 14;
const RESEND_LIMIT = 3;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 3;

export const maskPhone = (phone?: string) => (phone ? `+92 ${phone.slice(3, 6)} *** ${phone.slice(-4)}` : undefined);
const maskEmail = (email?: string) => (email ? email.replace(/^(.)[^@]*(@.*)$/, '$1•••$2') : undefined);

const featured = (partyId: string) => ALNOOR_RESIDENTS.find((r) => r.partyId === partyId);
export const principalOfParty = (partyId: string) => featured(partyId)?.principalId ?? invitedPrincipalId(partyId);
export const personaOfParty = (partyId: string) => featured(partyId)?.id ?? invitedPersonaId(partyId);

/** The people of the society as the live model has them today (a payer change or a move-out shows at once). */
function livePeople(ctx: HandlerContext): RegisterPerson[] {
  const s = society(ctx);
  const unverified = new Set(alnoorRegisterPeople().filter((p) => !p.verified).map((p) => p.partyId));
  return peopleOf(s.view.model, ctx.at).map((p) => (unverified.has(p.partyId) ? { ...p, verified: false } : p));
}

const latestInvitation = (state: IdentityState, partyId: string) =>
  state.invitations.filter((i) => i.partyId === partyId).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0];

export function statusOf(person: RegisterPerson, state: IdentityState, today: string): PortalStatus {
  if (!person.verified) return 'unverified';
  const account = state.portal[person.partyId];
  const invite = latestInvitation(state, person.partyId);
  const inviteStatus = (i: StoredInvitation | undefined): PortalStatus | undefined =>
    i?.state === 'sent' ? (i.expiresOn >= today ? 'invited' : 'expired') : i?.state === 'expired' ? 'expired' : undefined;
  if (account?.status === 'active') {
    const last = account.lastSignInAt?.slice(0, 10);
    return last && last >= dayOffset(-ACTIVE_DAYS, today) ? 'active' : 'inactive';
  }
  if (account?.status === 'revoked') return (invite && isAfter(invite.sentAt, account.revokedAt) && inviteStatus(invite)) || 'revoked';
  return inviteStatus(invite) ?? 'not_invited';
}

const summaryOf = (i: StoredInvitation, today: string): InvitationSummary => ({
  id: i.id,
  channel: i.channel,
  state: i.state === 'sent' && i.expiresOn < today ? 'expired' : i.state,
  sentAt: i.sentAt,
  expiresAt: `${i.expiresOn}T23:59:59Z`,
  sentByName: i.sentByName,
  resendCount: i.resendCount,
  ...(i.state === 'sent' && i.expiresOn >= today ? { demoLink: `/shared/auth/invite/${i.token}` } : {}),
});

const deviceFamily = (d?: { kind: string; platform: string }) => (d ? `${d.platform}_${d.kind}` : undefined);

function rowOf(ctx: HandlerContext, p: RegisterPerson, state: IdentityState): PortalAccessRow {
  const principal = principalOfParty(p.partyId);
  const account = state.portal[p.partyId];
  const invite = latestInvitation(state, p.partyId);
  const contact = state.contacts[principal];
  return {
    partyId: p.partyId,
    name: p.name,
    ...(maskPhone(contact?.phone ?? p.phone) ? { phoneMasked: maskPhone(contact?.phone ?? p.phone)! } : {}),
    ...(maskEmail(contact?.email ?? p.email) ? { emailMasked: maskEmail(contact?.email ?? p.email)! } : {}),
    flats: p.flats.map((f) => ({ flatId: f.flatId, flatCode: f.flatCode, roles: f.roles })),
    buildingIds: [...new Set(p.flats.map((f) => f.buildingId))],
    verified: p.verified,
    status: statusOf(p, state, ctx.at),
    ...(account?.lastSignInAt ? { lastSignInOn: account.lastSignInAt.slice(0, 10) } : {}),
    ...(account?.lastDevice ? { lastDevice: deviceFamily(account.lastDevice)! } : {}),
    activeSessions: state.sessions.filter((s) => s.principalId === principal && s.app === 'customer' && s.state === 'active').length,
    ...(invite ? { invitation: summaryOf(invite, ctx.at) } : {}),
    consents: contact?.consents ?? [],
  };
}

function guard(ctx: HandlerContext) {
  if (!ctx.tenantId || !PORTAL_MANAGED_TENANTS.includes(ctx.tenantId)) notFound(ctx);
  const s = society(ctx);
  authorize(ctx, 'resident_portal', recordOf(s));
  return s;
}

const hasConsent = (consents: ContactConsent[], channel: InvitationChannel) => channel === 'printed_code' || consents.some((c) => c.channel === channel && c.consented);
const tokenFor = (state: IdentityState, tenantId: string) => `${tenantId}.${nextSeq(state, 'inv')}${Math.random().toString(36).slice(2, 10)}`;

function invite(ctx: HandlerContext, state: IdentityState, p: RegisterPerson, channel: InvitationChannel, flatId: string | undefined): InviteResult['sent'][number] | InviteResult['skipped'][number] {
  const status = statusOf(p, state, ctx.at);
  if (!p.verified) return { partyId: p.partyId, reason: 'not_verified' };
  if (status === 'active' || status === 'inactive') return { partyId: p.partyId, reason: 'already_active' };
  const principal = principalOfParty(p.partyId);
  const contact = state.contacts[principal];
  const phone = contact?.phone ?? p.phone;
  if ((channel === 'sms' || channel === 'whatsapp') && !phone) return { partyId: p.partyId, reason: 'no_contact' };
  if (!hasConsent(contact?.consents ?? [], channel)) return { partyId: p.partyId, reason: 'no_consent' };
  const flat = p.flats.find((f) => f.flatId === flatId) ?? p.flats[0]!;
  const at = nowStamp(ctx);
  const existing = latestInvitation(state, p.partyId);
  let inv: StoredInvitation;
  if (existing && existing.state === 'sent' && existing.expiresOn >= ctx.at && existing.flatId === flat.flatId) {
    // A resend: limited, and it extends the invitation from today.
    const recent = existing.resendDates.filter((d) => d >= dayOffset(-7, ctx.at));
    if (recent.length >= RESEND_LIMIT) return { partyId: p.partyId, reason: 'resend_limit' };
    existing.resendCount += 1;
    existing.resendDates.push(ctx.at);
    existing.channel = channel;
    existing.expiresOn = dayOffset(INVITE_DAYS, ctx.at);
    inv = existing;
  } else {
    if (existing && existing.state === 'sent') existing.state = 'revoked';
    inv = {
      id: nextSeq(state, 'inv'),
      token: tokenFor(state, ctx.tenantId!),
      partyId: p.partyId,
      flatId: flat.flatId,
      channel,
      state: 'sent',
      sentAt: at,
      expiresOn: dayOffset(INVITE_DAYS, ctx.at),
      sentBy: ctx.persona!.principalId,
      sentByName: ctx.persona!.displayName,
      resendCount: 0,
      resendDates: [],
    };
    state.invitations.push(inv);
  }
  const summary = summaryOf(inv, ctx.at);
  return {
    partyId: p.partyId,
    invitation: summary,
    message: `${ALNOOR_SITE.name}: you are invited to the resident app for flat ${flat.flatCode}. Open ${summary.demoLink ?? ''} before ${inv.expiresOn}. A one-time code confirms it is you.`,
  };
}

const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

function issueCode(state: IdentityState, tenantId: string, kind: 'sign_in' | 'invitation', partyId: string, phone: string | undefined, token?: string): SignInCodeSent {
  const id = `${tenantId}.${nextSeq(state, 'chl')}`;
  const code = code6();
  const expiresAtMs = Date.now() + CODE_TTL_MS;
  state.challenges = state.challenges.filter((c) => c.expiresAtMs > Date.now() && !c.verified);
  state.challenges.push({ id, kind, partyId, ...(token ? { token } : {}), code, expiresAtMs, attemptsLeft: CODE_ATTEMPTS, verified: false });
  return { challengeId: id, sentTo: maskPhone(phone) ?? '', demoCode: code, expiresAt: new Date(expiresAtMs).toISOString(), attemptsLeft: CODE_ATTEMPTS };
}

/** Check a one-time code; wrong codes use up attempts and are recorded. */
function checkCode(ctx: HandlerContext, state: IdentityState, challengeId: string, code: string, kind: 'sign_in' | 'invitation') {
  const c = state.challenges.find((x) => x.id === challengeId && x.kind === kind);
  if (!c || c.verified || c.expiresAtMs < Date.now()) problem(ctx, 410, 'code_expired', 'identity:code.expired');
  if (c.attemptsLeft <= 0) problem(ctx, 429, 'code_locked', 'identity:code.locked');
  if (String(code ?? '').trim() !== c.code) {
    c.attemptsLeft -= 1;
    logEvent(state, { principalId: principalOfParty(c.partyId), kind: 'code_failed', at: nowStamp(ctx), app: 'customer', detail: kind });
    ctx.demo.save();
    problem(ctx, 422, c.attemptsLeft > 0 ? 'code_wrong' : 'code_locked', c.attemptsLeft > 0 ? 'identity:code.wrong' : 'identity:code.locked', { code: [c.attemptsLeft > 0 ? { code: 'identity:code.wrongField', params: { count: String(c.attemptsLeft) } } : { code: 'identity:code.locked' }] });
  }
  c.verified = true;
  return c;
}

/** The organisation a phone number belongs to (only portal-managed organisations sign in by phone). */
function tenantOfPhone(body: unknown): string | undefined {
  const phone = normalizePkPhone(String((body as { phone?: string } | undefined)?.phone ?? ''));
  if (!phone) return undefined;
  return alnoorRegisterPeople().some((p) => p.phone === phone) ? 'tnt_alnoor' : undefined;
}

export const PORTAL_ACCESS_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/portal-access$/,
    access: requires('resident_portal', 'portal_access.view', 'history_read'),
    handle: (ctx): PortalAccessList => {
      const s = guard(ctx);
      const state = identityOf(ctx);
      const q = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const all = livePeople(ctx).map((p) => rowOf(ctx, p, state));
      const flats = s.view.model.flats;
      const vacant = flats.filter((f) => f.occupancy === 'vacant').map((f) => ({ flatId: f.id, flatCode: f.code, buildingId: f.buildingId }));
      const occupied = flats.filter((f) => f.occupancy !== 'vacant' && f.occupancy !== 'association_use');
      const activeFlats = new Set(all.filter((r) => r.status === 'active').flatMap((r) => r.flats.map((f) => f.flatId)));
      const count = (st: PortalStatus) => all.filter((r) => r.status === st).length;
      const needle = (q.q ?? '').trim().toLowerCase();
      const rows = all.filter(
        (r) =>
          (!q.status || q.status === 'all' || (q.status === 'never' ? ['not_invited', 'invited', 'expired'].includes(r.status) : r.status === q.status)) &&
          (!q.building || r.buildingIds.includes(q.building)) &&
          (!q.role || r.flats.some((f) => f.roles.includes(q.role as PortalRole))) &&
          (!needle || r.name.toLowerCase().includes(needle) || r.flats.some((f) => f.flatCode.toLowerCase().includes(needle))),
      );
      return {
        summary: {
          people: all.length,
          active: count('active'),
          inactive: count('inactive'),
          invited: count('invited'),
          expired: count('expired'),
          notInvited: count('not_invited'),
          revoked: count('revoked'),
          unverified: count('unverified'),
          neverSignedIn: count('not_invited') + count('invited') + count('expired'),
          flats: flats.length,
          vacantFlats: vacant.length,
          flatsWithActiveUser: occupied.filter((f) => activeFlats.has(f.id)).length,
          occupiedFlats: occupied.length,
        },
        rows: rows.sort((a, b) => (a.flats[0]?.flatCode ?? '').localeCompare(b.flats[0]?.flatCode ?? '') || a.name.localeCompare(b.name)),
        buildings: s.view.model.buildings.map((b) => ({ id: b.id, name: b.name })),
        vacant,
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/flats\/(?<flatId>[\w-]+)\/portal$/,
    access: requires('resident_portal', 'portal_access.view', 'history_read'),
    handle: (ctx): { flatCode: string; vacant: boolean; rows: PortalAccessRow[] } => {
      const s = guard(ctx);
      const flat = s.view.model.flats.find((f) => f.id === ctx.params.flatId);
      if (!flat) notFound(ctx);
      const state = identityOf(ctx);
      const rows = livePeople(ctx)
        .filter((p) => p.flats.some((f) => f.flatId === flat.id))
        .map((p) => {
          const r = rowOf(ctx, p, state);
          return { ...r, flats: r.flats.filter((f) => f.flatId === flat.id) };
        });
      return { flatCode: flat.code, vacant: flat.occupancy === 'vacant', rows };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal-invitations$/,
    access: requires('resident_portal', 'portal_access.invite', 'operational'),
    handle: (ctx): InviteResult => {
      guard(ctx);
      const input = (ctx.req.body ?? {}) as InviteInput;
      const ids = [...new Set(input.partyIds ?? [])];
      if (!ids.length) invalid(ctx, 'partyIds', 'forms:errors.selectOne');
      if (ids.length > 50) invalid(ctx, 'partyIds', 'identity:invite.errors.tooMany');
      if (!['sms', 'whatsapp', 'email', 'printed_code'].includes(input.channel)) invalid(ctx, 'channel', 'forms:errors.selectOne');
      const state = identityOf(ctx);
      const people = livePeople(ctx);
      const result: InviteResult = { sent: [], skipped: [] };
      for (const id of ids) {
        const p = people.find((x) => x.partyId === id);
        if (!p) notFound(ctx);
        const r = invite(ctx, state, p, input.channel, ids.length === 1 ? input.flatId : undefined);
        if ('reason' in r) result.skipped.push(r);
        else result.sent.push(r);
      }
      ctx.demo.save();
      return result;
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal-invitations\/(?<id>[\w-]+)\/(?<action>resend|revoke)$/,
    access: requires('resident_portal', 'portal_access.invite', 'operational'),
    handle: (ctx): InviteResult | InvitationSummary => {
      guard(ctx);
      const state = identityOf(ctx);
      const inv = state.invitations.find((i) => i.id === ctx.params.id);
      if (!inv) notFound(ctx);
      if (ctx.params.action === 'revoke') {
        if (inv.state !== 'sent') invalid(ctx, 'invitation', 'identity:invite.errors.notOpen');
        inv.state = 'revoked';
        inv.revokedAt = nowStamp(ctx);
        inv.revokedByName = ctx.persona!.displayName;
        ctx.demo.save();
        return summaryOf(inv, ctx.at);
      }
      const p = livePeople(ctx).find((x) => x.partyId === inv.partyId);
      if (!p) notFound(ctx);
      const r = invite(ctx, state, p, inv.channel, inv.flatId);
      ctx.demo.save();
      return 'reason' in r ? { sent: [], skipped: [r] } : { sent: [r], skipped: [] };
    },
  },
  {
    method: 'POST',
    pattern: /^\/portal-access\/(?<partyId>[\w-]+)\/revoke$/,
    access: requires('resident_portal', 'portal_access.invite', 'operational'),
    handle: (ctx) => {
      guard(ctx);
      const reason = String((ctx.req.body as { reason?: string } | undefined)?.reason ?? '').trim();
      if (reason.length < 5) invalid(ctx, 'reason', 'forms:errors.reasonRequired');
      const state = identityOf(ctx);
      const account = state.portal[ctx.params.partyId!];
      if (!account || account.status !== 'active') notFound(ctx);
      const at = nowStamp(ctx);
      const by = ctx.persona!.displayName;
      Object.assign(account, { status: 'revoked', revokedAt: at, revokedByName: by });
      // Every device of the resident is signed out at once; a phone that is offline is refused when it next connects.
      const principal = principalOfParty(ctx.params.partyId!);
      for (const s of state.sessions.filter((x) => x.principalId === principal && x.app === 'customer')) endSession(s, 'portal_access_revoked', at, by);
      logEvent(state, { principalId: principal, kind: 'portal_access_revoked', at, app: 'customer', byName: by, detail: reason });
      ctx.demo.save();
      return { ok: true };
    },
  },
  // ---------------------------------------------------------------- the invitee (before sign-in)
  {
    method: 'GET',
    pattern: /^\/invitations\/(?<token>[\w.-]+)$/,
    access: publicFor('The invitee opens their invitation link: only what they need to recognise it is shown, scoped by the token they hold.', (_r, p) => tenantOfToken(p.token)),
    handle: (ctx): InvitationView => {
      if (!ctx.tenantId) return { state: 'not_found' };
      const state = identityOf(ctx);
      const inv = state.invitations.find((i) => i.token === ctx.params.token);
      if (!inv) return { state: 'not_found' };
      const p = livePeople(ctx).find((x) => x.partyId === inv.partyId);
      const flat = p?.flats.find((f) => f.flatId === inv.flatId);
      const st = inv.state === 'sent' && inv.expiresOn < ctx.at ? 'expired' : inv.state;
      // The holder of a real token may see whose invitation it was, never who it was for.
      const organisation = ctx.tenantId === 'tnt_alnoor' ? 'Al-Noor Residency (Demo)' : ctx.tenantId;
      if (st !== 'sent') return { state: st, organisation };
      // The person must still be linked to the flat and verified (someone who moved out cannot join).
      if (!p || !flat || !p.verified) return { state: 'revoked', organisation };
      return {
        state: 'sent',
        organisation,
        site: ALNOOR_SITE.name,
        flatCode: flat.flatCode,
        firstName: p.name.split(/\s+/)[0]!,
        channel: inv.channel,
        ...(maskPhone(state.contacts[principalOfParty(p.partyId)]?.phone ?? p.phone) ? { codeSentTo: maskPhone(state.contacts[principalOfParty(p.partyId)]?.phone ?? p.phone)! } : {}),
        expiresAt: `${inv.expiresOn}T23:59:59Z`,
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/invitations\/(?<token>[\w.-]+)\/code$/,
    access: publicFor('Sends the one-time code that proves the invitee holds the invited phone, scoped by the invitation token.', (_r, p) => tenantOfToken(p.token)),
    handle: (ctx): SignInCodeSent => {
      if (!ctx.tenantId) notFound(ctx);
      const state = identityOf(ctx);
      const inv = state.invitations.find((i) => i.token === ctx.params.token && i.state === 'sent' && i.expiresOn >= ctx.at);
      if (!inv) notFound(ctx);
      const p = livePeople(ctx).find((x) => x.partyId === inv.partyId && x.verified && x.flats.some((f) => f.flatId === inv.flatId));
      if (!p) notFound(ctx);
      const result = issueCode(state, ctx.tenantId, 'invitation', p.partyId, state.contacts[principalOfParty(p.partyId)]?.phone ?? p.phone, inv.token);
      ctx.demo.save();
      return result;
    },
  },
  {
    method: 'POST',
    pattern: /^\/invitations\/(?<token>[\w.-]+)\/accept$/,
    access: publicFor('Accepts an invitation with the one-time code: binds the resident account to the organisation, site, flat and verified person the token names.', (_r, p) => tenantOfToken(p.token)),
    handle: (ctx): InvitationAccepted => {
      if (!ctx.tenantId) notFound(ctx);
      const state = identityOf(ctx);
      const inv = state.invitations.find((i) => i.token === ctx.params.token);
      if (!inv || inv.state !== 'sent' || inv.expiresOn < ctx.at) problem(ctx, 410, 'invitation_closed', 'identity:invite.closed');
      const body = (ctx.req.body ?? {}) as { challengeId?: string; code?: string };
      const challenge = checkCode(ctx, state, String(body.challengeId ?? ''), String(body.code ?? ''), 'invitation');
      if (challenge.token !== inv.token || challenge.partyId !== inv.partyId) problem(ctx, 410, 'code_expired', 'identity:code.expired');
      // Re-check the binding at the moment of acceptance: same person, still linked to the flat, verified.
      const p = livePeople(ctx).find((x) => x.partyId === inv.partyId);
      const flat = p?.flats.find((f) => f.flatId === inv.flatId);
      if (!p || !flat || !p.verified) problem(ctx, 409, 'link_ended', 'identity:invite.linkEnded');
      const at = nowStamp(ctx);
      inv.state = 'accepted';
      inv.acceptedAt = at;
      state.portal[p.partyId] = { status: 'active', since: at };
      logEvent(state, { principalId: principalOfParty(p.partyId), kind: 'invitation_accepted', at, app: 'customer', detail: flat.flatCode });
      ctx.demo.save();
      return { personaId: personaOfParty(p.partyId), tenantId: ctx.tenantId, flatCode: flat.flatCode, name: p.name };
    },
  },
  // ---------------------------------------------------------------- AUTH-006: phone and one-time code
  {
    method: 'POST',
    pattern: /^\/sign-in\/code$/,
    access: publicFor('A resident asks for a sign-in code for their phone number; nothing about the account is revealed (the demo shows the code it would send).', (req) => tenantOfPhone(req.body)),
    handle: (ctx): SignInCodeSent | { challengeId: null; sentTo: string } => {
      const phone = normalizePkPhone(String((ctx.req.body as { phone?: string } | undefined)?.phone ?? ''));
      if (!phone) invalid(ctx, 'phone', 'forms:errors.phoneInvalid');
      const sentTo = maskPhone(phone)!;
      if (!ctx.tenantId) return { challengeId: null, sentTo };
      const state = identityOf(ctx);
      const p = livePeople(ctx).find((x) => (state.contacts[principalOfParty(x.partyId)]?.phone ?? x.phone) === phone);
      if (!p || state.portal[p.partyId]?.status !== 'active') return { challengeId: null, sentTo };
      const result = issueCode(state, ctx.tenantId, 'sign_in', p.partyId, phone);
      ctx.demo.save();
      return result;
    },
  },
  {
    method: 'POST',
    pattern: /^\/sign-in\/verify$/,
    access: publicFor('Checks the one-time sign-in code; the challenge id names the organisation it was issued for.', (req) => tenantOfToken(String((req.body as { challengeId?: string } | undefined)?.challengeId ?? ''))),
    handle: (ctx): { personaId: string } => {
      if (!ctx.tenantId) problem(ctx, 410, 'code_expired', 'identity:code.expired');
      const state = identityOf(ctx);
      const body = (ctx.req.body ?? {}) as { challengeId?: string; code?: string };
      const c = checkCode(ctx, state, String(body.challengeId ?? ''), String(body.code ?? ''), 'sign_in');
      if (state.portal[c.partyId]?.status !== 'active') problem(ctx, 403, 'portal_access_revoked', 'errors:access.portal_access_revoked');
      ctx.demo.save();
      return { personaId: personaOfParty(c.partyId) };
    },
  },
];

