import { findScreen, type ScreenEntry } from '@repo/contracts/screens';
import { CalendarClock } from 'lucide-react';
import { Badge } from '../data/StatusLabel';
import { KeyValueList } from '../data/KeyValueList';
import { Reference } from '../data/Reference';
import { useT } from '../lib/useT';
import { buttonClass } from '../primitives/Button';
import { Link } from '../primitives/Link';
import { PageHeader } from './PageHeader';
import { Panel } from './Panel';

/** The gate letter (A–H) a register row is scheduled for, if it names one. */
function gateLetter(gate: string): string | null {
  const m = /^([A-H])\b/.exec(gate.trim());
  return m ? m[1]! : null;
}

/**
 * Intentional page for a register screen that is not built yet (V3.1 register, adopted in Gate B).
 * Its address already works, so links and bookmarks are never dead ends. When the row was merged
 * into, or superseded by, another screen, the page says which one. Register names and codes are
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
  const gate = gateLetter(screen.gate);
  const canonical = screen.canonicalId !== screen.id ? findScreen(screen.canonicalId) : undefined;
  const otherApp = canonical && canonical.app !== screen.app && canonical.app === 'platform';
  return (
    <div data-testid="planned-screen" data-screen-id={screen.id}>
      <PageHeader
        title={screen.name}
        titleLang="en"
        badge={<Badge tone="neutral" icon={CalendarClock}>{t('status:screen.planned')}</Badge>}
        description={gate ? t('errors:planned.introGate', { gate }) : t('errors:planned.intro', { stage: String(screen.stage) })}
      />
      <Panel>
        <KeyValueList
          items={[
            { label: t('errors:planned.screenId'), value: <Reference value={screen.id} /> },
            ...(canonical
              ? [
                  {
                    label: t('errors:planned.partOf'),
                    value: (
                      <span>
                        <span lang="en">{canonical.name}</span> (<Reference value={canonical.id} />)
                        {otherApp ? ` · ${t('errors:planned.inPlatformHq')}` : ''}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(gate ? [{ label: t('errors:planned.gate'), value: gate }] : [{ label: t('errors:planned.stage'), value: String(screen.stage) }]),
            { label: t('errors:planned.module'), value: <span lang="en">{screen.module}</span> },
            { label: t('errors:planned.edition'), value: <span lang="en">{screen.edition}</span> },
            { label: t('errors:planned.template'), value: <span lang="en">{screen.uiTemplate}</span> },
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
