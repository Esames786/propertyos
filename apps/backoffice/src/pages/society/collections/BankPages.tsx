import type { BankFeed, BankLine, ReconciliationSummary } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { Ban, FileSpreadsheet, Link2, Link2Off, ListChecks, RotateCcw, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { COLLECTIONS } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { BankLineBadge } from './ckit';

type FeedLine = BankLine & { suggestion?: { kind: 'submission' | 'account'; id: string; label: string; href: string } };
const STATES = ['all', 'unmatched', 'unidentified', 'matched', 'excluded'] as const;

/**
 * BANK-003 bank transaction feed (simulated import of the association's statement). A line is
 * identified by the bank's transaction id: importing a statement twice, or an overlapping one, adds
 * nothing twice. Unmatched lines say who they probably belong to; the rest are "unidentified".
 */
export function BankFeedPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [state] = useQueryParam('state');
  const setParams = useQueryParams();
  const [importing, setImporting] = useState(false);
  const filter = (STATES as readonly string[]).includes(state ?? '') ? (state as (typeof STATES)[number]) : 'all';
  const q = useApiQuery<BankFeed>({ method: 'GET', path: '/bank/feed', query: { state: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="bank-feed" data-filter={filter}>
      <PageHeader
        title={t('nav:pages.bankFeed')}
        description={t('collections:bank.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={COLLECTIONS.reconciliation} variant="plain" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-control px-4 text-sm font-semibold text-text hover:bg-raised">
              <ListChecks aria-hidden className="size-4" />
              {t('nav:pages.reconciliation')}
            </Link>
            {can('bank.reconcile') && (
              <Button variant="primary" icon={Upload} onPress={() => setImporting(true)} data-testid="bank-import-open">
                {t('collections:bank.import')}
              </Button>
            )}
          </div>
        }
      />
      {q.data && (
        <ul className="grid gap-3 @2xl:grid-cols-2" data-testid="bank-statements">
          {q.data.statements.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-tile border border-border bg-panel p-4">
              <FileSpreadsheet aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
              <span className="min-w-0 text-sm">
                <bdi dir="ltr" className="ltr-ref block font-semibold text-text">{s.fileName}</bdi>
                <span className="block text-xs text-muted">
                  {t('collections:bank.statementLine', { from: fmt.date(s.from), to: fmt.date(s.to), lines: s.lines, credits: fmt.money(s.credits) })}
                </span>
                <span className="block text-xs text-muted">
                  {t('collections:bank.importedBy', { name: s.importedByName })} · <DateTime value={s.importedAt} style="dateTime" />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <FilterPills
        label={t('collections:bank.filter')}
        showLabel
        value={filter}
        testId="bank-filter"
        onChange={(v) => setParams({ state: v === 'all' ? null : v })}
        options={STATES.map((s) => ({ id: s, label: q.data ? t('collections:inbox.filterCount', { label: t(`collections:bank.filters.${s}`), count: q.data.counts[s] }) : t(`collections:bank.filters.${s}`) }))}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={8} />
      ) : q.data.lines.length === 0 ? (
        <EmptyState title={t('collections:bank.emptyTitle')} body={t('collections:bank.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="bank-lines">
          {(q.data.lines as FeedLine[]).map((l) => (
            <li key={l.id}>
              <BankLineCard line={l} canReconcile={can('bank.reconcile')} />
            </li>
          ))}
        </ul>
      )}
      {importing && <ImportDrawer onClose={() => setImporting(false)} />}
    </div>
  );
}

function BankLineCard({ line, canReconcile }: { line: FeedLine; canReconcile: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const [excluding, setExcluding] = useState(false);
  const act = useApiMutation<BankLine>();
  const [error, setError] = useState<unknown>(null);
  const unidentified = line.state === 'unmatched' && !line.suggestion;
  return (
    <div className="grid gap-x-6 gap-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="bank-line" data-txn={line.bankTxnId} data-state={unidentified ? 'unidentified' : line.state}>
      <span className="min-w-0">
        <span className="block font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{line.counterpartyName}</bdi></span>
        <span className="block text-xs text-muted">
          {fmt.date(line.valueDate)} · <bdi dir="ltr" className="ltr-ref">{line.bankTxnId}</bdi> · <bdi dir="ltr" className="ltr-ref">{line.narration}</bdi>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        <BankLineBadge state={line.state} unidentified={unidentified} />
        {line.state === 'matched' && line.paymentId && (
          <Link href={COLLECTIONS.payment(line.paymentId)} className="inline-flex items-center gap-1"><Link2 aria-hidden className="size-3.5" /><bdi dir="ltr" className="ltr-ref">{line.paymentRef}</bdi></Link>
        )}
        {line.suggestion && (
          <Link href={line.suggestion.href} className="inline-flex items-center gap-1" data-testid="bank-line-suggestion">
            {t(`collections:bank.suggestion.${line.suggestion.kind}`, { label: line.suggestion.label })}
          </Link>
        )}
        {line.state === 'excluded' && line.excludedReason && <span className="text-muted"><bdi>{t('billing:quote', { text: line.excludedReason })}</bdi></span>}
      </span>
      <span className="flex items-center justify-end gap-2">
        <Money value={line.amount} className="text-base font-bold" />
        {canReconcile && line.state === 'unmatched' && (
          <Button variant="quiet" size="sm" icon={Ban} onPress={() => setExcluding(true)} data-testid="bank-line-exclude">
            {t('collections:bank.exclude')}
          </Button>
        )}
        {canReconcile && line.state === 'excluded' && (
          <Button
            variant="quiet"
            size="sm"
            icon={RotateCcw}
            onPress={async () => {
              await act.mutateAsync({ method: 'POST', path: `/bank/lines/${line.id}/restore` });
              toast.success(t('collections:bank.restored'));
            }}
          >
            {t('collections:bank.restore')}
          </Button>
        )}
      </span>
      {error ? <ProblemAlert error={error} className="@3xl:col-span-3" /> : null}
      <ConfirmDialog
        isOpen={excluding}
        onOpenChange={setExcluding}
        title={t('collections:bank.excludeTitle')}
        effect={t('collections:bank.excludeEffect')}
        confirmLabel={t('collections:bank.exclude')}
        reasonLabel={t('collections:bank.excludeReason')}
        onConfirm={async (reason) => {
          setError(null);
          try {
            await act.mutateAsync({ method: 'POST', path: `/bank/lines/${line.id}/exclude`, body: { reason } });
            toast.success(t('collections:bank.excluded'));
          } catch (e) {
            setError(e);
          }
        }}
      />
    </div>
  );
}

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const mutation = useApiMutation<{ created: number; skipped: number; alreadyImported: boolean }>();
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; alreadyImported: boolean } | null>(null);
  const send = async (body: unknown) => {
    setError(null);
    try {
      const r = await mutation.mutateAsync({ method: 'POST', path: '/bank/statements', body });
      setResult(r);
      toast.success(r.alreadyImported ? t('collections:bank.alreadyImported') : t('collections:bank.imported', { count: r.created, skipped: r.skipped }));
    } catch (e) {
      setError(e);
    }
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((content) => {
      const dates = content.split(/\r?\n/).slice(1).map((r) => r.split(',')[1] ?? '').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      void send({ fileName: file.name, content, from: dates[0] ?? '', to: dates.at(-1) ?? '' });
    });
  };
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('collections:bank.importTitle')} subtitle={t('collections:bank.importSubtitle')} testId="bank-import" footer={<Button variant="primary" onPress={onClose}>{t('common:actions.done')}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-text">{t('collections:bank.importBody')}</p>
        <ul className="space-y-2">
          {[1, 2].map((n) => (
            <li key={n} className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border p-3">
              <span className="text-sm text-text">{t(`collections:bank.sample${n}` as 'collections:bank.sample1')}</span>
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} isPending={mutation.isPending} onPress={() => void send({ sample: n })} data-testid={`bank-import-sample-${n}`}>
                {t('collections:bank.importSample')}
              </Button>
            </li>
          ))}
        </ul>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-text">{t('collections:bank.importFile')}</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-sm text-muted file:me-3 file:min-h-10 file:rounded-control file:border-0 file:bg-primary-soft file:px-4 file:font-semibold file:text-primary" data-testid="bank-import-file" />
          <span className="block text-xs text-muted">{t('collections:bank.importColumns')}</span>
        </label>
        {result && (
          <p className="rounded-tile bg-success-soft px-4 py-3 text-sm text-success" role="status" data-testid="bank-import-result">
            {result.alreadyImported ? t('collections:bank.alreadyImported') : t('collections:bank.imported', { count: result.created, skipped: result.skipped })}
          </p>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/**
 * BANK-004 reconciliation: the statement against the payments. Verified transfers show as matched;
 * unmatched lines point to a waiting proof or an account where one is likely; payments verified
 * without a bank line (by hand, with a reason) wait to be found on a later statement.
 */
export function ReconciliationPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<ReconciliationSummary>({ method: 'GET', path: '/bank/reconciliation' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const r = q.data;
  const unmatched = (r.lines as FeedLine[]).filter((l) => l.state === 'unmatched');
  const awaiting = r.payments.filter((p) => !p.bankLineId && p.method === 'bank_transfer');
  const tiles = [
    { id: 'credits', label: t('collections:reconciliation.statementCredits'), value: fmt.money(r.statementCredits), href: COLLECTIONS.bankFeed() },
    { id: 'matched', label: t('collections:reconciliation.matched', { count: r.matched.count }), value: fmt.money(r.matched.amount), href: COLLECTIONS.bankFeed('matched') },
    { id: 'unmatched', label: t('collections:reconciliation.unmatched', { count: r.unmatched.count }), value: fmt.money(r.unmatched.amount), href: COLLECTIONS.bankFeed('unmatched') },
    { id: 'unidentified', label: t('collections:reconciliation.unidentified', { count: r.unidentified.count }), value: fmt.money(r.unidentified.amount), href: COLLECTIONS.bankFeed('unidentified') },
    { id: 'excluded', label: t('collections:reconciliation.excluded', { count: r.excluded.count }), value: fmt.money(r.excluded.amount), href: COLLECTIONS.bankFeed('excluded') },
    { id: 'awaiting', label: t('collections:reconciliation.awaiting', { count: r.awaitingBankLine.count }), value: fmt.money(r.awaitingBankLine.amount), href: COLLECTIONS.payments({ method: 'bank_transfer' }) },
  ];
  return (
    <div className="@container space-y-6" data-testid="reconciliation">
      <PageHeader title={t('nav:pages.reconciliation')} description={t('collections:reconciliation.intro')} />
      <ul className="grid gap-3 @lg:grid-cols-3 @5xl:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link href={tile.href} variant="plain" className="flex h-full flex-col gap-1 rounded-tile border border-border bg-panel p-4 shadow-card hover:bg-raised" data-testid={`reconciliation-${tile.id}`}>
              <span className="text-xs text-muted">{tile.label}</span>
              <bdi dir="ltr" className="ltr-ref text-lg font-bold text-text">{tile.value}</bdi>
            </Link>
          </li>
        ))}
      </ul>
      <section className="space-y-3" aria-labelledby="rec-unmatched">
        <h2 id="rec-unmatched" className="text-lg font-bold text-text">{t('collections:reconciliation.unmatchedTitle')}</h2>
        {unmatched.length === 0 ? (
          <p className="text-sm text-muted">{t('collections:reconciliation.allMatched')}</p>
        ) : (
          <ul className="space-y-2" data-testid="reconciliation-unmatched">
            {unmatched.map((l) => (
              <li key={l.id}>
                <BankLineCard line={l} canReconcile={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3" aria-labelledby="rec-awaiting">
        <h2 id="rec-awaiting" className="text-lg font-bold text-text">{t('collections:reconciliation.awaitingTitle')}</h2>
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted">{t('collections:reconciliation.noneAwaiting')}</p>
        ) : (
          <ul className="space-y-2" data-testid="reconciliation-awaiting">
            {awaiting.map((p) => (
              <li key={p.id}>
                <Link href={COLLECTIONS.payment(p.id, 'reconciliation')} variant="plain" className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-panel p-4 hover:bg-raised">
                  <span className="min-w-0">
                    <span className="block font-semibold text-text"><bdi>{p.payerName}</bdi></span>
                    <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · {fmt.date(p.receivedOn)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="warning" icon={Link2Off}>{t(`collections:verification.${p.verification}`)}</Badge>
                    <Money value={p.amount} className="font-semibold" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
