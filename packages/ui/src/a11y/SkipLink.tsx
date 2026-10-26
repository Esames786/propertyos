import { useT } from '../lib/useT';

export const MAIN_CONTENT_ID = 'main-content';

/** First focusable element on every page; visible when focused. */
export function SkipLink() {
  const { t } = useT();
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById(MAIN_CONTENT_ID);
        main?.focus();
        main?.scrollIntoView();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-control focus:bg-text focus:px-4 focus:py-3 focus:text-inverse focus:shadow-overlay"
    >
      {t('nav:skipToContent')}
    </a>
  );
}
