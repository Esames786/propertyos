import { ApiError, type BillingAccountDetail, type InvoiceList } from '@repo/contracts';
import { Breadcrumbs, ErrorState, Link, Money, NotFoundState, Panel, SegmentedControl, UrlTabs, useApiQuery, useQueryParam, useSession, useT } from '@repo/ui';
import { ACCESS_DATE, SOCIETY } from '../../../nav.config';
import { FactList, Loading, SettlementBadge, useSocietyFormat } from '../kit';
import { StatementView } from '../parts';

/**
 * BILL-002 billing account workspace: the flats the account covers and, per flat, who is liable
 * and since when (A2 §4.5); its invoices; and its statement, for the whole account or only the
 * lines one payer is liable for.
 */
export default function AccountWorkspace({ accountId }: { accountId: string }) {
  const { t } = useT();
  const q = useApiQuery<BillingAccountDetail>({ method: 'GET', path: `/billing-accounts/${accountId}` });
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)) {
    return (
      <div>
        <h1 id="page-title" className="sr-only">{t('billing:account.notFound')}</h1>
        <NotFoundState />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  return <Workspace data={q.data} />;
}

function Workspace({ data }: { data: BillingAccountDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [period, setPeriod] = useQueryParam('period');
  const [payer, setPayer] = useQueryParam('payer');
  const payers = [...new Map(data.payers.map((p) => [p.partyId, p])).values()];
  const tabs = [
    { id: 'overview', label: t('billing:account.tabs.overview') },
    { id: 'invoices', label: t('billing:account.tabs.invoices') },
    { id: 'statement', label: t('billing:account.tabs.statement') },
  ];
  return (
    <div className="@container space-y-6" data-testid="account-workspace" data-account={data.accountNo}>
      <Breadcrumbs items={[{ label: t('nav:items.billing'), href: SOCIETY.runs }, { label: t('nav:pages.accounts'), href: SOCIETY.accounts() }]} />
      <header className="space-y-3">
        <p className="text-sm text-muted">{t('billing:account.kind')} · <bdi>{data.legalEntityName}</bdi></p>
        <h1 id="page-title" className="text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-figure">
          <bdi dir="ltr">{data.accountNo}</bdi>
        </h1>
        <p className="text-sm text-text">{t('billing:account.holder', { name: data.holderName })}</p>
        <dl className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
          <Metric label={t('billing:account.balance')} value={<Money value={data.balance} />} />
          <Metric label={t('billing:account.overdue')} value={<Money value={data.overdue} />} />
          <Metric label={t('billing:account.openInvoices')} value={fmt.count(data.openInvoices)} />
          <Metric label={t('billing:account.flats')} value={data.flats.map((f) => f.code).join(', ')} />
        </dl>
      </header>
      <UrlTabs label={t('billing:account.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'invoices' ? (
            <AccountInvoices accountId={data.id} />
          ) : tab === 'statement' ? (
            <Panel>
              {payers.length > 1 && (
                <div className="mb-4">
                  <SegmentedControl
                    label={t('billing:account.statementFor')}
                    value={payer ?? 'all'}
                    onChange={(v) => setPayer(v === 'all' ? null : v)}
                    testId="account-statement-payer"
                    options={[{ id: 'all', label: t('billing:account.wholeAccount') }, ...payers.map((p) => ({ id: p.partyId, label: p.name }))]}
                  />
                </div>
              )}
              <StatementView accountId={data.id} payer={payer ?? undefined} period={period ?? '2026-11'} onPeriod={(p) => setPeriod(p === '2026-11' ? null : p)} />
            </Panel>
          ) : (
            <div className="grid gap-5 @4xl:grid-cols-2">
              {data.liabilities.map((l) => (
                <Panel key={l.flatId} title={t('sites:flat.flatN', { code: l.flatCode })} description={t('billing:account.liableHint')} actions={<Link href={SOCIETY.flat(data.siteId, l.flatId, 'payer')} className="inline-flex min-h-10 items-center text-sm">{can('site.manage') ? t('sites:flat.changePayer') : t('sites:person.openFlat')}</Link>}>
                  <FactList facts={l.facts} today={ACCESS_DATE} emptyText={t('sites:flat.noPayer')} testId={`account-liability-${l.flatCode}`} />
                </Panel>
              ))}
            </div>
          )
        }
      </UrlTabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-tile bg-sunken/60 px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

function AccountInvoices({ accountId }: { accountId: string }) {
  const { t } = useT();
  const q = useApiQuery<InvoiceList>({ method: 'GET', path: '/billing/invoices', query: { account: accountId } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  return (
    <Panel title={t('billing:account.tabs.invoices')}>
      {q.data.items.length === 0 ? (
        <p className="text-sm text-muted">{t('sites:flat.noInvoices')}</p>
      ) : (
        <ul className="divide-y divide-border" data-testid="account-invoices">
          {q.data.items.map((i) => (
            <li key={i.id}>
              <Link href={SOCIETY.invoice(i.id)} variant="plain" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control px-2 py-2.5 hover:bg-raised">
                <span className="min-w-0 flex-1">
                  <bdi dir="ltr" className="ltr-ref block font-semibold text-text">{i.ref}</bdi>
                  <span className="block text-xs text-muted">{t(`billing:source.${i.source}`)} · <bdi dir="ltr" className="ltr-ref">{i.flats.join(', ')}</bdi> · {t('sites:flat.payerOf', { name: i.payerName })}</span>
                </span>
                <SettlementBadge invoice={i} />
                <Money value={i.total} className="font-semibold" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
