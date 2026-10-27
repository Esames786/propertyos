import type { ContractApproval, TenantDetail } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import {
  Badge,
  Button,
  buttonClass,
  ConfirmDialog,
  Drawer,
  dynamicT,
  ErrorState,
  InlineAlert,

  Link,
  Skeleton,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useCan,
  useQueryParam,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { Calculator, CheckCircle2, CornerUpLeft, FileClock, MapPin } from 'lucide-react';
import { useState } from 'react';
import { componentLabel } from '../../components/PricingBuilder';
import { QuoteTotals } from '../../components/quote';
import { useHqFormat } from '../../lib/format';
import { editionName, lifecycleOf, moduleName, STATUS_ICON, STATUS_TONE } from '../../lib/labels';
import { HQ } from '../../nav.config';

/**
 * Tenant summary (opened from the tenants list or the dashboard with ?tenant=…): lifecycle and
 * billing status kept apart, sites, granted modules, the contract and its quote, the commercial
 * approval (approve / return for an approver who is not the requester, D-14), and the audit trail.
 * Tenant metadata only: the platform never reads tenant records here (A1 §4).
 */
export function TenantSummaryDrawer() {
  const { t } = useT();
  const [id, setId] = useQueryParam('tenant');
  const detail = useApiQuery<TenantDetail>(id ? { method: 'GET', path: `/platform/tenants/${id}` } : null);
  const d = detail.data;
  return (
    <Drawer
      isOpen={!!id}
      onOpenChange={(open) => !open && setId(null)}
      title={d?.displayName ?? t('platform:summary.loading')}
      subtitle={d ? `${editionName(t, d.edition)} · ${d.city}` : undefined}
      size="lg"
      testId="tenant-summary"
      footer={
        d && (
          <div className="flex flex-wrap gap-2">
            <Link variant="plain" href={`${HQ.simulator}?tenant=${d.id}`} className={buttonClass('secondary')} data-testid="summary-simulate">
              <Calculator aria-hidden className="size-4" />
              {t('platform:summary.simulate')}
            </Link>
            <Link variant="plain" href={`/hq/tenants/${d.id}`} className={buttonClass('quiet')} data-testid="summary-360">
              {t('platform:summary.open360')}
            </Link>
          </div>
        )
      }
    >
      {detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : !d ? <Skeleton className="h-96 rounded-tile" /> : <Body tenant={d} />}
    </Drawer>
  );
}

function Body({ tenant: d }: { tenant: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const s = lifecycleOf(d);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" data-testid="summary-status">
        <Badge tone={STATUS_TONE[s]} icon={STATUS_ICON[s]}>
          {t(`platform:status.${s}`)}
        </Badge>
        <Badge tone="neutral">{t(`platform:contractStatus.${d.contractStatus}`)}</Badge>
        <Badge tone={d.billingStatus === 'overdue' ? 'warning' : 'neutral'}>{t(`platform:billingStatus.${d.billingStatus}`)}</Badge>
      </div>

      {d.approval && <ApprovalPanel approval={d.approval} tenant={d} />}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-tile border border-border/70 p-4 min-[30rem]:grid-cols-2" data-testid="summary-facts">
        {[
          { label: t('platform:summary.legalName'), value: <bdi>{d.legalName}</bdi> },
          { label: t('platform:summary.type'), value: t(`platform:tenantTypes.${d.type}`) },
          { label: t('platform:summary.origin'), value: t(`platform:origins.${d.origin}`) },
          { label: t('platform:summary.created'), value: fmt.date(d.createdAt) },
          ...(d.trialEndsOn ? [{ label: t('platform:summary.trialEnds'), value: fmt.date(d.trialEndsOn) }] : []),
          { label: t('platform:summary.mrr'), value: <bdi dir="ltr">{fmt.money(d.mrr)}</bdi> },
          { label: t('platform:summary.contact'), value: <bdi>{d.organisation.contactName}</bdi> },
        ].map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="mt-0.5 font-medium text-text">{f.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="summary-sites">
        <h3 id="summary-sites" className="text-sm font-bold text-text">
          {t('platform:summary.sites', { count: d.sites.length })}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {d.sites.map((site) => (
            <li key={site.id} className="flex items-center gap-2 text-sm">
              <MapPin aria-hidden className="size-4 text-muted" />
              <bdi className="font-medium">{site.name}</bdi>
              <span className="text-muted">
                · {site.city} · {t('platform:wizard.review.siteUnits', { count: site.declaredUnits })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="summary-modules">
        <h3 id="summary-modules" className="text-sm font-bold text-text">
          {t('platform:summary.modules', { count: d.grants.length })}
        </h3>
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="summary-modules">
          {d.grants.map((g) => (
            <li key={g.module}>
              <Badge tone="neutral">{g.sites === 'all' ? moduleName(t, g.module) : t('platform:summary.moduleSites', { module: moduleName(t, g.module), count: g.sites.length })}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {d.contract && d.quote && (
        <section aria-labelledby="summary-contract" className="space-y-3">
          <h3 id="summary-contract" className="text-sm font-bold text-text">
            {t('platform:summary.contract', { version: d.contract.version })}
          </h3>
          <QuoteTotals quote={d.quote} />
          <ul className="space-y-1 text-sm">
            {d.contract.components.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span>{componentLabel(t, c)}</span>
                <span className="shrink-0 text-muted tabular">{c.unitPrice && c.type !== 'FREE' ? fmt.money(c.unitPrice) : c.type === 'TRIAL' ? t('platform:builder.trialDays', { days: c.trialDays ?? 30 }) : '—'}</span>
              </li>
            ))}
            {d.contract.discounts.map((x) => (
              <li key={x.id} className="flex justify-between gap-3 text-warning">
                <span>{x.reason ?? t('platform:summary.discount')}</span>
                <span className="shrink-0 tabular">{x.kind === 'percent' ? `−${x.value}%` : `−${fmt.money(x.value)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="summary-audit">
        <h3 id="summary-audit" className="text-sm font-bold text-text">
          {t('platform:summary.audit')}
        </h3>
        {d.audit.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{t('platform:summary.noAudit')}</p>
        ) : (
          <ol className="mt-2 space-y-2 border-s border-border ps-4">
            {d.audit.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="text-text">{dynamicT(t)(`platform:audit.${e.action}`, { ...e.params, tenant: e.tenantName ?? '', actor: e.actorName })}</p>
                <p className="text-xs text-muted">
                  <bdi>{e.actorName}</bdi> · {fmt.relative(e.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-xs text-muted">{t('platform:summary.metadataOnly')}</p>
    </div>
  );
}

/** D-14: pending approval with its reasons, and the decision for a permitted, different user. */
function ApprovalPanel({ approval, tenant }: { approval: ContractApproval; tenant: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const can = useCan();
  const { persona } = useSession();
  const toast = useToast();
  const announce = useAnnounce();
  const decide = useApiMutation<ContractApproval>();
  const [dialog, setDialog] = useState<'approve' | 'return' | null>(null);

  if (approval.status !== 'pending') {
    return (
      <InlineAlert tone={approval.status === 'approved' ? 'success' : 'info'} title={t(`platform:approval.decided.${approval.status}`, { by: approval.decidedBy ?? '' })}>
        {approval.comment && <p>{approval.comment}</p>}
      </InlineAlert>
    );
  }
  const isRequester = persona?.displayName === approval.requestedBy;
  const mayDecide = can('platform.contracts.approve') && !isRequester;
  const run = async (decision: 'approve' | 'return', comment?: string) => {
    try {
      await decide.mutateAsync({ method: 'POST', path: `/platform/approvals/${approval.id}/decide`, body: { decision, comment } });
      const msg = decision === 'approve' ? t('platform:approval.approvedToast', { name: tenant.displayName }) : t('platform:approval.returnedToast', { name: tenant.displayName });
      toast.success(msg);
      announce(msg);
    } catch (e) {
      toast.error(e instanceof ApiError && e.problem.code === 'maker_checker_required' ? t('platform:errors.makerChecker') : t('platform:approval.failed'));
      throw e;
    }
  };
  return (
    <div className="rounded-tile border border-warning/40 bg-warning-soft/60 p-4" data-testid="summary-approval">
      <p className="flex items-center gap-2 font-semibold text-text">
        <FileClock aria-hidden className="size-5 text-warning" />
        {t('platform:approval.pendingTitle')}
      </p>
      <p className="mt-1 text-sm text-muted">{t('platform:approval.requested', { by: approval.requestedBy, date: fmt.date(approval.requestedAt) })}</p>
      <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-text" data-testid="approval-required">
        {approval.reasons.map((r, i) => (
          <li key={`${r.rule}-${i}`} data-testid={`approval-reason-${r.rule}`}>
            {dynamicT(t)(`platform:approval.rules.${r.rule}`, r.params)}
          </li>
        ))}
      </ul>
      {mayDecide ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" icon={CheckCircle2} onPress={() => setDialog('approve')} data-testid="approval-approve">
            {t('platform:approval.approve')}
          </Button>
          <Button variant="secondary" icon={CornerUpLeft} onPress={() => setDialog('return')} data-testid="approval-return">
            {t('platform:approval.return')}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted" data-testid="approval-waiting">
          {isRequester ? t('platform:approval.ownRequest') : t('platform:approval.noPermission')}
        </p>
      )}
      <ConfirmDialog
        isOpen={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('platform:approval.approveTitle', { name: tenant.displayName })}
        effect={t('platform:approval.approveEffect')}
        confirmLabel={t('platform:approval.approve')}
        onConfirm={() => run('approve')}
      />
      <ConfirmDialog
        isOpen={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('platform:approval.returnTitle', { name: tenant.displayName })}
        effect={t('platform:approval.returnEffect')}
        confirmLabel={t('platform:approval.return')}
        reasonLabel={t('platform:approval.returnReason')}
        onConfirm={(reason) => run('return', reason)}
      />
    </div>
  );
}
