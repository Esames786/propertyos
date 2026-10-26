import { useEffect, useRef } from 'react';
import { useAnnounce } from './LiveAnnouncer';
import { useT } from '../lib/useT';

/**
 * After client-side navigation: set the document title, move focus to the page heading
 * (so keyboard and screen-reader users start at the new content) and announce the page.
 * Skipped on first load, where the browser already starts at the top of the document.
 */
export function useRouteFocus(pathname: string, pageTitle: string, appName: string) {
  const announce = useAnnounce();
  const { t } = useT();
  const first = useRef(true);
  const lastPath = useRef(pathname);

  useEffect(() => {
    document.title = t('common:app.pageTitle', { page: pageTitle, app: appName });
  }, [pageTitle, appName, t]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const id = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: false });
      }
      announce(t('a11y:announce.pageLoaded', { title: pageTitle }));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, pageTitle, announce, t]);
}
