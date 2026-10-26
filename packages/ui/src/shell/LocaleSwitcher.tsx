import { LOCALE_META, SUPPORTED_LOCALES, useLocale, type AppLocale } from '@repo/i18n';
import { Languages } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

export function useLanguageAnnouncement() {
  const { locale } = useLocale();
  const announce = useAnnounce();
  const { t } = useT();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announce(t('a11y:language.changed', { language: LOCALE_META[locale].nativeName }));
  }, [locale, announce, t]);
}

/**
 * One-tap EN ⇄ اردو toggle. The visible label is the other language written in its own script,
 * so speakers can find it whatever the current language is. Switching does not reload or remount.
 */
export function LocaleToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useT();
  const { locale, setLocale } = useLocale();
  const other: AppLocale = SUPPORTED_LOCALES.find((l) => l !== locale) ?? locale;
  const meta = LOCALE_META[other];
  return (
    <AriaButton
      onPress={() => setLocale(other)}
      aria-label={t('nav:header.switchLanguageTo', { language: meta.nativeName })}
      data-testid="locale-toggle"
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-pill border border-border-control px-3.5 text-sm font-medium text-text outline-none transition-colors duration-[var(--motion-fast)] data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11',
        className,
      )}
    >
      <Languages aria-hidden className="size-4 text-muted" />
      {!compact && (
        <span lang={other} dir={other === 'ur-PK' ? 'rtl' : 'ltr'} className={other === 'ur-PK' ? 'font-[family-name:var(--font-urdu)]' : ''}>
          {meta.nativeName}
        </span>
      )}
    </AriaButton>
  );
}
