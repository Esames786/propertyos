import { ApiError, type ReceiptDetail } from '@repo/contracts';
import { Button, buttonClass, EmptyState, ErrorState, Link, PageHeader, useApiQuery, useQueryParam, useSession, useT } from '@repo/ui';
import { BadgeCheck, Printer, ReceiptText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Amount, InstalmentStatusChip, instalmentLabel, MethodChip, PORTAL, PortalSkeleton, usePortalFormat } from './shared';

/**
 * PORTAL-010 receipt (`?record=<receipt id>`). Receipts exist only for payments Finance verified;
 * an uploaded proof never produces one. Printed or saved as PDF through the browser.
 */
export default function ReceiptPage() {
  const { t } = useT();
  const [record] = useQueryParam('record');
  const query = useApiQuery<ReceiptDetail>(record ? { method: 'GET', path: `/portal/receipts/${record}` } : null);
  const crumbs = [{ label: t('portal:pages.payments'), href: PORTAL.payments }, { label: t('portal:receipt.title') }];
  const back = (
    <Link href={`${PORTAL.payments}?status=paid`} variant="plain" className={buttonClass('primary', 'md')}>
      {t('portal:receipt.back')}
    </Link>
  );
  const missing = !record || (query.isError && query.error instanceof ApiError && query.error.problem.status === 404);
  if (missing)
    return (
      <>
        <PageHeader title={t('portal:receipt.missingTitle')} breadcrumbs={crumbs} />
        <EmptyState title={t('portal:receipt.missingTitle')} body={t('portal:receipt.missingBody')} actions={back} />
      </>
    );
  if (query.isPending) return <PortalSkeleton title={t('portal:receipt.title')} />;
  if (query.isError)
    return (
      <>
        <PageHeader title={t('portal:receipt.title')} breadcrumbs={crumbs} />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  return <ReceiptView receipt={query.data} crumbs={crumbs} />;
}

function ReceiptView({ receipt, crumbs }: { receipt: ReceiptDetail; crumbs: Array<{ label: string; href?: string }> }) {
  const { t } = useT();
  const { tenant } = useSession();
  const fmt = usePortalFormat(receipt.verifiedAt);
  const rows: Array<[string, ReactNode]> = [
    [t('portal:receipt.fields.receiptNo'), <bdi dir="ltr" className="ltr-ref font-semibold">{receipt.ref}</bdi>],
    [t('portal:receipt.fields.instalment'), `${instalmentLabel(t, { kind: receipt.kind, number: receipt.instalmentNumber, of: receipt.of })} · ${fmt.monthYear(receipt.period)}`],
    [t('portal:receipt.fields.unit'), <bdi dir="ltr" className="ltr-ref">{receipt.property.unitRef}</bdi>],
    [t('portal:receipt.fields.project'), <bdi>{receipt.property.projectName}</bdi>],
    [t('portal:receipt.fields.receivedFrom'), <bdi>{receipt.owner.displayName}</bdi>],
    [t('portal:receipt.fields.customerRef'), <bdi dir="ltr" className="ltr-ref">{receipt.owner.customerRef}</bdi>],
    [t('portal:receipt.fields.paidOn'), fmt.date(receipt.paidOn)],
    [t('portal:receipt.fields.method'), <MethodChip method={receipt.method} />],
    [t('portal:receipt.fields.bankReference'), <bdi dir="ltr" className="ltr-ref font-mono text-[0.8125rem]">{receipt.bankReference}</bdi>],
    [t('portal:receipt.fields.verifiedOn'), fmt.instantTime(receipt.verifiedAt)],
    [t('portal:receipt.fields.verifiedBy'), <bdi>{receipt.verifiedBy}</bdi>],
  ];
  return (
    <div data-testid="portal-receipt">
      <PageHeader
        title={t('portal:receipt.title')}
        breadcrumbs={crumbs}
        actions={
          <Button variant="secondary" icon={Printer} onPress={() => window.print()} data-testid="receipt-print">
            {t('portal:receipt.print')}
          </Button>
        }
      />
      <article aria-labelledby="receipt-heading" className="relative mx-auto max-w-2xl overflow-hidden rounded-card border border-border/70 bg-panel shadow-raised motion-safe:animate-rise-in">
        <div aria-hidden className="h-2 bg-[linear-gradient(90deg,#1e4d42,#2a6a5a_60%,#b58a47)]" />
        <div className="p-5 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border pb-5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-11 place-items-center rounded-[12px] bg-primary font-display text-xl text-on-primary">
                {tenant.name.charAt(0)}
              </span>
              <div>
                <p className="font-display text-lg leading-tight text-text">
                  <bdi>{tenant.name}</bdi>
                </p>
                <h2 id="receipt-heading" className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                  <ReceiptText aria-hidden className="size-4" />
                  {t('portal:receipt.title')}
                </h2>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <InstalmentStatusChip status="paid" />
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <BadgeCheck aria-hidden className="size-4" />
                {t('portal:receipt.verified')}
              </span>
            </div>
          </header>
          <div className="py-6 text-center">
            <p className="text-sm text-muted">{t('portal:receipt.amountReceived')}</p>
            <p className="mt-1 text-[2.25rem] leading-none font-bold tracking-tight text-success sm:text-[2.75rem]" data-testid="receipt-amount">
              <Amount value={receipt.amount.amount} />
            </p>
          </div>
          <dl className="divide-y divide-border rounded-tile border border-border">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 px-4 py-2.5 text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 text-end break-words text-text">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-control bg-demo-soft px-3 py-2 text-center text-xs font-medium text-demo" data-testid="receipt-prototype">
            {t('portal:receipt.prototype')}
          </p>
        </div>
      </article>
      <div className="mt-6 flex justify-center print:hidden">
        <Link href={`${PORTAL.payments}?status=paid`} variant="plain" className={buttonClass('secondary', 'md')}>
          {t('portal:receipt.back')}
        </Link>
      </div>
    </div>
  );
}
