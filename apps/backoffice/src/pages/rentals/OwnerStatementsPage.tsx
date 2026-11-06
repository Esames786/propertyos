import type { OwnerStatementsList, OwnerStatementView, StatementLineView } from '@repo/contracts';
import { Button, ConfirmDialog, EmptyState, ErrorState, FilterPills, InlineAlert, KeyValueList, Link, Money, PageHeader, Panel, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast, DateTime } from '@repo/ui';
import { FileCheck2, Printer } from 'lucide-react';
import { useState } from 'react';
import { RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { unbroken, useProblemToast } from '../society/hr/hkit';
import { Activity, D33Note, ModelBadge, NotSettled, PAYOUTS_TARGET, RENT_VIEW, RentNav, ROLL_TARGET, StatementBadge, WRAP } from './rkit';

/**
 * RNT-005 owner statements. One owner and one month: sourced lines (each opens its source), worked
 * out on **settled money only**. Approved rent demands, approved owner expenses, deposits held for
 * tenants and payout instructions are shown apart as memo lines and never reach the closing payable.
 * Issuing freezes the statement as an immutable snapshot the landlord can open in the resident app.
 */
export default function OwnerStatementsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const set = useQueryParams();
  const [ownerParam] = useQueryParam('owner');
  const [periodParam] = useQueryParam('period');
  const list = useApiQuery<OwnerStatementsList>({ method: 'GET', path: '/rentals/owner-statements' });
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loading lines={8} />;
  const l = list.data;
  const owner = l.owners.find((o) => o.id === ownerParam)?.id ?? l.owners[0]?.id;
  const period = periodParam && l.periods.includes(periodParam) ? periodParam : l.periods[0];
  return (
    <div className="@container space-y-5" data-testid="rent-statements">
      <PageHeader title={t('rentals:statements.title')} description={t('rentals:statements.intro')} />
      <RentNav current="statements" />
      {!owner || !period ? (
        <EmptyState title={t('rentals:statements.none')} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <SelectControl
                label={t('rentals:statements.owner')}
                value={owner}
                onChange={(v) => v && set({ owner: v })}
                options={l.owners.map((o) => ({ id: o.id, label: `${o.name} · ${o.sites.join(', ')}` }))}
                testId="statement-owner"
              />
            </div>
            <FilterPills label={t('rentals:statements.period')} options={l.periods.map((p) => ({ id: p, label: fmt.period(p) }))} value={period} onChange={(v) => set({ period: v })} testId="statement-period" />
          </div>
          <Statement key={`${owner}-${period}`} owner={owner} period={period} />
        </>
      )}
    </div>
  );
}

function sourceHref(line: StatementLineView): string | null {
  if (line.source.kind === 'rent_roll') return RENTALS.rentRoll(line.source.id);
  if (line.source.kind === 'lease' && line.leaseId) return RENTALS.lease(line.leaseId, line.kind === 'deposit_held' ? 'deposit' : undefined);
  if (line.source.kind === 'payout') return RENTALS.payouts();
  return null;
}

function Statement({ owner, period }: { owner: string; period: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const { allows } = useSession();
  const [issuing, setIssuing] = useState(false);
  const issue = useApiMutation<OwnerStatementView>();
  const q = useApiQuery<OwnerStatementView>({ method: 'GET', path: '/rentals/owner-statements/statement', query: { owner, period } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const s = q.data;
  const can = (href: string | null, line: StatementLineView) =>
    href && ((line.source.kind === 'rent_roll' && allows(ROLL_TARGET)) || (line.source.kind === 'lease' && allows(RENT_VIEW)) || (line.source.kind === 'payout' && allows(PAYOUTS_TARGET))) ? href : null;
  const settled = s.lines.filter((x) => x.basis === 'settled');
  const memo = s.lines.filter((x) => x.basis === 'memo');
  return (
    <div className="space-y-5 print:space-y-3" data-testid="statement" data-owner={s.owner.id} data-period={s.period} data-state={s.state}>
      <Panel
        title={t('rentals:statements.heading', { name: s.owner.name, month: fmt.period(s.period) })}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {s.actions.issue && (
              <Button className={WRAP} variant="primary" icon={FileCheck2} onPress={() => setIssuing(true)} data-testid="statement-issue">
                {t('rentals:statements.issue')}
              </Button>
            )}
            <Button className={WRAP} variant="quiet" icon={Printer} onPress={() => window.print()} data-testid="statement-print">
              {t('rentals:statements.print')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <StatementBadge state={s.state} />
            <ModelBadge model={s.model} />
            {s.ref && (
              <bdi dir="ltr" className="font-medium" data-testid="statement-ref">
                {unbroken(s.ref)}
              </bdi>
            )}
          </p>
          <p className="text-muted">
            {t('rentals:statements.agreement', { ref: unbroken(s.agreement.ref), n: s.agreement.version, fee: s.agreement.feePct })}
            {s.issuedAt && (
              <>
                {' · '}
                {t('rentals:statements.issuedBy', { name: s.issuedByName ?? '' })} <DateTime value={s.issuedAt} style="dateTime" />
              </>
            )}
          </p>
          <p className="text-xs text-muted">{t('rentals:statements.sample')}</p>
          <D33Note />
        </div>
      </Panel>
      {s.scopeLimited && (
        <InlineAlert tone="info" data-testid="statement-limited">
          {t('rentals:statements.limited')}
        </InlineAlert>
      )}
      {s.state === 'issued' && (
        <InlineAlert tone="info" data-testid="statement-frozen">
          {t('rentals:statements.frozen')}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
        <Panel title={t('rentals:statements.settledTitle')} description={t(s.model === 'principal' ? 'rentals:statements.settledPrincipal' : 'rentals:statements.settledHint')}>
          <div data-testid="statement-totals">
            <KeyValueList
              items={[
                { label: t('rentals:statements.opening'), value: <Money value={s.totals.opening} /> },
                { label: t('rentals:statements.settledRent'), value: <Money value={s.totals.settledRent} /> },
                { label: t('rentals:statements.fees'), value: <Money value={s.totals.fees} /> },
                { label: t('rentals:statements.settledExpenses'), value: <Money value={s.totals.settledExpenses} /> },
                { label: t('rentals:statements.settledPayouts'), value: <Money value={s.totals.settledPayouts} /> },
                {
                  label: t('rentals:statements.closing'),
                  value: (
                    <span className="font-semibold" data-testid="statement-closing" data-amount={s.totals.closing.amount}>
                      <Money value={s.totals.closing} />
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </Panel>
        <Panel title={t('rentals:statements.memoTitle')} description={t('rentals:statements.memoHint')}>
          <div data-testid="statement-memo">
            <KeyValueList
              items={[
                { label: t('rentals:statements.rentDue'), value: <Money value={s.memo.rentDue} /> },
                { label: t('rentals:statements.expensesApproved'), value: <Money value={s.memo.expensesApproved} /> },
                { label: t('rentals:statements.depositsAgreed'), value: <Money value={s.memo.depositsAgreed} /> },
                { label: t('rentals:statements.depositsHeld'), value: <Money value={s.memo.depositsHeld} /> },
                { label: t('rentals:statements.pendingPayouts'), value: <Money value={s.memo.pendingPayouts} /> },
              ]}
            />
          </div>
        </Panel>
      </div>
      {[
        ['settled', settled],
        ['memo', memo],
      ].map(([basis, lines]) => (
        <Panel key={basis as string} title={t(basis === 'settled' ? 'rentals:statements.settledLines' : 'rentals:statements.memoLines')}>
          {(lines as StatementLineView[]).length === 0 ? (
            <p className="text-sm text-muted" data-testid={`statement-${basis as string}-none`}>
              {t(basis === 'settled' ? 'rentals:statements.noSettled' : 'rentals:statements.noMemo')}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid={`statement-${basis as string}-lines`}>
              {(lines as StatementLineView[]).map((x, i) => {
                const href = can(sourceHref(x), x);
                return (
                  <li key={`${x.source.ref}-${x.kind}-${i}`} className="grid grid-cols-1 gap-1 p-2.5 text-sm @2xl:grid-cols-[minmax(0,1.6fr)_auto_auto] @2xl:items-center @2xl:gap-3" data-testid="statement-line" data-kind={x.kind} data-basis={x.basis}>
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{t(`rentals:statements.kind.${x.kind}`)}</span>
                      {x.unitCode && (
                        <>
                          {' · '}
                          <bdi>{unbroken(x.unitCode)}</bdi>
                        </>
                      )}
                      {x.siteName && (
                        <>
                          {' · '}
                          <bdi>{x.siteName}</bdi>
                        </>
                      )}
                      {x.text && <span className="block text-xs text-muted">“{unbroken(x.text)}”</span>}
                      <span className="block text-xs text-muted">
                        {t('rentals:statements.source')}:{' '}
                        {x.source.kind === 'rent_roll' && (
                          <>
                            {href ? <Link href={href}>{t('rentals:statements.sourceRoll', { month: fmt.period(x.source.id) })}</Link> : t('rentals:statements.sourceRoll', { month: fmt.period(x.source.id) })}
                            {' · '}
                          </>
                        )}
                        {x.source.kind === 'rent_roll' && x.leaseId ? (
                          allows(RENT_VIEW) ? (
                            <Link href={RENTALS.lease(x.leaseId)}>
                              <bdi dir="ltr">{unbroken(x.leaseRef ?? '')}</bdi>
                            </Link>
                          ) : (
                            <bdi dir="ltr">{unbroken(x.leaseRef ?? '')}</bdi>
                          )
                        ) : href ? (
                          <Link href={href}>
                            <bdi dir="ltr">{unbroken(x.leaseRef ?? x.source.ref)}</bdi>
                          </Link>
                        ) : (
                          <bdi dir="ltr">{unbroken(x.leaseRef ?? x.source.ref)}</bdi>
                        )}
                      </span>
                    </span>
                    <span className="text-xs text-muted">{t(`rentals:statements.state.${x.state}`)}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Money value={x.amount} />
                      {x.basis === 'memo' && x.kind !== 'payout_pending' && <NotSettled testId="statement-line-settlement" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ))}
      {s.state === 'issued' && (
        <Panel title={t('rentals:statements.historyTitle')}>
          <Activity events={s.history} testId="statement-history" />
        </Panel>
      )}
      <ConfirmDialog
        isOpen={issuing}
        onOpenChange={setIssuing}
        title={t('rentals:statements.issueTitle', { name: s.owner.name, month: fmt.period(s.period) })}
        effect={t('rentals:statements.issueEffect')}
        confirmLabel={t('rentals:statements.issue')}
        onConfirm={async () => {
          try {
            const v = await issue.mutateAsync({ method: 'POST', path: '/rentals/owner-statements/issue', body: { ownerId: s.owner.id, period: s.period } });
            toast.success(t('rentals:statements.issued', { ref: v.ref ?? '' }));
          } catch (e) {
            problem(e);
          }
          setIssuing(false);
        }}
      />
    </div>
  );
}
