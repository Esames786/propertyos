import type { ComponentType, ContractStatus, EditionKey, ModuleKey, TenantStatus, UsageDimension } from '@repo/contracts';
import type { StatusTone, TileHue, useT } from '@repo/ui';
import {
  AlertOctagon,
  BadgeCheck,
  Building,
  Building2,
  CircleDashed,
  Clock3,
  FileClock,
  Hourglass,
  Layers3,
  PauseCircle,
  Puzzle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

type T = ReturnType<typeof useT>['t'];

/** Translation keys can't contain dots inside a segment, so dimension codes map to underscores. */
export const dimensionKey = (d: UsageDimension) => d.replace(/\./g, '_') as 'units_eligible';

export const dimensionLabel = (t: T, d: UsageDimension) => t(`platform:dimensions.${dimensionKey(d)}`);
export const moduleName = (t: T, m: ModuleKey) => t(`platform:modules.${m}.name`);
export const editionName = (t: T, e: EditionKey) => t(`platform:editions.${e}.name`);
export const componentName = (t: T, c: ComponentType) => t(`platform:components.${c}.name`);

export const STATUS_TONE: Record<TenantStatus | 'awaiting_approval', StatusTone> = {
  draft: 'neutral',
  trial: 'info',
  active: 'success',
  grace: 'warning',
  suspended: 'error',
  cancelled: 'neutral',
  archived: 'neutral',
  awaiting_approval: 'warning',
};

export const STATUS_ICON: Record<TenantStatus | 'awaiting_approval', LucideIcon> = {
  draft: CircleDashed,
  trial: Hourglass,
  active: BadgeCheck,
  grace: Clock3,
  suspended: PauseCircle,
  cancelled: AlertOctagon,
  archived: AlertOctagon,
  awaiting_approval: FileClock,
};

/** A tenant's displayed lifecycle: "awaiting approval" is a contract state shown in place of draft. */
export const lifecycleOf = (t: { status: TenantStatus; contractStatus: ContractStatus | 'none' }) =>
  t.status === 'draft' && t.contractStatus === 'pending_approval' ? ('awaiting_approval' as const) : t.status;

export const EDITION_ICON: Record<EditionKey, LucideIcon> = { developer: Building2, community: Building, portfolio: Layers3, custom: Puzzle };
export const EDITION_HUE: Record<EditionKey, TileHue> = { developer: 'emerald', community: 'sky', portfolio: 'violet', custom: 'amber' };
export const NEW_ICON = Sparkles;
