import { describe, expect, it } from 'vitest';
import { LocalTourProgressStore, type TourScope } from './TourProgressStore';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const sales: TourScope = { tenantId: 't1', personaId: 'sales', app: 'backoffice' };
const finance: TourScope = { ...sales, personaId: 'finance' };

const record = (scope: TourScope, version = 1) => ({
  ...scope,
  tourId: 'GLOBAL-TOUR-001',
  tourVersion: version,
  status: 'completed' as const,
  lastStepId: 'help',
  startedAt: '2026-10-26T09:00:00Z',
  completedAt: '2026-10-26T09:02:00Z',
  dismissedAt: null,
  updatedAt: '2026-10-26T09:02:00Z',
});

describe('LocalTourProgressStore', () => {
  it('starts every persona with a pending welcome and auto-offer on', () => {
    const store = new LocalTourProgressStore(new MemoryStorage() as unknown as Storage);
    expect(store.getProfile(sales)).toMatchObject({ welcomeDecision: 'pending', autoOffer: true, seenModules: [] });
  });

  it('keys progress by tenant + persona + app + tour + version', () => {
    const store = new LocalTourProgressStore(new MemoryStorage() as unknown as Storage);
    store.saveProgress(record(sales));
    expect(store.getProgress(sales, 'GLOBAL-TOUR-001', 1)?.status).toBe('completed');
    expect(store.getProgress(sales, 'GLOBAL-TOUR-001', 2)).toBeNull();
    expect(store.getProgress(finance, 'GLOBAL-TOUR-001', 1)).toBeNull();
  });

  it('stores no personal or business data', () => {
    const storage = new MemoryStorage();
    const store = new LocalTourProgressStore(storage as unknown as Storage);
    store.saveProgress(record(sales));
    store.saveProfile({ ...store.getProfile(sales), welcomeDecision: 'declined' });
    const raw = [...storage.data.values()].join('');
    expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}|\+92|cnic|amount|phone|displayName/i);
  });

  it('reset clears only that scope', () => {
    const store = new LocalTourProgressStore(new MemoryStorage() as unknown as Storage);
    store.saveProgress(record(sales));
    store.saveProgress(record(finance));
    store.reset(sales);
    expect(store.listProgress(sales)).toHaveLength(0);
    expect(store.listProgress(finance)).toHaveLength(1);
  });

  it('falls back to memory when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const store = new LocalTourProgressStore(broken);
    store.saveProgress(record(sales));
    expect(store.getProgress(sales, 'GLOBAL-TOUR-001', 1)?.status).toBe('completed');
  });
});
