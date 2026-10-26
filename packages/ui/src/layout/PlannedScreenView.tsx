import type { ScreenEntry } from '@repo/contracts/screens';
import { CalendarClock } from 'lucide-react';
import { Badge } from '../data/StatusLabel';
import { KeyValueList } from '../data/KeyValueList';
import { Reference } from '../data/Reference';
import { useT } from '../lib/useT';
import { buttonClass } from '../primitives/Button';
import { Link } from '../primitives/Link';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';

/**
 * Intentional page for a register screen scheduled for a later stage (Stage 0 report §5).
 * Its address already works, so links and bookmarks are never dead ends. Register names are
 * English data until their screens are built, so they are marked lang="en" for screen readers.
 */
export function PlannedScreenView({
  screen,
  record,
  startHref,
  secondary,
}: {
  screen: ScreenEntry;
  record: string | null;
  startHref: string;
  secondary?: { label: string; href: string };
}) {
  const { t } = useT();
  return (
    <div data-testid="planned-screen" data-screen-id={screen.id}>
      <PageHeader
        title={screen.name}
        titleLang="en"
        badge={<Badge tone="neutral" icon={CalendarClock}>{t('status:screen.planned')}</Badge>}
        description={t('errors:planned.intro', { stage: String(screen.stage) })}
      />
      <Panel>
        <KeyValueList
          items={[
            { label: t('errors:planned.screenId'), value: <Reference value={screen.id} /> },
            { label: t('errors:planned.template'), value: <span lang="en">{screen.uiTemplate}</span> },
            { label: t('errors:planned.stage'), value: String(screen.stage) },
            { label: t('errors:planned.status'), value: t(`status:screen.${screen.status as 'planned'}`) },
            { label: t('errors:planned.registerRoute'), value: <Reference value={screen.registerRoute} /> },
            ...(record ? [{ label: t('errors:planned.record'), value: <Reference value={record} /> }] : []),
          ]}
        />
      </Panel>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link variant="plain" href={startHref} className={buttonClass('primary')}>
          {t('common:actions.goToStart')}
        </Link>
        {secondary && (
          <Link variant="plain" href={secondary.href} className={buttonClass('secondary')}>
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
