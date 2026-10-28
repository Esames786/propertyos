import { ApiError, type BillingRun, type BillingRunDetail, type ChargeRule, type Exemption, type SiteOverview, type SiteSummary } from '@repo/contracts';
import { emitTourEvent } from '@repo/ui/onboarding';
import { Breadcrumbs, Button, cn, ErrorState, Link, PageHeader, Panel, useAnnounce, useApiMutation, useApiQuery, useNavigation, useT } from '@repo/ui';
import { CheckCircle2, CircleAlert, FilePlus2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ChoiceCards } from '../parts';

const addMonths = (period: string, n: number) => {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const inForce = (from: string, to: string | undefined, period: string) => from <= period && (to === undefined || period < to);

/**
 * BILL-006 billing run builder: choose the month, see what the run will use (flats, rules in force,
 * exemptions, opening balances) and create the draft. Nothing is billed here; the draft opens in the
 * run workspace, where the preview is generated flat by flat.
 */
export default function NewRunPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { navigate } = useNavigation();
  const announce = useAnnounce();
  const runs = useApiQuery<{ runs: BillingRun[]; nextPeriod: string; canCreate: boolean }>({ method: 'GET', path: '/billing-runs' });
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const siteId = sites.data?.[0]?.id;
  const overview = useApiQuery<SiteOverview>(siteId ? { method: 'GET', path: `/sites/${siteId}` } : null);
  const rules = useApiQuery<{ rules: ChargeRule[] }>({ method: 'GET', path: '/charges/rules' });
  const exemptions = useApiQuery<Exemption[]>({ method: 'GET', path: '/exemptions' });
  const create = useApiMutation<BillingRunDetail>();
  const [chosen, setChosen] = useState<string | null>(null);

  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />;
  if (!runs.data || !sites.data || !overview.data || !rules.data || !exemptions.data) return <Loading lines={8} />;

  const next = runs.data.nextPeriod;
  const period = chosen ?? next;
  const open = runs.data.runs.find((r) => r.period === period && r.state !== 'CANCELLED');
  const site = overview.data.site;
  const ruleCount = rules.data.rules.filter((r) => inForce(r.from, r.to, period)).length;
  const hasMaintenance = rules.data.rules.some((r) => r.category === 'maintenance' && inForce(r.from, r.to, period));
  const approved = exemptions.data.filter((e) => e.state === 'approved' && inForce(e.from, e.to, period)).length;
  const pending = exemptions.data.filter((e) => e.state === 'pending_approval').length;
  const opening = overview.data.checklist.find((s) => s.key === 'opening_balances');

  const checks = [
    { key: 'flats', state: site.flats === site.declaredFlats ? 'ok' : 'warn', text: t('billing:newRun.checks.flats', { flats: fmt.count(site.flats), declared: fmt.count(site.declaredFlats) }), href: SOCIETY.structure(site.id) },
    { key: 'rules', state: hasMaintenance ? 'ok' : 'block', text: hasMaintenance ? t('billing:newRun.checks.rules', { count: ruleCount }) : t('billing:newRun.checks.noRules'), href: SOCIETY.rules() },
    { key: 'exemptions', state: pending ? 'warn' : 'ok', text: pending ? t('billing:newRun.checks.pendingExemptions', { count: pending, approved }) : t('billing:newRun.checks.exemptions', { count: approved }), href: SOCIETY.exemptions },
    { key: 'opening', state: opening?.state === 'done' ? 'ok' : 'warn', text: opening?.state === 'done' ? t('billing:newRun.checks.opening') : t('billing:newRun.checks.noOpening'), href: SOCIETY.openingBalances(site.id) },
  ] as const;
  const blocked = !hasMaintenance || !!open;

  const submit = async () => {
    try {
      const result = await create.mutateAsync({ method: 'POST', path: '/billing-runs', body: { period } });
      announce(t('billing:newRun.created', { period: fmt.period(period) }));
      emitTourEvent('billing.run.created');
      navigate(SOCIETY.run(result.run.id));
    } catch {
      /* shown below */
    }
  };
  const duplicate = create.error instanceof ApiError && create.error.problem.code === 'duplicate_period' ? create.error.problem.errors?.period?.[0]?.params : undefined;

  return (
    <div className="@container mx-auto max-w-4xl space-y-6" data-testid="new-run-page">
      <Breadcrumbs items={[{ label: t('nav:items.billing'), href: SOCIETY.runs }, { label: t('nav:pages.billingRuns'), href: SOCIETY.runs }]} />
      <PageHeader title={t('nav:pages.newRun')} description={t('billing:newRun.intro')} />
      <Panel title={t('billing:newRun.stepPeriod')}>
        <ChoiceCards
          label={t('billing:newRun.period')}
          value={period}
          onChange={setChosen}
          testId="new-run-period"
          options={[next, addMonths(next, 1)].map((p, i) => ({
            id: p,
            title: fmt.period(p),
            detail: i === 0 ? t('billing:newRun.nextToBill') : t('billing:newRun.later', { period: fmt.period(next) }),
          }))}
        />
      </Panel>
      <Panel title={t('billing:newRun.stepScope')}>
        <p className="text-sm text-text">{t('billing:newRun.scope', { site: site.name, flats: fmt.count(site.flats), buildings: fmt.count(site.buildings) })}</p>
        <p className="mt-1 text-xs text-muted">{t('billing:newRun.scopeLater')}</p>
      </Panel>
      <Panel title={t('billing:newRun.stepChecks')} description={t('billing:newRun.checksHint')}>
        <ul className="space-y-2" data-testid="new-run-checks">
          {checks.map((c) => {
            const Icon = c.state === 'ok' ? CheckCircle2 : c.state === 'warn' ? TriangleAlert : CircleAlert;
            return (
              <li key={c.key} className="flex items-start gap-2.5 text-sm" data-check={c.key} data-state={c.state}>
                <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', c.state === 'ok' ? 'text-success' : c.state === 'warn' ? 'text-warning' : 'text-error')} />
                <Link href={c.href}>{c.text}</Link>
              </li>
            );
          })}
        </ul>
      </Panel>
      {open && (
        <p className="rounded-tile border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-text" data-testid="new-run-existing">
          {t('billing:newRun.existing', { period: fmt.period(period) })} <Link href={SOCIETY.run(open.id)}>{t('billing:runs.open', { ref: open.ref })}</Link>
        </p>
      )}
      {create.isError && (
        <div className="space-y-2">
          <ProblemAlert error={create.error} />
          {duplicate?.runId && <Link href={SOCIETY.run(duplicate.runId)}>{t('billing:runs.open', { ref: duplicate.ref ?? '' })}</Link>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href={SOCIETY.runs} className="inline-flex min-h-10 items-center text-sm">
          {t('common:actions.cancel')}
        </Link>
        <Button variant="primary" icon={FilePlus2} onPress={() => void submit()} isPending={create.isPending} isDisabled={blocked || !runs.data.canCreate} disabledReason={!runs.data.canCreate ? t('billing:run.why.permission_missing') : open ? t('billing:newRun.existingShort') : !hasMaintenance ? t('billing:newRun.checks.noRules') : undefined} data-testid="new-run-create" data-tour-id="new-run-create">
          {t('billing:newRun.create', { period: fmt.period(period) })}
        </Button>
      </div>
    </div>
  );
}
