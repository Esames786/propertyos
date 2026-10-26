import { LocaleToggle, NavigationProvider, useT } from '@repo/ui';
import { useCallback, useEffect } from 'react';
import { useHref, useLocation, useNavigate } from 'react-router';
import { RegisterResolver } from './register';

/**
 * Minimal frame for register routes outside the backoffice shell (SaaS HQ, staff authentication).
 * Their screens are built in Stage 2 with their own shells.
 */
export function StandaloneLayout() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  useEffect(() => {
    document.title = t('common:app.pageTitle', { page: t('nav:pages.planned'), app: t('common:app.backoffice') });
  }, [t]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <div className="min-h-dvh bg-bg">
        <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3">
          <span className="text-sm font-semibold text-text">{t('common:app.productName')}</span>
          <LocaleToggle />
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 outline-none">
          <RegisterResolver />
        </main>
      </div>
    </NavigationProvider>
  );
}
