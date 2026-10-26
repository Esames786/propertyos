import { buttonClass, Link, PageHeader, Panel, ShortcutList, useT } from '@repo/ui';
import { ListChecks } from 'lucide-react';

/** GLOBAL-007 as a page; the same content opens as a drawer from Help on any page (?help=open). */
export default function HelpPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('help:drawerTitle')} description={t('help:pages.default.body')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('help:pages.tours.title')} description={t('help:pages.tours.body')}>
          <Link variant="plain" href="/backoffice/help/tours" className={buttonClass('primary')}>
            <ListChecks aria-hidden className="size-4" />
            {t('help:menu.tourLibrary')}
          </Link>
        </Panel>
        <Panel title={t('help:shortcuts.title')}>
          <ShortcutList />
        </Panel>
      </div>
    </>
  );
}
