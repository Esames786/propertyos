import type { Money as MoneyValue } from '@repo/contracts';
import { formatMoney, useLocale } from '@repo/i18n';
import { cn } from '../lib/cn';

/** Formatted money, always 2 decimals, LTR-isolated; the amount never changes with locale. */
export function Money({
  value,
  className,
  display = 'symbol',
}: {
  value: MoneyValue;
  className?: string;
  display?: 'symbol' | 'code';
}) {
  const { locale } = useLocale();
  return (
    <bdi dir="ltr" className={cn('ltr-ref whitespace-nowrap', className)} data-amount={value.amount}>
      {formatMoney(value, locale, { currencyDisplay: display })}
    </bdi>
  );
}
