import type { LedgerPeriodsView, LedgerPeriodView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, ErrorState, Link, PageHeader, Panel, useApiQuery, useKeyedCreate, useT, useToast, type StatusTone } from '@repo/ui';
import { CheckCircle2, Lock, LockOpen, RotateCcw, TriangleAlert, Unlock, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Loading, useSocietyFormat } from '../../society/kit';
import { useProblemToast } from '../../society/hr/hkit';
import { ACC, Blocked, EntityBar, History, LedgerNav, ProvisionalNotice, useEntityParam, WRAP, KEEP } from './lkit';

/**
 * ACC-009 Accounting periods (PARTIAL, Gate E.7 Wave 1). One period record per legal entity and month
 * (the S.1 `FiscalPeriod`; at integration it is shared with the cashbook, BANK-007). A month closes
 * only after it has ended and when no journal dated in it is waiting; a closed month refuses every
 * posting. Reopening is asked by one person and approved by someone else.
 */
const STATE: Record<LedgerPeriodView['state'], [StatusTone, LucideIcon]> = { open: ['success', LockOpen], closing: ['info', Lock], closed: ['neutral', Lock], reopened: ['warning', Unlock] };

export default function PeriodsPage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<LedgerPeriodsView>({ method: 'GET', path: '/ledger/periods', query: entity ? { entity } : {} }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-periods">
      <PageHeader title={t('ledger:periods.title')} description={t('ledger:periods.intro')} />
      <LedgerNav current="periods" entity={entity} />
      <ProvisionalNotice screen="periods" />
      <EntityBar scope={d} onChange={setEntity} />
      <Panel title={t('ledger:periods.listTitle')}>
        <ul className="space-y-3">
          {d.periods.map((p) => (
            <PeriodCard key={p.id} p={p} entity={d.entity.id} />
          ))}
        </ul>
      </Panel>
      <Panel title={t('ledger:periods.policyTitle')}>
        <ul className="list-disc space-y-1 ps-5 text-sm" data-testid="journal-policy">
          <li>{t('ledger:periods.policy.approval')}</li>
          <li>{t('ledger:periods.policy.approver')}</li>
          <li>{t('ledger:periods.policy.poster')}</li>
          <li>{t('ledger:periods.policy.thresholds')}</li>
        </ul>
        <p className="mt-2 text-xs text-muted">{t('ledger:periods.policyVersion', { version: d.policy.version })}</p>
      </Panel>
    </div>
  );
}

function PeriodCard({ p, entity }: { p: LedgerPeriodView; entity: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const keyed = {
    close: useKeyedCreate<LedgerPeriodView>('fpd-close'),
    'reopen-request': useKeyedCreate<LedgerPeriodView>('fpd-reopen'),
    'reopen-approve': useKeyedCreate<LedgerPeriodView>('fpd-reopen-ok'),
    'reopen-reject': useKeyedCreate<LedgerPeriodView>('fpd-reopen-no'),
  };
  const [confirm, setConfirm] = useState<keyof typeof keyed | null>(null);
  const [tone, icon] = STATE[p.state];
  const run = async (step: keyof typeof keyed, reason?: string) => {
    try {
      await keyed[step].send({ method: 'POST', path: `/ledger/periods/${p.id}/${step}`, body: reason ? { reason } : {} });
      toast.success(t(`ledger:periods.done.${step}`, { period: fmt.period(p.period) }));
      return true;
    } catch (e) {
      problem(e);
      return false;
    }
  };
  const needsReason = confirm === 'reopen-request' || confirm === 'reopen-reject';
  return (
    <li className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="period" data-period={p.period} data-state={p.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span>{fmt.period(p.period)}</span>
            <Badge tone={tone} icon={icon} data-testid="period-state" data-state={p.state}>
              {t(`ledger:periodState.${p.state}`)}
            </Badge>
          </p>
          <p className="text-xs text-muted">
            {t('ledger:periods.posted', { count: p.postedJournals })}
            {p.closedByName ? ` · ${t('ledger:periods.closedBy', { name: p.closedByName })}` : ''}
          </p>
          <Link href={ACC.journals({ entity })} className="text-sm">
            {t('ledger:periods.toJournals')}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.actions.close && (
            <Button className={WRAP} variant="primary" icon={Lock} onPress={() => setConfirm('close')} data-testid="period-close">
              {t('ledger:periods.close')}
            </Button>
          )}
          {p.actions.requestReopen && (
            <Button className={WRAP} icon={RotateCcw} onPress={() => setConfirm('reopen-request')} data-testid="period-reopen-request">
              {t('ledger:periods.requestReopen')}
            </Button>
          )}
          {p.actions.approveReopen && (
            <Button className={WRAP} variant="primary" icon={Unlock} onPress={() => setConfirm('reopen-approve')} data-testid="period-reopen-approve">
              {t('ledger:periods.approveReopen')}
            </Button>
          )}
          {p.actions.rejectReopen && (
            <Button className={WRAP} variant="quiet" icon={XCircle} onPress={() => setConfirm('reopen-reject')} data-testid="period-reopen-reject">
              {t('ledger:periods.rejectReopen')}
            </Button>
          )}
        </div>
      </div>
      {p.state !== 'closed' && (
        <ul className="space-y-1" data-testid="period-checks">
          {p.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-sm" data-check={c.key} data-outcome={c.outcome}>
              {c.outcome === 'passed' ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span className="min-w-0 break-words">{t(`ledger:periods.check.${c.key}.${c.outcome}`, { count: c.count })}</span>
            </li>
          ))}
        </ul>
      )}
      {p.reopenRequest && (
        <p className="text-sm" data-testid="period-reopen-pending">
          {t('ledger:periods.reopenPending', { name: p.reopenRequest.byName })} <span className="break-words text-muted">“{p.reopenRequest.reason}”</span>
        </p>
      )}
      {p.blocked && <Blocked>{t(`ledger:periods.blocked.${p.blocked}`)}</Blocked>}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('ledger:periods.historyTitle')}</summary>
        <div className="mt-2">
          <History events={p.history} />
        </div>
      </details>
      <ConfirmDialog
        isOpen={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`ledger:periods.confirm.${confirm}`, { period: fmt.period(p.period) }) : ''}
        effect={confirm ? t(`ledger:periods.effect.${confirm}`) : ''}
        confirmLabel={confirm ? t(`ledger:periods.label.${confirm}`) : ''}
        destructive={confirm === 'close' || confirm === 'reopen-reject'}
        {...(needsReason ? { reasonLabel: t('ledger:journal.reason') } : {})}
        onConfirm={async (reason) => {
          if (!confirm) return;
          const ok = await run(confirm, reason);
          if (ok) setConfirm(null);
          return ok;
        }}
      />
    </li>
  );
}
