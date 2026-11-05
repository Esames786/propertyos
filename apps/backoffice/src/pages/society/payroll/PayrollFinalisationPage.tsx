import type { PayLineWarning, PayPeriodView, PayRunsList, PayRunView } from '@repo/contracts';
import { PAY_LINE_WARNINGS } from '@repo/contracts';
import { Button, ConfirmDialog, EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, PlainCheckbox, PlainTextArea, useApiMutation, useApiQuery, useCan, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { Check, Info, Lock, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { PAYROLL } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { unbroken, useProblemToast } from '../hr/hkit';
import { Activity, Boundary, PayNav, RunBadge, WRAP } from './pkit';

/**
 * PAY-005 payroll finalisation: maker ≠ checker. The approver made no part of the run and has no pay
 * in it, reads its warnings and confirms in words that approval freezes an obligation, not a payment.
 * A run can be returned for changes, or (before its period closes, with no live instruction) its
 * approval reversed. Every decision is in the audit trail.
 */
export default function PayrollFinalisationPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [param] = useQueryParam('run');
  const setParams = useQueryParams();
  const runs = useApiQuery<PayRunsList>({ method: 'GET', path: '/payroll/runs' });
  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />;
  if (!runs.data) return <Loading lines={8} />;
  const ordered = [...runs.data.items].sort((a, b) => Number(b.state === 'submitted') - Number(a.state === 'submitted'));
  const id = param ?? ordered[0]?.id;
  return (
    <div className="@container space-y-5" data-testid="pay-finalisation">
      <PageHeader title={t('payroll:finalisation.title')} description={t('payroll:finalisation.intro')} />
      <PayNav current="finalisation" />
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <Panel title={t('payroll:finalisation.queue')}>
          {ordered.length === 0 ? (
            <EmptyState title={t('payroll:finalisation.none')} />
          ) : (
            <ul className="space-y-2" data-testid="pay-final-queue">
              {ordered.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ run: r.id })}
                    aria-current={r.id === id ? 'true' : undefined}
                    className={`grid w-full gap-1 rounded-tile border p-3 text-start text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus ${r.id === id ? 'border-primary bg-primary-soft' : 'border-border/70 bg-panel hover:bg-raised'}`}
                    data-testid="pay-final-item"
                    data-run={r.id}
                    data-state={r.state}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <bdi dir="ltr" className="font-semibold">
                        {unbroken(r.ref)}
                      </bdi>
                      <RunBadge state={r.state} />
                    </span>
                    <span className="text-muted">
                      {fmt.period(r.month)} · <Money value={r.net} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {id ? <Decision key={id} id={id} /> : null}
      </div>
    </div>
  );
}

function Decision({ id }: { id: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const act = useApiMutation<PayRunView | PayPeriodView>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<'return' | 'reverse' | 'close' | null>(null);
  const can = useCan();
  const q = useApiQuery<PayRunView>({ method: 'GET', path: `/payroll/runs/${id}` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const r = q.data;
  const counts = PAY_LINE_WARNINGS.map((w) => [w, r.lines.filter((l) => l.state === 'included' && l.warnings.includes(w)).length] as [PayLineWarning, number]).filter(([, n]) => n > 0);
  const approve = async () => {
    setError(null);
    try {
      const v = (await act.mutateAsync({ method: 'POST', path: `/payroll/runs/${r.id}/approve`, body: { acknowledge: acknowledged, note } })) as PayRunView;
      toast.success(t('payroll:finalisation.approved', { ref: v.ref }));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="min-w-0 space-y-5" data-testid="pay-final-detail" data-run={r.id} data-state={r.state}>
      <Panel title={t('payroll:finalisation.summary')} description={`${fmt.period(r.month)} · ${t('payroll:run.version', { version: r.version })}`}>
        <div className="space-y-4 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <bdi dir="ltr">{unbroken(r.ref)}</bdi>
            <RunBadge state={r.state} />
          </p>
          <dl className="grid grid-cols-1 gap-3 @md:grid-cols-3">
            <div>
              <dt className="text-muted">{t('payroll:money.gross')}</dt>
              <dd className="font-semibold">
                <Money value={r.totals.gross} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('payroll:money.deductions')}</dt>
              <dd className="font-semibold">
                <Money value={r.totals.deductions} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('payroll:money.net')}</dt>
              <dd className="font-semibold" data-testid="pay-final-net">
                <Money value={r.totals.net} />
              </dd>
            </div>
          </dl>
          <p>
            <span className="text-muted">{t('payroll:finalisation.makers')}: </span>
            <bdi>{r.makers.join(', ')}</bdi>
          </p>
          {r.submittedByName && r.state === 'submitted' && <p className="text-muted">{t('payroll:finalisation.submittedBy', { name: r.submittedByName, date: fmt.date(r.submittedAt!) })}</p>}
          <p>
            <Link href={PAYROLL.run(r.id)}>{t('payroll:dashboard.openRun')}</Link>
          </p>
        </div>
      </Panel>
      <Boundary compact />
      {r.scopeLimited && <InlineAlert tone="info">{t('payroll:scopeLimited')}</InlineAlert>}
      {r.blocked && (
        <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="pay-final-blocked">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`payroll:blocked.${r.blocked}`)}
        </p>
      )}
      {r.stale && <InlineAlert tone="warning">{t('payroll:runBlocker.stale')}</InlineAlert>}
      {r.state === 'submitted' && (
        <Panel title={t('payroll:finalisation.warnings')}>
          <ul className="space-y-1 text-sm" data-testid="pay-final-warnings">
            {counts.length === 0 && <li className="text-muted">{t('payroll:finalisation.noWarnings')}</li>}
            {counts.map(([w, n]) => (
              <li key={w} data-warning={w}>
                {t('payroll:finalisation.warningCount', { label: t(`payroll:warning.${w}`), count: n })}
              </li>
            ))}
            {r.policies
              .filter((p) => p.state === 'not_configured')
              .map((p) => (
                <li key={p.key} className="text-muted">
                  {t(`payroll:policy.key.${p.key}`)} — {t('payroll:policy.state.not_configured')}
                </li>
              ))}
          </ul>
          {r.actions.approve && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <PlainCheckbox isSelected={acknowledged} onChange={setAcknowledged} testId="pay-final-acknowledge">
                {t('payroll:finalisation.acknowledge')}
              </PlainCheckbox>
              <PlainTextArea label={t('payroll:finalisation.note')} value={note} onChange={setNote} rows={2} testId="pay-final-note" />
              {error ? <ProblemAlert error={error} /> : null}
            </div>
          )}
        </Panel>
      )}
      {r.state === 'approved' && <InlineAlert tone="warning">{t('payroll:finalisation.frozen', { version: r.version })}</InlineAlert>}
      <div className="flex flex-wrap gap-2">
        {r.actions.approve && (
          <Button className={WRAP} variant="primary" icon={Check} isPending={act.isPending} onPress={() => void approve()} data-testid="pay-final-approve">
            {t('payroll:finalisation.approve')}
          </Button>
        )}
        {r.actions.return && (
          <Button className={WRAP} icon={Undo2} onPress={() => setConfirming('return')} data-testid="pay-final-return">
            {t('payroll:finalisation.return')}
          </Button>
        )}
        {r.actions.reverse && (
          <Button className={WRAP} variant="quiet" icon={RotateCcw} onPress={() => setConfirming('reverse')} data-testid="pay-final-reverse">
            {t('payroll:finalisation.reverse')}
          </Button>
        )}
        {r.state === 'approved' && r.periodState === 'open' && !r.scopeLimited && can('payroll.approve') && (
          <Button className={WRAP} icon={Lock} onPress={() => setConfirming('close')} data-testid="pay-final-close">
            {t('payroll:finalisation.closePeriod')}
          </Button>
        )}
      </div>
      <Panel title={t('payroll:finalisation.audit')}>
        <Activity events={r.history} testId="pay-final-audit" />
      </Panel>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming === 'close' ? t('payroll:periods.confirm.close', { ref: r.periodRef }) : confirming ? t(`payroll:finalisation.confirm.${confirming}`, { ref: r.ref }) : ''}
        effect={confirming === 'close' ? t('payroll:periods.effect.close') : confirming ? t(`payroll:finalisation.effect.${confirming}`) : ''}
        confirmLabel={confirming === 'close' ? t('payroll:periods.close') : confirming ? t(`payroll:finalisation.${confirming}`) : ''}
        destructive={confirming === 'reverse'}
        {...(confirming === 'return' ? { reasonLabel: t('payroll:finalisation.returnReason') } : confirming === 'reverse' ? { reasonLabel: t('payroll:finalisation.reverseReason') } : {})}
        onConfirm={async (reason) => {
          if (!confirming) return;
          try {
            if (confirming === 'close') {
              await act.mutateAsync({ method: 'POST', path: `/payroll/periods/${r.periodId}/close` });
              toast.success(t('payroll:periods.closed', { ref: r.periodRef }));
            } else {
              await act.mutateAsync({ method: 'POST', path: `/payroll/runs/${r.id}/${confirming}`, body: confirming === 'return' ? { note: reason } : { reason } });
              toast.success(t(`payroll:finalisation.${confirming === 'return' ? 'returned' : 'reversed'}`, { ref: r.ref }));
            }
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
    </div>
  );
}
