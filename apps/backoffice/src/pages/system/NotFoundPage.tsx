import { buttonClass, Link, NotFoundState, useT } from '@repo/ui';

export function NotFoundPage() {
  const { t } = useT();
  return (
    <NotFoundState
      headingLevel={1}
      actions={
        <Link variant="plain" href="/backoffice/lab" className={buttonClass('primary')}>
          {t('common:actions.goToStart')}
        </Link>
      }
    />
  );
}
