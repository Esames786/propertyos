import type { PayDisbursements, PayInstructionView } from '@repo/contracts';
import { Button, ConfirmDialog, EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, useApiMutation, useApiQuery, useQueryParam, useT, useToast } from '@repo/ui';
import { Ban, BadgeCheck, CircleDashed, FilePlus2, Info, Send } from 'lucide-react';
import { useState } from 'react';
import { PAYROLL } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { unbroken, useProblemToast } from '../hr/hkit';
import { AccountText, Activity, InstructionBadge, NotSettled, PayNav, RunBadge, WRAP } from './pkit';

/**
 * PAY-006 disbursement status (PARTIAL). For each approved run: its obligation, its disbursement
 * instruction (prepared → approved → "sent (simulated)", maker ≠ checker) and, separately, the
 * settlement, which stays "Not settled" for every line: no outgoing payment can be verified in this
 * gate, so there is no control that settles, confirms or marks anything paid.
 */
const NEEDS = ['subject', 'account', 'line', 'match', 'reversal'] as const;

export default function PayrollDisbursementPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const [run] = useQueryParam('run');
  const prepare = useApiMutation<PayInstructionView>();
  const q = useApiQuery<PayDisbursements>({ method: 'GET', path: '/payroll/disbursements', ...(run ? { query: { run } } : {}) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-disbursement">
      <PageHeader title={t('payroll:disbursement.title')} description={t('payroll:disbursement.intro')} />
      <PayNav current="disbursement" />
      <InlineAlert tone="warning" title={t('payroll:disbursement.partialTitle')} data-testid="pay-disbursement-partial">
        {t('payroll:disbursement.partial')}
      </InlineAlert>
      {d.runs.length === 0 ? (
        <EmptyState title={t('payroll:disbursement.none')} />
      ) : (
        <ul className="space-y-5" data-testid="pay-disbursement-runs">
          {d.runs.map((r) => (
            <li key={r.runId} className="space-y-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-disbursement-run" data-run={r.runId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">
                    <Link href={PAYROLL.run(r.runId)}>
                      <bdi dir="ltr">{unbroken(r.runRef)}</bdi>
                    </Link>
                    <RunBadge state={r.state} />
                  </h2>
                  <p className="text-sm text-muted">
                    {fmt.period(r.month)} · {t('payroll:periods.payOn', { date: fmt.date(r.payDate) })} · {t('payroll:disbursement.obligation')}: <Money value={r.net} />
                  </p>
                </div>
                {r.canInstruct && (
                  <Button
                    variant="primary"
                    icon={FilePlus2}
                    isPending={prepare.isPending}
                    onPress={async () => {
                      try {
                        const v = await prepare.mutateAsync({ method: 'POST', path: `/payroll/runs/${r.runId}/instructions` });
                        toast.success(t('payroll:disbursement.prepared', { ref: v.ref }));
                      } catch (e) {
                        problem(e);
                      }
                    }}
                    data-testid="pay-instruction-prepare"
                  >
                    {t('payroll:disbursement.prepare')}
                  </Button>
                )}
              </div>
              {r.blocked === 'other_sites' && (
                <p className="flex items-start gap-1.5 text-sm text-muted">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('payroll:blocked.other_sites')}
                </p>
              )}
              {r.instruction && <Instruction ins={r.instruction} />}
            </li>
          ))}
        </ul>
      )}
      {d.cancelled.length > 0 && (
        <Panel title={t('payroll:disbursement.earlier')}>
          <ul className="space-y-2 text-sm" data-testid="pay-instructions-cancelled">
            {d.cancelled.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <bdi dir="ltr" className="font-medium">
                  {c.ref}
                </bdi>
                <InstructionBadge state={c.state} />
                {c.cancelledByName && <span className="text-muted">{t('payroll:disbursement.who.cancelled', { name: c.cancelledByName, reason: c.cancelReason ?? '' })}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={t('payroll:disbursement.needsTitle')}>
        <ul className="space-y-2 text-sm" data-testid="pay-settlement-needs">
          {NEEDS.map((n) => (
            <li key={n} className="flex items-start gap-2">
              <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="min-w-0 break-words">{t(`payroll:disbursement.needs.${n}`)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Instruction({ ins }: { ins: PayInstructionView }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const act = useApiMutation<PayInstructionView>();
  const [confirming, setConfirming] = useState<'approve' | 'send' | 'cancel' | null>(null);
  const path = { approve: 'approve', send: 'sent', cancel: 'cancel' } as const;
  return (
    <section aria-labelledby={`ins-${ins.id}`} className="space-y-3 rounded-tile border border-border p-3" data-testid="pay-instruction" data-ref={ins.ref} data-state={ins.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 id={`ins-${ins.id}`} className="flex flex-wrap items-center gap-2 font-semibold text-text">
            <bdi dir="ltr">{unbroken(ins.ref)}</bdi>
            <InstructionBadge state={ins.state} />
          </h3>
          <p className="text-sm">
            <span className="text-muted">{t('payroll:disbursement.total')}: </span>
            <span className="font-semibold" data-testid="pay-instruction-total">
              <Money value={ins.total} />
            </span>
          </p>
          <ul className="text-xs text-muted">
            <li>{t('payroll:disbursement.who.prepared', { name: ins.preparedByName })}</li>
            {ins.approvedByName && <li>{t('payroll:disbursement.who.approved', { name: ins.approvedByName })}</li>}
            {ins.sentByName && <li>{t('payroll:disbursement.who.sent', { name: ins.sentByName })}</li>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {ins.actions.approve && (
            <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setConfirming('approve')} data-testid="pay-instruction-approve">
              {t('payroll:disbursement.approve')}
            </Button>
          )}
          {ins.actions.send && (
            <Button className={WRAP} variant="primary" icon={Send} onPress={() => setConfirming('send')} data-testid="pay-instruction-send">
              {t('payroll:disbursement.send')}
            </Button>
          )}
          {ins.actions.cancel && (
            <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setConfirming('cancel')} data-testid="pay-instruction-cancel">
              {t('payroll:disbursement.cancel')}
            </Button>
          )}
        </div>
      </div>
      {ins.blocked && (
        <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="pay-instruction-blocked">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`payroll:blocked.${ins.blocked}`)}
        </p>
      )}
      {ins.scopeLimited && <p className="text-sm text-muted">{t('payroll:scopeLimited')}</p>}
      <div>
        <h4 className="mb-1 text-sm font-semibold">{t('payroll:disbursement.lines')}</h4>
        <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid="pay-instruction-lines">
          {ins.lines.map((l) => (
            <li key={l.employeeId} className="grid grid-cols-1 gap-1 p-2.5 text-sm @2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_auto_auto] @2xl:items-center @2xl:gap-3" data-testid="pay-instruction-line" data-employee={l.employeeId}>
              <bdi className="font-medium">{l.employeeName}</bdi>
              <span className="text-xs text-muted">
                {t(`payroll:method.${l.method}`)}
                {l.account && (
                  <>
                    {' · '}
                    <AccountText last4={l.account} verified />
                  </>
                )}
              </span>
              <Money value={l.amount} />
              <NotSettled />
            </li>
          ))}
        </ul>
      </div>
      {ins.held.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">{t('payroll:disbursement.held')}</h4>
          <ul className="space-y-1 text-sm" data-testid="pay-instruction-held">
            {ins.held.map((h) => (
              <li key={h.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-dashed border-border px-3 py-2" data-reason={h.reason}>
                <span>
                  <bdi className="font-medium">{h.employeeName}</bdi> · <span className="text-muted">{t(`payroll:disbursement.heldReason.${h.reason}`)}</span>
                </span>
                <Money value={h.amount} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('payroll:run.historyTitle')}</summary>
        <div className="mt-2">
          <Activity events={ins.history} />
        </div>
      </details>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`payroll:disbursement.confirm.${confirming}`, { ref: ins.ref }) : ''}
        effect={confirming ? t(`payroll:disbursement.effect.${confirming}`) : ''}
        confirmLabel={confirming ? t(`payroll:disbursement.${confirming}`) : ''}
        destructive={confirming === 'cancel'}
        {...(confirming === 'cancel' ? { reasonLabel: t('payroll:disbursement.cancelReason') } : {})}
        onConfirm={async (reason) => {
          if (!confirming) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/payroll/instructions/${ins.id}/${path[confirming]}`, body: confirming === 'cancel' ? { reason } : {} });
            toast.success(t(confirming === 'approve' ? 'payroll:disbursement.approvedToast' : confirming === 'send' ? 'payroll:disbursement.sent' : 'payroll:disbursement.cancelled', { ref: ins.ref }));
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
    </section>
  );
}
