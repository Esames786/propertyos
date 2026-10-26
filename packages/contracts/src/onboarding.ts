import type { AppId } from './persona';

export type TourStatus = 'offered' | 'in_progress' | 'paused' | 'completed' | 'dismissed';

/**
 * Mirrors the future `user_tour_progress` table (doc 09 §8) minus server ids.
 * Logical key: tenant + user(persona) + app + tour + version. Holds no PII or business data.
 */
export interface TourProgressRecord {
  tenantId: string;
  personaId: string;
  app: AppId;
  tourId: string;
  tourVersion: number;
  status: TourStatus;
  lastStepId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  updatedAt: string;
}

/** First-use state per tenant + persona + app (doc 09 §5: first login is per org and app). */
export interface OnboardingProfile {
  tenantId: string;
  personaId: string;
  app: AppId;
  welcomeDecision: 'pending' | 'accepted' | 'declined';
  autoOffer: boolean;
  seenModules: string[];
  updatedAt: string;
}
