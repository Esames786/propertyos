import type { ModuleCategory, WorkspacePlan } from '@repo/contracts';
import { formatCalendarDate, formatNumber, useLocale } from '@repo/i18n';
import { Badge, dynamicT, ErrorState, PageHeader, Panel, Skeleton, useApiQuery, useT } from '@repo/ui';
import { CheckCircle2, Eye, MinusCircle } from 'lucide-react';

const CATEGORY_ORDER: ModuleCategory[] = ['foundation', 'community', 'finance', 'property', 'sales', 'people', 'channels'];

/**
 * ADM-023 Your plan & modules (read-only). What the organisation's subscription includes, from its
 * own side: modules in force and the sites they cover, and what is not included. Changes are made
 * by the platform on a contract amendment, never here.
 */
export default function PlanPage() {
  const { t } = useT();
  const plan = useApiQuery<WorkspacePlan>({ method: 'GET', path: '/workspace/plan' });
  return (
    <div className="space-y-6" data-testid="plan-page">
      <PageHeader
        title={t('nav:pages.plan')}
        badge={<Badge tone="neutral" icon={Eye}>{t('workspace:plan.readOnly')}</Badge>}
        description={plan.data ? t('workspace:plan.intro', { organisation: plan.data.tenant.name }) : undefined}
      />
      {plan.isPending ? <Skeleton className="h-96 rounded-card" /> : plan.isError ? <ErrorState error={plan.error} onRetry={() => void plan.refetch()} /> : <PlanBody plan={plan.data} />}
    </div>
  );
}

function PlanBody({ plan }: { plan: WorkspacePlan }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const { locale } = useLocale();
  const included = plan.modules.filter((m) => m.licensed);
  const others = plan.modules.filter((m) => !m.licensed);
  const siteName = (id: string) => plan.sites.find((s) => s.id === id)?.name ?? id;
  const facts = [
    { id: 'edition', label: t('workspace:plan.facts.plan'), value: tr(`platform:editions.${plan.tenant.edition}.name`) },
    { id: 'status', label: t('workspace:plan.facts.status'), value: tr(`platform:status.${plan.tenant.status}`) },
    { id: 'since', label: t('workspace:plan.facts.since'), value: formatCalendarDate(plan.tenant.licensedFrom, locale) },
    { id: 'sites', label: t('workspace:plan.facts.sites'), value: formatNumber(plan.sites.length, locale) },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="plan-facts">
        {facts.map((f) => (
          <div key={f.id} className="rounded-card border border-border/70 bg-panel p-4 shadow-card">
            <dt className="text-sm text-muted">{f.label}</dt>
            <dd className="mt-1 text-lg font-bold text-text">{f.value}</dd>
          </div>
        ))}
      </dl>

      <Panel title={t('workspace:plan.included', { count: included.length })} description={t('workspace:plan.includedHint')}>
        <ul className="grid gap-3 @2xl:grid-cols-2" data-testid="plan-included">
          {included.map((m) => (
            <li key={m.key} className="flex items-start gap-3 rounded-tile border border-border/70 p-4" data-testid={`plan-module-${m.key}`}>
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="font-semibold text-text">{tr(`platform:modules.${m.key}.name`)}</p>
                <p className="text-sm text-muted">{tr(`platform:modules.${m.key}.description`)}</p>
                <p className="mt-1.5 text-xs text-muted">
                  {m.alwaysOn ? t('workspace:plan.alwaysOn') : m.sites === 'all' ? t('workspace:plan.allSites') : t('workspace:plan.someSites', { sites: (m.sites ?? []).map(siteName).join(', ') })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t('workspace:plan.notIncluded', { count: others.length })} description={t('workspace:plan.notIncludedHint')}>
        <div className="grid gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3" data-testid="plan-not-included">
          {CATEGORY_ORDER.map((category) => {
            const items = others.filter((m) => m.category === category);
            if (!items.length) return null;
            return (
              <section key={category} aria-label={tr(`platform:moduleCategories.${category}`)}>
                <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{tr(`platform:moduleCategories.${category}`)}</h3>
                <ul className="mt-2 space-y-1.5">
                  {items.map((m) => (
                    <li key={m.key} className="flex items-center gap-2 text-sm text-muted">
                      <MinusCircle aria-hidden className="size-4 shrink-0" />
                      <span>{tr(`platform:modules.${m.key}.name`)}</span>
                      <span className="sr-only">{t('workspace:plan.notInPlanSr')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
