import { ApiError, type BillingRunAction, type BillingRunDetail, type BillingRunItem, type ChargeCategoryKey, type PostResult, type RunCheck } from '@repo/contracts';
import {
  AmountStrip,
  Badge,
  Breadcrumbs,
  Button,
  cn,
  ConfirmDialog,
  DateTime,
  DirectionalIcon,
  Drawer,
  dynamicT,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  Money,
  NotFoundState,
  Panel,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useT,
  useToast,
} from '@repo/ui';
import { emitTourEvent } from '@repo/ui/onboarding';
import { ArrowRight, Ban, BadgeCheck, CheckCircle2, ChevronRight, CircleAlert, FileStack, Hourglass, ListChecks, ReceiptText, RefreshCw, Search, Send, ShieldCheck, TriangleAlert, Undo2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { Loading, OccupancyBadge, ProblemAlert, RunProgress, RunStateBadge, ScrollRegion, useSocietyFormat } from '../kit';
import { AuditList, ChargesTable } from '../parts';

const CATEGORY_ORDER: ChargeCategoryKey[] = ['maintenance', 'security', 'lift', 'water'];
const ITEM_FILTERS = ['all', 'billed', 'exempt', 'override', 'no_payer'] as const;
type ItemFilter = (typeof ITEM_FILTERS)[number];
const PAGE_SIZE = 20;

/**
 * BILL-008 billing run workspace with BILL-007 (assessment by flat) as its items tab (Gate C.1
 * reference experience C). The run moves draft → previewed → waiting for approval → approved →
 * posted → residents notified. What the signed-in person may do next is decided by the server and
 * explained when it is not allowed (the preparer never approves; a stale preview blocks the way).
 * Posting is safe to repeat. A posted run is read-only: corrections are credit notes.
 */
export default function RunWorkspace({ runId }: { runId: string }) {
  const { t } = useT();
  const q = useApiQuery<BillingRunDetail>({ method: 'GET', path: `/billing-runs/${runId}` });
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)) {
    return (
      <div className="space-y-4">
        <h1 id="page-title" className="sr-only">
          {t('billing:run.notFound')}
        </h1>
        <NotFoundState />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  return <Workspace data={q.data} />;
}

function Workspace({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { run } = data;
  const period = fmt.period(run.period);
  const totals = run.totals;
  const [, setTab] = useQueryParam('tab');
  const setParams = useQueryParams();
  const tabs = [
    { id: 'summary', label: t('billing:run.tabs.summary') },
    { id: 'items', label: t('billing:run.tabs.items') },
    { id: 'exceptions', label: t('billing:run.tabs.exceptions') },
    { id: 'approval', label: t('billing:run.tabs.approval') },
    { id: 'posting', label: t('billing:run.tabs.posting') },
    { id: 'audit', label: t('billing:run.tabs.audit') },
  ];

  return (
    <div className="@container space-y-6" data-testid="run-workspace" data-state={run.state} data-stale={run.stale}>
      <Breadcrumbs items={[{ label: t('nav:items.billing'), href: SOCIETY.runs }, { label: t('nav:pages.billingRuns'), href: SOCIETY.runs }]} />
      <section aria-labelledby="page-title" className="space-y-5 rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">
              <bdi dir="ltr" className="ltr-ref">
                {run.ref}
              </bdi>{' '}
              · <bdi>{run.siteName}</bdi>
            </p>
            <h1 id="page-title" className="mt-0.5 text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-figure">
              {t('billing:run.title', { period })}
            </h1>
            <p className="mt-1 text-sm text-muted">{t('billing:run.dates', { issue: fmt.date(run.issueDate), due: fmt.date(run.dueDate), name: run.createdByName })}</p>
          </div>
          <RunStateBadge state={run.state} stale={run.stale} />
        </div>
        <RunProgress state={run.state} history={run.history} />
        <NextStep data={data} />
      </section>

      {totals && (
        <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-4" data-testid="run-totals">
          <AmountStrip tone="neutral" icon={ReceiptText} label={t('billing:run.kpi.amount')} amount={<Money value={totals.amount} />} />
          <KpiButton label={t('billing:run.kpi.invoices')} value={fmt.count(totals.invoices)} hint={t('billing:run.kpi.invoicesHint', { accounts: fmt.count(totals.accounts) })} onPress={() => setTab(run.state === 'POSTED' || run.state === 'NOTIFIED' ? 'posting' : 'items')} testId="run-kpi-invoices" />
          <KpiButton label={t('billing:run.kpi.flats')} value={fmt.count(totals.flats)} hint={t('billing:run.kpi.flatsHint')} onPress={() => setParams({ tab: 'items', show: 'billed' })} testId="run-kpi-flats" />
          <KpiButton label={t('billing:run.kpi.exempt')} value={fmt.count(totals.exempt)} hint={t('billing:run.kpi.exemptHint')} onPress={() => setParams({ tab: 'items', show: 'exempt' })} testId="run-kpi-exempt" />
        </div>
      )}

      <UrlTabs label={t('billing:run.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'items' ? (
            <ItemsTab data={data} />
          ) : tab === 'exceptions' ? (
            <ExceptionsTab data={data} />
          ) : tab === 'approval' ? (
            <ApprovalTab data={data} />
          ) : tab === 'posting' ? (
            <PostingTab data={data} />
          ) : tab === 'audit' ? (
            <Panel title={t('billing:run.tabs.audit')}>
              <AuditList query={{ run: run.id }} />
            </Panel>
          ) : (
            <SummaryTab data={data} />
          )
        }
      </UrlTabs>
    </div>
  );
}

function KpiButton({ label, value, hint, onPress, testId }: { label: string; value: string; hint: string; onPress: () => void; testId: string }) {
  return (
    <button type="button" onClick={onPress} className="group flex min-w-0 items-center justify-between gap-3 rounded-card border border-border/70 bg-panel px-4 py-3 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus" data-testid={testId}>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block text-xl font-bold text-text">{value}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <DirectionalIcon icon={ChevronRight} className="size-4 shrink-0 text-muted" />
    </button>
  );
}

/** The one next step for this person, with the reason when it is someone else's to take. */
function NextStep({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<BillingRunDetail | PostResult>();
  const [confirm, setConfirm] = useState<null | 'post' | 'cancel' | 'return'>(null);
  const { run, actions } = data;
  const period = fmt.period(run.period);
  const totals = run.totals;

  const act = async (action: BillingRunAction, note?: string) => {
    const result = await mutation.mutateAsync({ method: 'POST', path: `/billing-runs/${run.id}/${action}`, body: note ? { note } : {} });
    const msg =
      action === 'post' && 'replayed' in result
        ? t(result.replayed ? 'billing:run.done.postReplay' : 'billing:run.done.post', { count: result.invoiceIds.length, period })
        : t(`billing:run.done.${action}`, { period });
    toast.success(msg);
    announce(msg);
    if (action === 'preview') emitTourEvent('billing.run.previewed');
  };
  const safe = (action: BillingRunAction, note?: string) => act(action, note).catch(() => undefined);
  const reasonText = (a: BillingRunAction) => {
    const r = actions[a]?.reason;
    return r ? t(`billing:run.why.${r}`) : undefined;
  };

  let body: React.ReactNode = null;
  const allowed = (a: BillingRunAction) => actions[a]?.allowed === true;
  switch (run.state) {
    case 'DRAFT':
      body = (
        <Step icon={ListChecks} title={t('billing:run.next.draftTitle')} text={t('billing:run.next.draftText')}>
          <Button variant="primary" icon={ListChecks} onPress={() => void safe('preview')} isDisabled={!allowed('preview')} disabledReason={reasonText('preview')} isPending={mutation.isPending} data-testid="run-preview" data-tour-id="run-preview">
            {t('billing:run.actions.preview')}
          </Button>
        </Step>
      );
      break;
    case 'PREVIEWED':
      body = run.stale ? (
        <Step icon={RefreshCw} tone="warning" title={t('billing:run.next.staleTitle')} text={t('billing:run.next.staleText')}>
          <Button variant="primary" icon={RefreshCw} onPress={() => void safe('preview')} isDisabled={!allowed('preview')} disabledReason={reasonText('preview')} isPending={mutation.isPending} data-testid="run-preview">
            {t('billing:run.actions.regenerate')}
          </Button>
          <Button variant="secondary" icon={Send} isDisabled disabledReason={t('billing:run.why.stale_preview')} data-testid="run-submit">
            {t('billing:run.actions.submit')}
          </Button>
        </Step>
      ) : (
        <Step icon={Send} title={t('billing:run.next.previewedTitle')} text={t('billing:run.next.previewedText', { count: totals?.invoices ?? 0, amount: totals ? fmt.money(totals.amount) : '' })}>
          <Button variant="primary" icon={Send} onPress={() => void safe('submit')} isDisabled={!allowed('submit')} disabledReason={reasonText('submit')} isPending={mutation.isPending} data-testid="run-submit">
            {t('billing:run.actions.submit')}
          </Button>
          {allowed('preview') && (
            <Button variant="secondary" icon={RefreshCw} onPress={() => void safe('preview')} data-testid="run-regenerate">
              {t('billing:run.actions.regenerate')}
            </Button>
          )}
        </Step>
      );
      break;
    case 'APPROVAL_PENDING':
      body = (
        <Step
          icon={allowed('approve') ? BadgeCheck : Hourglass}
          tone={run.stale ? 'warning' : undefined}
          title={allowed('approve') ? t('billing:run.next.approveTitle') : t('billing:run.next.waitingTitle')}
          text={allowed('approve') ? t('billing:run.next.approveText', { name: run.createdByName }) : run.stale ? t('billing:run.next.staleWaiting') : t('billing:run.next.waitingText')}
        >
          <Button variant="primary" icon={BadgeCheck} onPress={() => void safe('approve')} isDisabled={!allowed('approve')} disabledReason={reasonText('approve')} isPending={mutation.isPending} data-testid="run-approve">
            {t('billing:run.actions.approve')}
          </Button>
          {allowed('return') && (
            <Button variant="secondary" icon={Undo2} onPress={() => setConfirm('return')} data-testid="run-return">
              {t('billing:run.actions.return')}
            </Button>
          )}
        </Step>
      );
      break;
    case 'APPROVED':
      body = (
        <Step icon={ReceiptText} title={t('billing:run.next.postTitle')} text={t('billing:run.next.postText', { name: run.approvedByName ?? '' })}>
          <Button variant="primary" icon={ReceiptText} onPress={() => setConfirm('post')} isDisabled={!allowed('post')} disabledReason={reasonText('post')} isPending={mutation.isPending} data-testid="run-post">
            {t('billing:run.actions.post', { count: totals?.invoices ?? 0 })}
          </Button>
        </Step>
      );
      break;
    case 'POSTED':
      body = (
        <Step icon={Send} tone="success" title={t('billing:run.next.notifyTitle')} text={t('billing:run.next.notifyText', { count: totals?.invoices ?? 0 })}>
          <Button variant="primary" icon={Send} onPress={() => void safe('notify')} isDisabled={!allowed('notify')} disabledReason={reasonText('notify')} isPending={mutation.isPending} data-testid="run-notify">
            {t('billing:run.actions.notify')}
          </Button>
          <Link href={SOCIETY.invoices({ run: run.id })} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
            {t('billing:run.openInvoices')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        </Step>
      );
      break;
    case 'NOTIFIED':
      body = (
        <Step icon={CheckCircle2} tone="success" title={t('billing:run.next.doneTitle')} text={t('billing:run.next.doneText', { count: run.notified?.notices ?? 0 })}>
          <Link href={SOCIETY.invoices({ run: run.id })} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary" data-testid="run-open-invoices">
            {t('billing:run.openInvoices')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        </Step>
      );
      break;
    case 'CANCELLED':
      body = <Step icon={XCircle} title={t('billing:run.next.cancelledTitle')} text={t('billing:run.next.cancelledText')} />;
      break;
  }

  return (
    <div className="space-y-3" data-testid="run-next-step">
      {body}
      {(run.state === 'POSTED' || run.state === 'NOTIFIED') && (
        <p className="flex items-start gap-2 rounded-tile bg-sunken/60 px-3 py-2 text-xs text-muted" data-testid="run-read-only">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('billing:run.readOnly')}
        </p>
      )}
      {allowed('cancel') && (
        <Button variant="quiet" size="sm" icon={XCircle} onPress={() => setConfirm('cancel')} data-testid="run-cancel">
          {t('billing:run.actions.cancel')}
        </Button>
      )}
      {mutation.isError && <ProblemAlert error={mutation.error} />}
      <ConfirmDialog
        isOpen={confirm === 'post'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('billing:run.confirm.postTitle', { period })}
        effect={t('billing:run.confirm.postEffect', { count: totals?.invoices ?? 0, amount: totals ? fmt.money(totals.amount) : '' })}
        confirmLabel={t('billing:run.actions.post', { count: totals?.invoices ?? 0 })}
        onConfirm={() => safe('post')}
      />
      <ConfirmDialog
        isOpen={confirm === 'return'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('billing:run.confirm.returnTitle')}
        effect={t('billing:run.confirm.returnEffect', { name: run.createdByName })}
        confirmLabel={t('billing:run.actions.return')}
        reasonLabel={t('billing:run.confirm.comment')}
        onConfirm={(note) => safe('return', note)}
      />
      <ConfirmDialog
        isOpen={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('billing:run.confirm.cancelTitle')}
        effect={t('billing:run.confirm.cancelEffect')}
        confirmLabel={t('billing:run.actions.cancel')}
        destructive
        reasonLabel={t('billing:run.confirm.reason')}
        onConfirm={(note) => safe('cancel', note)}
      />
    </div>
  );
}

function Step({ icon: Icon, title, text, tone, children }: { icon: typeof Send; title: string; text: string; tone?: 'warning' | 'success'; children?: React.ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4 rounded-tile border p-4', tone === 'warning' ? 'border-warning/40 bg-warning-soft' : tone === 'success' ? 'border-success/30 bg-success-soft' : 'border-primary/25 bg-primary-soft/40')}>
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-primary')} />
        <div className="min-w-0">
          <p className="font-semibold text-text" data-testid="run-next-title">
            {title}
          </p>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-start gap-2">{children}</div>}
    </div>
  );
}

function SummaryTab({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const totals = data.run.totals;
  return (
    <div className="grid gap-5 @4xl:grid-cols-[3fr_2fr]">
      <Panel title={t('billing:run.summary.byCategory')}>
        {totals ? (
          <table className="w-full text-sm" data-testid="run-by-category">
            <caption className="sr-only">{t('billing:run.summary.byCategory')}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 text-start font-medium">{t('billing:run.summary.category')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t('billing:run.summary.flats')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t('billing:run.summary.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {totals.byCategory.map((c) => (
                <tr key={c.category} className="border-b border-border/60">
                  <th scope="row" className="py-2.5 text-start font-medium text-text">{t(`billing:categories.${c.category}`)}</th>
                  <td className="py-2.5 text-end">{fmt.count(c.flats)}</td>
                  <td className="py-2.5 text-end"><Money value={c.amount} /></td>
                </tr>
              ))}
              {totals.byType.map((x) => (
                <tr key={x.type} className="text-muted">
                  <th scope="row" className="py-2 text-start text-xs font-normal">{t('billing:run.summary.byType', { type: t(`sites:types.${x.type}`), flats: fmt.count(x.flats) })}</th>
                  <td />
                  <td className="py-2 text-end text-xs"><Money value={x.amount} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="pt-3 text-start font-bold text-text">{t('billing:run.summary.total')}</th>
                <td className="pt-3 text-end font-semibold">{fmt.count(totals.flats)}</td>
                <td className="pt-3 text-end font-bold"><Money value={totals.amount} /></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-sm text-muted">{t('billing:run.summary.noPreview')}</p>
        )}
      </Panel>
      <Panel title={t('billing:run.checks.title')} description={t('billing:run.checks.description')}>
        <ul className="space-y-2" data-testid="run-checks">
          {data.checks.map((c) => (
            <CheckRow key={c.key} check={c} siteId={data.run.siteId} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const checkLink = (key: RunCheck['key'], siteId: string): string | undefined =>
  ({ rules: SOCIETY.rules(), exempt: SOCIETY.exemptions, opening_balances: SOCIETY.openingBalances(siteId), declared_flats: SOCIETY.structure(siteId) })[key as string];

function CheckRow({ check, siteId }: { check: RunCheck; siteId: string }) {
  const { t } = useT();
  const Icon = check.state === 'ok' ? CheckCircle2 : check.state === 'warn' ? TriangleAlert : CircleAlert;
  const href = checkLink(check.key, siteId);
  // Only the states a check can reach have copy (the server never sends the others).
  const text = dynamicT(t)(`billing:run.checks.${check.key}.${check.state}`, { count: check.count ?? 0 });
  return (
    <li className="flex items-start gap-2.5 text-sm" data-testid="run-check" data-check={check.key} data-state={check.state}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', check.state === 'ok' ? 'text-success' : check.state === 'warn' ? 'text-warning' : 'text-error')} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{t(`billing:run.checks.state.${check.state}`)}: </span>
        {href ? <Link href={href}>{text}</Link> : text}
      </span>
    </li>
  );
}

function ItemsTab({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [show] = useQueryParam('show');
  const [block] = useQueryParam('block');
  const setItemParams = useQueryParams();
  const [q, setQ] = useState('');
  const [pageParam, setPage] = useQueryParam('page');
  const [open, setOpen] = useState<BillingRunItem | null>(null);
  const filter: ItemFilter = (ITEM_FILTERS as readonly string[]).includes(show ?? '') ? (show as ItemFilter) : 'all';
  const items = data.items;
  const blocks = [...new Set(items.map((i) => i.buildingCode))];
  const overridden = (i: BillingRunItem) => i.lines.some((l) => l.winner.scope.level !== 'site');
  const rows = useMemo(
    () =>
      items
        .filter((i) => filter === 'all' || (filter === 'billed' ? !i.exempt && i.payerPartyId : filter === 'exempt' ? i.exempt : filter === 'override' ? overridden(i) : !i.payerPartyId))
        .filter((i) => !block || i.buildingCode === block)
        .filter((i) => {
          const n = q.trim().toLowerCase().replace(/[\s-]/g, '');
          return !n || i.unitCode.toLowerCase().replace('-', '').includes(n) || i.payerName.toLowerCase().includes(q.trim().toLowerCase()) || i.accountNo.toLowerCase().includes(q.trim().toLowerCase());
        }),
    [items, filter, block, q],
  );
  if (!items.length) {
    return (
      <Panel>
        <p className="text-sm text-muted" data-testid="run-items-empty">{t('billing:run.items.empty')}</p>
      </Panel>
    );
  }
  const amount = (i: BillingRunItem, c: ChargeCategoryKey) => i.lines.find((l) => l.category === c)?.amount;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageNo = Math.min(pages, Math.max(1, Number(pageParam) || 1));
  const shown = rows.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  return (
    <Panel title={t('billing:run.items.title')} description={t('billing:run.items.description')}>
      <div className="mb-4 space-y-3">
        <SearchField value={q} onChange={setQ} className="flex max-w-md flex-col gap-1.5" data-testid="run-items-search">
          <Label className="text-sm font-medium text-text">{t('billing:run.items.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('billing:run.items.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterPills label={t('billing:run.items.show')} showLabel value={filter} testId="run-items-filter" onChange={(v) => setItemParams({ show: v === 'all' ? null : v, page: null })} options={ITEM_FILTERS.map((f) => ({ id: f, label: t(`billing:run.items.filters.${f}`) }))} />
          <FilterPills label={t('billing:run.items.block')} showLabel value={block ?? 'all'} testId="run-items-block" onChange={(v) => setItemParams({ block: v === 'all' ? null : v, page: null })} options={[{ id: 'all', label: t('billing:run.items.allBlocks') }, ...blocks.map((b) => ({ id: b, label: t('billing:run.items.blockN', { code: b }) }))]} />
        </div>
        <p className="text-sm text-muted" role="status" data-testid="run-items-count">
          {t('billing:run.items.showing', { count: rows.length, total: fmt.count(items.length) })}
        </p>
      </div>

      <ScrollRegion label={t('billing:run.items.title')} className="hidden @3xl:block">
        <table className="w-full min-w-[46rem] text-sm" data-testid="run-items-table">
          <caption className="sr-only">{t('billing:run.items.title')}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('billing:run.items.flat')}</th>
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('billing:run.items.payer')}</th>
              {CATEGORY_ORDER.map((c) => (
                <th key={c} scope="col" className="py-2 pe-3 text-end font-medium">{t(`billing:categories.${c}`)}</th>
              ))}
              <th scope="col" className="py-2 pe-3 text-end font-medium">{t('billing:run.items.total')}</th>
              <th scope="col" className="py-2 text-end font-medium"><span className="sr-only">{t('billing:run.items.details')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className={cn('border-b border-border/60', i.exempt && 'text-muted')} data-testid="run-item" data-flat={i.unitCode} data-exempt={i.exempt || undefined}>
                <th scope="row" className="py-2 pe-3 text-start font-semibold text-text">
                  <Link href={SOCIETY.flat(data.run.siteId, i.unitId)}><bdi dir="ltr">{i.unitCode}</bdi></Link>
                  {overridden(i) && <span className="ms-2 inline-block align-middle"><Badge tone="info" icon={FileStack}>{t('billing:run.items.override')}</Badge></span>}
                </th>
                <td className="py-2 pe-3">
                  <bdi>{i.payerName || '—'}</bdi>
                  <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{i.accountNo}</bdi></span>
                </td>
                {CATEGORY_ORDER.map((c) => {
                  const a = amount(i, c);
                  return (
                    <td key={c} className="py-2 pe-3 text-end tabular-nums">{a ? <Money value={a} /> : '—'}</td>
                  );
                })}
                <td className="py-2 pe-3 text-end font-semibold tabular-nums">
                  {i.exempt ? <Badge tone="info" icon={Ban}>{t('billing:run.items.exempt')}</Badge> : <Money value={i.total} />}
                </td>
                <td className="py-2 text-end">
                  <Button variant="quiet" size="sm" onPress={() => setOpen(i)} aria-label={t('billing:run.items.whyFor', { flat: i.unitCode })} data-testid="run-item-why">
                    {t('billing:run.items.why')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <ul className="space-y-2 @3xl:hidden" data-testid="run-items-cards">
        {shown.map((i) => (
          <li key={i.id} data-testid="run-item-card" data-flat={i.unitCode}>
            <button type="button" onClick={() => setOpen(i)} className="flex w-full items-center gap-3 rounded-tile border border-border px-3 py-3 text-start outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-text">
                  <bdi dir="ltr">{i.unitCode}</bdi>
                  {overridden(i) && <Badge tone="info" icon={FileStack}>{t('billing:run.items.override')}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted"><bdi>{i.payerName || '—'}</bdi> · <bdi dir="ltr" className="ltr-ref">{i.accountNo}</bdi></span>
              </span>
              {i.exempt ? <Badge tone="info" icon={Ban}>{t('billing:run.items.exempt')}</Badge> : <Money value={i.total} className="font-semibold" />}
              <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label={t('crm:list.pagination')} className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{t('crm:list.showing', { from: fmt.count((pageNo - 1) * PAGE_SIZE + 1), to: fmt.count(Math.min(rows.length, pageNo * PAGE_SIZE)), total: fmt.count(rows.length) })}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" isDisabled={pageNo <= 1} onPress={() => setPage(pageNo - 1 > 1 ? String(pageNo - 1) : null)} data-testid="run-items-prev">
              {t('crm:list.previous')}
            </Button>
            <Button variant="secondary" size="sm" isDisabled={pageNo >= pages} onPress={() => setPage(String(pageNo + 1))} data-testid="run-items-next">
              {t('crm:list.next')}
            </Button>
          </div>
        </nav>
      )}
      {open && <ItemDrawer item={open} siteId={data.run.siteId} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function ItemDrawer({ item, siteId, onClose }: { item: BillingRunItem; siteId: string; onClose: () => void }) {
  const { t } = useT();
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('billing:run.items.drawerTitle', { flat: item.unitCode })} subtitle={t('billing:run.items.drawerSubtitle', { name: item.payerName || '—', account: item.accountNo })} testId="run-item-drawer" size="lg">
      <div className="@container space-y-4">
        <div className="flex flex-wrap gap-2">
          <OccupancyBadge occupancy={item.occupancy} />
          <Badge tone="neutral">{t(`sites:types.${item.type}`)}</Badge>
        </div>
        <ChargesTable lines={item.lines} />
        <p className="flex justify-between border-t border-border pt-3 text-sm">
          <span className="font-semibold text-text">{t('billing:run.items.total')}</span>
          <Money value={item.total} className="text-base font-bold" />
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={SOCIETY.flat(siteId, item.unitId)}>{t('billing:run.items.openFlat', { flat: item.unitCode })}</Link>
          <Link href={SOCIETY.account(item.billingAccountId)}>{t('billing:run.items.openAccount', { account: item.accountNo })}</Link>
          {item.invoiceId && <Link href={SOCIETY.invoice(item.invoiceId)}>{t('billing:run.items.openInvoice', { ref: item.invoiceRef ?? '' })}</Link>}
        </div>
        <p className="text-xs text-muted">{t('billing:run.items.key', { key: item.idempotencyKey })}</p>
      </div>
    </Drawer>
  );
}

function ExceptionsTab({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const setParams = useQueryParams();
  const exempt = data.items.filter((i) => i.exempt);
  const overrides = data.items.filter((i) => i.lines.some((l) => l.winner.scope.level !== 'site'));
  const noPayer = data.items.filter((i) => !i.payerPartyId);
  const shared = Object.entries(
    data.items.filter((i) => !i.exempt).reduce<Record<string, BillingRunItem[]>>((m, i) => ({ ...m, [i.billingAccountId]: [...(m[i.billingAccountId] ?? []), i] }), {}),
  ).filter(([, list]) => list.length > 1);
  if (!data.items.length) return <Panel><p className="text-sm text-muted">{t('billing:run.items.empty')}</p></Panel>;
  return (
    <div className="grid gap-5 @4xl:grid-cols-2">
      <Panel title={t('billing:run.exceptions.exempt', { count: exempt.length })} description={t('billing:run.exceptions.exemptHint')}>
        <ul className="space-y-2" data-testid="exceptions-exempt">
          {exempt.map((i) => (
            <li key={i.id} className="rounded-tile border border-border px-3 py-2 text-sm">
              <Link href={SOCIETY.flat(data.run.siteId, i.unitId)}><bdi dir="ltr">{i.unitCode}</bdi></Link> · <bdi className="text-muted">{i.lines[0]?.exemption?.reason}</bdi>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('billing:run.exceptions.overrides', { count: overrides.length })} description={t('billing:run.exceptions.overridesHint')}>
        <Button variant="secondary" size="sm" onPress={() => setParams({ tab: 'items', show: 'override' })} data-testid="exceptions-overrides">
          {t('billing:run.exceptions.showOverrides')}
        </Button>
      </Panel>
      <Panel title={t('billing:run.exceptions.shared', { count: shared.length })} description={t('billing:run.exceptions.sharedHint')}>
        <ul className="space-y-2" data-testid="exceptions-shared">
          {shared.map(([accountId, list]) => (
            <li key={accountId} className="rounded-tile border border-border px-3 py-2 text-sm">
              <Link href={SOCIETY.account(accountId)}><bdi dir="ltr">{list[0]!.accountNo}</bdi></Link>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {list.map((i) => (
                  <li key={i.id}>{t('billing:run.exceptions.sharedLine', { flat: i.unitCode, name: i.payerName })}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('billing:run.exceptions.noPayer', { count: noPayer.length })}>
        <p className="text-sm text-muted">{noPayer.length ? t('billing:run.exceptions.noPayerSome') : t('billing:run.exceptions.noPayerNone')}</p>
      </Panel>
    </div>
  );
}

function ApprovalTab({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const events = data.run.history.filter((h) => h.action === 'submit' || h.action === 'return' || h.action === 'approve');
  return (
    <div className="grid gap-5 @4xl:grid-cols-[2fr_3fr]">
      <Panel title={t('billing:run.approval.ruleTitle')}>
        <p className="text-sm text-text">{t('billing:run.approval.rule', { name: data.run.createdByName })}</p>
        {data.actions.approve?.reason === 'maker_checker_required' && (
          <InlineAlert tone="info" className="mt-3">
            {t('billing:run.why.maker_checker_required')}
          </InlineAlert>
        )}
      </Panel>
      <Panel title={t('billing:run.approval.historyTitle')}>
        {events.length === 0 ? (
          <p className="text-sm text-muted">{t('billing:run.approval.none')}</p>
        ) : (
          <ol className="space-y-3" data-testid="approval-history">
            {events.map((e, i) => (
              <li key={i} className="rounded-tile border border-border px-3 py-2.5 text-sm" data-action={e.action}>
                <p className="font-semibold text-text">{t(`billing:run.approval.events.${e.action as 'submit' | 'return' | 'approve'}`, { name: e.byName })}</p>
                {e.note && <p className="mt-1 text-muted"><bdi>{t('billing:quote', { text: e.note })}</bdi></p>}
                <p className="mt-1 text-xs text-muted"><DateTime value={e.at} style="dateTime" /></p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function PostingTab({ data }: { data: BillingRunDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { run } = data;
  const replays = run.history.filter((h) => h.replay).length;
  const posted = run.state === 'POSTED' || run.state === 'NOTIFIED';
  const invoices = data.items.filter((i) => i.invoiceId).reduce<Array<{ id: string; ref: string; flats: string[] }>>((list, i) => {
    const found = list.find((x) => x.id === i.invoiceId);
    if (found) found.flats.push(i.unitCode);
    else list.push({ id: i.invoiceId!, ref: i.invoiceRef ?? '', flats: [i.unitCode] });
    return list;
  }, []);
  return (
    <div className="space-y-5">
      <Panel title={t('billing:run.posting.title')}>
        <ul className="space-y-2 text-sm text-text">
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />{t('billing:run.posting.idempotent')}</li>
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />{t('billing:run.posting.grouping')}</li>
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />{t('billing:run.posting.locked')}</li>
          <li className="flex gap-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />{t('billing:run.posting.notify')}</li>
        </ul>
        {posted && (
          <p className="mt-4 rounded-tile bg-sunken/60 px-3 py-2 text-sm text-text" data-testid="posting-result" data-invoices={invoices.length} data-replays={replays}>
            {t('billing:run.posting.result', { count: invoices.length, date: run.postedAt ? fmt.date(run.postedAt) : '', replays })}
          </p>
        )}
      </Panel>
      {posted && (
        <Panel
          title={t('billing:run.posting.invoices', { count: invoices.length })}
          actions={
            <Link href={SOCIETY.invoices({ run: run.id })} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
              {t('billing:run.openInvoices')}
              <DirectionalIcon icon={ArrowRight} className="size-4" />
            </Link>
          }
        >
          <ul className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3" data-testid="posted-invoices">
            {invoices.slice(0, 12).map((i) => (
              <li key={i.id}>
                <Link href={SOCIETY.invoice(i.id)} variant="plain" className="flex items-center justify-between gap-3 rounded-tile border border-border px-3 py-2 text-sm hover:bg-raised">
                  <bdi dir="ltr" className="ltr-ref font-semibold">{i.ref}</bdi>
                  <bdi dir="ltr" className="ltr-ref text-xs text-muted">{i.flats.join(', ')}</bdi>
                </Link>
              </li>
            ))}
          </ul>
          {invoices.length > 12 && <p className="mt-3 text-xs text-muted">{t('billing:run.posting.more', { count: invoices.length - 12 })}</p>}
        </Panel>
      )}
    </div>
  );
}
