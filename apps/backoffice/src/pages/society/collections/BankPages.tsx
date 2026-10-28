import type { BankFeed, BankLine, Beneficiary, ReconciliationSummary } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import { Badge, Button, ConfirmDialog, DateTime, Drawer, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { Ban, CalendarClock, FileSpreadsheet, Landmark, Link2, ListChecks, RotateCcw, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { ACCESS_DATE, COLLECTIONS } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { BankLineBadge } from './ckit';

/** An account number inside a translated sentence: kept left to right in Urdu (an LTR isolate). */
const ltr = (v: string) => `\u2066${v}\u2069`;

type FeedLine = BankLine & { suggestion?: { kind: 'submission' | 'account'; id: string; label: string; href: string } };
const STATES = ['all', 'unmatched', 'unidentified', 'matched', 'excluded'] as const;

/**
 * BANK-003 bank transaction feed (simulated import of the association's statements). Each statement
 * belongs to one of the association's verified accounts, chosen at import; a line is identified by
 * that account, the statement source and the bank's transaction id, so importing a statement twice
 * adds nothing twice. Unmatched lines say who they probably belong to; the rest are "unidentified".
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
                <span className="block text-xs text-muted" data-testid="bank-statement-account" data-account={s.beneficiaryId}>
                  {t('collections:bank.statementAccount', { iban: ltr(formatIban(s.iban)) })}
                </span>
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
      {importing && <ImportDrawer accounts={q.data?.accounts ?? []} onClose={() => setImporting(false)} />}
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
        <span className="block text-xs text-muted" data-testid="bank-line-account" data-account={line.beneficiaryId}>
          {t('collections:bank.lineAccount', { iban: ltr(formatIban(line.accountIban)) })}
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

type ImportResult = { created: number; skipped: number; alreadyImported: boolean; nowMatchable: Array<{ id: string; ref: string; flats: string[] }> };

const SAMPLES = [
  { n: 1, account: 'main' },
  { n: 2, account: 'main' },
  { n: 3, account: 'main' },
  { n: 4, account: 'committee' },
] as const;

/** How an account is described when choosing it: title, IBAN and whether it is in force, upcoming or retired. */
function accountLabel(t: ReturnType<typeof useT>['t'], fmt: ReturnType<typeof useSocietyFormat>, a: Beneficiary, today: string) {
  const when =
    a.activeTo && a.activeTo <= today
      ? t('collections:bank.accountRetired', { date: fmt.date(a.activeTo) })
      : a.activeFrom && a.activeFrom > today
        ? t('collections:bank.accountUpcoming', { date: fmt.date(a.activeFrom) })
        : t('collections:bank.accountInForce');
  return `${a.accountTitle} · ${formatIban(a.iban)} (${when})`;
}

function ImportDrawer({ accounts, onClose }: { accounts: Beneficiary[]; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const mutation = useApiMutation<ImportResult>();
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Never assumed: the officer says which account the statement belongs to.
  const [account, setAccount] = useState<string | null>(null);
  const today = ACCESS_DATE;
  const send = async (body: Record<string, unknown>) => {
    setError(null);
    setResult(null);
    try {
      const r = await mutation.mutateAsync({ method: 'POST', path: '/bank/statements', body: { ...body, beneficiaryId: account } });
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
      const dates = content
        .split(/\r?\n/)
        .filter((r) => !r.startsWith('#'))
        .slice(1)
        .map((r) => r.split(',')[1] ?? '')
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      void send({ fileName: file.name, content, from: dates[0] ?? '', to: dates.at(-1) ?? '' });
    });
  };
  const ibanOf = (kind: 'main' | 'committee') => accounts.find((a) => (kind === 'committee' ? a.id === 'ben_anr_committee' : a.id === 'ben_anr_main'))?.iban ?? '';
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('collections:bank.importTitle')} subtitle={t('collections:bank.importSubtitle')} testId="bank-import" footer={<Button variant="primary" onPress={onClose}>{t('common:actions.done')}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-text">{t('collections:bank.importBody')}</p>
        <div className="space-y-1.5">
          <SelectControl
            label={t('collections:bank.account')}
            placeholder={t('collections:bank.accountPick')}
            value={account}
            onChange={(k) => setAccount(k)}
            options={accounts.map((a) => ({ id: a.id, label: accountLabel(t, fmt, a, today) }))}
            testId="bank-import-account"
          />
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Landmark aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t('collections:bank.accountHelp')}
          </p>
        </div>
        <ul className="space-y-2">
          {SAMPLES.map(({ n, account: kind }) => (
            <li key={n} className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border p-3">
              <span className="min-w-0 text-sm text-text">
                <span className="block">{t(`collections:bank.sample${n}` as 'collections:bank.sample1')}</span>
                <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{t('collections:bank.sampleFor', { iban: formatIban(ibanOf(kind)) })}</bdi></span>
              </span>
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} isPending={mutation.isPending} isDisabled={!account} onPress={() => void send({ sample: n })} data-testid={`bank-import-sample-${n}`}>
                {t('collections:bank.importSample')}
              </Button>
            </li>
          ))}
        </ul>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-text">{t('collections:bank.importFile')}</span>
          <input type="file" accept=".csv,text/csv" disabled={!account} onChange={onFile} className="block w-full text-sm text-muted file:me-3 file:min-h-10 file:rounded-control file:border-0 file:bg-primary-soft file:px-4 file:font-semibold file:text-primary disabled:opacity-60" data-testid="bank-import-file" />
          <span className="block text-xs text-muted">{t('collections:bank.importColumns')}</span>
        </label>
        {result && (
          <div className="space-y-2 rounded-tile bg-success-soft px-4 py-3 text-sm text-success" role="status" data-testid="bank-import-result">
            <p>{result.alreadyImported ? t('collections:bank.alreadyImported') : t('collections:bank.imported', { count: result.created, skipped: result.skipped })}</p>
            {result.nowMatchable.length > 0 && (
              <p className="text-text" data-testid="bank-import-matchable">
                {t('collections:bank.nowMatchable', { count: result.nowMatchable.length, refs: '' })}
                {result.nowMatchable.map((x, i) => (
                  <span key={x.id}>
                    {i > 0 ? ', ' : ''}
                    <Link href={COLLECTIONS.review(x.id)}><bdi dir="ltr" className="ltr-ref">{x.ref}</bdi> (<bdi dir="ltr" className="ltr-ref">{x.flats.join(', ')}</bdi>)</Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/**
 * BANK-004 reconciliation: the statement against the payments. Verified transfers show as matched;
 * unmatched lines point to a waiting proof or an account where one is likely; proofs checked but not
 * yet on any statement wait for their bank line (nothing is settled until then).
 */
export function ReconciliationPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<ReconciliationSummary>({ method: 'GET', path: '/bank/reconciliation' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const r = q.data;
  const unmatched = (r.lines as FeedLine[]).filter((l) => l.state === 'unmatched');
  const tiles = [
    { id: 'credits', label: t('collections:reconciliation.statementCredits'), value: fmt.money(r.statementCredits), href: COLLECTIONS.bankFeed() },
    { id: 'matched', label: t('collections:reconciliation.matched', { count: r.matched.count }), value: fmt.money(r.matched.amount), href: COLLECTIONS.bankFeed('matched') },
    { id: 'unmatched', label: t('collections:reconciliation.unmatched', { count: r.unmatched.count }), value: fmt.money(r.unmatched.amount), href: COLLECTIONS.bankFeed('unmatched') },
    { id: 'unidentified', label: t('collections:reconciliation.unidentified', { count: r.unidentified.count }), value: fmt.money(r.unidentified.amount), href: COLLECTIONS.bankFeed('unidentified') },
    { id: 'excluded', label: t('collections:reconciliation.excluded', { count: r.excluded.count }), value: fmt.money(r.excluded.amount), href: COLLECTIONS.bankFeed('excluded') },
    { id: 'awaiting', label: t('collections:reconciliation.awaiting', { count: r.awaitingBankLine.count }), value: fmt.money(r.awaitingBankLine.amount), href: COLLECTIONS.inbox('awaiting_bank_evidence') },
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
        {r.awaitingProofs.length === 0 ? (
          <p className="text-sm text-muted">{t('collections:reconciliation.noneAwaiting')}</p>
        ) : (
          <ul className="space-y-2" data-testid="reconciliation-awaiting">
            {r.awaitingProofs.map((p) => (
              <li key={p.id}>
                <Link href={COLLECTIONS.review(p.id)} variant="plain" className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-panel p-4 hover:bg-raised">
                  <span className="min-w-0">
                    <span className="block font-semibold text-text"><bdi>{p.payerName}</bdi></span>
                    <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{p.flats.join(', ')}</bdi> · {fmt.date(p.transferDate)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="info" icon={CalendarClock}>{t('collections:states.awaiting_bank_evidence')}</Badge>
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
