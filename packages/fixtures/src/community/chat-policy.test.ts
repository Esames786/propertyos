import { describe, expect, it } from 'vitest';
import { mayDeliverQueued, mayReadMessage, type ChatMembership, type ChatMessage } from './chat-policy';

const joined: ChatMembership[] = [{ principalId: 'res_A', groupId: 'block_A', joinedAt: '2026-10-10T00:00:00Z' }];
const msg = (createdAt: string, id = 'm1'): ChatMessage => ({ id, groupId: 'block_A', senderId: 'res_B', createdAt });
const now = '2026-11-01T00:00:00Z';
const rule = { days: 90, heldMessageIds: [] as string[] };
const read = (overrides: Partial<Parameters<typeof mayReadMessage>[0]> = {}) => mayReadMessage({
  enabled: true, memberships: joined, principalId: 'res_A', groupId: 'block_A', message: msg('2026-10-20T00:00:00Z'), now, retention: rule, ...overrides,
});
describe('D.3 policy: membership, revocation and history', () => {
  it('allows current member after joining', () => expect(read()).toEqual({ allowed: true }));
  it('denies history predating membership', () => expect(read({ message: msg('2026-10-09T23:59:59Z') })).toEqual({ allowed: false, reason: 'before_join' }));
  it('denies a different group or principal', () => {
    expect(read({ groupId: 'block_B' })).toEqual({ allowed: false, reason: 'outside_group' });
    expect(read({ principalId: 'res_C' })).toEqual({ allowed: false, reason: 'missing_membership' });
  });
  it('revokes a moved-out resident on every read and queued send', () => {
    const left = [{ ...joined[0]!, leftAt: '2026-10-31T00:00:00Z' }];
    expect(read({ memberships: left })).toEqual({ allowed: false, reason: 'membership_expired' });
    expect(mayDeliverQueued({ enabled: true, memberships: left, senderId: 'res_A', groupId: 'block_A', now, retention: rule })).toEqual({ allowed: false, reason: 'membership_expired' });
  });
  it('does not restore old history after rejoining', () => {
    const different = [{ ...joined[0]!, leftAt: '2026-10-21T00:00:00Z' }, { ...joined[0]!, joinedAt: '2026-10-30T00:00:00Z' }];
    expect(read({ memberships: different })).toEqual({ allowed: false, reason: 'before_join' });
  });
  it('blocks chat until the society sets retention', () => expect(read({ retention: undefined })).toEqual({ allowed: false, reason: 'chat_disabled' }));
  it('expires messages unless a lawful hold applies', () => {
    const old = msg('2026-10-11T00:00:00Z', 'held');
    expect(read({ message: old, retention: { days: 10, heldMessageIds: [] } })).toEqual({ allowed: false, reason: 'retention_expired' });
    expect(read({ message: old, retention: { days: 10, heldMessageIds: ['held'] } })).toEqual({ allowed: true });
  });
  it('honors deleted messages even on hold', () => {
    expect(read({ message: { ...msg('2026-10-20T00:00:00Z'), deletedAt: '2026-10-21T00:00:00Z' } })).toEqual({ allowed: false, reason: 'deleted' });
  });
  it('rejects invalid timestamps', () => expect(() => read({ now: 'not-a-date' })).toThrow(RangeError));
});
