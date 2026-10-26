import { buttonClass, Link, NotFoundState, useT } from '@repo/ui';

export function NotFoundPage() {
  const { t } = useT();
  return (
    <NotFoundState
      headingLevel={1}
      actions={
        <Link variant="plain" href="/backoffice/home/role-aware-dashboard" className={buttonClass('primary')}>
          {t('common:actions.goToStart')}
        </Link>
      }
    />
  );
}
