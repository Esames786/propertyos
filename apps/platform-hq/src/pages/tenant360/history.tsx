import type { ContractHistory, ContractVersionEntry, TenantDetail } from '@repo/contracts';
import { Badge, buttonClass, ConfirmDialog, dynamicT, ErrorState, Link, Panel, Skeleton, useAnnounce, useApiMutation, useApiQuery, useCan, useT, useToast, type StatusTone } from '@repo/ui';
import { FilePen, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@repo/ui';
import { ChangeList, ProblemSummary } from '../../components/config';
import { Expandable } from '../../components/Expandable';
import { useHqFormat } from '../../lib/format';
import { moduleName } from '../../lib/labels';
import { HQ } from '../../nav.config';

const TONE: Record<ContractVersionEntry['display'], StatusTone> = {
  in_force: 'success',
  scheduled: 'info',
  superseded: 'neutral',
  pending_approval: 'warning',
  returned: 'warning',
  withdrawn: 'neutral',
};

/**
 * Contract versions of a tenant (HQ-011 amendments): the one in force, scheduled changes, versions
 * awaiting approval and the history, each with its date, author, approver, monthly price and what
 * changed against the version before.
 */
export function ContractVersions({ tenant: d }: { tenant: TenantDetail }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const fmt = useHqFormat();
  const can = useCan();
  const toast = useToast();
  const announce = useAnnounce();
  const withdraw = useApiMutation<ContractHistory>();
  const [confirm, setConfirm] = useState<ContractVersionEntry | null>(null);
  const [error, setError] = useState<unknown>(null);
  const history = useApiQuery<ContractHistory>({ method: 'GET', path: `/platform/tenants/${d.id}/contracts` });
  const manage = can('platform.contracts.manage') || can('platform.grants.manage');
  const open = history.data?.versions.some((v) => v.display === 'pending_approval' || v.display === 'scheduled');
  const amendable = ['active', 'trial', 'grace'].includes(d.status);
  return (
    <Panel
      title={t('platform:history.title')}
      description={t('platform:history.hint')}
      actions={
        manage && amendable && !open ? (
          <Link variant="plain" href={HQ.amend(d.id)} className={buttonClass('primary')} data-testid="t360-amend">
            <FilePen aria-hidden className="size-4" />
            {t('platform:history.amend')}
          </Link>
        ) : undefined
      }
    >
      {error !== null && <ProblemSummary error={error} />}
      {history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : !history.data ? (
        <Skeleton className="h-40 rounded-tile" />
      ) : (
        <ol className="space-y-3" data-testid="t360-contract-history">
          {history.data.versions.map((v) => (
            <li key={v.contract.id} className="rounded-tile border border-border/70 p-3" data-testid={`contract-version-${v.contract.version}`} data-display={v.display}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-text">
                  {t('platform:summary.contract', { version: v.contract.version })} <span className="text-sm font-normal text-muted">· {t('platform:history.from', { date: fmt.date(v.effectiveFrom) })}</span>
                </p>
                <Badge tone={TONE[v.display]}>{t(`platform:history.display.${v.display}`)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {t('platform:config.by', { name: v.contract.createdBy })} · {t('platform:history.monthly', { amount: fmt.money(v.monthlyNet) })}
                {v.approval?.decidedBy ? ` · ${t(v.approval.status === 'returned' ? 'platform:config.returnedBy' : 'platform:config.approvedBy', { name: v.approval.decidedBy })}` : ''}
              </p>
              {v.reason && <p className="mt-1 text-sm text-text">{v.reason}</p>}
              {v.approval && v.approval.status === 'pending' && (
                <ul className="mt-1 list-disc ps-5 text-sm text-warning">
                  {v.approval.reasons.map((r, i) => (
                    <li key={i}>{tr(`platform:approval.rules.${r.rule}`, r.params)}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted">{v.modules.map((m) => moduleName(t, m.module)).join(', ')}</p>
              {v.changes.length > 0 && (
                <div className="mt-2">
                  <Expandable title={t('platform:config.changesCount', { count: v.changes.length })} testId={`contract-changes-${v.contract.version}`}>
                    <ChangeList changes={v.changes} />
                  </Expandable>
                </div>
              )}
              {manage && (v.display === 'scheduled' || v.display === 'pending_approval') && (
                <Button variant="quiet" icon={Undo2} className="mt-2" onPress={() => setConfirm(v)} data-testid={`contract-withdraw-${v.contract.version}`}>
                  {t('platform:history.withdraw')}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {confirm && (
        <ConfirmDialog
          isOpen
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t('platform:history.withdrawTitle', { version: confirm.contract.version })}
          effect={t('platform:history.withdrawEffect')}
          confirmLabel={t('platform:history.withdraw')}
          destructive
          onConfirm={async () => {
            setError(null);
            try {
              await withdraw.mutateAsync({ method: 'POST', path: `/platform/tenants/${d.id}/amendments/${confirm.contract.id}/withdraw` });
              const msg = t('platform:history.withdrawn', { version: confirm.contract.version });
              toast.success(msg);
              announce(msg);
            } catch (e) {
              setError(e);
              throw e;
            }
          }}
        />
      )}
    </Panel>
  );
}
