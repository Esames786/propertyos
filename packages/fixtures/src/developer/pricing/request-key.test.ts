import { describe, expect, it } from 'vitest';
import { MAX_IDEMPOTENCY_KEY } from '../../idempotency';
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
    for (const raw of ['short', 'contains spaces here', 'bad/key/value-1111', 'x'.repeat(81), 'x'.repeat(101), '__proto__']) {
      expect(parseDraftRequestKey(raw, raw)).toBeNull();
    }
    expect(parseDraftRequestKey('y'.repeat(80), 'y'.repeat(80))).toBe('y'.repeat(80));
  });
  it('never accepts a key longer than E.0 keeps (MAX_IDEMPOTENCY_KEY), so two keys never become one', () => {
    expect(MAX_IDEMPOTENCY_KEY).toBe(80);
    const a = `${'k'.repeat(MAX_IDEMPOTENCY_KEY)}-a`, b = `${'k'.repeat(MAX_IDEMPOTENCY_KEY)}-b`;
    expect(parseDraftRequestKey(a, a)).toBeNull();
    expect(parseDraftRequestKey(b, b)).toBeNull();
  });
  // Gate E.3 local validation: names of Object.prototype members are ordinary keys. The own-entry lookup they
  // need is now E.0's (idempotency.ts replayOf, Wave 2 fix); e3qa-flows.api.test.ts covers them end to end.
  it('accepts keys that name Object.prototype members as ordinary keys', () => {
    for (const key of ['hasOwnProperty', 'isPrototypeOf', 'toLocaleString', '__defineGetter__']) {
      expect(parseDraftRequestKey(key, key)).toBe(key);
    }
  });
});
