/**
 * Gate E.0: the shared history, version and audit projection (plan §4.4), generalised from the accepted
 * payroll closure (`payroll/views.ts` `projectEvents` / `projectVersions`, Issue #16 P0-1).
 *
 * Every read model that embeds history, versions, events, audit, activity or totals is projected for
 * the reader **before** it is serialized:
 * - a reader who may see the whole record (every project, entity, cost centre or person it touches)
 *   gets the full audit, unchanged;
 * - for anyone else, an event **about** something narrower (one person, one project, one lead…) is kept
 *   only if they may see that thing; an event about the record as a whole is kept with who, when and
 *   what, but without values (except values declared safe, such as a version number or a reference),
 *   without its free-text note (a note may name anyone or any amount), and with an action whose
 *   wording names an amount replaced by its `_limited` form;
 * - versions keep their number, time, author and reason; a change about something the reader cannot
 *   see reads "changed" and never names it;
 * - totals are withheld from a partial reader rather than recalculated (`wholeOnly`): no filtered total
 *   is ever made up.
 * Nothing is recalculated or invented: projected events are the stored ones with fields left out.
 *
 * Narrow-vs-full tests use `projection.testkit.ts` (`compareProjection`).
 */

/** An audit event as stored. Modules may store more fields; `internal` names those never returned. */
export interface AuditEvent {
  at: string;
  by?: string;
  byName?: string;
  action: string;
  values?: Record<string, unknown>;
  note?: string;
}

export interface HistoryPolicy<E extends AuditEvent> {
  /** The reader may see the whole record: the full audit. */
  whole: boolean;
  /** What a single event is about, when narrower than the record (a person, project, lead …). */
  about?: (e: E) => string | undefined;
  /** Whether the reader may see that thing. Required with `about` (absent means "sees nothing narrower"). */
  sees?: (aboutId: string) => boolean;
  /** Value keys that never carry hidden data. */
  safeValues?: readonly string[];
  /** Actions whose wording names an amount: a partial reader gets `${action}_limited`. */
  limitedActions?: ReadonlySet<string>;
  /** Stored-only fields (ids of what an event is about) never returned to anyone. */
  internal?: ReadonlyArray<keyof E>;
}

export type ProjectedEvent = AuditEvent & Record<string, unknown>;

const strip = <E extends AuditEvent>(e: E, internal: ReadonlyArray<keyof E> = []): ProjectedEvent => {
  const out: Record<string, unknown> = { ...(e as AuditEvent & Record<string, unknown>) };
  for (const k of internal) delete out[k as string];
  return out as ProjectedEvent;
};

/** Every event list, projected for the reader (see the module comment). */
export function projectHistory<E extends AuditEvent>(events: readonly E[], policy: HistoryPolicy<E>): ProjectedEvent[] {
  return events.flatMap((e): ProjectedEvent[] => {
    if (policy.whole) return [strip(e, policy.internal)];
    const about = policy.about?.(e);
    if (about !== undefined) return policy.sees?.(about) ? [strip(e, policy.internal)] : [];
    const safe = Object.fromEntries(Object.entries(e.values ?? {}).filter(([k]) => (policy.safeValues ?? []).includes(k)));
    return [
      {
        at: e.at,
        ...(e.by !== undefined ? { by: e.by } : {}),
        ...(e.byName !== undefined ? { byName: e.byName } : {}),
        action: policy.limitedActions?.has(e.action) ? `${e.action}_limited` : e.action,
        ...(Object.keys(safe).length ? { values: safe } : {}),
      },
    ];
  });
}

/** A stored version of a record. `aboutId` (never returned) names what a change was about. */
export interface StoredVersionEntry {
  n: number;
  at: string;
  byName: string;
  reason: string;
  aboutId?: string;
  /** The readable name of what it was about, shown only to a reader who may see it. */
  about?: string;
}

export interface VersionPolicy {
  whole: boolean;
  sees?: (aboutId: string) => boolean;
  /** Reasons about the whole record (never about one hidden thing): shown to every reader. */
  recordWide?: ReadonlySet<string>;
}

export interface ProjectedVersion {
  n: number;
  at: string;
  byName: string;
  reason: string;
  about?: string;
}

/** A record's versions, projected for the reader (number, time, author and reason; never a hidden name). */
export function projectVersions(versions: readonly StoredVersionEntry[], policy: VersionPolicy): ProjectedVersion[] {
  return versions.map(({ aboutId, ...v }): ProjectedVersion => {
    if (policy.whole) return { n: v.n, at: v.at, byName: v.byName, reason: v.reason, ...(v.about !== undefined ? { about: v.about } : {}) };
    const seen = aboutId !== undefined && !!policy.sees?.(aboutId);
    return { n: v.n, at: v.at, byName: v.byName, reason: policy.recordWide?.has(v.reason) || seen ? v.reason : 'changed', ...(seen && v.about !== undefined ? { about: v.about } : {}) };
  });
}

/** A total, count or export only a whole reader may have (a partial reader gets nothing, not a recomputed figure). */
export const wholeOnly = <T>(whole: boolean, value: T): T | undefined => (whole ? value : undefined);
