import type { EditionKey, HqAttentionItem, HqOverview, PlatformAuditEvent, SignupPolicy, TenantStatus } from '@repo/contracts';
import { Badge, cn, DirectionalIcon, dynamicT, IconTile, Link, Panel, RevealItem, Stagger, useT, type TileHue } from '@repo/ui';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileClock,
  Hourglass,
  Inbox,
  KeyRound,
  Mail,
  PauseCircle,
  PencilLine,
  Rocket,
  ShieldQuestion,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { HQ } from '../../nav.config';
import { useHqFormat } from '../../lib/format';
import { EDITION_HUE, EDITION_ICON, editionName, moduleName, STATUS_ICON, STATUS_TONE } from '../../lib/labels';

const ATTENTION: Record<HqAttentionItem['kind'], { icon: LucideIcon; hue: TileHue }> = {
  approval: { icon: FileClock, hue: 'amber' },
  trial_ending: { icon: Hourglass, hue: 'violet' },
  grace: { icon: Clock3, hue: 'orange' },
  suspended: { icon: PauseCircle, hue: 'rose' },
  request: { icon: Inbox, hue: 'sky' },
  draft: { icon: PencilLine, hue: 'slate' },
};

/** "Needs your attention": every item names the tenant and why, and opens the right place. */
export function AttentionPanel({ items, className }: { items: HqAttentionItem[]; className?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  // Dates arrive as ISO data; they are formatted for the reader's language here.
  const localise = (params: Record<string, string>) => (params.date ? { ...params, date: fmt.date(params.date) } : params);
  return (
    <section aria-labelledby="hq-attention-title" data-tour-id="hq-attention" data-testid="hq-attention" className={cn('rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="hq-attention-title" className="text-lg font-bold text-text">
            {t('platform:attention.title')}
          </h2>
          <p className="text-sm text-muted">{t('platform:attention.subtitle')}</p>
        </div>
        <span className="grid min-w-10 place-items-center rounded-pill bg-accent-soft px-3 py-1.5 text-lg font-bold text-accent tabular" aria-label={t('platform:attention.count', { count: items.length })}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 flex items-center gap-2 text-success">
          <CheckCircle2 aria-hidden className="size-5" />
          {t('platform:attention.none')}
        </p>
      ) : (
        <Stagger as="ul" className="mt-4 divide-y divide-border/70">
          {items.map((item, i) => {
            const look = ATTENTION[item.kind];
            return (
              // Phones spotlight the first item: the whole list is taller than a small screen.
              <RevealItem as="li" key={item.id} tourId={i === 0 ? 'hq-attention-first' : undefined}>
                <Link
                  variant="plain"
                  href={item.href}
                  data-testid={`attention-${item.kind}`}
                  className="group flex items-center gap-3 rounded-control px-1 py-3 outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus"
                >
                  <IconTile icon={look.icon} hue={look.hue} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-text">
                      <bdi>{item.title}</bdi>
                    </span>
                    <span className="block text-sm text-muted">{dynamicT(t)(`platform:attention.${item.detailKey}`, localise(item.params))}</span>
                  </span>
                  <Badge tone={item.tone === 'danger' ? 'error' : item.tone === 'warning' ? 'warning' : 'info'}>{t(`platform:attention.kind.${item.kind}`)}</Badge>
                  <DirectionalIcon icon={ArrowRight} className="size-4 shrink-0 text-muted transition-transform group-data-hovered:translate-x-0.5 rtl:group-data-hovered:-translate-x-0.5" />
                </Link>
              </RevealItem>
            );
          })}
        </Stagger>
      )}
    </section>
  );
}

const POLICY_ICON: Record<SignupPolicy, LucideIcon> = {
  self_service_trial: Rocket,
  approval_required: ShieldQuestion,
  invitation_only: KeyRound,
  sales_assisted: Mail,
};

/** D-8 onboarding policy: which signup mode Get started offers. Read-only in this checkpoint. */
export function PolicyPanel({ policy }: { policy: SignupPolicy }) {
  const { t } = useT();
  const Icon = POLICY_ICON[policy];
  return (
    <Panel title={t('platform:policy.title')} description={t('platform:policy.subtitle')}>
      <div className="flex items-start gap-3" data-testid="hq-signup-policy">
        <IconTile icon={Icon} hue="teal" />
        <div className="min-w-0">
          <p className="font-semibold text-text">{t(`platform:policy.modes.${policy}.name`)}</p>
          <p className="text-sm text-muted">{t(`platform:policy.modes.${policy}.body`)}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('platform:policy.allModes')}>
        {(Object.keys(POLICY_ICON) as SignupPolicy[]).map((mode) => (
          <li key={mode}>
            <Badge tone={mode === policy ? 'success' : 'neutral'} icon={mode === policy ? CheckCircle2 : POLICY_ICON[mode]}>
              {t(`platform:policy.modes.${mode}.name`)}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{t('platform:policy.note')}</p>
    </Panel>
  );
}

const STATUS_ORDER: TenantStatus[] = ['active', 'trial', 'grace', 'suspended', 'draft'];

/** Tenant mix by edition, with lifecycle chips that open the filtered list. */
export function TenantMixPanel({ overview: o, className }: { overview: HqOverview; className?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const editions: Array<{ key: EditionKey; count: number }> = [
    { key: 'developer', count: o.tenants.byType.developer },
    { key: 'community', count: o.tenants.byType.association },
    { key: 'portfolio', count: o.tenants.byType.portfolio_manager },
    { key: 'custom', count: o.tenants.byType.custom },
  ];
  return (
    <Panel title={t('platform:dashboard.mix.title')} description={t('platform:dashboard.mix.subtitle', { count: o.tenants.total })} className={className}>
      <ul className="grid grid-cols-2 gap-3" data-testid="hq-tenant-mix">
        {editions.map((e) => (
          <li key={e.key}>
            <Link
              variant="plain"
              href={`${HQ.tenants}?edition=${e.key}`}
              className="flex items-center gap-3 rounded-tile border border-border/70 p-3 outline-none transition-shadow data-hovered:shadow-card data-focus-visible:outline-2 data-focus-visible:outline-focus"
            >
              <IconTile icon={EDITION_ICON[e.key]} hue={EDITION_HUE[e.key]} size="sm" />
              <span className="min-w-0">
                <span className="block text-xl leading-none font-bold text-text tabular">{fmt.count(e.count)}</span>
                <span className="block truncate text-xs text-muted">{editionName(t, e.key)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('platform:dashboard.mix.byStatus')}>
        {STATUS_ORDER.filter((s) => o.tenants.byStatus[s] > 0).map((s) => (
          <li key={s}>
            <Link variant="plain" href={`${HQ.tenants}?status=${s}`} className="rounded-pill outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus">
              <Badge tone={STATUS_TONE[s]} icon={STATUS_ICON[s]}>
                {`${t(`platform:status.${s}`)} · ${fmt.count(o.tenants.byStatus[s])}`}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Module adoption across live tenants: count plus a bar (the count is always written out). */
export function ModulesPanel({ modules, live, className }: { modules: HqOverview['modules']; live: number; className?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const top = modules.filter((m) => m.module !== 'core').slice(0, 9);
  return (
    <Panel title={t('platform:dashboard.modules.title')} description={t('platform:dashboard.modules.subtitle', { count: live })} className={className}>
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-testid="hq-modules">
        {top.map((m) => (
          <li key={m.module}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-text">{moduleName(t, m.module)}</span>
              <span className="shrink-0 text-muted tabular">{t('platform:dashboard.modules.ofTenants', { count: m.tenants, total: fmt.count(live) })}</span>
            </div>
            <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-pill bg-sunken">
              <div className="h-full rounded-pill bg-primary transition-[width] duration-700" style={{ width: `${live ? Math.round((m.tenants / live) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Trials ending soon and new workspace requests. */
export function RequestsPanel({ overview: o, className }: { overview: HqOverview; className?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const fresh = o.requests.filter((r) => r.status === 'new');
  return (
    <Panel title={t('platform:dashboard.pipeline.title')} description={t('platform:dashboard.pipeline.subtitle')} className={className}>
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-text">{t('platform:dashboard.pipeline.trials')}</h3>
          {o.trials.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t('platform:dashboard.kpi.trialsNone')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {o.trials.map((tr) => (
                <li key={tr.tenantId} className="flex items-center gap-3">
                  <IconTile icon={Hourglass} hue="violet" size="sm" />
                  <Link href={HQ.tenant(tr.tenantId)} className="min-w-0 flex-1 truncate font-medium">
                    <bdi>{tr.name}</bdi>
                  </Link>
                  <span className="shrink-0 text-sm text-muted">{t('platform:dashboard.pipeline.endsIn', { days: tr.daysLeft, date: fmt.date(tr.endsOn) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">{t('platform:dashboard.pipeline.requests', { count: fresh.length })}</h3>
          <ul className="mt-2 space-y-2" data-testid="hq-requests-summary">
            {o.requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <IconTile icon={r.kind === 'sales' ? Mail : r.kind === 'trial' ? Sparkles : UserPlus} hue="sky" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">
                    <bdi>{r.organisation}</bdi>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {t(`platform:requests.kind.${r.kind}`)} · {editionName(t, r.edition)} · {r.city}
                  </span>
                </span>
                <Badge tone={r.status === 'new' ? 'info' : 'neutral'}>{t(`platform:requests.status.${r.status}`)}</Badge>
              </li>
            ))}
          </ul>
          <Link href={`${HQ.tenants}?tab=requests`} className="mt-3 inline-block text-sm">
            {t('platform:dashboard.pipeline.allRequests')}
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/** Recent platform activity (audit), newest first. */
export function ActivityPanel({ events }: { events: PlatformAuditEvent[] }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <Panel title={t('platform:dashboard.activity.title')} description={t('platform:dashboard.activity.subtitle')}>
      <ol className="relative space-y-4 border-s border-border ps-5" data-testid="hq-activity">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden className="absolute -start-[1.6875rem] top-1 size-3 rounded-pill border-2 border-panel bg-primary" />
            <p className="text-sm text-text">
              {dynamicT(t)(`platform:audit.${e.action}`, { ...e.params, tenant: e.tenantName ?? '', actor: e.actorName })}
            </p>
            <p className="text-xs text-muted">
              <bdi>{e.actorName}</bdi> · {fmt.relative(e.at)}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
