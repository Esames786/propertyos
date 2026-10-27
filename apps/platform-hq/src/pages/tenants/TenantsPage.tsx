import type { EditionKey, TenantListResponse, TenantStatus, TenantSummary, WorkspaceRequest } from '@repo/contracts';
import { EDITIONS } from '@repo/contracts';
import {
  Badge,
  buttonClass,
  EmptyState,
  ErrorState,
  FilterPills,
  IconTile,
  Link,
  PageHeader,
  RevealItem,
  SelectControl,
  Skeleton,
  Stagger,
  UrlTabs,
  useAnnounce,
  useApiQuery,
  useCan,
  useQueryParam,
  useQueryParams,
  useT,
} from '@repo/ui';
import { Mail, Plus, Search, Sparkles, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button as AriaButton, Input, Label, SearchField } from 'react-aria-components';
import { useHqFormat } from '../../lib/format';
import { EDITION_HUE, EDITION_ICON, editionName, lifecycleOf, STATUS_ICON, STATUS_TONE } from '../../lib/labels';
import { HQ } from '../../nav.config';
import { TenantSummaryDrawer } from './TenantSummaryDrawer';

type Filter = 'all' | TenantStatus | 'awaiting_approval';
const FILTERS: Filter[] = ['all', 'active', 'trial', 'awaiting_approval', 'grace', 'suspended', 'draft'];
const SORTS = ['created', 'name', 'mrr'] as const;

/**
 * HQ-002 Tenants. Search, status, edition and sort live in the URL (shareable, restored on Back);
 * a row opens the tenant summary drawer (?tenant=…). Workspace requests (D-8) are a second tab.
 */
export default function TenantsPage() {
  const { t } = useT();
  const can = useCan();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('platform:pages.tenants')}
        description={t('platform:tenants.description')}
        actions={
          can('platform.tenants.create') && (
            <Link variant="plain" href={HQ.createTenant} className={buttonClass('primary')} data-testid="tenants-create">
              <Plus aria-hidden className="size-4" />
              {t('platform:shell.createTenant')}
            </Link>
          )
        }
      />
      <UrlTabs
        label={t('platform:pages.tenants')}
        defaultId="tenants"
        items={[
          { id: 'tenants', label: t('platform:tenants.tabs.tenants') },
          { id: 'requests', label: t('platform:tenants.tabs.requests') },
        ]}
      >
        {(tab) => (tab === 'requests' ? <RequestsTab /> : <TenantList />)}
      </UrlTabs>
      <TenantSummaryDrawer />
    </div>
  );
}

function TenantList() {
  const { t } = useT();
  const fmt = useHqFormat();
  const announce = useAnnounce();
  const [q] = useQueryParam('q');
  const [status] = useQueryParam('status');
  const [edition] = useQueryParam('edition');
  const [sort] = useQueryParam('sort');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');

  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? '') ? (status as Filter) : 'all';
  const ed: EditionKey | 'all' = (EDITIONS as readonly string[]).includes(edition ?? '') ? (edition as EditionKey) : 'all';
  const sortBy = (SORTS as readonly string[]).includes(sort ?? '') ? (sort as (typeof SORTS)[number]) : 'created';

  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const list = useApiQuery<TenantListResponse>(
    { method: 'GET', path: '/platform/tenants', query: { q: q ?? undefined, status: filter === 'all' ? undefined : filter, edition: ed === 'all' ? undefined : ed, sort: sortBy } },
    { placeholderData: (prev) => prev },
  );

  const total = list.data?.total;
  const firstLoad = useRef(true);
  useEffect(() => {
    if (total === undefined) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    announce(t('platform:tenants.updated', { count: total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, q, filter, ed]);

  const counts = list.data?.counts;
  const allCount = counts ? Object.entries(counts).filter(([k]) => k !== 'awaiting_approval').reduce((s, [, n]) => s + n, 0) : undefined;
  const open = (id: string) => setParams({ tenant: id }, { replace: false });

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <SearchField value={draft} onChange={setDraft} className="flex min-w-0 flex-1 flex-col gap-1.5" data-testid="tenants-search">
            <Label className="text-sm font-medium text-text">{t('platform:tenants.search')}</Label>
            <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
              <Search aria-hidden className="size-4 shrink-0 text-muted" />
              <Input placeholder={t('platform:tenants.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
              {draft && (
                <AriaButton aria-label={t('common:actions.clear')} className="grid size-8 place-items-center rounded-pill text-muted outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus">
                  <X aria-hidden className="size-4" />
                </AriaButton>
              )}
            </div>
          </SearchField>
          <div className="grid grid-cols-2 gap-3 md:w-[26rem]">
            <SelectControl
              label={t('platform:tenants.edition')}
              value={ed}
              options={[{ id: 'all', label: t('platform:tenants.allEditions') }, ...EDITIONS.map((e) => ({ id: e, label: editionName(t, e) }))]}
              onChange={(v) => setParams({ edition: v && v !== 'all' ? v : null })}
              testId="tenants-edition"
            />
            <SelectControl
              label={t('platform:tenants.sort')}
              value={sortBy}
              options={SORTS.map((s) => ({ id: s, label: t(`platform:tenants.sorts.${s}`) }))}
              onChange={(v) => setParams({ sort: v && v !== 'created' ? v : null })}
              testId="tenants-sort"
            />
          </div>
        </div>
        <FilterPills
          label={t('platform:tenants.statusFilter')}
          showLabel
          value={filter}
          testId="tenants-status"
          onChange={(v) => setParams({ status: v === 'all' ? null : v })}
          options={FILTERS.map((f) => ({ id: f, label: f === 'all' ? t('platform:tenants.filters.all') : t(`platform:tenants.filters.${f}`), count: f === 'all' ? allCount : counts?.[f] }))}
        />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common:state.loading')}</span>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-tile" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState title={t('platform:tenants.emptyTitle')} body={t('platform:tenants.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {t('platform:tenants.showing', { count: list.data.total })}
          </p>
          {/* Wide screens: a real table (caption, row headers) in a labelled, keyboard-scrollable region. */}
          <div role="region" aria-label={t('platform:tenants.tableLabel')} tabIndex={0} className="hidden overflow-x-auto rounded-card border border-border/70 bg-panel shadow-card outline-none focus-visible:outline-2 focus-visible:outline-focus md:block">
            <table className="w-full text-sm" data-testid="tenants-table">
              <caption className="sr-only">{t('platform:tenants.tableLabel')}</caption>
              <thead className="border-b border-border bg-sunken/50 text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{t('platform:tenants.col.tenant')}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{t('platform:tenants.col.edition')}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{t('platform:tenants.col.status')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{t('platform:tenants.col.units')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{t('platform:tenants.col.modules')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{t('platform:tenants.col.mrr')}</th>
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{t('platform:tenants.col.created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {list.data.items.map((tn) => (
                  <TenantRow key={tn.id} tenant={tn} onOpen={() => open(tn.id)} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: one card per tenant. */}
          <Stagger as="ul" className="grid gap-3 md:hidden [&>*]:min-w-0" testId="tenants-cards">
            {list.data.items.map((tn) => (
              <RevealItem as="li" key={tn.id}>
                <TenantCard tenant={tn} onOpen={() => open(tn.id)} />
              </RevealItem>
            ))}
          </Stagger>
        </>
      )}
      <p className="text-xs text-muted">{t('platform:tenants.metadataOnly', { date: fmt.date('2026-10-26') })}</p>
    </div>
  );
}

function StatusBadge({ tenant }: { tenant: TenantSummary }) {
  const { t } = useT();
  const s = lifecycleOf(tenant);
  return (
    <Badge tone={STATUS_TONE[s]} icon={STATUS_ICON[s]}>
      {t(`platform:status.${s}`)}
    </Badge>
  );
}

function TenantRow({ tenant: tn, onOpen }: { tenant: TenantSummary; onOpen: () => void }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <tr className="transition-colors hover:bg-sunken/40" data-testid={`tenant-row-${tn.id}`}>
      <th scope="row" className="px-4 py-3 text-start font-normal">
        <div className="flex items-center gap-3">
          <IconTile icon={EDITION_ICON[tn.edition]} hue={EDITION_HUE[tn.edition]} size="sm" />
          <div className="min-w-0">
            <AriaButton onPress={onOpen} className="max-w-[22rem] truncate text-start font-semibold text-primary underline-offset-2 outline-none data-hovered:underline data-focus-visible:rounded-sm data-focus-visible:outline-2 data-focus-visible:outline-focus" data-testid={`open-${tn.id}`}>
              <bdi>{tn.displayName}</bdi>
            </AriaButton>
            <p className="truncate text-xs text-muted">
              <bdi>{tn.legalName}</bdi> · {tn.city}
            </p>
          </div>
          {tn.createdInSession && <Badge tone="info" icon={Sparkles}>{t('platform:tenants.new')}</Badge>}
        </div>
      </th>
      <td className="px-4 py-3 whitespace-nowrap">{editionName(t, tn.edition)}</td>
      <td className="px-4 py-3">
        <StatusBadge tenant={tn} />
      </td>
      <td className="px-4 py-3 text-end tabular">
        {fmt.count(tn.units.eligible ?? tn.units.declared)}
        <span className="block text-xs whitespace-nowrap text-muted">{t('platform:tenants.sites', { count: tn.siteCount })}</span>
      </td>
      <td className="px-4 py-3 text-end tabular">{fmt.count(tn.modules.length)}</td>
      <td className="px-4 py-3 text-end font-semibold tabular">
        <bdi dir="ltr">{fmt.money(tn.mrr)}</bdi>
      </td>
      <td className="px-4 py-3 text-end whitespace-nowrap text-muted">{fmt.date(tn.createdAt)}</td>
    </tr>
  );
}

function TenantCard({ tenant: tn, onOpen }: { tenant: TenantSummary; onOpen: () => void }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <AriaButton
      onPress={onOpen}
      className="flex w-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-4 text-start shadow-card outline-none transition-[translate,box-shadow] data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-focus-visible:outline-2 data-focus-visible:outline-focus"
      data-testid={`tenant-card-${tn.id}`}
    >
      <span className="flex flex-wrap items-start gap-3">
        <IconTile icon={EDITION_ICON[tn.edition]} hue={EDITION_HUE[tn.edition]} size="md" />
        <span className="min-w-0 flex-1 basis-40">
          <span className="block font-bold text-text">
            <bdi>{tn.displayName}</bdi>
          </span>
          <span className="block text-sm text-muted">
            {editionName(t, tn.edition)} · {tn.city}
          </span>
        </span>
        <StatusBadge tenant={tn} />
      </span>
      <span className="grid grid-cols-3 gap-2 border-t border-border/70 pt-3 text-sm">
        <span>
          <span className="block text-xs text-muted">{t('platform:tenants.col.units')}</span>
          <span className="font-semibold tabular">{fmt.count(tn.units.eligible ?? tn.units.declared)}</span>
        </span>
        <span>
          <span className="block text-xs text-muted">{t('platform:tenants.col.modules')}</span>
          <span className="font-semibold tabular">{fmt.count(tn.modules.length)}</span>
        </span>
        <span>
          <span className="block text-xs text-muted">{t('platform:tenants.col.mrr')}</span>
          <bdi dir="ltr" className="font-semibold tabular">
            {fmt.money(tn.mrr)}
          </bdi>
        </span>
      </span>
    </AriaButton>
  );
}

function RequestsTab() {
  const { t } = useT();
  const fmt = useHqFormat();
  const can = useCan();
  const requests = useApiQuery<WorkspaceRequest[]>({ method: 'GET', path: '/platform/requests' });
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />;
  if (!requests.data) return <Skeleton className="h-48 rounded-card" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('platform:requests.intro')}</p>
      <Stagger as="ul" className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0" testId="requests-list">
        {requests.data.map((r) => (
          <RevealItem as="li" key={r.id}>
            <article className="flex h-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid={`request-${r.id}`}>
              <div className="flex items-start gap-3">
                <IconTile icon={r.kind === 'sales' ? Mail : r.kind === 'trial' ? Sparkles : UserPlus} hue="sky" size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text">
                    <bdi>{r.organisation}</bdi>
                  </h3>
                  <p className="text-sm text-muted">
                    <bdi>{r.contactName}</bdi> · {r.city} · {fmt.relative(r.receivedAt)}
                  </p>
                </div>
                <Badge tone={r.status === 'new' ? 'info' : 'neutral'}>{t(`platform:requests.status.${r.status}`)}</Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">{t('platform:requests.kindLabel')}</dt>
                  <dd className="font-medium">{t(`platform:requests.kind.${r.kind}`)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('platform:tenants.edition')}</dt>
                  <dd className="font-medium">{editionName(t, r.edition)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('platform:requests.units')}</dt>
                  <dd className="font-medium tabular">{r.expectedUnits ? fmt.count(r.expectedUnits) : '—'}</dd>
                </div>
              </dl>
              {can('platform.tenants.create') && r.status !== 'converted' && r.status !== 'declined' && (
                <Link variant="plain" href={`${HQ.createTenant}?from=${r.id}`} className={`${buttonClass('secondary')} mt-auto self-start`} data-testid={`request-start-${r.id}`}>
                  <Plus aria-hidden className="size-4" />
                  {t('platform:requests.start')}
                </Link>
              )}
            </article>
          </RevealItem>
        ))}
      </Stagger>
    </div>
  );
}
