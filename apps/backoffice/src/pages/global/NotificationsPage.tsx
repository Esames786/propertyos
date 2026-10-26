import { NotificationList, PageHeader, Panel, useT } from '@repo/ui';

/** GLOBAL-004 as a full page (the header panel shows the same list). */
export default function NotificationsPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('common:notifications.panelTitle')} />
      <Panel className="max-w-3xl p-0 sm:p-0">
        <NotificationList />
      </Panel>
    </>
  );
}
