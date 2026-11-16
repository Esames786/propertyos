import { describe, expect, it } from 'vitest';
import { canHydrateDraft, expectedDraftVersion } from './revision-sync';

const old = { id: 'draft_01', currentVersion: 2 };
const newest = { id: 'draft_01', currentVersion: 3 };
const other = { id: 'draft_02', currentVersion: 9 };
const committed = { id: 'draft_01', version: 3 };

describe('E.3 revision sync — safe after successful POST and failed/stale GET', () => {
  it('never rehydrates an unsaved editor from background refresh', () => {
    expect(canHydrateDraft('draft_01', newest, true, null)).toBe(false);
    expect(canHydrateDraft('draft_01', newest, true, committed)).toBe(false);
  });
  it('rejects old cached detail until the committed revision is visible', () => {
    expect(canHydrateDraft('draft_01', old, false, committed)).toBe(false);
    expect(canHydrateDraft('draft_01', newest, false, committed)).toBe(true);
    expect(canHydrateDraft('draft_01', { ...newest, currentVersion: 4 }, false, committed)).toBe(true);
  });
  it('blocks a detail response from the wrong selected record', () => {
    expect(canHydrateDraft('draft_01', other, false, null)).toBe(false);
    expect(canHydrateDraft('draft_01', null, false, null)).toBe(false);
    expect(canHydrateDraft(null, newest, false, null)).toBe(false);
  });
  it('uses the known committed version for an immediate second revision', () => {
    expect(expectedDraftVersion('draft_01', old, committed)).toBe(3);
    expect(expectedDraftVersion('draft_01', newest, committed)).toBe(3);
    expect(expectedDraftVersion('draft_01', { ...newest, currentVersion: 4 }, committed)).toBe(4);
  });
  it('does not leak a previous selected draft version into a new draft', () => {
    expect(expectedDraftVersion('draft_02', other, committed)).toBe(9);
    expect(expectedDraftVersion('draft_02', null, committed)).toBeUndefined();
    expect(expectedDraftVersion(null, newest, committed)).toBeUndefined();
  });
  it('rejects malformed version metadata', () => {
    expect(canHydrateDraft('draft_01', { id: 'draft_01', currentVersion: 0 }, false, null)).toBe(false);
    expect(canHydrateDraft('draft_01', { id: 'draft_01', currentVersion: Number.NaN }, false, null)).toBe(false);
  });
});
