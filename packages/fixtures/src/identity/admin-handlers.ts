import type { Persona, SessionRecord, StaffUserDetail, StaffUserRow } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { ALL_PERSONAS } from '../people';
import { endSession, toEvent, toSessionRecord } from './me-handlers';
import { deviceLabel, identityOf, logEvent, nowStamp } from './state';

/**
 * ADM-003 user workspace (Gate D.1): an administrator sees and ends the office sessions of their own
 * organisation's staff. Scope: only staff of this organisation exist here (anyone else is "not
 * found"); residents' devices are managed through portal access (RES-007), never from here; ending a
 * session needs `sessions.manage` and is recorded for the person and in their security activity.
 */
const staffOf = (ctx: HandlerContext): Persona[] => ALL_PERSONAS.filter((p) => p.tenantId === ctx.tenantId && p.app === 'backoffice');

function staffMember(ctx: HandlerContext): Persona {
  const p = staffOf(ctx).find((x) => x.principalId === ctx.params.principal);
  if (!p) notFound(ctx);
  return p;
}

function row(ctx: HandlerContext, p: Persona): StaffUserRow {
  const state = identityOf(ctx);
  const sessions = state.sessions.filter((s) => s.principalId === p.principalId && s.app === 'backoffice');
  const active = sessions.filter((s) => s.state === 'active');
  const last = [...sessions].sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt))[0];
  return {
    principalId: p.principalId,
    personaId: p.id,
    name: p.displayName,
    email: p.email,
    roleKey: p.roleKey,
    activeSessions: active.length,
    ...(last ? { lastActiveAt: last.lastActiveAt } : {}),
    alsoResident: ALL_PERSONAS.some((x) => x.tenantId === p.tenantId && x.principalId === p.principalId && x.app === 'customer'),
  };
}

const canManage = (ctx: HandlerContext) => !!ctx.access?.permissions.includes('sessions.manage');

export const ADMIN_IDENTITY_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/admin\/users$/,
    access: requires('core', 'admin.view', 'history_read'),
    handle: (ctx): StaffUserRow[] => staffOf(ctx).map((p) => row(ctx, p)),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/users\/(?<principal>[\w-]+)$/,
    access: requires('core', 'admin.view', 'history_read'),
    handle: (ctx): StaffUserDetail => {
      const p = staffMember(ctx);
      const state = identityOf(ctx);
      const sessions = state.sessions
        .filter((s) => s.principalId === p.principalId && s.app === 'backoffice')
        .sort((a, b) => (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) || Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));
      return {
        ...row(ctx, p),
        permissions: p.permissions.length,
        sessions: sessions.slice(0, 12).map((s) => toSessionRecord(s, p.tenantId, ctx.sessionId)),
        events: state.events.filter((e) => e.principalId === p.principalId && e.app === 'backoffice').sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 20).map(toEvent),
        canManageSessions: canManage(ctx),
        isYou: p.principalId === ctx.persona?.principalId,
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/users\/(?<principal>[\w-]+)\/sessions\/(?<id>[\w-]+)\/revoke$/,
    access: requires('core', 'sessions.manage', 'operational'),
    handle: (ctx): SessionRecord => {
      const p = staffMember(ctx);
      const state = identityOf(ctx);
      const session = state.sessions.find((s) => s.id === ctx.params.id && s.principalId === p.principalId && s.app === 'backoffice');
      if (!session) notFound(ctx);
      // Your own browser is signed out with "Sign out", not from here.
      if (session.id === ctx.sessionId) invalid(ctx, 'session', 'identity:sessions.errors.current');
      if (session.state !== 'active') invalid(ctx, 'session', 'identity:sessions.errors.ended');
      const at = nowStamp(ctx);
      const by = ctx.persona!.displayName;
      endSession(session, 'revoked_by_admin', at, by);
      logEvent(state, { principalId: p.principalId, kind: 'session_revoked_by_admin', at, app: 'backoffice', deviceLabel: deviceLabel(session.device), byName: by });
      ctx.demo.save();
      return toSessionRecord(session, p.tenantId, ctx.sessionId);
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/users\/(?<principal>[\w-]+)\/sessions\/revoke-all$/,
    access: requires('core', 'sessions.manage', 'operational'),
    handle: (ctx) => {
      const p = staffMember(ctx);
      const state = identityOf(ctx);
      const at = nowStamp(ctx);
      const by = ctx.persona!.displayName;
      const ended = state.sessions.filter((s) => s.principalId === p.principalId && s.app === 'backoffice' && s.state === 'active' && s.id !== ctx.sessionId);
      for (const s of ended) endSession(s, 'revoked_by_admin', at, by);
      if (ended.length) logEvent(state, { principalId: p.principalId, kind: 'session_revoked_by_admin', at, app: 'backoffice', byName: by, detail: String(ended.length) });
      ctx.demo.save();
      return { ended: ended.length };
    },
  },
];
