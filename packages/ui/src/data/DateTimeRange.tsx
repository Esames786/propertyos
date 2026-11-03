import { formatInstant, useLocale, type InstantStyle } from '@repo/i18n';
import { cn } from '../lib/cn';

/**
 * A read-only pair of instants, rendered as separate bidi-isolated tokens.
 *
 * In Urdu the beginning of the range belongs on the reading-start (right) side.
 * A single unisolated string like "7:00 AM – 3:00 PM" is reordered by the bidi
 * algorithm even if the *timestamps* themselves are correct.
 *
 * Do not apply dir="auto" to editable input fields: this component contains
 * semantic read-only <time> elements only.
 */
export function DateTimeRange({
  start,
  end,
  style = 'time',
  className,
}: {
  start: string;
  end: string;
  style?: Extract<InstantStyle, 'time' | 'dateTime' | 'date'>;
  className?: string;
}) {
  const { locale } = useLocale();
  const startText = formatInstant(start, locale, style);
  const endText = formatInstant(end, locale, style);
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-baseline gap-x-1 gap-y-0.5', className)}>
      <time dateTime={start}><bdi dir="auto">{startText}</bdi></time>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{locale === 'ur-PK' ? 'تا' : 'to'}</span>
      <time dateTime={end}><bdi dir="auto">{endText}</bdi></time>
    </span>
  );
}
