import type { InstalmentItem, InstalmentStatus, PaymentMethod, PortalReceipt, ProjectMilestone } from '@repo/contracts';
import {
  formatArea,
  formatCalendarDate,
  formatInstant,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  useLocale,
} from '@repo/i18n';
import { Badge, cn, DirectionalIcon, Link, RecordCard, Skeleton, useT, type StatusTone } from '@repo/ui';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  FileQuestion,
  Hourglass,
  Landmark,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { PORTAL } from '../../nav.config';

export { PORTAL };

type T = ReturnType<typeof useT>['t'];

/** Formatting bound to the active locale and to the data's own clock (`asOf`), so fixtures stay deterministic. */
export function usePortalFormat(asOf: string) {
  const { locale } = useLocale();
  return useMemo(() => {
    const today = asOf.slice(0, 10);
    const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      locale,
      today,
      money: (amount: string) => formatMoney({ amount, currency: 'PKR' }, locale),
      compact: (amount: string, digits = 2) => formatMoneyCompact({ amount, currency: 'PKR' }, locale, digits),
      date: (calendarDate: string) => formatCalendarDate(calendarDate, locale),
      instant: (iso: string) => formatInstant(iso, locale, 'date'),
      instantTime: (iso: string) => formatInstant(iso, locale, 'dateTime'),
      monthYear: (calendarDate: string) => monthYear.format(new Date(`${calendarDate}T00:00:00Z`)),
      percent: (ratio: number, digits = 0) => formatPercent(ratio, locale, digits),
      count: (n: number) => formatNumber(n, locale),
      area: (sqft: number) => formatArea(sqft, locale),
      /** Whole days from the data clock to a calendar date (negative when past). */
      daysUntil: (calendarDate: string) => Math.round((Date.parse(`${calendarDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    };
  }, [locale, asOf]);
}

export type PortalFormat = ReturnType<typeof usePortalFormat>;

/** Latin money inside any language: bidi-isolated and left-to-right. */
export function Amount({ value, className }: { value: string; className?: string }) {
  const { locale } = useLocale();
  return (
    <bdi dir="ltr" className={cn('ltr-ref whitespace-nowrap tabular', className)} data-amount={value}>
      {formatMoney({ amount: value, currency: 'PKR' }, locale)}
    </bdi>
  );
}

export const STATUS_TONE: Record<InstalmentStatus, StatusTone> = {
  paid: 'success',
  due: 'warning',
  overdue: 'error',
  awaiting_verification: 'info',
  needs_information: 'warning',
  upcoming: 'neutral',
};

const STATUS_ICON: Record<InstalmentStatus, LucideIcon> = {
  paid: CheckCircle2,
  due: Clock3,
  overdue: CircleAlert,
  awaiting_verification: Hourglass,
  needs_information: FileQuestion,
  upcoming: CalendarClock,
};

/** Colour of the record's key amount; always next to a status label (never colour alone). */
export const AMOUNT_TONE: Record<InstalmentStatus, string> = {
  paid: 'text-success',
  due: 'text-warning',
  overdue: 'text-error',
  awaiting_verification: 'text-info',
  needs_information: 'text-warning',
  upcoming: 'text-text',
};

const ACCENT: Record<InstalmentStatus, 'success' | 'error' | 'warning' | 'info' | undefined> = {
  paid: 'success',
  due: 'warning',
  overdue: 'error',
  awaiting_verification: 'info',
  needs_information: 'warning',
  upcoming: undefined,
};

export const METHOD_ICON: Record<PaymentMethod, LucideIcon> = {
  bank_transfer: Landmark,
  cheque: ScrollText,
  cash_deposit: Banknote,
  online_simulated: CreditCard,
};

export function InstalmentStatusChip({ status, className }: { status: InstalmentStatus; className?: string }) {
  const { t } = useT();
  return (
    <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} className={className}>
      {t(`portal:status.${status}`)}
    </Badge>
  );
}

export function MethodChip({ method }: { method: PaymentMethod }) {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={METHOD_ICON[method]}>
      {t(`portal:method.${method}`)}
    </Badge>
  );
}

/** "Down payment" or "Instalment 16 of 36". */
export function instalmentLabel(t: T, item: Pick<InstalmentItem, 'kind' | 'number' | 'of'>) {
  return item.kind === 'down_payment' ? t('portal:instalment.downPayment') : t('portal:instalment.numberOf', { number: item.number, total: item.of });
}

/** Due-date phrase relative to the data clock. */
export function dueText(t: T, fmt: PortalFormat, dueDate: string) {
  const days = fmt.daysUntil(dueDate);
  if (days === 0) return t('portal:instalment.dueToday');
  if (days < 0) return t('portal:instalment.overdueBy', { count: -days });
  return t('portal:instalment.dueIn', { count: days });
}

/** Payment-schedule card (Nizam-style bill): coloured inline-start edge, big amount, chips, an action footer. */
export function InstalmentCard({ item, fmt, headingLevel = 3 }: { item: InstalmentItem; fmt: PortalFormat; headingLevel?: 2 | 3 }) {
  const { t } = useT();
  const payHref = `${PORTAL.pay}?record=${item.id}`;
  const footer = (() => {
    switch (item.status) {
      case 'paid':
        return (
          <FooterRow tone="success" icon={Check} text={t('portal:instalment.paymentReceived')} action={item.receiptId ? { label: t('portal:instalment.viewReceipt'), href: `${PORTAL.receipt}?record=${item.receiptId}` } : undefined} />
        );
      case 'awaiting_verification':
        return (
          <FooterRow
            tone="info"
            icon={Hourglass}
            text={t(item.proof?.simulated ? 'portal:instalment.simulatedSent' : 'portal:instalment.proofSent', { date: item.proof ? fmt.instant(item.proof.submittedAt) : '' })}
          />
        );
      case 'needs_information':
        return <FooterRow tone="warning" icon={FileQuestion} text={t('portal:payments.financeNote.label')} action={{ label: t('portal:instalment.uploadAgain'), href: `${payHref}&mode=upload` }} />;
      case 'upcoming':
        return <FooterRow tone="neutral" icon={CalendarClock} text={t('portal:instalment.notDueYet')} action={{ label: t('portal:instalment.payOrUpload'), href: payHref }} />;
      default:
        return <FooterRow tone={item.status === 'overdue' ? 'error' : 'warning'} icon={Clock3} text={dueText(t, fmt, item.dueDate)} action={{ label: t('portal:instalment.payOrUpload'), href: payHref }} />;
    }
  })();
  return (
    <RecordCard
      testId={`instalment-${item.id}`}
      accent={ACCENT[item.status]}
      highlight={item.changedInSession}
      headingLevel={headingLevel}
      eyebrow={instalmentLabel(t, item)}
      title={item.kind === 'down_payment' ? fmt.date(item.dueDate) : fmt.monthYear(item.dueDate)}
      chips={
        <>
          <InstalmentStatusChip status={item.status} />
          {item.status === 'paid' && item.method && <MethodChip method={item.method} />}
          {item.status === 'awaiting_verification' && item.proof && <MethodChip method={item.proof.method} />}
        </>
      }
      actions={
        <span className="text-end">
          <span className={cn('block text-xl leading-tight font-bold tracking-tight sm:text-2xl', AMOUNT_TONE[item.status])}>
            <Amount value={item.amount.amount} />
          </span>
          <span className="mt-0.5 block text-xs text-muted">{t('portal:instalment.dueOn', { date: fmt.date(item.dueDate) })}</span>
        </span>
      }
      footer={footer}
    >
      {item.status === 'needs_information' && item.financeNoteKey ? <p className="text-sm text-text">{t(item.financeNoteKey as 'portal:payments.financeNote.unclear')}</p> : undefined}
    </RecordCard>
  );
}

const FOOTER_TONE = {
  success: 'bg-success-soft text-success',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  error: 'bg-error-soft text-error',
  neutral: 'bg-sunken/60 text-muted',
} as const;

function FooterRow({ tone, icon: Icon, text, action }: { tone: keyof typeof FOOTER_TONE; icon: LucideIcon; text: string; action?: { label: string; href: string } }) {
  return (
    <div className={cn('-mx-4 -my-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-1.5 text-sm font-medium sm:-mx-5 sm:px-5', FOOTER_TONE[tone])}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon aria-hidden className="size-4 shrink-0" />
        <span>{text}</span>
      </span>
      {action && (
        <Link href={action.href} variant="plain" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary data-hovered:underline pointer-coarse:min-h-11">
          {action.label}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Verified payment with its receipt link (home and payments). */
export function ReceiptCard({ receipt, fmt, headingLevel = 3 }: { receipt: PortalReceipt; fmt: PortalFormat; headingLevel?: 2 | 3 }) {
  const { t } = useT();
  return (
    <RecordCard
      testId={`receipt-${receipt.id}`}
      accent="success"
      headingLevel={headingLevel}
      eyebrow={instalmentLabel(t, { kind: receipt.kind, number: receipt.instalmentNumber, of: receipt.of })}
      title={receipt.kind === 'down_payment' ? fmt.date(receipt.period) : fmt.monthYear(receipt.period)}
      chips={
        <>
          <InstalmentStatusChip status="paid" />
          <MethodChip method={receipt.method} />
        </>
      }
      actions={
        <span className="text-end">
          <span className="block text-xl leading-tight font-bold tracking-tight text-success sm:text-2xl">
            <Amount value={receipt.amount.amount} />
          </span>
          <span className="mt-0.5 block text-xs text-muted">{fmt.date(receipt.paidOn)}</span>
        </span>
      }
      footer={<FooterRow tone="success" icon={Check} text={t('portal:instalment.paymentReceived')} action={{ label: t('portal:instalment.viewReceipt'), href: `${PORTAL.receipt}?record=${receipt.id}` }} />}
    />
  );
}

/** Milestones as a compact list: name, state in words, a bar (the words carry the meaning). */
export function MilestoneList({ milestones, fmt, dense = false }: { milestones: ProjectMilestone[]; fmt: PortalFormat; dense?: boolean }) {
  const { t } = useT();
  return (
    <ol className={cn('grid gap-3', !dense && 'sm:grid-cols-2')}>
      {milestones.map((m) => {
        const state = m.progress >= 1 ? 'done' : m.progress > 0 ? 'active' : 'upcoming';
        return (
          <li key={m.key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-text">
                {state === 'done' ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" /> : <span aria-hidden className={cn('size-2.5 shrink-0 rounded-pill', state === 'active' ? 'bg-primary' : 'bg-border-control')} />}
                <span className="truncate">{t(`portal:construction.milestone.${m.key}`)}</span>
              </span>
              <span className={cn('shrink-0 text-xs', state === 'done' ? 'text-success' : 'text-muted')}>
                {state === 'active' ? t('portal:construction.milestoneState.active', { percent: fmt.percent(m.progress) }) : t(`portal:construction.milestoneState.${state}`)}
              </span>
            </div>
            <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-primary-soft">
              <div className={cn('h-full rounded-pill', state === 'done' ? 'bg-success' : 'bg-primary')} style={{ width: `${Math.round(m.progress * 100)}%` }} />
            </div>
            {!dense && <p className="mt-1 text-xs text-muted">{t('portal:construction.target', { date: fmt.date(m.date) })}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal progress bar with its value stated in text next to it (role="progressbar" for AT). */
export function ProgressBar({ value, label, className, tone = 'success' }: { value: number; label: string; className?: string; tone?: 'success' | 'primary' | 'inverse' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2 overflow-hidden rounded-pill', tone === 'inverse' ? 'bg-inverse/25' : 'bg-sunken', className)}
    >
      <div className={cn('h-full rounded-pill', tone === 'success' ? 'bg-success' : tone === 'primary' ? 'bg-primary' : 'bg-inverse')} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Loading placeholder with an off-screen heading so the page still has an h1 and a busy status. */
export function PortalSkeleton({ title, variant = 'list' }: { title: string; variant?: 'home' | 'list' }) {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true" className="space-y-6" data-testid="skeleton">
      <span className="sr-only">{t('common:state.loading')}</span>
      <h1 className="sr-only">{title}</h1>
      {variant === 'home' ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Skeleton className="h-60 rounded-card lg:col-span-7" />
            <Skeleton className="h-60 rounded-card lg:col-span-5" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
        </>
      ) : (
        <>
          <Skeleton className="h-9 w-64 max-w-full" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </>
      )}
    </div>
  );
}

/** Section wrapper: a real h2 heading with optional link, tour anchor and test id. */
export function Section({
  id,
  title,
  action,
  tourId,
  testId,
  className,
  children,
}: {
  id: string;
  title: string;
  action?: { label: string; href: string };
  tourId?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-tour-id={tourId} data-testid={testId} className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id={id} className="text-lg font-bold tracking-tight text-text sm:text-xl">
          {title}
        </h2>
        {action && (
          <Link href={action.href} variant="plain" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary data-hovered:underline">
            {action.label}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
