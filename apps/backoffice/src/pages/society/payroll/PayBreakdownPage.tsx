import type { PayBreakdown } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, PlainTextArea, PlainTextField, UrlTabs, useApiMutation, useApiQuery, useQueryParam, useT, useToast } from '@repo/ui';
import { CalendarCheck, CircleDashed, Gift, Info, Minus, Plus, TriangleAlert, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { PAYROLL } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { fieldErrorKey, unbroken, useProblemToast, useRole } from '../hr/hkit';
import { AccountText, Activity, PayNav, RunBadge, WRAP } from './pkit';

/**
 * PAY-004 one person's pay in one run: earnings (prorated by the labelled demo rule), bonuses, the
 * deductions that would apply (none is applied: statutory ones are placeholders, advance and loan
 * instalments are held) and net pay, which is owed, not paid. The preparer confirms a daily wage's
 * days, adds or removes a bonus, or excludes the person with a reason; never on their own pay.
 * The account is masked to its last four characters.
 */
export default function PayBreakdownPage() {
  const { t } = useT();
  const [run] = useQueryParam('run');
  const [employee] = useQueryParam('employee');
  const path = employee ? (run ? `/payroll/runs/${run}/lines/${employee}` : `/payroll/employees/${employee}/latest`) : null;
  const q = useApiQuery<PayBreakdown>(path ? { method: 'GET', path } : null);
  if (!path)
    return (
      <div className="space-y-5">
        <PageHeader title={t('payroll:breakdown.title')} />
        <PayNav current="run" />
        <EmptyState title={t('payroll:breakdown.notFound')} />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  return <Breakdown b={q.data} />;
}

function Breakdown({ b }: { b: PayBreakdown }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const role = useRole();
  const toast = useToast();
  const problem = useProblemToast();
  const act = useApiMutation<PayBreakdown>();
  const [drawer, setDrawer] = useState<'days' | 'bonus' | null>(null);
  const [confirming, setConfirming] = useState<{ kind: 'exclude' | 'include' | 'removeBonus'; bonusId?: string; label?: string } | null>(null);
  const base = `/payroll/runs/${b.run.id}/lines/${b.employee.id}`;
  const a = b.actions;
  const allowanceRows = b.earnings.filter((e) => e.kind === 'allowance');
  const baseRow = b.earnings.find((e) => e.kind === 'base');
  return (
    <div className="@container space-y-5" data-testid="pay-breakdown" data-employee={b.employee.id} data-state={b.state}>
      <PageHeader
        title={b.employee.name}
        breadcrumbs={[
          { label: t('payroll:run.title'), href: PAYROLL.run(b.run.id) },
          { label: t('payroll:breakdown.title'), href: PAYROLL.breakdown({ run: b.run.id, employee: b.employee.id }) },
        ]}
        badge={<RunBadge state={b.run.state} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi dir="ltr">{b.employee.code}</bdi> · {role(b.employee.role)} · {t(`payroll:basis.${b.basis ?? 'none'}`)} ·{' '}
            <Link href={PAYROLL.run(b.run.id)}>
              <bdi dir="ltr">{unbroken(b.run.ref)}</bdi>
            </Link>{' '}
            · {fmt.period(b.run.month)}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {a.confirmDays && (
              <Button className={WRAP} variant="primary" icon={CalendarCheck} onPress={() => setDrawer('days')} data-testid="pay-days-open">
                {t('payroll:breakdown.confirmDays')}
              </Button>
            )}
            {a.addBonus && (
              <Button className={WRAP} icon={Gift} onPress={() => setDrawer('bonus')} data-testid="pay-bonus-open">
                {t('payroll:breakdown.addBonus')}
              </Button>
            )}
            {a.exclude && (
              <Button className={WRAP} variant="quiet" icon={UserMinus} onPress={() => setConfirming({ kind: 'exclude' })} data-testid="pay-line-exclude">
                {t('payroll:breakdown.exclude')}
              </Button>
            )}
            {a.include && (
              <Button className={WRAP} icon={UserPlus} onPress={() => setConfirming({ kind: 'include' })} data-testid="pay-line-include">
                {t('payroll:breakdown.include')}
              </Button>
            )}
          </div>
        }
      />
      <PayNav current="run" />
      {b.own && (
        <InlineAlert tone="info" data-testid="pay-breakdown-own">
          {t('payroll:breakdown.own')}
        </InlineAlert>
      )}
      {b.exclusion && (
        <InlineAlert tone="warning" title={t('payroll:lineState.excluded')} data-testid="pay-breakdown-excluded">
          {t('payroll:breakdown.excludedNote', { name: b.exclusion.byName, reason: b.exclusion.reason })}
        </InlineAlert>
      )}
      {b.run.stale && <InlineAlert tone="warning">{t('payroll:runBlocker.stale')}</InlineAlert>}
      {b.blocked && !b.own && (
        <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="pay-breakdown-blocked">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`payroll:blocked.${b.blocked}`)}
        </p>
      )}
      {(b.blockers.length > 0 || b.warnings.length > 0) && (
        <ul className="space-y-2" data-testid="pay-breakdown-flags">
          {b.blockers.map((x) => (
            <li key={x} className="rounded-tile border border-error/40 bg-error-soft/40 p-3 text-sm" data-blocker={x}>
              <span className="flex items-center gap-1.5 font-semibold text-error">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                {t(`payroll:blocker.${x}`)}
              </span>
              <span className="mt-1 block text-text">{t(`payroll:blockerHelp.${x}`)}</span>
            </li>
          ))}
          {b.warnings.map((x) => (
            <li key={x} className="rounded-tile border border-warning/40 bg-warning-soft/30 p-3 text-sm" data-warning={x}>
              <span className="flex items-center gap-1.5 font-semibold text-text">
                <Info aria-hidden className="size-4 shrink-0" />
                {t(`payroll:warning.${x}`)}
              </span>
              <span className="mt-1 block text-muted">{t(`payroll:warningHelp.${x}`)}</span>
            </li>
          ))}
        </ul>
      )}
      <Panel>
        <dl className="grid grid-cols-1 gap-3 text-sm @md:grid-cols-3" data-testid="pay-breakdown-summary">
          <div>
            <dt className="text-muted">{t('payroll:money.gross')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={b.gross} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:money.deductions')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={b.deductionsTotal} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:money.net')}</dt>
            <dd className="text-lg font-semibold" data-testid="pay-breakdown-net">
              <Money value={b.net} />
            </dd>
          </div>
        </dl>
      </Panel>
      <UrlTabs
        label={t('payroll:breakdown.tabs.label')}
        items={(['earnings', 'bonuses', 'deductions', 'net'] as const).map((id) => ({ id, label: t(`payroll:breakdown.tabs.${id}`) }))}
        phoneLimit={4}
      >
        {(tab) => (
          <div className="pt-4" data-testid={`pay-breakdown-tab-${tab}`}>
            {tab === 'earnings' && (
              <div className="space-y-3 text-sm">
                <p className="text-muted">{t('payroll:breakdown.employed', { days: b.employedDays, of: b.periodDays })}</p>
                {b.days && (
                  <div className="space-y-1 rounded-tile border border-border/70 p-3" data-testid="pay-breakdown-days">
                    <p>{b.days.recordedFrom ? t('payroll:breakdown.recorded', { days: b.days.recorded, from: fmt.date(b.days.recordedFrom) }) : t('payroll:breakdown.recordedNone', { days: b.days.recorded })}</p>
                    {b.days.confirmed && <p className="font-medium">{t('payroll:breakdown.confirmed', { days: b.days.confirmed.days, name: b.days.confirmed.byName, reason: b.days.confirmed.reason })}</p>}
                  </div>
                )}
                {b.earnings.length === 0 ? (
                  <EmptyState title={t('payroll:basis.none')} />
                ) : (
                  <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid="pay-earnings">
                    {baseRow && (
                      <li className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                        <span className="min-w-0">
                          <span className="block font-medium">{t('payroll:breakdown.base')}</span>
                          <span className="block text-xs text-muted">
                            {b.basis === 'daily' ? (
                              <>
                                {t('payroll:breakdown.dailyRate', { rate: fmt.money(baseRow.rate) })} · {t('payroll:breakdown.daysWorked', { counted: baseRow.days?.counted ?? 0 })}
                              </>
                            ) : (
                              <>
                                {t('payroll:breakdown.rate')} {fmt.money(baseRow.rate)} · {t('payroll:breakdown.daysCounted', { counted: baseRow.days?.counted ?? 0, of: baseRow.days?.of ?? 0 })}
                              </>
                            )}
                          </span>
                        </span>
                        <Money value={baseRow.amount} />
                      </li>
                    )}
                    {allowanceRows.map((e) => (
                      <li key={e.allowance} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                        <span className="min-w-0">
                          <span className="block font-medium">{t(`payroll:allowance.${e.allowance!}`)}</span>
                          <span className="block text-xs text-muted">
                            {t('payroll:breakdown.rate')} {fmt.money(e.rate)} · {t('payroll:breakdown.daysCounted', { counted: e.days?.counted ?? 0, of: e.days?.of ?? 0 })}
                          </span>
                        </span>
                        <Money value={e.amount} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 'bonuses' && (
              <div className="space-y-3 text-sm">
                {b.bonuses.length === 0 ? (
                  <EmptyState title={t('payroll:breakdown.noBonuses')} />
                ) : (
                  <ul className="space-y-2" data-testid="pay-bonuses">
                    {b.bonuses.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 rounded-tile border border-border/70 p-3" data-testid="pay-bonus">
                        <span className="min-w-0">
                          <span className="block font-medium break-words">{x.label}</span>
                          <span className="block text-xs break-words text-muted">“{x.reason}”</span>
                          <span className="block text-xs text-muted">
                            {t('payroll:breakdown.bonusBy', { name: x.addedByName })}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Money value={x.amount} />
                          {a.removeBonus && (
                            <Button className={WRAP} size="sm" variant="quiet" icon={Minus} onPress={() => setConfirming({ kind: 'removeBonus', bonusId: x.id, label: x.label })} data-testid="pay-bonus-remove">
                              {t('payroll:breakdown.removeBonus')}
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 'deductions' && (
              <div className="space-y-4 text-sm">
                <section aria-labelledby="pay-ded-applied" className="space-y-1">
                  <h3 id="pay-ded-applied" className="font-semibold">
                    {t('payroll:breakdown.applied')}
                  </h3>
                  <p className="text-muted" data-testid="pay-deductions-applied">
                    {t('payroll:breakdown.appliedNone')}
                  </p>
                </section>
                <section aria-labelledby="pay-ded-held" className="space-y-1">
                  <h3 id="pay-ded-held" className="font-semibold">
                    {t('payroll:breakdown.held')}
                  </h3>
                  {b.deductions.held.length === 0 ? (
                    <p className="text-muted">{t('payroll:breakdown.heldNone')}</p>
                  ) : (
                    <ul className="space-y-2" data-testid="pay-deductions-held">
                      {b.deductions.held.map((h) => (
                        <li key={h.advanceId} className="flex flex-wrap items-start justify-between gap-2 rounded-tile border border-border/70 p-3">
                          <span className="min-w-0">
                            <span className="block font-medium">
                              <bdi dir="ltr">{t('payroll:breakdown.heldLine', { ref: h.ref, n: h.instalment, of: h.of })}</bdi>
                            </span>
                            <span className="block text-xs text-muted">{t('payroll:warningHelp.advance_held')}</span>
                          </span>
                          <span className="flex items-center gap-2 text-muted">
                            <Money value={h.amount} />
                            <Badge tone="neutral" icon={CircleDashed}>
                              {t('payroll:warning.advance_held')}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="pay-ded-statutory" className="space-y-1">
                  <h3 id="pay-ded-statutory" className="font-semibold">
                    {t('payroll:breakdown.statutoryTitle')}
                  </h3>
                  <ul className="space-y-1" data-testid="pay-deductions-statutory">
                    {b.deductions.statutory.map((s) => (
                      <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border border-dashed border-border px-3 py-2">
                        <span>{t(`payroll:statutory.${s.key}`)}</span>
                        <span className="text-xs font-medium text-warning">{t('payroll:statutory.placeholder')}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                {(b.deductions.unpaidLeaveDays > 0 || b.deductions.absences > 0) && (
                  <ul className="space-y-1 text-muted">
                    {b.deductions.unpaidLeaveDays > 0 && <li>{t('payroll:breakdown.unpaidLeave', { count: b.deductions.unpaidLeaveDays })}</li>}
                    {b.deductions.absences > 0 && <li>{t('payroll:breakdown.absences', { count: b.deductions.absences })}</li>}
                  </ul>
                )}
              </div>
            )}
            {tab === 'net' && (
              <div className="space-y-3 text-sm">
                <p className="text-2xl font-semibold" data-testid="pay-net-amount">
                  <Money value={b.net} />
                </p>
                <p className="text-muted">{t('payroll:breakdown.netExplain')}</p>
                <p>
                  <span className="text-muted">{t('payroll:breakdown.payment')}: </span>
                  {t(`payroll:method.${b.payment.method ?? 'none'}`)}
                  {b.payment.account && (
                    <>
                      {' · '}
                      <AccountText last4={b.payment.account} verified={!!b.payment.accountVerified} />
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </UrlTabs>
      {b.otherRuns.length > 0 && (
        <Panel title={t('payroll:breakdown.otherRuns')}>
          <ul className="space-y-1 text-sm">
            {b.otherRuns.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <Link href={PAYROLL.breakdown({ run: o.id, employee: b.employee.id })}>
                  <bdi dir="ltr">{o.ref}</bdi>
                </Link>
                <span className="text-muted">{fmt.period(o.month)}</span>
                <RunBadge state={o.state} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={t('payroll:breakdown.historyTitle')}>{b.history.length === 0 ? <p className="text-sm text-muted">—</p> : <Activity events={b.history} testId="pay-line-history" />}</Panel>
      {a.confirmDays && <DaysDrawer key={`d-${String(drawer === 'days')}`} open={drawer === 'days'} onClose={() => setDrawer(null)} b={b} path={`${base}/days`} />}
      {a.addBonus && <BonusDrawer key={`b-${String(drawer === 'bonus')}`} open={drawer === 'bonus'} onClose={() => setDrawer(null)} path={`${base}/bonuses`} />}
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`payroll:breakdown.confirm.${confirming.kind}`, { name: b.employee.name, ref: b.run.ref, label: confirming.label ?? '' }) : ''}
        effect={confirming ? t(`payroll:breakdown.effect.${confirming.kind}`) : ''}
        confirmLabel={confirming?.kind === 'exclude' ? t('payroll:breakdown.exclude') : confirming?.kind === 'include' ? t('payroll:breakdown.include') : t('payroll:breakdown.removeBonus')}
        destructive={confirming?.kind !== 'include'}
        {...(confirming?.kind === 'exclude' ? { reasonLabel: t('payroll:breakdown.bonusReason') } : {})}
        onConfirm={async (reason) => {
          if (!confirming) return;
          try {
            const path = confirming.kind === 'removeBonus' ? `${base}/bonuses/${confirming.bonusId}/remove` : `${base}/${confirming.kind}`;
            const v = await act.mutateAsync({ method: 'POST', path, body: confirming.kind === 'exclude' ? { reason } : {} });
            toast.success(confirming.kind === 'exclude' ? t('payroll:breakdown.excluded', { name: b.employee.name, version: v.run.version }) : confirming.kind === 'include' ? t('payroll:breakdown.includedToast', { name: b.employee.name, version: v.run.version }) : t('payroll:breakdown.bonusRemoved', { version: v.run.version }));
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
    </div>
  );
}

function DaysDrawer({ open, onClose, b, path }: { open: boolean; onClose: () => void; b: PayBreakdown; path: string }) {
  const { t } = useT();
  const toast = useToast();
  const [days, setDays] = useState(b.days?.confirmed ? String(b.days.confirmed.days) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<PayBreakdown>();
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('payroll:breakdown.confirmDays')}
      subtitle={b.employee.name}
      testId="pay-days-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                const v = await save.mutateAsync({ method: 'POST', path, body: { days: days.trim(), reason } });
                toast.success(t('payroll:breakdown.daysSaved', { version: v.run.version }));
                onClose();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="pay-days-save"
          >
            {t('payroll:breakdown.confirmSave')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <PlainTextField label={t('payroll:breakdown.daysLabel')} value={days} onChange={setDays} inputMode="numeric" dir="ltr" description={t('payroll:breakdown.daysHint', { max: b.employedDays })} testId="pay-days-input" {...(fieldErrorKey(error, 'days') ? { errorKey: fieldErrorKey(error, 'days')! } : {})} />
        <PlainTextArea label={t('payroll:breakdown.reasonLabel')} value={reason} onChange={setReason} rows={3} testId="pay-days-reason" {...(fieldErrorKey(error, 'reason') ? { errorKey: fieldErrorKey(error, 'reason')! } : {})} />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function BonusDrawer({ open, onClose, path }: { open: boolean; onClose: () => void; path: string }) {
  const { t } = useT();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<PayBreakdown>();
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('payroll:breakdown.addBonus')}
      testId="pay-bonus-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                const v = await save.mutateAsync({ method: 'POST', path, body: { label, amount, reason } });
                toast.success(t('payroll:breakdown.bonusAdded', { version: v.run.version }));
                onClose();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="pay-bonus-save"
          >
            {t('payroll:breakdown.bonusSave')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <PlainTextField label={t('payroll:breakdown.bonusLabel')} value={label} onChange={setLabel} testId="pay-bonus-label" {...(fieldErrorKey(error, 'label') ? { errorKey: fieldErrorKey(error, 'label')! } : {})} />
        <PlainTextField label={t('payroll:breakdown.bonusAmount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" testId="pay-bonus-amount" {...(fieldErrorKey(error, 'amount') ? { errorKey: fieldErrorKey(error, 'amount')! } : {})} />
        <PlainTextArea label={t('payroll:breakdown.bonusReason')} value={reason} onChange={setReason} rows={3} testId="pay-bonus-reason" {...(fieldErrorKey(error, 'reason') ? { errorKey: fieldErrorKey(error, 'reason')! } : {})} />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
