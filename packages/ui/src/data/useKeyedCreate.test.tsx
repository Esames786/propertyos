import { ApiError, type ApiRequest, type Persona } from '@repo/contracts';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../providers/AppProviders';
import { useKeyedCreate } from './useApi';

/**
 * GitHub Issue #21: the credit-note drawer's request key (`useKeyedCreate`). One key per logical create:
 * a press after a failure sends the same key again, so a retry whose first attempt reached the server
 * is answered with what it created (never a second record) and its success is not lost; the key is new
 * after a success, after the server refused it as used by another request, and in a new form.
 */
const ME: Persona = { id: 'finance', tenantId: 'tnt_a', app: 'backoffice', principalId: 'usr_t', displayName: 'Test Treasurer', roleKey: 'common:persona.manager', email: 't@example.com', permissions: ['credit_note.create'], projectScope: 'all' };

/** A server that binds a key to the request, as the mock API's credit-note POST does (Issue #21). */
function server() {
  const bound = new Map<string, { content: string; result: { id: string } }>();
  const seen: Array<{ key: string | undefined; bodyKey: unknown }> = [];
  const s = {
    seen,
    bound,
    /** The next request reaches the server, which acts on it, but its answer never arrives. */
    loseNextAnswer: false,
    /** The next request is refused before anything is bound (e.g. a validation refusal). */
    refuseNext: null as ApiError | null,
    request: async <T,>(req: ApiRequest): Promise<T> => {
      const { idempotencyKey: bodyKey, ...content } = (req.body ?? {}) as Record<string, unknown>;
      seen.push({ key: req.idempotencyKey, bodyKey });
      if (s.refuseNext) {
        const e = s.refuseNext;
        s.refuseNext = null;
        throw e;
      }
      const key = req.idempotencyKey ?? `none-${seen.length}`;
      const prior = bound.get(key);
      let result: { id: string };
      if (prior) {
        if (prior.content !== JSON.stringify(content)) throw problem(409, 'idempotency_key_reused');
        result = prior.result;
      } else {
        result = { id: `rec-${bound.size + 1}` };
        bound.set(key, { content: JSON.stringify(content), result });
      }
      if (s.loseNextAnswer) {
        s.loseNextAnswer = false;
        throw new TypeError('Failed to fetch');
      }
      return result as T;
    },
  };
  return s;
}
const problem = (status: number, code: string) => new ApiError({ status, code, messageKey: `finance:problems.${code}`, correlationId: 'c', changed: false });

function setup() {
  localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: ME.id, projectId: 'all' }));
  const api = server();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders app="backoffice" tenant={{ id: 'tnt_a', name: 'Alpha' }} personas={[ME]} createTransport={() => api}>
      {children}
    </AppProviders>
  );
  const hook = renderHook(() => useKeyedCreate<{ id: string }>('cn'), { wrapper });
  /** Press "Issue": the answer, or the error the drawer would show. */
  const press = async (body: Record<string, unknown>) => {
    let out: { ok: true; id: string } | { ok: false; error: unknown } = { ok: false, error: null };
    await act(async () => {
      try {
        out = { ok: true, id: (await hook.result.current.send({ method: 'POST', path: '/billing/invoices/inv_1/credit-notes', body })).id };
      } catch (error) {
        out = { ok: false, error };
      }
    });
    return out;
  };
  return { api, hook, press, wrapper };
}

const NOTE = { reason: 'Lift out of service', lines: [{ lineId: 'l1', amount: '600.00' }] };

describe('useKeyedCreate (Issue #21: the credit-note drawer’s request key)', () => {
  it('a press after a lost answer sends the same key and gets the record the first attempt created; then the key is new', async () => {
    const { api, hook, press } = setup();
    const first = hook.result.current.key;
    expect(first).toMatch(/^cn-[0-9a-f-]{36}$/);
    api.loseNextAnswer = true;
    const lost = await press(NOTE);
    expect(lost.ok).toBe(false);
    expect(hook.result.current.key).toBe(first);
    const retry = await press(NOTE);
    expect(retry).toEqual({ ok: true, id: 'rec-1' });
    // The same key both times, in the request and in the body; one record.
    expect(api.seen).toEqual([{ key: first, bodyKey: first }, { key: first, bodyKey: first }]);
    expect(api.bound.size).toBe(1);
    expect(hook.result.current.key).not.toBe(first);
    expect(hook.result.current.key).toMatch(/^cn-/);
  });

  it('after a success the next create (even with the same content) is a new record under a new key', async () => {
    const { api, hook, press } = setup();
    const a = await press(NOTE);
    const second = hook.result.current.key;
    const b = await press(NOTE);
    expect([a, b]).toEqual([{ ok: true, id: 'rec-1' }, { ok: true, id: 'rec-2' }]);
    expect(api.seen[0]!.key).not.toBe(api.seen[1]!.key);
    expect(api.seen[1]!.key).toBe(second);
  });

  it('a refused request keeps the key (the server bound nothing); a reused-key refusal renews it', async () => {
    const { api, hook, press } = setup();
    const first = hook.result.current.key;
    api.refuseNext = problem(422, 'validation_failed');
    expect((await press(NOTE)).ok).toBe(false);
    expect(hook.result.current.key).toBe(first);
    api.refuseNext = problem(503, 'service_unavailable');
    expect((await press(NOTE)).ok).toBe(false);
    expect(hook.result.current.key).toBe(first);
    // The first attempt went through, its answer was lost, then the form was changed: the key is refused.
    api.loseNextAnswer = true;
    expect((await press(NOTE)).ok).toBe(false);
    const reused = await press({ ...NOTE, lines: [{ lineId: 'l1', amount: '500.00' }] });
    expect(reused.ok).toBe(false);
    expect(reused.ok === false && reused.error instanceof ApiError && reused.error.problem.code).toBe('idempotency_key_reused');
    expect(hook.result.current.key).not.toBe(first);
    expect(api.bound.size).toBe(1);
  });

  it('a new form (a new mount) starts with a new key; two forms never share one', async () => {
    const one = setup();
    const k1 = one.hook.result.current.key;
    one.hook.unmount();
    const two = renderHook(() => useKeyedCreate<{ id: string }>('cn'), { wrapper: one.wrapper });
    const other = renderHook(() => useKeyedCreate<{ id: string }>('cn'), { wrapper: one.wrapper });
    expect(two.result.current.key).not.toBe(k1);
    expect(other.result.current.key).not.toBe(two.result.current.key);
  });
});
