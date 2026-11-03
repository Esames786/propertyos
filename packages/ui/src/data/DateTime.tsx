import { formatCalendarDate, formatInstant, formatRelative, useLocale, type InstantStyle } from '@repo/i18n';

/** An instant or calendar date in the active locale; relative times keep the absolute value in a title. */
export function DateTime({
  value,
  style = 'date',
  relative = false,
  className,
}: {
  value: string;
  style?: InstantStyle | 'calendar';
  relative?: boolean;
  className?: string;
}) {
  const { locale } = useLocale();
  if (style === 'calendar') {
    return (
      <time dateTime={value} className={className}>
        <bdi dir="auto">{formatCalendarDate(value, locale)}</bdi>
      </time>
    );
  }
  const absolute = formatInstant(value, locale, style === 'date' && relative ? 'dateTime' : style);
  return (
    <time dateTime={value} title={relative ? absolute : undefined} className={className}>
      <bdi dir="auto">{relative ? formatRelative(value, locale) : absolute}</bdi>
    </time>
  );
}
