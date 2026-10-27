import type { AppId, ModuleKey, Permission } from '@repo/contracts';
import type { TileHue } from '@repo/tokens';
import type { LucideIcon } from 'lucide-react';

/**
 * Tour contract (doc 09 §8, extended per ADR-0002).
 * - EXPLAIN: modal step; focus moves in and the page is inert.
 * - GUIDED_ACTION: non-modal; the user operates the highlighted control; advances on an event.
 * - SIMULATED_TASK: GUIDED_ACTION with training data and a visible TRAINING banner.
 */
export type TourKind = 'EXPLAIN' | 'GUIDED_ACTION' | 'SIMULATED_TASK';

export interface TourStep {
  id: string;
  /** Stable `data-tour-id` of the control on tablet/desktop. */
  targetId?: string;
  /** Equivalent control on phones (e.g. menu button instead of the hidden sidebar). */
  mobileTargetId?: string;
  titleKey: string;
  bodyKey: string;
  mobileBodyKey?: string;
  kind: TourKind;
  /** Navigate here before locating the target. */
  route?: string;
  requiredPermission?: Permission;
  /** Kept only when at least one of these modules is licensed (e.g. developer figures on the dashboard). */
  anyModule?: readonly ModuleKey[];
  /** Event that completes a GUIDED_ACTION / SIMULATED_TASK step. */
  completionEvent?: string;
  /** Event that temporarily hides the overlay while the user works in a menu or dialog it opened. */
  suspendEvent?: string;
  /** Event that brings the overlay back if the user closed that menu without finishing. */
  resumeEvent?: string;
  /** GUIDED_ACTION steps the user may also pass with Next. */
  optional?: boolean;
  /** When the target is missing/unauthorised: skip silently, or explain without a highlight. */
  fallback?: 'skip' | 'explain';
  /** The step renders inside a host dialog's slot (target lives in a modal). */
  inlineSlot?: string;
  /** Illustrated header for introduction steps (an icon on a tinted band; decorative). */
  art?: { icon: LucideIcon; hue: TileHue };
}

export interface TourDefinition {
  id: string;
  version: number;
  app: AppId;
  /** Persona ids, or '*' for every persona of the app. */
  applicablePersonas: readonly string[] | '*';
  /** Offered automatically on first visit to this module (doc 09 §2B). */
  moduleId?: string;
  /** The whole tour needs this (its module licensed and the permission held), e.g. the Sales tour. */
  requiredPermission?: Permission;
  nameKey: string;
  summaryKey: string;
  /** Runs inside practice mode (training store, TRAINING banner). */
  practice?: boolean;
  steps: TourStep[];
}

export const TOUR_FIND_TIMEOUT_MS = 3000;
