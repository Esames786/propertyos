import type { ApiRequest, Persona } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import type { HandlerContext } from './handler-types';
import { canonical, inputFingerprint, MAX_IDEMPOTENCY_KEY, remember, replayOf, requestKey, type IdempotencyStore } from './idempotency';

/**
 * Gate E.0 shared bound idempotency (plan §4.5): a key replays only the identical request (operation,
 * organisation, principal, target, input) while the caller still has authority over the target; every
 * other reuse gets one non-disclosing 409 and changes nothing.
 */
const ctx = (o: { principal?: string; tenant?: string; key?: string; bodyKey?: string } = {}) =>
  ({
    persona: o.principal === '' ? undefined : ({ principalId: o.principal ?? 'usr_a' } as Persona),
    tenantId: o.tenant ?? 'tnt_larkspur',
    correlationId: 'demo-test',
    req: { method: 'POST', path: '/x', ...(o.key !== undefined ? { idempotencyKey: o.key } : {}), body: o.bodyKey !== undefined ? { idempotencyKey: o.bodyKey } : {} } as ApiRequest,
  }) as unknown as HandlerContext;

const REQ = { op: 'journal.create', target: 'le_larkspur', input: { lines: [{ account: '1100', debit: '100.00' }], memo: 'Opening' } };
const yes = () => true;

async function refusal(fn: () => unknown): Promise<string> {
  try {
    fn();
  } catch (e) {
    const err = e as Error & { problem: Record<string, unknown> };
    return JSON.stringify({ name: err.name, message: err.message, problem: err.problem });
  }
  throw new Error('expected a refusal');
}
const REUSED = JSON.stringify({ name: 'ApiError', message: 'idempotency_key_reused', problem: { status: 409, code: 'idempotency_key_reused', messageKey: 'errors:api.idempotencyKeyReused', correlationId: 'demo-test', changed: false } });

describe('idempotency.ts — bound replay', () => {
  it('no key: never a replay, nothing remembered', () => {
    const store: IdempotencyStore = {};
    expect(replayOf(ctx(), store, { ...REQ, stillAuthorized: yes })).toBeUndefined();
    remember(ctx(), store, REQ, 'jnl_1');
    expect(store).toEqual({});
  });

  it('the identical request replays the recorded result', () => {
    const store: IdempotencyStore = {};
    const c = ctx({ key: 'k1' });
    expect(replayOf(c, store, { ...REQ, stillAuthorized: yes })).toBeUndefined();
    remember(c, store, REQ, 'jnl_1');
    expect(store.k1).toMatchObject({ op: 'journal.create', tenant: 'tnt_larkspur', principal: 'usr_a', target: 'le_larkspur', recordId: 'jnl_1' });
    expect(replayOf(ctx({ key: 'k1' }), store, { ...REQ, stillAuthorized: yes })).toBe('jnl_1');
    // The same input with its keys in another order is the same request.
    expect(replayOf(ctx({ key: 'k1' }), store, { ...REQ, input: { memo: 'Opening', lines: [{ debit: '100.00', account: '1100' }] }, stillAuthorized: yes })).toBe('jnl_1');
  });

  it('any other use of the key gets the same 409 and the store is unchanged', async () => {
    const store: IdempotencyStore = {};
    remember(ctx({ key: 'k1' }), store, REQ, 'jnl_1');
    const before = JSON.stringify(store);
    const variants: Array<[string, HandlerContext, typeof REQ]> = [
      ['another operation', ctx({ key: 'k1' }), { ...REQ, op: 'journal.reverse' }],
      ['another person', ctx({ key: 'k1', principal: 'usr_b' }), REQ],
      ['another organisation', ctx({ key: 'k1', tenant: 'tnt_crescent' }), REQ],
      ['another target', ctx({ key: 'k1' }), { ...REQ, target: 'le_lsp_two_demo' }],
      ['another input', ctx({ key: 'k1' }), { ...REQ, input: { ...REQ.input, memo: 'Changed' } }],
    ];
    for (const [name, c, req] of variants) expect(await refusal(() => replayOf(c, store, { ...req, stillAuthorized: yes })), name).toBe(REUSED);
    expect(JSON.stringify(store)).toBe(before);
  });

  it('a legacy unbound entry (an id alone) replays nothing: refused like any reuse', async () => {
    const store: IdempotencyStore = { k1: 'jnl_old', k2: { recordId: 'jnl_old' } };
    expect(await refusal(() => replayOf(ctx({ key: 'k1' }), store, { ...REQ, stillAuthorized: yes }))).toBe(REUSED);
    expect(await refusal(() => replayOf(ctx({ key: 'k2' }), store, { ...REQ, stillAuthorized: yes }))).toBe(REUSED);
  });

  it('the identical request after losing authority over the target is answered like a target never issued (404)', async () => {
    const store: IdempotencyStore = {};
    remember(ctx({ key: 'k1' }), store, REQ, 'jnl_1');
    const out = JSON.parse(await refusal(() => replayOf(ctx({ key: 'k1' }), store, { ...REQ, stillAuthorized: () => false })));
    expect(out.problem).toMatchObject({ status: 404, code: 'not_found', changed: false });
  });

  it('without a signed-in principal nothing replays and nothing is remembered', () => {
    const store: IdempotencyStore = {};
    remember(ctx({ key: 'k1', principal: '' }), store, REQ, 'jnl_1');
    expect(store).toEqual({});
    remember(ctx({ key: 'k1' }), store, REQ, 'jnl_1');
    expect(replayOf(ctx({ key: 'k1', principal: '' }), store, { ...REQ, stillAuthorized: yes })).toBeUndefined();
  });

  it('the key: the transport’s key first, else the body’s (S.1 contract), trimmed and cut to 80 characters', () => {
    expect(requestKey(ctx({ key: ' abc ' }))).toBe('abc');
    expect(requestKey(ctx({ bodyKey: 'body-key' }))).toBe('body-key');
    expect(requestKey(ctx({ key: 'transport', bodyKey: 'body' }))).toBe('transport');
    expect(requestKey(ctx({ key: '  ' }))).toBeUndefined();
    expect(requestKey(ctx({ key: 'x'.repeat(200) }))?.length).toBe(MAX_IDEMPOTENCY_KEY);
  });

  it('canonical input: keys sorted, bigint as text, undefined dropped; fingerprints differ for different input', () => {
    expect(canonical({ b: 1n, a: undefined, c: [undefined, { z: 1, y: 2 }] })).toBe('{"b":"1","c":[null,{"y":2,"z":1}]}');
    expect(inputFingerprint({ a: 1, b: 2 })).toBe(inputFingerprint({ b: 2, a: 1 }));
    expect(inputFingerprint({ a: 1 })).not.toBe(inputFingerprint({ a: 2 }));
    expect(inputFingerprint({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });
});
