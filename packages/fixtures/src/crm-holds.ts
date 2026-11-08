import type { DemoOverlay } from './demo-store';

/**
 * Unit holds of the developer CRM (Gate E.0 F-4, Issues #22/#23, validated in the E.0 foundation
 * branch). A hold is session demo state: it changes no real inventory.
 *
 * - **One clock.** `holdClock()` is the only time source for holds: the expiry written when a hold is
 *   placed and every later "is it still active?" check read it, once per request. It is the
 *   browser's clock, exactly as when holds were introduced (the demo's business date, FIXTURE_NOW,
 *   is frozen and would never expire anything). Tests fake it (`vi.useFakeTimers` +
 *   `vi.setSystemTime`): no test sleeps on the wall clock.
 * - **One projection.** `activeHolds()` is the only way handlers read holds: an expired hold is not
 *   held, on every read (unit 360, lead matching, the unit list) and every write (hold, release).
 *   Reading never deletes a stored hold; the stored record and the lead's history stay as they were.
 * - **Ownership.** Only the principal who placed a hold may release it. A hold stored before the
 *   initiator was recorded (a legacy hold) is released by nobody: it fails closed until it expires or
 *   the demo is reset.
 *
 * Not decided here (owner decision E-11): a configurable duration, extensions, an override
 * permission and an administrator override with a reason. None exists; the 48 hours stay illustrative.
 */

export type StoredHold = DemoOverlay['holds'][string];

/** Illustrative hold length, unchanged since Stage 1.5R (E-11 keeps it until the owner sets a policy). */
export const HOLD_DURATION_MS = 48 * 3_600_000;

/** The single clock of unit holds (milliseconds since the epoch). */
export const holdClock = (): number => Date.now();

/** Active at `now`: a parseable expiry strictly after `now` (an unreadable expiry is not a hold). */
export function holdActive(hold: StoredHold | undefined, now: number): hold is StoredHold {
  if (!hold) return false;
  const until = Date.parse(hold.until);
  return Number.isFinite(until) && now < until;
}

/** The holds in force at `now`, unit id → hold. The stored map is never changed. */
export function activeHolds(all: Readonly<Record<string, StoredHold>>, now: number): Record<string, StoredHold> {
  return Object.fromEntries(Object.entries(all).filter(([, h]) => holdActive(h, now)));
}

/** The expiry of a hold placed at `now`. */
export const holdUntil = (now: number): string => new Date(now + HOLD_DURATION_MS).toISOString();

/** Only the initiating principal; a legacy hold without a recorded principal is released by nobody. */
export function releasableBy(hold: StoredHold, principalId: string | undefined): boolean {
  return typeof hold.principalId === 'string' && hold.principalId.length > 0 && hold.principalId === principalId;
}
