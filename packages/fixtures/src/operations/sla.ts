import type { RequestPriority, RequestSla, RequestUrgency, SlaStatus, SlaTarget } from '@repo/contracts';

/**
 * Service levels of a request (MNT-007). The clock starts when the request is raised: the response
 * target ends at triage, the resolution target when the work is completed (or the issue resolved).
 * Before triage the resident's urgency stands for the priority. A request inside its last quarter is
 * "at risk"; past its target it is "breached" while open and "missed" once done. Cancelled, merged
 * and hidden requests stop their clocks ("paused"). Pure: the same inputs give the same answer.
 */
export const PRIORITY_OF_URGENCY: Record<RequestUrgency, RequestPriority> = { emergency: 'p1', urgent: 'p2', normal: 'p3', low: 'p4' };

const HOUR = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

export interface SlaInput {
  priority?: RequestPriority;
  urgency: RequestUrgency;
  createdAt: string;
  respondedAt?: string;
  /** Work completed (repair) or issue resolved. */
  doneAt?: string;
  /** Cancelled, merged or hidden: the clocks stop. */
  stopped?: boolean;
}

function status(target: number, start: number, end: number | undefined, now: number, stopped: boolean): SlaStatus {
  if (end !== undefined) return end <= target ? 'met' : 'missed';
  if (stopped) return 'paused';
  if (now > target) return 'breached';
  return target - now < (target - start) / 4 ? 'at_risk' : 'on_track';
}

export function slaOf(input: SlaInput, targets: readonly SlaTarget[], now: string): RequestSla {
  const priority = input.priority ?? PRIORITY_OF_URGENCY[input.urgency];
  const t = targets.find((x) => x.priority === priority) ?? targets[targets.length - 1]!;
  const start = Date.parse(input.createdAt);
  const respondBy = start + t.respondHours * HOUR;
  const resolveBy = start + t.resolveHours * HOUR;
  const at = Date.parse(now);
  return {
    priority,
    respondBy: iso(respondBy),
    resolveBy: iso(resolveBy),
    ...(input.respondedAt ? { respondedAt: input.respondedAt } : {}),
    response: status(respondBy, start, input.respondedAt ? Date.parse(input.respondedAt) : undefined, at, !!input.stopped),
    resolution: status(resolveBy, start, input.doneAt ? Date.parse(input.doneAt) : undefined, at, !!input.stopped),
  };
}

/** Whether a status needs someone's attention now. */
export const slaAlarm = (s: SlaStatus) => s === 'breached' || s === 'at_risk';
