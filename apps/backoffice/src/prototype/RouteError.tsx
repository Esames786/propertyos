import { useT } from '@repo/ui';
import { CircleAlert } from 'lucide-react';

/** Route-level error boundary: the rest of the app keeps working; offers reload and a way out. */
export function RouteError() {
  const { t } = useT();
  return (
    <main id="main-content" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
      <div className="space-y-4 text-center">
        <CircleAlert aria-hidden className="mx-auto size-10 text-error" />
        <h1 className="text-xl font-semibold text-text">{t('errors:states.boundaryTitle')}</h1>
        <p className="text-muted">{t('errors:states.boundaryBody')}</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => location.reload()} className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary">
            {t('common:actions.retry')}
          </button>
          <a href="/backoffice/lab" className="rounded-control border border-border-control px-4 py-2 text-sm">
            {t('common:actions.goToStart')}
          </a>
        </div>
      </div>
    </main>
  );
}
