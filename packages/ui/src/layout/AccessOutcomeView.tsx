import type { DenyReason, ModuleKey } from '@repo/contracts';
import { CirclePause, Lock, MapPinOff, PackageX, type LucideIcon } from 'lucide-react';
import { IconTile } from '../data/IconTile';
import { dynamicT, useT } from '../lib/useT';
import { buttonClass } from '../primitives/Button';
import { Link } from '../primitives/Link';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';
import type { TileHue } from '@repo/tokens';

type Kind = 'notInPlan' | 'site' | 'role' | 'suspended' | 'inactive';

const KIND: Record<DenyReason, Kind> = {
  module_not_licensed: 'notInPlan',
  feature_not_licensed: 'notInPlan',
  site_not_licensed: 'site',
  permission_missing: 'role',
  separation_of_duties: 'role',
  state_locked: 'role',
  out_of_scope: 'role',
  tenant_suspended: 'suspended',
  tenant_inactive: 'inactive',
};

const LOOK: Record<Kind, [LucideIcon, TileHue]> = {
  notInPlan: [PackageX, 'slate'],
  site: [MapPinOff, 'slate'],
  role: [Lock, 'amber'],
  suspended: [CirclePause, 'rose'],
  inactive: [CirclePause, 'slate'],
};

/**
 * GLOBAL-012 access outcome: what someone sees when an address belongs to a module their
 * organisation has not licensed, a site outside the licence, or a role they do not hold. It says
 * why in plain words and offers a way on; it never shows the module's content or data.
 */
export function AccessOutcomeView({
  reason,
  module,
  organisation,
  startHref,
  planHref,
}: {
  reason: DenyReason;
  module?: ModuleKey;
  organisation: string;
  startHref: string;
  /** "Your plan & modules", for people who may open it. */
  planHref?: string;
}) {
  const { t } = useT();
  const tr = dynamicT(t);
  const kind = KIND[reason];
  const [icon, hue] = LOOK[kind];
  const moduleName = module ? tr(`platform:modules.${module}.name`) : '';
  return (
    <div data-testid="access-outcome" data-reason={reason} data-module={module}>
      <PageHeader title={tr(`errors:access.${kind}.title`)} />
      <Panel>
        <div className="flex items-start gap-4">
          <IconTile icon={icon} hue={hue} size="lg" />
          <div className="min-w-0 space-y-2">
            <p className="text-base text-text">{tr(`errors:access.${kind}.body`, { module: moduleName, organisation })}</p>
            <p className="text-sm text-muted">{tr(`errors:access.${kind}.next`)}</p>
          </div>
        </div>
      </Panel>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link variant="plain" href={startHref} className={buttonClass('primary')} data-testid="access-outcome-start">
          {t('common:actions.goToStart')}
        </Link>
        {planHref && (
          <Link variant="plain" href={planHref} className={buttonClass('secondary')} data-testid="access-outcome-plan">
            {t('errors:access.seePlan')}
          </Link>
        )}
      </div>
    </div>
  );
}
