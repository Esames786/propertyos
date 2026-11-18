/**
 * A form must submit the version it actually displays, not a newer background
 * GET. A successful POST also establishes a new authoritative form version.
 */
export type CommittedDraftFloor = Readonly<{ id: string; version: number }>;
type VersionedDraft = { id: string; currentVersion: number };

export function canHydrateDraft<T extends VersionedDraft>(
  selectedId: string | null,
  fetched: T | null | undefined,
  dirty: boolean,
  floor: CommittedDraftFloor | null,
): fetched is T {
  if (dirty || !selectedId || !fetched || fetched.id !== selectedId) return false;
  if (floor?.id === selectedId && fetched.currentVersion < floor.version) return false;
  return Number.isSafeInteger(fetched.currentVersion) && fetched.currentVersion > 0;
}

/** Pin the version to the hydrated form or acknowledged POST, never a newer GET. */
export function expectedDraftVersion(
  selectedId: string | null,
  floor: CommittedDraftFloor | null,
): number | undefined {
  if (!selectedId || floor?.id !== selectedId) return undefined;
  return Number.isSafeInteger(floor.version) && floor.version > 0 ? floor.version : undefined;
}

/** Stable identity avoids an effect loop when the same loaded version is observed. */
export function pinDraftVersion(
  previous: CommittedDraftFloor | null,
  draft: VersionedDraft,
): CommittedDraftFloor {
  if (previous?.id === draft.id && previous.version === draft.currentVersion) return previous;
  return { id: draft.id, version: draft.currentVersion };
}
