import { describe, expect, it } from 'vitest';
import { parseDraftRequestKey } from './request-key';

const KEY = 'e3-draft-create-123456';

describe('Gate E.3 header/body idempotency key agreement', () => {
  it('accepts the same key in transport metadata and JSON body', () => {
    expect(parseDraftRequestKey(KEY, KEY)).toBe(KEY);
  });
  it('supports a single key location for compatible clients', () => {
    expect(parseDraftRequestKey(KEY, undefined)).toBe(KEY);
    expect(parseDraftRequestKey(undefined, KEY)).toBe(KEY);
  });
  it('refuses absent or empty idempotency keys', () => {
    expect(parseDraftRequestKey(undefined, undefined)).toBeNull();
    expect(parseDraftRequestKey('', '')).toBeNull();
  });
  it('rejects header/body mismatches before a request can bind its key', () => {
    expect(parseDraftRequestKey(KEY, 'another-e3-draft-key-123')).toBeNull();
    expect(parseDraftRequestKey(KEY, null)).toBeNull();
    expect(parseDraftRequestKey(9, KEY)).toBeNull();
  });
  it('rejects malformed, dangerously short or oversize keys', () => {
    for (const raw of ['short', 'contains spaces here', 'bad/key/value-1111', 'x'.repeat(101), '__proto__']) {
      expect(parseDraftRequestKey(raw, raw)).toBeNull();
    }
    expect(parseDraftRequestKey('y'.repeat(100), 'y'.repeat(100))).toBe('y'.repeat(100));
  });
});
