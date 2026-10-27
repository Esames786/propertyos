import { ApiError, type AccessDecision, type EffectiveAccess, type ModuleCatalog, type ModuleKey, type ModuleSelection, type PreviewSession, type TenantDetail } from '@repo/contracts';
import {
  Badge,
  dynamicT,
  ErrorState,
  evaluate,
  ForbiddenState,
  IconTile,
  InlineAlert,
  PageHeader,
  Panel,
  SegmentedControl,
  SelectControl,
  Skeleton,
  Switch,
  TENANT_NAV,
  TENANT_QUICK_CREATE,
  TENANT_SEARCH_SCOPES,
  useApiQuery,
  useQueryParam,
  useSession,
  useT,
  useTransport,
  workspaceRouteTarget,
  type StatusTone,
} from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, LayoutGrid, Plus, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Checkbox, CheckboxGroup, Label } from 'react-aria-components';
import { moduleName } from '../../lib/labels';
import { HQ } from '../../nav.config';

type Status = 'available' | 'notInPlan' | 'role' | 'site' | 'suspended' | 'inactive';

const statusOf = (d: AccessDecision): Status =>
  d.allowed
    ? 'available'
    : d.reason === 'module_not_licensed' || d.reason === 'feature_not_licensed'
      ? 'notInPlan'
      : d.reason === 'tenant_suspended'
        ? 'suspended'
        : d.reason === 'tenant_inactive'
          ? 'inactive'
          : d.reason === 'site_not_licensed'
            ? 'site'
            : 'role';

const TONE: Record<Status, StatusTone> = { available: 'success', notInPlan: 'neutral', role: 'warning', site: 'neutral', suspended: 'error', inactive: 'neutral' };

/** Areas a client works in (the start page and prototype tools are not part of the licence). */
const AREAS = TENANT_NAV.filter((i) => !['home', 'lab', 'help'].includes(i.id));

/** Addresses an operator commonly checks (shown left-to-right isolated, so they read correctly in Urdu). */
const SAMPLE_ADDRESSES = [
  '/backoffice/crm/sales-home',
  '/backoffice/crm/lead-360-workspace',
  '/backoffice/inv/unit-matrix',
  '/backoffice/sal/booking-list',
  '/backoffice/con/construction-update-list',
  '/backoffice/fin/finance-dashboard',
  '/backoffice/mnt/maintenance-list',
  '/backoffice/mnt/new-request',
  '/backoffice/res/resident-dashboard',
  '/backoffice/adm/plan',
];

/**
 * HQ-009 Preview as client. Shows, for one of the tenant's roles, the menus, quick actions, search
 * and areas the client actually gets: the same navigation model and access rule the workspace uses,
 * evaluated against the tenant's licence. No tenant records are loaded and nobody is signed in as
 * the client (no impersonation). A what-if module set can be tried; it is never saved.
 */
export default function PreviewPage({ id }: { id: string }) {
  const { t } = useT();
  const { transport } = useTransport();
  const { persona } = useSession();
  const [roleParam, setRoleParam] = useQueryParam('role');
  const [whatIf, setWhatIf] = useState<ModuleSelection[] | null>(null);
  const detail = useApiQuery<TenantDetail>({ method: 'GET', path: `/platform/tenants/${id}` });

  const request = (modules: ModuleSelection[] | null) =>
    transport.request<PreviewSession>({ method: 'POST', path: `/platform/tenants/${id}/preview`, body: { ...(roleParam ? { role: roleParam } : {}), ...(modules ? { modules } : {}) } });
  const actual = useQuery({
    queryKey: ['hq-preview', persona?.id, id, roleParam],
    queryFn: () => request(null),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const tried = useQuery({
    queryKey: ['hq-preview-whatif', persona?.id, id, roleParam, JSON.stringify(whatIf)],
    queryFn: () => request(whatIf),
    enabled: whatIf !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  if (actual.isPending || detail.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (actual.isError) {
    return actual.error instanceof ApiError && actual.error.problem.status === 403 ? <ForbiddenState role={persona ? dynamicT(t)(persona.roleKey) : ''} /> : <ErrorState error={actual.error} onRetry={() => void actual.refetch()} />;
  }
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const session = actual.data;
  const shown = whatIf && tried.data ? tried.data : session;

  return (
    <div className="space-y-6" data-testid="preview-page" data-tenant-id={session.tenant.id} data-role={session.role.id}>
      <PageHeader
        title={t('platform:preview.title')}
        breadcrumbs={[
          { label: t('platform:nav.tenants'), href: HQ.tenants },
          { label: session.tenant.name, href: HQ.tenant360(session.tenant.id) },
          { label: t('platform:preview.crumb') },
        ]}
        badge={<Badge tone="demo" icon={Eye}>{t('platform:preview.badge')}</Badge>}
        description={t('platform:preview.intro', { tenant: session.tenant.name })}
      />
      <InlineAlert tone="info" title={t('platform:preview.bannerTitle', { tenant: session.tenant.name, role: dynamicT(t)(session.role.labelKey) })}>
        <span data-testid="preview-banner">{t('platform:preview.bannerBody')}</span>
        {session.containsTenantRecords === false && (
          <span className="ms-2 inline-flex align-middle" data-testid="preview-no-records">
            <Badge tone="success" icon={ShieldCheck}>{t('platform:preview.noRecords')}</Badge>
          </span>
        )}
      </InlineAlert>

      <div className="flex flex-wrap items-end gap-4">
        <SegmentedControl
          label={t('platform:preview.role')}
          value={session.role.id}
          options={session.roles.map((r) => ({ id: r.id, label: dynamicT(t)(r.labelKey) }))}
          onChange={(v) => setRoleParam(v)}
          testId="preview-role"
        />
      </div>

      {whatIf && (
        <InlineAlert tone="warning" title={t('platform:preview.whatIfTitle')}>
          <span data-testid="preview-whatif-banner">{t('platform:preview.whatIfBody')}</span>
        </InlineAlert>
      )}

      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="space-y-6 lg:col-span-5">
          <MenuPreview session={shown} />
        </div>
        <div className="space-y-6 lg:col-span-7">
          <AreaTable session={shown} baseline={whatIf ? session : null} />
          <ActionsAndSearch session={shown} />
        </div>
      </div>

      <AddressCheck session={shown} />
      <WhatIf tenant={detail.data} session={session} tried={whatIf ? (tried.data ?? null) : null} value={whatIf} onChange={setWhatIf} />
    </div>
  );
}

function useDecide(session: PreviewSession) {
  return useMemo(() => {
    const access: EffectiveAccess = session.access;
    return (target: Parameters<typeof evaluate>[1]) => evaluate(access, target, session.at);
  }, [session]);
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useT();
  return <Badge tone={TONE[status]}>{t(`platform:preview.status.${status}`)}</Badge>;
}

/** The client's sidebar and phone bar, drawn from the same model the workspace renders. */
function MenuPreview({ session }: { session: PreviewSession }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const decide = useDecide(session);
  const items = TENANT_NAV.filter((i) => i.id !== 'lab' && decide(i).allowed);
  const bar = items.filter((i) => i.bottomBar).slice(0, 3);
  const create = TENANT_QUICK_CREATE.some((q) => decide({ permission: q.permission }).allowed) && decide({ permission: 'quickcreate.use' }).allowed;
  return (
    <Panel title={t('platform:preview.menuTitle')} description={t('platform:preview.menuHint')}>
      <div className="rounded-tile border border-border bg-bg p-3" aria-label={t('platform:preview.menuFrame')} role="group">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span aria-hidden className="grid size-8 place-items-center rounded-[0.625rem] bg-primary font-semibold text-on-primary">
            {session.tenant.name.charAt(0)}
          </span>
          <bdi className="truncate text-sm font-semibold text-text">{session.tenant.name}</bdi>
        </div>
        <ul className="space-y-1" data-testid="preview-nav">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 rounded-control px-2 py-1.5 text-sm text-text" data-testid={`preview-nav-${i.id}`}>
              <i.icon aria-hidden className="size-4 text-muted" />
              {tr(i.labelKey)}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 mb-2 text-xs font-semibold tracking-[0.06em] text-muted uppercase">{t('platform:preview.phoneBar')}</p>
      <ul className="flex items-stretch justify-around rounded-[1.25rem] border border-border bg-panel px-2 py-2 text-xs text-muted" data-testid="preview-phone-bar">
        {bar.slice(0, 2).map((i) => (
          <li key={i.id} className="flex flex-col items-center gap-1">
            <i.icon aria-hidden className="size-5" />
            {tr(i.labelKey)}
          </li>
        ))}
        {create && (
          <li className="flex flex-col items-center gap-1 text-primary" data-testid="preview-phone-create">
            <span aria-hidden className="grid size-7 place-items-center rounded-pill bg-primary text-on-primary">
              <Plus className="size-4" />
            </span>
            {t('common:quickCreate.label')}
          </li>
        )}
        {bar.slice(2).map((i) => (
          <li key={i.id} className="flex flex-col items-center gap-1">
            <i.icon aria-hidden className="size-5" />
            {tr(i.labelKey)}
          </li>
        ))}
        <li className="flex flex-col items-center gap-1">
          <LayoutGrid aria-hidden className="size-5" />
          {t('nav:more')}
        </li>
      </ul>
    </Panel>
  );
}

/** Every work area, available or why not; with a what-if, what would change. */
function AreaTable({ session, baseline }: { session: PreviewSession; baseline: PreviewSession | null }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const decide = useDecide(session);
  const before = useDecide(baseline ?? session);
  return (
    <Panel title={t('platform:preview.areasTitle')} description={t('platform:preview.areasHint')}>
      <ul className="divide-y divide-border/70" data-testid="preview-areas">
        {AREAS.map((a) => {
          const status = statusOf(decide(a));
          const was = statusOf(before(a));
          const changed = baseline && status !== was;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid={`preview-area-${a.id}`} data-status={status}>
              <span className="flex items-center gap-3">
                <IconTile icon={a.icon} hue={status === 'available' ? 'emerald' : 'slate'} size="sm" />
                <span className="font-medium text-text">{tr(a.labelKey)}</span>
              </span>
              <span className="flex items-center gap-2">
                {changed && <span className="text-xs font-semibold text-accent">{t(status === 'available' ? 'platform:preview.gained' : 'platform:preview.lost')}</span>}
                <StatusBadge status={status} />
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ActionsAndSearch({ session }: { session: PreviewSession }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const decide = useDecide(session);
  return (
    <div className="grid gap-6 @container sm:grid-cols-2 [&>*]:min-w-0">
      <Panel title={t('platform:preview.quickCreate')}>
        <ul className="space-y-2" data-testid="preview-quick-create">
          {TENANT_QUICK_CREATE.map((q) => {
            const status = statusOf(decide({ permission: q.permission }));
            return (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`preview-qc-${q.id}`} data-status={status}>
                <span>{tr(q.labelKey)}</span>
                <StatusBadge status={status} />
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel title={t('platform:preview.search')}>
        <ul className="space-y-2" data-testid="preview-search">
          {TENANT_SEARCH_SCOPES.map((s) => {
            const status = statusOf(decide(s));
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`preview-search-${s.id}`} data-status={status}>
                <span>{tr(s.labelKey)}</span>
                <StatusBadge status={status} />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/** "Would this role open this address?" — the same rule the workspace applies to deep links. */
function AddressCheck({ session }: { session: PreviewSession }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const decide = useDecide(session);
  const [address, setAddress] = useState<string>(SAMPLE_ADDRESSES[0]!);
  const target = workspaceRouteTarget(address);
  const decision = decide(target);
  const status = statusOf(decision);
  const kind = status === 'available' ? null : status === 'notInPlan' ? 'notInPlan' : status === 'suspended' ? 'suspended' : status === 'inactive' ? 'inactive' : status === 'site' ? 'site' : 'role';
  return (
    <Panel title={t('platform:preview.addressTitle')} description={t('platform:preview.addressHint')}>
      <div className="grid gap-4 @xl:grid-cols-2 [&>*]:min-w-0">
        <SelectControl label={t('platform:preview.address')} value={address} options={SAMPLE_ADDRESSES.map((a) => ({ id: a, label: `\u2066${a}\u2069` }))} onChange={(v) => v && setAddress(v)} testId="preview-address" />
        <div className="rounded-tile border border-border/70 p-4" aria-live="polite" data-testid="preview-address-result" data-status={status}>
          <StatusBadge status={status} />
          <p className="mt-2 font-semibold text-text">{kind ? tr(`errors:access.${kind}.title`) : t('platform:preview.opens')}</p>
          {target.module && <p className="mt-1 text-sm text-muted">{t('platform:preview.addressModule', { module: tr(`platform:modules.${target.module}.name`) })}</p>}
        </div>
      </div>
    </Panel>
  );
}

/** Try another set of modules: nothing is saved, nothing is audited; a live change is an amendment. */
function WhatIf({
  tenant,
  session,
  tried,
  value,
  onChange,
}: {
  tenant: TenantDetail;
  session: PreviewSession;
  tried: PreviewSession | null;
  value: ModuleSelection[] | null;
  onChange: (v: ModuleSelection[] | null) => void;
}) {
  const { t } = useT();
  const catalog = useApiQuery<ModuleCatalog>({ method: 'GET', path: '/platform/catalog' });
  const actual = session.access.grants.map((g) => g.module);
  const selected = (value ?? tenant.grants).map((m) => m.module);
  const toSelections = (keys: string[]): ModuleSelection[] =>
    keys.map((k) => tenant.grants.find((g) => g.module === k) ?? { module: k as ModuleKey, sites: 'all' });
  const issues = tried?.dependencies.ok === false ? tried.dependencies.issues : [];
  return (
    <Panel title={t('platform:preview.whatIfPanel')} description={t('platform:preview.whatIfHint')}>
      <Switch isSelected={value !== null} onChange={(on) => onChange(on ? [...tenant.grants] : null)} label={t('platform:preview.whatIfToggle')} testId="preview-whatif-toggle" />
      {value !== null && catalog.data && (
        <div className="mt-4 space-y-4">
          <CheckboxGroup value={selected} onChange={(keys) => onChange(toSelections(keys))} className="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3" data-testid="preview-modules">
            <Label className="sr-only">{t('platform:preview.whatIfPanel')}</Label>
            {catalog.data.modules.map((m) => (
              <Checkbox
                key={m.key}
                value={m.key}
                isDisabled={m.alwaysOn}
                className="group flex cursor-default items-center gap-2.5 rounded-control px-2 py-1.5 text-sm text-text outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus data-disabled:text-muted"
                data-testid={`preview-module-${m.key}`}
              >
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[0.35rem] border-2 border-border-control group-data-selected:border-primary group-data-selected:bg-primary">
                  <svg viewBox="0 0 16 16" className="hidden size-3.5 text-on-primary group-data-selected:block">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  {moduleName(t, m.key)}
                  {actual.includes(m.key) && <span className="ms-1 text-xs text-muted">({t('platform:preview.inPlanNow')})</span>}
                </span>
              </Checkbox>
            ))}
          </CheckboxGroup>
          {issues.length > 0 && (
            <InlineAlert tone="warning" title={t('platform:preview.dependencyTitle')}>
              <ul className="list-disc space-y-1 ps-5" data-testid="preview-dependency-issues">
                {issues.map((i, n) => (
                  <li key={`${i.module}-${n}`}>{t('platform:preview.needs', { module: moduleName(t, i.module), needs: moduleName(t, i.requires) })}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
        </div>
      )}
    </Panel>
  );
}
