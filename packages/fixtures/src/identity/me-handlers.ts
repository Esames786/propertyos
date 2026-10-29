import type { AppSwitchRedeemed, AppSwitchTarget, AppSwitchTicket, ContactConsent, MyProfile, MySecurity, SecurityEvent, SessionRecord, UpdateContactInput } from '@repo/contracts';
import { normalizePkPhone } from '@repo/i18n/format';
import { forbid, invalid, notFound, publicFor, requires, type Handler, type HandlerContext } from '../handler-types';
import { ALL_PERSONAS } from '../people';
import { directoryTenant } from '../tenant-directory';
import { alnoorRegisterPeople } from './register-people';
import { deviceLabel, identityOf, logEvent, nextSeq, nowStamp, type IdentityState, type StoredEvent, type StoredSession } from './state';

/**
 * The signed-in person's own security and profile (Gate D.1: GLOBAL-008/016, PORTAL-024/041,
 * GLOBAL-015). Every endpoint works on the caller's own principal only: no id in the address can
 * reach anyone else's sessions. The switch between apps is a one-time ticket in the organisation's
 * demo partition (shared by both apps), redeemed once by the other app within two minutes.
 */
const SWITCH_TTL_MS = 2 * 60 * 1000;

export const toSessionRecord = (s: StoredSession, tenantId: string, currentId: string | undefined): SessionRecord => ({
  id: s.id,
  principalId: s.principalId,
  personaId: s.personaId,
  tenantId,
  app: s.app,
  device: s.device,
  ...(s.approxPlace ? { approxPlace: s.approxPlace } : {}),
  createdAt: s.createdAt,
  lastActiveAt: s.lastActiveAt,
  state: s.state,
  ...(s.endedAt ? { endedAt: s.endedAt } : {}),
  ...(s.endReason ? { endReason: s.endReason } : {}),
  ...(s.endedByName ? { endedByName: s.endedByName } : {}),
  current: s.id === currentId,
});

export const toEvent = (e: StoredEvent): SecurityEvent => ({ ...e });

const me = (ctx: HandlerContext) => {
  const persona = ctx.persona;
  if (!persona) forbid(ctx);
  return persona;
};

/** End one session (it stays in the list as history). */
export function endSession(s: StoredSession, reason: NonNullable<StoredSession['endReason']>, at: string, byName?: string) {
  if (s.state !== 'active') return;
  s.state = reason === 'signed_out' ? 'signed_out' : 'revoked';
  s.endedAt = at;
  s.endReason = reason;
  if (byName) s.endedByName = byName;
}

/** Where this person can switch to: the same person's identity in the other app of this organisation. */
export function switchTargetOf(ctx: HandlerContext, state: IdentityState): AppSwitchTarget | undefined {
  const mine = me(ctx);
  if (mine.app !== 'backoffice' && mine.app !== 'customer') return undefined;
  const other = ALL_PERSONAS.find((p) => p.tenantId === mine.tenantId && p.principalId === mine.principalId && p.app !== mine.app && (p.app === 'backoffice' || p.app === 'customer'));
  if (!other) return undefined;
  // The resident side opens only with an active portal account (verified link, not withdrawn).
  if (other.app === 'customer') {
    const account = other.partyId ? state.portal[other.partyId] : undefined;
    if (!account || account.status !== 'active') return undefined;
  }
  return { app: other.app as 'backoffice' | 'customer', personaId: other.id, roleKey: other.roleKey };
}

const consentsOf = (state: IdentityState, principalId: string): ContactConsent[] =>
  state.contacts[principalId]?.consents ?? [
    { channel: 'sms', consented: false },
    { channel: 'whatsapp', consented: false },
    { channel: 'email', consented: true },
  ];

export const ME_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/me\/security$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): MySecurity => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      const sessions = state.sessions.filter((s) => s.principalId === persona.principalId);
      // The current session first, then active ones by last use, then the ended history.
      const order = (s: StoredSession) => (s.id === ctx.sessionId ? 0 : s.state === 'active' ? 1 : 2);
      sessions.sort((a, b) => order(a) - order(b) || b.lastActiveAt.localeCompare(a.lastActiveAt));
      return {
        sessions: sessions.slice(0, 12).map((s) => toSessionRecord(s, persona.tenantId, ctx.sessionId)),
        events: state.events.filter((e) => e.principalId === persona.principalId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25).map(toEvent),
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/me\/sessions\/current\/sign-out$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx) => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      const session = state.sessions.find((s) => s.id === ctx.sessionId);
      const at = nowStamp(ctx);
      if (session) endSession(session, 'signed_out', at);
      logEvent(state, { principalId: persona.principalId, kind: 'signed_out', at, app: ctx.app ?? 'backoffice', ...(session ? { deviceLabel: deviceLabel(session.device) } : {}) });
      ctx.demo.save();
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/me\/sessions\/(?<id>[\w-]+)\/revoke$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): MySecurity['sessions'][number] => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      // Only the caller's own sessions exist for them (another person's id is "not found").
      const session = state.sessions.find((s) => s.id === ctx.params.id && s.principalId === persona.principalId);
      if (!session) notFound(ctx);
      if (session.id === ctx.sessionId) invalid(ctx, 'session', 'identity:sessions.errors.current');
      if (session.state !== 'active') invalid(ctx, 'session', 'identity:sessions.errors.ended');
      const at = nowStamp(ctx);
      endSession(session, 'revoked_by_self', at, persona.displayName);
      logEvent(state, { principalId: persona.principalId, kind: 'session_revoked', at, app: ctx.app ?? 'backoffice', deviceLabel: deviceLabel(session.device) });
      ctx.demo.save();
      return toSessionRecord(session, persona.tenantId, ctx.sessionId);
    },
  },
  {
    method: 'POST',
    pattern: /^\/me\/sessions\/sign-out-others$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx) => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      const at = nowStamp(ctx);
      const others = state.sessions.filter((s) => s.principalId === persona.principalId && s.state === 'active' && s.id !== ctx.sessionId);
      for (const s of others) endSession(s, 'signed_out_elsewhere', at, persona.displayName);
      logEvent(state, { principalId: persona.principalId, kind: 'other_sessions_signed_out', at, app: ctx.app ?? 'backoffice', detail: String(others.length) });
      ctx.demo.save();
      return { ended: others.length };
    },
  },
  {
    method: 'GET',
    pattern: /^\/me\/profile$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): MyProfile => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      const contact = state.contacts[persona.principalId];
      const registered = persona.partyId ? alnoorRegisterPeople().find((p) => p.partyId === persona.partyId) : undefined;
      const links = ctx.access?.scopes.find((s) => s.type === 'party');
      const flats = links && links.type === 'party' ? [...new Set(links.links.filter((l) => l.verified && (!l.to || l.to > ctx.at)).map((l) => registered?.flats.find((f) => f.flatId === l.unitId)?.flatCode ?? l.unitId))] : undefined;
      const switchTo = switchTargetOf(ctx, state);
      const lastSignIn = state.events.find((e) => e.principalId === persona.principalId && e.kind === 'signed_in')?.at;
      return {
        principalId: persona.principalId,
        displayName: persona.displayName,
        email: contact?.email ?? persona.email,
        ...((contact?.phone ?? registered?.phone) ? { phone: contact?.phone ?? registered?.phone } : {}),
        roleKey: persona.roleKey,
        organisation: directoryTenant(persona.tenantId)?.name ?? persona.tenantId,
        ...(flats && flats.length ? { flats } : {}),
        consents: consentsOf(state, persona.principalId),
        signInMethods:
          persona.app === 'customer'
            ? [{ kind: 'sms_code', enabled: true, ...(lastSignIn ? { lastUsedAt: lastSignIn } : {}) }, { kind: 'passkey', enabled: false }]
            : [{ kind: 'password', enabled: true, ...(lastSignIn ? { lastUsedAt: lastSignIn } : {}) }, { kind: 'sms_code', enabled: true }, { kind: 'passkey', enabled: false }],
        ...(switchTo ? { switchTo } : {}),
      };
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/me\/contact$/,
    access: requires('core', 'signed_in', 'operational'),
    handle: (ctx) => {
      const persona = me(ctx);
      const input = (ctx.req.body ?? {}) as UpdateContactInput;
      const state = identityOf(ctx);
      const current = state.contacts[persona.principalId] ?? { consents: consentsOf(state, persona.principalId) };
      // The number on the society register counts until the person changes it (same as GET /me/profile).
      const registered = persona.partyId ? alnoorRegisterPeople().find((p) => p.partyId === persona.partyId)?.phone : undefined;
      let phone = current.phone ?? registered;
      if (input.phone !== undefined) {
        const normal = input.phone.trim() ? normalizePkPhone(input.phone) : null;
        if (input.phone.trim() && !normal) invalid(ctx, 'phone', 'forms:errors.phoneInvalid');
        phone = normal ?? undefined;
      }
      let email = current.email;
      if (input.email !== undefined) {
        const value = input.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) invalid(ctx, 'email', 'forms:errors.emailInvalid');
        email = value;
      }
      const at = nowStamp(ctx);
      const consents = input.consents
        ? current.consents.map((c) => {
            const next = input.consents!.find((x) => x.channel === c.channel);
            return next && next.consented !== c.consented ? { channel: c.channel, consented: next.consented, updatedAt: at } : c;
          })
        : current.consents;
      // Message channels need a number or address to send to.
      if (consents.some((c) => c.consented && c.channel !== 'email') && !phone) invalid(ctx, 'phone', 'identity:profile.errors.phoneForMessages');
      state.contacts[persona.principalId] = { ...(phone ? { phone } : {}), ...(email ? { email } : {}), consents };
      logEvent(state, { principalId: persona.principalId, kind: 'contact_changed', at, app: ctx.app ?? 'backoffice' });
      ctx.demo.save();
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/me\/app-switch$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): AppSwitchTicket => {
      const persona = me(ctx);
      const state = identityOf(ctx);
      const target = switchTargetOf(ctx, state);
      if (!target) forbid(ctx);
      const token = `${persona.tenantId}.${nextSeq(state, 'sw')}${Math.random().toString(36).slice(2, 10)}`;
      const expiresAtMs = Date.now() + SWITCH_TTL_MS;
      state.switches = state.switches.filter((t) => !t.used && t.expiresAtMs > Date.now());
      state.switches.push({ token, principalId: persona.principalId, fromApp: persona.app as 'backoffice' | 'customer', toApp: target.app, personaId: target.personaId, expiresAtMs, used: false });
      ctx.demo.save();
      return { token, app: target.app, expiresAt: new Date(expiresAtMs).toISOString() };
    },
  },
  {
    method: 'POST',
    pattern: /^\/app-switch\/(?<token>[\w.-]+)$/,
    access: publicFor('Redeems a one-time switch ticket the same person created in the other app two minutes ago at most; it names no data, only who and where.', (_req, p) => tenantOfToken(p.token)),
    handle: (ctx): AppSwitchRedeemed => {
      const state = identityOf(ctx);
      const ticket = state.switches.find((t) => t.token === ctx.params.token);
      // A ticket opens only the app it was made for, once, within its two minutes.
      if (!ticket || ticket.used || ticket.expiresAtMs < Date.now() || (ctx.app && ctx.app !== ticket.toApp)) notFound(ctx);
      const target = ALL_PERSONAS.find((p) => p.id === ticket.personaId && p.principalId === ticket.principalId && p.tenantId === ctx.tenantId);
      if (!target) notFound(ctx);
      if (target.app === 'customer' && (!target.partyId || state.portal[target.partyId]?.status !== 'active')) notFound(ctx);
      ticket.used = true;
      logEvent(state, { principalId: ticket.principalId, kind: 'switched_app', at: nowStamp(ctx), app: ticket.toApp, detail: ticket.fromApp });
      ctx.demo.save();
      return { personaId: target.id, app: ticket.toApp, fromApp: ticket.fromApp };
    },
  },
];

/** A token's organisation is its prefix (`tnt_alnoor.…`); only organisations with records qualify. */
export function tenantOfToken(token: string | undefined): string | undefined {
  const tenantId = token?.split('.')[0];
  return tenantId && directoryTenant(tenantId) ? tenantId : undefined;
}
