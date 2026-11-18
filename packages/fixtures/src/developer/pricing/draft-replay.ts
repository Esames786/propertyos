import { ApiError } from '@repo/contracts';
import { notFound, type HandlerContext } from '../../handler-types';
import { remember, replayOf, type BoundRequest, type IdempotencyStore } from '../../idempotency';

/**
 * Wave 2 integration (seam notes §5): E.3's five draft families replay through E.0's shared, request-bound
 * idempotency (`replayOf` / `remember`; any other use of a key gets its one non-disclosing 409
 * `idempotency_key_reused`). E.3 keeps its stricter pre-checks (`request-key.ts`: a key is required, and
 * header and body keys must agree, else 422) and calls this only after them and after validation.
 *
 * What a request produced is recorded as the draft at the version it left (`<id>@v<n>`). Versions are
 * append-only and never edited, so the original response is rebuilt exactly, also after later revisions.
 */
interface VersionedDraft {
  id: string;
  currentVersion: number;
  versions: ReadonlyArray<{ version: number }>;
}

/** The recorded result of a create or revision: this draft at its current version. */
export const draftResult = (draft: VersionedDraft): string => `${draft.id}@v${draft.currentVersion}`;

/** The draft as it was when version `n` was its latest (a deep copy; the stored draft is untouched). */
export function atVersion<T extends VersionedDraft>(draft: T, n: number): T {
  const copy = structuredClone(draft);
  return { ...copy, currentVersion: n, versions: copy.versions.filter((v) => v.version <= n) };
}

/**
 * The original response when this is the identical request again (same operation, organisation, person,
 * target and normalised input) and the caller still has authority (`stillAuthorized`); undefined for a new
 * key. `find` looks the draft up again through the family's own creator-and-scope check, so a draft that
 * is no longer readable answers exactly like an id never issued.
 */
export function replayDraft<T extends VersionedDraft>(
  ctx: HandlerContext,
  store: IdempotencyStore | undefined,
  req: BoundRequest & { stillAuthorized: () => boolean },
  find: (id: string) => T | undefined,
): T | undefined {
  const recorded = replayOf(ctx, store ?? {}, req);
  if (recorded === undefined) return undefined;
  const m = /^(.+)@v([1-9]\d*)$/.exec(recorded);
  const draft = m ? find(m[1]!) : undefined;
  const n = Number(m?.[2]);
  if (!draft || n > draft.currentVersion) notFound(ctx);
  return atVersion(draft, n);
}

/** Records the key of a create or revision that just succeeded (the store is the family's own section's). */
export function rememberDraft(ctx: HandlerContext, store: IdempotencyStore, req: BoundRequest, draft: VersionedDraft): void {
  remember(ctx, store, req, draftResult(draft));
}

/**
 * The draft is no longer at the version the editor started from (or the section is not this organisation's):
 * 409 `stale_version`, as the base's CRM answers, with the family's own "reload" message. Nothing changes.
 */
export function staleVersion(ctx: HandlerContext, messageKey: string): never {
  throw new ApiError({ status: 409, code: 'stale_version', messageKey, correlationId: ctx.correlationId, changed: false });
}
