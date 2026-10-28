import type { InstalmentItem, InstalmentStatus, PortalPayments } from '@repo/contracts';
import {
  buttonClass,
  ErrorState,
  FilterPills,
  IconButton,
  InlineAlert,
  Link,
  PageHeader,
  Panel,
  RevealItem,
  Stagger,
  useAnnounce,
  useApiQuery,
  useQueryParam,
  useT,
  useToast,
  type FilterPill,
} from '@repo/ui';
import { Building2, CheckCircle2, Copy, Hash, Hourglass, Landmark, Wallet } from 'lucide-react';
import { Amount, InstalmentCard, instalmentLabel, PORTAL, PortalSkeleton, ProgressBar, Section, usePortalFormat } from './shared';

type FilterId = 'open' | 'awaiting' | 'upcoming' | 'paid' | 'all';
const FILTERS: Record<FilterId, readonly InstalmentStatus[] | null> = {
  open: ['due', 'overdue', 'needs_information'],
  awaiting: ['awaiting_verification'],
  upcoming: ['upcoming'],
  paid: ['paid'],
  all: null,
};
const isFilter = (v: string | null): v is FilterId => v !== null && v in FILTERS;

/**
 * PORTAL-004 payments dashboard: plan summary, the instalment schedule as colour-edged cards
 * (filter in the URL, `?status=`), bank details for transfers and verified receipts.
 * Uploaded proof shows "Awaiting verification" here; only Finance verification makes it Paid.
 */
export default function PaymentsPage() {
  const { t } = useT();
  const query = useApiQuery<PortalPayments>({ method: 'GET', path: '/portal/payments' });
  if (query.isPending) return <PortalSkeleton title={t('portal:payments.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:payments.title')} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <PaymentsView data={query.data} />;
}

function PaymentsView({ data }: { data: PortalPayments }) {
  const { t } = useT();
  const fmt = usePortalFormat(data.asOf);
  const [statusParam, setStatus] = useQueryParam('status');
  const filter: FilterId = isFilter(statusParam) ? statusParam : 'open';
  const { plan, schedule, property } = data;
  const count = (id: FilterId) => (FILTERS[id] ? schedule.filter((i) => FILTERS[id]!.includes(i.status)).length : schedule.length);
  const pills: FilterPill<FilterId>[] = (Object.keys(FILTERS) as FilterId[]).map((id) => ({ id, label: t(`portal:payments.filters.${id}`), count: count(id) }));
  const visible: InstalmentItem[] = FILTERS[filter] ? schedule.filter((i) => FILTERS[filter]!.includes(i.status)) : schedule;
  // Paid lists read newest first (like a statement); everything else in plan order.
  const ordered = filter === 'paid' ? [...visible].reverse() : visible;
  const down = schedule.find((i) => i.kind === 'down_payment');

  return (
    <div className="space-y-8" data-testid="portal-payments">
      <PageHeader
        title={t('portal:payments.title')}
        description={t('portal:payments.description', {
          unit: property.unitRef,
          count: plan.instalmentCount,
          percent: down ? fmt.percent(Number(down.amount.amount) / Number(property.price.amount)) : '',
        })}
        actions={
          <Link href={PORTAL.pay} variant="plain" className={buttonClass('primary', 'md')} data-testid="payments-pay">
            <Wallet aria-hidden className="size-4" />
            {t('portal:nav.payLong')}
          </Link>
        }
      />

      <section aria-labelledby="plan-summary-title" className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-6" data-testid="plan-summary">
        <h2 id="plan-summary-title" className="sr-only">
          {t('portal:payments.summary.title')}
        </h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 xs:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-sm text-muted">{t('portal:payments.summary.total')}</dt>
            <dd className="mt-0.5 text-lg font-bold text-text sm:text-xl">
              <Amount value={plan.totalPrice.amount} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-sm text-muted">
              <CheckCircle2 aria-hidden className="size-4 text-success" />
              {t('portal:payments.summary.paid')}
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-success sm:text-xl" data-testid="summary-paid">
              <Amount value={plan.paidToDate.amount} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted">{t('portal:payments.summary.outstanding')}</dt>
            <dd className="mt-0.5 text-lg font-bold text-text sm:text-xl">
              <Amount value={plan.outstanding.amount} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 text-sm text-muted">
              <Hourglass aria-hidden className="size-4 text-info" />
              {t('portal:payments.summary.awaiting')}
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-info sm:text-xl" data-testid="summary-awaiting">
              <Amount value={plan.awaitingVerification.amount} />
            </dd>
          </div>
        </dl>
        <ProgressBar value={plan.paidShare} label={t('portal:payments.summary.progressLabel')} className="mt-5" />
        <p className="mt-2 text-sm text-muted">
          {t('portal:payments.summary.progress', { percent: fmt.percent(plan.paidShare), paid: fmt.count(plan.paidCount), total: fmt.count(plan.instalmentCount) })}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-6">
        <Section id="schedule-title" title={t('portal:payments.schedule.title')} className="lg:col-span-8" testId="payments-schedule">
          <FilterPills label={t('portal:payments.filters.label')} options={pills} value={filter} onChange={(v) => setStatus(v === 'open' ? null : v)} testId="payments-filter" className="mb-4" />
          {ordered.length ? (
            <Stagger as="ul" key={filter} className="space-y-3">
              {/* Only the first cards stagger in; a long schedule should not keep the last cards waiting. */}
              {ordered.map((item, i) =>
                i < 6 ? (
                  <RevealItem as="li" key={item.id}>
                    <InstalmentCard item={item} fmt={fmt} />
                  </RevealItem>
                ) : (
                  <li key={item.id}>
                    <InstalmentCard item={item} fmt={fmt} />
                  </li>
                ),
              )}
            </Stagger>
          ) : (
            <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted" data-testid="schedule-empty">
              {filter === 'awaiting' ? t('portal:payments.schedule.emptyAwaiting') : t('portal:payments.schedule.empty')}
            </p>
          )}
        </Section>

        <div className="space-y-6 lg:col-span-4">
          <BankDetails account={data.collectionAccount} />
          <Section id="receipts-title" title={t('portal:payments.receipts.title')} testId="payments-receipts">
            <p className="-mt-2 mb-3 text-sm text-muted">{t('portal:payments.receipts.count', { count: data.receipts.length })}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border/70 bg-panel shadow-card">
              {data.receipts.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`${PORTAL.receipt}?record=${r.id}`}
                    variant="plain"
                    data-testid={`receipt-row-${r.id}`}
                    className="flex min-h-14 items-center gap-3 border-s-4 border-s-success px-3.5 py-2.5 outline-none transition-colors duration-[var(--motion-fast)] data-hovered:bg-success-soft/60 data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus"
                  >
                    <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{r.kind === 'down_payment' ? fmt.date(r.period) : fmt.monthYear(r.period)}</span>
                      <span className="block truncate text-xs text-muted">
                        {instalmentLabel(t, { kind: r.kind, number: r.instalmentNumber, of: r.of })} · {t('portal:status.paid')}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-sm font-bold text-success">
                        <Amount value={r.amount.amount} />
                      </span>
                      <span className="block text-xs font-medium text-primary">{t('portal:instalment.viewReceipt')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.receipts.length > 6 && filter !== 'paid' && (
              <Link href={`${PORTAL.payments}?status=paid`} variant="plain" className={buttonClass('secondary', 'md', 'mt-3 w-full')}>
                {t('portal:home.receipts.viewAll')}
              </Link>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Fictional collection account (DEMO_COLLECTION_ACCOUNT) with a working copy button. */
export function BankDetails({ account, compact = false }: { account: PortalPayments['collectionAccount']; compact?: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.iban.replace(/\s/g, ''));
      toast.success(t('portal:payments.bank.copied'));
      announce(t('portal:payments.bank.copied'));
    } catch {
      toast.error(t('portal:payments.bank.copyFailed'));
    }
  };
  return (
    <Panel title={t('portal:payments.bank.title')} headingLevel={compact ? 3 : 2} className="p-4 sm:p-5">
      <InlineAlert tone="warning" className="mb-4">{t('portal:payments.bank.fictional')}</InlineAlert>
      {/* Each group is a div holding exactly one dt and one dd; the icon sits inside the dt. */}
      <dl className="space-y-3 text-sm" data-testid="bank-details">
        <div className="relative min-w-0 ps-7">
          <dt className="text-muted">
            <Landmark aria-hidden className="absolute start-0 top-0.5 size-4 text-muted" />
            {t('portal:payments.bank.bankName')}
          </dt>
          <dd className="font-semibold text-text">
            <bdi>{account.bankName}</bdi>
          </dd>
        </div>
        <div className="relative min-w-0 ps-7">
          <dt className="text-muted">
            <Building2 aria-hidden className="absolute start-0 top-0.5 size-4 text-muted" />
            {t('portal:payments.bank.accountTitle')}
          </dt>
          <dd className="font-semibold text-text">
            <bdi>{account.accountTitle}</bdi>
          </dd>
        </div>
        <div className="relative min-w-0 ps-7">
          <dt className="text-muted">
            <Hash aria-hidden className="absolute start-0 top-0.5 size-4 text-muted" />
            {t('portal:payments.bank.iban')}
          </dt>
          <dd className="flex items-center justify-between gap-2">
            <bdi dir="ltr" className="ltr-ref font-mono text-small font-semibold tracking-wide break-all text-text" data-testid="bank-iban">
              {account.iban}
            </bdi>
            <IconButton label={t('portal:payments.bank.copy')} icon={Copy} onPress={() => void copy()} className="-my-1" />
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
