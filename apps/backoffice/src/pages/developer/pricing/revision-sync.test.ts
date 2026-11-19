import { describe, expect, it } from 'vitest';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion } from './revision-sync';

const old = { id: 'draft_01', currentVersion: 2 };
const newest = { id: 'draft_01', currentVersion: 3 };
const other = { id: 'draft_02', currentVersion: 9 };
const committed = { id: 'draft_01', version: 3 };

describe('E.3 revision sync — save against the displayed version', () => {
  it('does not hydrate dirty forms even when a newer GET arrives', () => {
    expect(canHydrateDraft('draft_01', newest, true, null)).toBe(false);
    const pinned = pinDraftVersion(null, old);
    expect(canHydrateDraft('draft_01', newest, true, pinned)).toBe(false);
    expect(expectedDraftVersion('draft_01', pinned)).toBe(2);
  });
  it('rejects old cached detail after a successful POST', () => {
    expect(canHydrateDraft('draft_01', old, false, committed)).toBe(false);
    expect(canHydrateDraft('draft_01', newest, false, committed)).toBe(true);
    expect(expectedDraftVersion('draft_01', committed)).toBe(3);
  });
  it('does not submit a version until the selected record has hydrated', () => {
    expect(expectedDraftVersion('draft_01', null)).toBeUndefined();
    expect(expectedDraftVersion('draft_02', committed)).toBeUndefined();
    expect(expectedDraftVersion(null, committed)).toBeUndefined();
  });
  it('allows clean forms to hydrate newer revisions', () => {
    const pinned = pinDraftVersion(null, old);
    expect(canHydrateDraft('draft_01', newest, false, pinned)).toBe(true);
    expect(expectedDraftVersion('draft_01', pinDraftVersion(pinned, newest))).toBe(3);
  });
  it('rejects wrong record, missing payload or malformed version', () => {
    expect(canHydrateDraft('draft_01', other, false, null)).toBe(false);
    expect(canHydrateDraft('draft_01', null, false, null)).toBe(false);
    expect(canHydrateDraft('draft_01', { ...old, currentVersion: NaN }, false, null)).toBe(false);
    expect(expectedDraftVersion('draft_01', { id: 'draft_01', version: 0 })).toBeUndefined();
  });
  it('preserves identity for an already pinned version', () => {
    expect(pinDraftVersion(committed, newest)).toBe(committed);
  });
});
