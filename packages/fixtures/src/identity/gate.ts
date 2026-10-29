import type { DeviceInfo, Persona } from '@repo/contracts';
import type { DemoPartition } from '../demo-store';
import { deviceLabel, identityOf, logEvent, type IdentityState, type StoredSession } from './state';

/** Organisations whose resident portal is managed by invitation (Gate D.1): the society demo. */
export const PORTAL_MANAGED_TENANTS: readonly string[] = ['tnt_alnoor'];

export type GateOutcome = { ok: true; session: StoredSession; state: IdentityState } | { ok: false; reason: 'session_ended' | 'portal_access_revoked' };

/** A session id for a browser that signed in before Gate D.1 kept sessions (one per app and identity). */
export const legacySessionId = (app: string, personaId: string) => `ses_legacy_${app}_${personaId}`;

const TOUCH_MS = 5 * 60 * 1000;

/**
 * Before any tenant endpoint runs (after the identity and its access are known): the session must be
 * active, and a resident of a portal-managed organisation must hold an active portal account. A new
 * session (this browser's first request after signing in) is recorded with its device; an existing
 * one is touched at most every five minutes, so two apps refreshing each other never loop.
 */
export function sessionGate(
  input: { demo: DemoPartition; persona: Persona; sessionId: string | undefined; device: DeviceInfo | undefined; app: StoredSession['app']; stamp: string },
): GateOutcome {
  const { demo, persona, app, stamp } = input;
  const state = identityOf({ demo, tenantId: persona.tenantId });
  if (persona.app === 'customer' && PORTAL_MANAGED_TENANTS.includes(persona.tenantId)) {
    const account = persona.partyId ? state.portal[persona.partyId] : undefined;
    if (!account || account.status !== 'active') return { ok: false, reason: 'portal_access_revoked' };
  }
  const id = input.sessionId ?? legacySessionId(app, persona.id);
  let session = state.sessions.find((x) => x.id === id);
  if (session && (session.state !== 'active' || session.principalId !== persona.principalId)) return { ok: false, reason: 'session_ended' };
  const device: DeviceInfo = input.device ?? { kind: 'desktop', platform: 'other', browser: 'Browser' };
  if (!session) {
    session = { id, principalId: persona.principalId, personaId: persona.id, app, device, createdAt: stamp, lastActiveAt: stamp, state: 'active' };
    state.sessions.unshift(session);
    logEvent(state, { principalId: persona.principalId, kind: 'signed_in', at: stamp, app, deviceLabel: deviceLabel(device) });
    if (persona.partyId && state.portal[persona.partyId]) Object.assign(state.portal[persona.partyId]!, { lastSignInAt: stamp, lastDevice: device });
    demo.save();
  } else if (Date.parse(stamp) - Date.parse(session.lastActiveAt) > TOUCH_MS) {
    session.lastActiveAt = stamp;
    demo.save();
  }
  return { ok: true, session, state };
}
