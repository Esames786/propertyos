import type { PayExport, PayLineSummary, PayRunsList, PayRunView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, Panel, saveFile, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast, useTransport } from '@repo/ui';
import { ClipboardCheck, Download, Info, RefreshCw, Search, Send, TriangleAlert, Undo2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { PAYROLL } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { LinkButton, unbroken, useProblemToast, useRole } from '../hr/hkit';
import { Activity, Boundary, PayNav, RunBadge, WRAP } from './pkit';

/**
 * PAY-003 payroll run workspace: one run, its version, what blocks it, its totals and every person in
 * it (each opens PAY-004), with recalculation and submission. Approval happens on PAY-005 by someone
 * who made no part of the run. The run is an obligation: nothing here pays anyone.
 */
const FILTERS = ['all', 'blocked', 'warnings', 'excluded'] as const;
type Filter = (typeof FILTERS)[number];
const inFilter = (f: Filter, l: PayLineSummary) => (f === 'all' ? true : f === 'blocked' ? l.state === 'included' && l.blockers.length > 0 : f === 'warnings' ? l.state === 'included' && l.warnings.length > 0 : l.state === 'excluded');

export default function PayrollRunPage() {
  const { t } = useT();
  const [param] = useQueryParam('run');
  const runs = useApiQuery<PayRunsList>({ method: 'GET', path: '/payroll/runs' });
  const id = param ?? runs.data?.items.find((r) => r.state !== 'reversed')?.id ?? runs.data?.items[0]?.id;
  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />;
  if (!runs.data) return <Loading lines={10} />;
  if (!id)
    return (
      <div className="@container space-y-5" data-testid="pay-run-none">
        <PageHeader title={t('payroll:run.title')} />
        <PayNav current="run" />
        <EmptyState title={t('payroll:run.none')} actions={<LinkButton href={PAYROLL.periods()}>{t('payroll:run.toPeriods')}</LinkButton>} />
      </div>
    );
  return <RunWorkspace key={id} id={id} runs={runs.data} />;
}

function RunWorkspace({ id, runs }: { id: string; runs: PayRunsList }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const role = useRole();
  const toast = useToast();
  const problem = useProblemToast();
  const { transport } = useTransport();
  const setParams = useQueryParams();
  const [filterParam] = useQueryParam('filter');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState<'recompute' | 'submit' | 'withdraw' | null>(null);
  const act = useApiMutation<PayRunView>();
  const q = useApiQuery<PayRunView>({ method: 'GET', path: `/payroll/runs/${id}` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const r = q.data;
  const a = r.actions;
  const filter: Filter = (FILTERS as readonly string[]).includes(filterParam ?? '') ? (filterParam as Filter) : 'all';
  const norm = (s: string) => s.toLowerCase().normalize('NFKD');
  const lines = r.lines.filter((l) => inFilter(filter, l) && (!search.trim() || norm(`${l.employeeName} ${l.code} ${role(l.role)}`).includes(norm(search.trim()))));
  const exportCsv = async () => {
    try {
      const x = await transport.request<PayExport>({ method: 'GET', path: `/payroll/runs/${r.id}/export` });
      const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const rows = x.rows.map((row) => [row.code, row.name, row.role, row.state, row.gross, row.deductions, row.net].map(cell).join(','));
      saveFile({ fileName: t('payroll:run.exportName', { ref: x.runRef, version: x.version }), mime: 'text/csv', content: [`# ${t('payroll:run.csvNote')}`, t('payroll:run.csvHeader'), ...rows].join('\n') });
    } catch (e) {
      problem(e);
    }
  };
  return (
    <div className="@container space-y-5" data-testid="pay-run" data-run={r.id} data-ref={r.ref} data-state={r.state} data-version={r.version}>
      <PageHeader
        title={t('payroll:run.title')}
        breadcrumbs={[{ label: t('payroll:periods.title'), href: PAYROLL.periods() }]}
        badge={<RunBadge state={r.state} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi dir="ltr" className="font-medium text-text" data-testid="pay-run-ref">
              {unbroken(r.ref)}
            </bdi>
            <span>· {t('payroll:run.period', { month: fmt.period(r.month), from: fmt.date(r.from), to: fmt.date(r.to) })}</span>
            <span data-testid="pay-run-version">· {t('payroll:run.version', { version: r.version })}</span>
            <span>
              · <bdi>{r.legalEntityName}</bdi>
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {a.recompute && (
              <Button className={WRAP} icon={RefreshCw} onPress={() => setConfirming('recompute')} data-testid="pay-run-recompute">
                {t('payroll:run.recompute')}
              </Button>
            )}
            {a.withdraw && (
              <Button className={WRAP} icon={Undo2} onPress={() => setConfirming('withdraw')} data-testid="pay-run-withdraw">
                {t('payroll:run.withdraw')}
              </Button>
            )}
            {a.submit && (
              <Button className={WRAP} variant="primary" icon={Send} onPress={() => setConfirming('submit')} data-testid="pay-run-submit">
                {t('payroll:run.submit')}
              </Button>
            )}
            {(a.approve || a.return || a.reverse) && (
              <LinkButton variant="primary" icon={ClipboardCheck} href={PAYROLL.finalisation(r.id)} testId="pay-run-to-finalisation">
                {t('payroll:run.toFinalisation')}
              </LinkButton>
            )}
            <Button className={WRAP} variant="quiet" icon={Download} onPress={() => void exportCsv()} data-testid="pay-run-export">
              {t('payroll:run.export')}
            </Button>
          </div>
        }
      />
      <PayNav current="run" />
      {runs.items.length > 1 && (
        <div className="max-w-md">
          <SelectControl label={t('payroll:run.pick')} value={r.id} onChange={(v) => v && setParams({ run: v, filter: null })} options={runs.items.map((x) => ({ id: x.id, label: `${x.ref} · ${fmt.period(x.month)} · ${t(`payroll:runState.${x.state}`)}` }))} testId="pay-run-pick" />
        </div>
      )}
      <Boundary compact />
      {r.scopeLimited && (
        <InlineAlert tone="info" data-testid="pay-run-limited">
          {t('payroll:scopeLimited')}
        </InlineAlert>
      )}
      {r.state === 'approved' && r.approvedByName && (
        <InlineAlert tone="warning" data-testid="pay-run-approved">
          {t('payroll:run.approvedNote', { name: r.approvedByName, date: fmt.date(r.approvedAt!) })}
          {r.instruction && (
            <>
              {' '}
              <Link href={PAYROLL.disbursement(r.id)}>{t('payroll:run.instructionLink', { ref: r.instruction.ref })}</Link>
            </>
          )}
        </InlineAlert>
      )}
      {r.state === 'reversed' && r.reversedByName && <InlineAlert tone="info">{r.reversalReason ? t('payroll:run.reversedNote', { name: r.reversedByName, date: fmt.date(r.reversedAt!), reason: r.reversalReason }) : t('payroll:run.reversedNoteBrief', { name: r.reversedByName, date: fmt.date(r.reversedAt!) })}</InlineAlert>}
      {r.runBlockers.length > 0 && (
        <InlineAlert tone="warning" title={r.stale ? t('payroll:run.staleTitle') : t('payroll:run.blockersTitle')} data-testid="pay-run-blockers">
          <ul className="list-disc space-y-0.5 ps-5">
            {r.runBlockers.map((b) => (
              <li key={b} data-blocker={b}>
                {t(`payroll:runBlocker.${b}`)}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {r.blocked && (
        <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="pay-run-blocked">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`payroll:blocked.${r.blocked}`)}
        </p>
      )}
      <Panel title={t('payroll:run.totals')}>
        <dl className="grid grid-cols-1 gap-3 text-sm @md:grid-cols-3" data-testid="pay-run-totals">
          <div>
            <dt className="text-muted">{t('payroll:money.gross')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={r.totals.gross} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:money.deductions')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={r.totals.deductions} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:money.net')}</dt>
            <dd className="text-lg font-semibold" data-testid="pay-run-net">
              <Money value={r.totals.net} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:run.included')}</dt>
            <dd>{fmt.count(r.totals.included)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:run.excluded')}</dt>
            <dd>{fmt.count(r.totals.excluded)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:run.blocked')}</dt>
            <dd data-testid="pay-run-held">{fmt.count(r.totals.blocked)}</dd>
          </div>
        </dl>
      </Panel>
      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="pay-run-lines" className="min-w-0 space-y-3">
          <h2 id="pay-run-lines" className="text-base font-semibold text-text">
            {t('payroll:run.lines')}
          </h2>
          <FilterPills
            label={t('payroll:run.lines')}
            value={filter}
            onChange={(v) => setParams({ filter: v === 'all' ? null : v })}
            options={FILTERS.map((f) => ({ id: f, label: t(`payroll:run.filter.${f}`), count: r.lines.filter((l) => inFilter(f, l)).length }))}
            testId="pay-run-filter"
          />
          <div className="max-w-sm space-y-1">
            <label htmlFor="pay-run-search" className="block text-sm font-medium text-text">
              {t('payroll:run.search')}
            </label>
            <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
              <Search aria-hidden className="size-4 shrink-0 text-muted" />
              <input id="pay-run-search" type="search" value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder={t('payroll:run.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" data-testid="pay-run-search" />
            </div>
          </div>
          {lines.length === 0 ? (
            <EmptyState title={t('payroll:run.noMatch')} />
          ) : (
            <ul className="space-y-2" data-testid="pay-run-lines">
              {lines.map((l) => (
                <li key={l.employeeId}>
                  <Link
                    href={PAYROLL.breakdown({ run: r.id, employee: l.employeeId })}
                    variant="plain"
                    className="grid grid-cols-1 gap-2 rounded-tile border border-border/70 bg-panel p-3 shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] @2xl:items-center"
                    data-testid="pay-run-line"
                    data-employee={l.employeeId}
                    data-name={l.employeeName}
                    data-state={l.state}
                    data-blockers={l.blockers.join(' ')}
                    data-warnings={l.warnings.join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <bdi className="font-semibold text-text">{l.employeeName}</bdi>
                        {l.own && (
                          <Badge tone="info" icon={UserRound}>
                            {t('payroll:run.own')}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr">{l.code}</bdi> · {role(l.role)} · {t(`payroll:basis.${l.basis ?? 'none'}`)}
                      </span>
                    </span>
                    <span className="min-w-0 space-y-1 text-xs">
                      {l.state === 'excluded' && <span className="block font-medium text-muted">{t('payroll:lineState.excluded')}</span>}
                      {l.blockers.map((b) => (
                        <span key={b} className="flex items-start gap-1 font-medium text-error">
                          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          {t(`payroll:blocker.${b}`)}
                        </span>
                      ))}
                      {l.warnings.map((w) => (
                        <span key={w} className="flex items-start gap-1 text-muted">
                          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          {t(`payroll:warning.${w}`)}
                        </span>
                      ))}
                    </span>
                    <span className="text-sm font-semibold text-text @2xl:text-end">
                      <Money value={l.net} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="min-w-0 space-y-5">
          <Panel title={t('payroll:run.versions')}>
            <ol className="space-y-2 text-sm" data-testid="pay-run-versions">
              {[...r.versions].reverse().map((v) => (
                <li key={v.n} className="border-s-2 border-border ps-3">
                  <span className="font-medium">{t('payroll:run.versionLine', { n: v.n, reason: t(`payroll:version.${v.reason as 'prepared'}`) })}</span>
                  {v.about && (
                    <>
                      {' '}
                      · <bdi>{v.about}</bdi>
                    </>
                  )}
                  <span className="block text-xs text-muted">
                    <bdi>{v.byName}</bdi>
                    {v.net && (
                      <>
                        {' · '}
                        <Money value={v.net} />
                      </>
                    )}
                    {v.included !== undefined && <> · {fmt.count(v.included)}</>}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <section id="policies" aria-labelledby="pay-policies" className="rounded-tile border border-border/70 bg-panel p-4 shadow-card">
            <h2 id="pay-policies" className="text-base font-semibold text-text">
              {t('payroll:policy.title')}
            </h2>
            <p className="mt-1 text-xs text-muted">{t('payroll:policy.intro')}</p>
            <ul className="mt-3 space-y-2 text-sm" data-testid="pay-policies">
              {r.policies.map((p) => (
                <li key={p.key} data-policy={p.key} data-state={p.state}>
                  <span className="font-medium">{t(`payroll:policy.key.${p.key}`)}</span>
                  <span className="block text-xs font-medium text-warning">{t(`payroll:policy.state.${p.state}`)}</span>
                  <span className="block text-xs text-muted">{t(`payroll:policy.help.${p.key}`)}</span>
                </li>
              ))}
            </ul>
          </section>
          <Panel title={t('payroll:run.historyTitle')}>
            <Activity events={r.history} testId="pay-run-history" />
          </Panel>
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`payroll:run.confirm.${confirming}`, { ref: r.ref }) : ''}
        effect={confirming ? t(`payroll:run.effect.${confirming}`) : ''}
        confirmLabel={confirming ? t(`payroll:run.${confirming}`) : ''}
        {...(confirming === 'withdraw' ? { reasonLabel: t('payroll:finalisation.returnReason') } : {})}
        onConfirm={async (reason) => {
          if (!confirming) return;
          try {
            const v = await act.mutateAsync({ method: 'POST', path: `/payroll/runs/${r.id}/${confirming}`, body: confirming === 'withdraw' ? { reason } : {} });
            toast.success(confirming === 'recompute' ? t('payroll:run.recomputed', { version: v.version }) : confirming === 'submit' ? t('payroll:run.submitted', { ref: v.ref }) : t('payroll:run.withdrawn', { ref: v.ref }));
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
    </div>
  );
}
