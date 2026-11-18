import type { UnitHoldView } from '@repo/contracts';
import type { DemoOverlay } from './demo-store';
import { leadOpenTo } from './developer/crm/scope';
import type { HandlerContext } from './handler-types';
import { ALL_PERSONAS } from './people';

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

// ---------------------------------------------------------------------------------------------
// Wave 1 integration (Issue #25): the one hold ledger of the CRM and the inventory screens
// ---------------------------------------------------------------------------------------------
// E.2 (INV-001/002/008) mirrored the rules above function for function in `developer/inventory/rules.ts`;
// that copy is gone and E.2 reads these. Its extra helpers move here unchanged in meaning, and the hold view
// that the CRM and E.2 each built is now one projection, so both say the same thing about the same hold.

/** Holds whose time ran out at `now` (history only: they no longer count as held). The stored map is never changed. */
export function lapsedHolds(all: Readonly<Record<string, StoredHold>>, now: number): Record<string, StoredHold> {
  return Object.fromEntries(Object.entries(all).filter(([, h]) => !holdActive(h, now)));
}

/**
 * Release is owner-only (Issue #23): a hold in force at `now`, released by its initiator. A different
 * principal, an expired or unknown hold and a legacy hold are refused alike (one non-disclosing 404).
 */
export function mayRelease(hold: StoredHold | undefined, principalId: string | undefined, now: number): boolean {
  return holdActive(hold, now) && releasableBy(hold, principalId);
}

/**
 * One clock reading per request: the first read of a request is kept for that request's other checks
 * (E.2's helper functions all ask; E.0's handlers read `holdClock()` once and pass it on, which is the same).
 */
const REQUEST_NOW = new WeakMap<object, number>();
export function requestNow(req: object): number {
  let now = REQUEST_NOW.get(req);
  if (now === undefined) REQUEST_NOW.set(req, (now = holdClock()));
  return now;
}

/** A unit held only in the demo seed: no hold record, no expiry, never releasable. */
export const SEED_HOLD: UnitHoldView = { source: 'seed' };

/**
 * THE projection of a hold in force for one reader (§4.4), used by the CRM handlers and the inventory views:
 * - that it is held, and its expiry on the one hold clock, to every reader of the unit;
 * - the lead it is for (id and reference), only to a reader who may see THAT lead: the canonical record-level
 *   CRM rule (`developer/crm/scope.ts` `leadOpenTo`: the lead's project in the reader's CRM scope AND the lead
 *   assigned to them, or `lead.assign` in that project). F-GPT-W1-01 (Issue #25 review): a project-level check
 *   let a salesperson read a colleague's lead id and reference here;
 * - the colleague who placed it (a person of this organisation only; a legacy hold names nobody). Who may see
 *   the holder's name is owner decision D-INT-05, unchanged here;
 * - `releasable` only for its initiator, while it is in force (Issue #23).
 */
export function holdViewFor(ctx: HandlerContext, hold: StoredHold, now: number): UnitHoldView {
  const lead = ctx.demo.leads(ctx.data.leads).find((l) => l.id === hold.leadId);
  const named = !!lead && leadOpenTo(ctx, lead);
  const holder = hold.principalId ? ALL_PERSONAS.find((p) => p.principalId === hold.principalId && p.tenantId === ctx.tenantId)?.displayName : undefined;
  return {
    source: 'live',
    until: hold.until,
    ...(named ? { leadRef: hold.leadRef, leadId: hold.leadId } : {}),
    ...(holder ? { holderName: holder } : {}),
    ...(mayRelease(hold, ctx.persona?.principalId, now) ? { releasable: true as const } : {}),
  };
}
