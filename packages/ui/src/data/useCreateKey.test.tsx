import { ApiError } from '@repo/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isKeyReused, useCreateKey } from './useApi';

/**
 * GitHub Issue #18 (FIN-02): one idempotency key per logical create. The key survives re-renders
 * (a retry of the same create sends it again) and changes only when the caller renews it (after a
 * success, a new form, or the server refusing a key another request already used).
 */
describe('useCreateKey', () => {
  it('keeps one key across renders and gives a different one on renew', () => {
    const { result, rerender } = renderHook(() => useCreateKey('cv'));
    const first = result.current[0];
    expect(first).toMatch(/^cv-[0-9a-f-]{36}$/);
    rerender();
    expect(result.current[0]).toBe(first);
    act(() => result.current[1]());
    expect(result.current[0]).not.toBe(first);
    expect(result.current[0]).toMatch(/^cv-/);
  });

  it('two forms on one page never share a key', () => {
    const a = renderHook(() => useCreateKey('trf'));
    const b = renderHook(() => useCreateKey('trf'));
    expect(a.result.current[0]).not.toBe(b.result.current[0]);
  });

  it('recognises only the reused-key refusal', () => {
    const problem = (code: string) => new ApiError({ status: 409, code, messageKey: `finance:problems.${code}`, correlationId: 'c', changed: false });
    expect(isKeyReused(problem('idempotency_key_reused'))).toBe(true);
    expect(isKeyReused(problem('insufficient_funds'))).toBe(false);
    expect(isKeyReused(new Error('idempotency_key_reused'))).toBe(false);
  });
});
