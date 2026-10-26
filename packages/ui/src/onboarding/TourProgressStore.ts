import type { AppId, OnboardingProfile, TourProgressRecord } from '@repo/contracts';

export interface TourScope {
  tenantId: string;
  personaId: string;
  app: AppId;
}

/**
 * Progress persistence seam. Prototype: LocalTourProgressStore. Backend stage: an API store over
 * `user_tour_progress` (doc 09 §8). Stores only status, step id and timestamps: no PII.
 */
export interface TourProgressStore {
  getProfile(scope: TourScope): OnboardingProfile;
  saveProfile(profile: OnboardingProfile): void;
  getProgress(scope: TourScope, tourId: string, version: number): TourProgressRecord | null;
  saveProgress(record: TourProgressRecord): void;
  listProgress(scope: TourScope): TourProgressRecord[];
  reset(scope: TourScope): void;
}

interface StoredScope {
  profile: OnboardingProfile;
  progress: Record<string, TourProgressRecord>;
}

const keyOf = (s: TourScope) => `onboarding:v1:${s.tenantId}:${s.personaId}:${s.app}`;
const progressKey = (tourId: string, version: number) => `${tourId}@${version}`;

export function newProfile(scope: TourScope): OnboardingProfile {
  return { ...scope, welcomeDecision: 'pending', autoOffer: true, seenModules: [], updatedAt: new Date().toISOString() };
}

/** localStorage-backed store with an in-memory fallback when storage is unavailable. */
export class LocalTourProgressStore implements TourProgressStore {
  private memory = new Map<string, StoredScope>();
  private storage: Storage | undefined;

  constructor(storage: Storage | undefined = globalThis.localStorage) {
    this.storage = storage;
  }

  private read(scope: TourScope): StoredScope {
    const key = keyOf(scope);
    try {
      const raw = this.storage?.getItem(key);
      if (raw) return JSON.parse(raw) as StoredScope;
    } catch {
      /* fall back to memory */
    }
    return this.memory.get(key) ?? { profile: newProfile(scope), progress: {} };
  }

  private write(scope: TourScope, value: StoredScope) {
    const key = keyOf(scope);
    this.memory.set(key, value);
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* memory copy is kept */
    }
  }

  getProfile(scope: TourScope): OnboardingProfile {
    return this.read(scope).profile;
  }

  saveProfile(profile: OnboardingProfile): void {
    const scope = { tenantId: profile.tenantId, personaId: profile.personaId, app: profile.app };
    const current = this.read(scope);
    this.write(scope, { ...current, profile: { ...profile, updatedAt: new Date().toISOString() } });
  }

  getProgress(scope: TourScope, tourId: string, version: number): TourProgressRecord | null {
    return this.read(scope).progress[progressKey(tourId, version)] ?? null;
  }

  saveProgress(record: TourProgressRecord): void {
    const scope = { tenantId: record.tenantId, personaId: record.personaId, app: record.app };
    const current = this.read(scope);
    this.write(scope, {
      ...current,
      progress: { ...current.progress, [progressKey(record.tourId, record.tourVersion)]: { ...record, updatedAt: new Date().toISOString() } },
    });
  }

  listProgress(scope: TourScope): TourProgressRecord[] {
    return Object.values(this.read(scope).progress);
  }

  reset(scope: TourScope): void {
    this.memory.delete(keyOf(scope));
    try {
      this.storage?.removeItem(keyOf(scope));
    } catch {
      /* ignore */
    }
  }
}
