/**
 * Gate E.3: protect committed draft revisions against a delayed/stale GET.
 *
 * A successful POST returns the authoritative new version. React Query may still
 * expose the older cached detail while invalidation/refetch is in flight, or
 * permanently if the refresh fails. Never hydrate the editor backwards.
 */
export type CommittedDraftFloor = Readonly<{ id: string; version: number }>;

export function canHydrateDraft(
  selectedId: string | null,
  fetched: { id: string; currentVersion: number } | null | undefined,
  dirty: boolean,
  floor: CommittedDraftFloor | null,
): boolean {
  if (dirty || !selectedId || !fetched || fetched.id !== selectedId) return false;
  if (floor?.id === selectedId && fetched.currentVersion < floor.version) return false;
  return Number.isSafeInteger(fetched.currentVersion) && fetched.currentVersion > 0;
}

/** Used by optimistic revision saves without trusting stale detail query data. */
export function expectedDraftVersion(
  selectedId: string | null,
  fetched: { id: string; currentVersion: number } | null | undefined,
  floor: CommittedDraftFloor | null,
): number | undefined {
  if (!selectedId) return undefined;
  const fetchedVersion = fetched?.id === selectedId ? fetched.currentVersion : 0;
  const committedVersion = floor?.id === selectedId ? floor.version : 0;
  const latest = Math.max(fetchedVersion, committedVersion);
  return Number.isSafeInteger(latest) && latest > 0 ? latest : undefined;
}
