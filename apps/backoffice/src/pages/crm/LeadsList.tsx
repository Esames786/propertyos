import { LEAD_SORTS, PIPELINE_STAGES, type LeadListResponse, type LeadSort, type PipelineStageId } from '@repo/contracts';
import {
  Button,
  DirectionalIcon,
  EmptyState,
  ErrorState,
  FilterPills,
  PageHeader,
  RevealItem,
  SelectControl,
  Skeleton,
  Stagger,
  useAnnounce,
  useApiQuery,
  useNavigation,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
} from '@repo/ui';
import { useTraining } from '@repo/ui/onboarding';
import { ChevronLeft, ChevronRight, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input, SearchField, Label, Button as AriaButton } from 'react-aria-components';
import { useContactSheet } from './ContactSheet';
import { useCrmFormat } from './format';
import { LeadCard } from './LeadCard';

const STAGES = ['all', ...PIPELINE_STAGES] as const;

/**
 * Lead list (CRM-002). Search, stage and sort live in the URL, so a filtered list is shareable and
 * coming back from a lead restores it exactly. Leads created in this session are listed first with
 * a "New" marker; practice leads appear only while practice mode is on, labelled as practice.
 */
export default function LeadsList() {
  const { t } = useT();
  const { can } = useSession();
  const f = useCrmFormat();
  const announce = useAnnounce();
  const training = useTraining();
  const { location } = useNavigation();
  const [q] = useQueryParam('q');
  const [status] = useQueryParam('status');
  const [sort] = useQueryParam('sort');
  const [page] = useQueryParam('page');
  const [, setDrawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const contact = useContactSheet();

  const stage: PipelineStageId | 'all' = (STAGES as readonly string[]).includes(status ?? '') ? (status as PipelineStageId) : 'all';
  const sortBy: LeadSort = (LEAD_SORTS as readonly string[]).includes(sort ?? '') ? (sort as LeadSort) : 'recent';
  const pageNo = Math.max(1, Number(page) || 1);

  // Debounce typing into the URL (replace, so Back is not flooded with keystrokes).
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const list = useApiQuery<LeadListResponse>(
    {
      method: 'GET',
      path: '/leads',
      query: { q: q ?? undefined, status: stage, sort: sortBy, page: pageNo },
      training: training.active,
    },
    { placeholderData: (prev) => prev },
  );

  const total = list.data?.total;
  const first = useRef(true);
  useEffect(() => {
    if (total === undefined) return;
    if (first.current) {
      first.current = false;
      return;
    }
    announce(t('crm:list.updated', { count: total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, q, stage]);

  const from = `${location.pathname}${location.search}`;
  const counts = list.data?.counts;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const start = list.data && list.data.total ? (list.data.page - 1) * list.data.pageSize + 1 : 0;
  const end = list.data ? Math.min(list.data.total, list.data.page * list.data.pageSize) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav:pages.leadsList')}
        breadcrumbs={[{ label: t('nav:pages.salesHome'), href: '/backoffice/crm/sales-home' }]}
        description={total !== undefined ? t('crm:list.description', { count: total }) : undefined}
        actions={
          can('lead.create') && (
            <Button variant="primary" icon={UserPlus} onPress={() => setDrawer('new-lead', { replace: false })} data-testid="leads-new">
              {t('crm:home.actionNewLead')}
            </Button>
          )
        }
      />

      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <SearchField value={draft} onChange={setDraft} className="flex min-w-0 flex-1 flex-col gap-1.5" data-testid="leads-search">
            <Label className="text-sm font-medium text-text">{t('crm:list.search')}</Label>
            <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
              <Search aria-hidden className="size-4 shrink-0 text-muted" />
              <Input placeholder={t('crm:list.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
              {draft && (
                <AriaButton aria-label={t('common:actions.clear')} className="grid size-8 place-items-center rounded-pill text-muted outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus">
                  <X aria-hidden className="size-4" />
                </AriaButton>
              )}
            </div>
          </SearchField>
          <div className="md:w-56">
            <SelectControl
              label={t('crm:list.sort')}
              value={sortBy}
              options={[
                { id: 'recent', label: t('crm:list.sortRecent') },
                { id: 'followUp', label: t('crm:list.sortFollowUp') },
                { id: 'budget', label: t('crm:list.sortBudget') },
                { id: 'name', label: t('crm:list.sortName') },
              ]}
              onChange={(v) => setParams({ sort: v && v !== 'recent' ? v : null, page: null })}
              testId="leads-sort"
            />
          </div>
        </div>
        <FilterPills
          label={t('crm:list.stageFilter')}
          showLabel
          value={stage}
          testId="leads-stage"
          onChange={(v) => setParams({ status: v === 'all' ? null : v, page: null })}
          options={STAGES.map((s) => ({ id: s, label: t(`crm:stage.${s}`), count: counts?.[s] }))}
        />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div role="status" aria-busy="true" className="grid gap-3 lg:grid-cols-2">
          <span className="sr-only">{t('common:state.loading')}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-card" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          title={t('crm:list.emptyTitle')}
          body={t('crm:list.emptyBody')}
          actions={
            <Button
              variant="secondary"
              onPress={() => {
                setDraft('');
                setParams({ q: null, status: null, page: null });
              }}
            >
              {t('crm:list.clear')}
            </Button>
          }
        />
      ) : (
        <>
          <Stagger as="ul" key={`${stage}-${sortBy}-${pageNo}-${q ?? ''}`} className="grid gap-3 lg:grid-cols-2">
            {list.data.items.map((l) => (
              <RevealItem as="li" key={l.id}>
                <LeadCard lead={l} f={f} from={from} onContact={contact.open} />
              </RevealItem>
            ))}
          </Stagger>
          <nav aria-label={t('crm:list.pagination')} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" data-testid="leads-showing">
              {t('crm:list.showing', { from: f.count(start), to: f.count(end), total: f.count(list.data.total) })}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" isDisabled={pageNo <= 1} onPress={() => setParams({ page: pageNo - 1 > 1 ? String(pageNo - 1) : null }, { replace: false })}>
                <span className="inline-flex items-center gap-1.5">
                  <DirectionalIcon icon={ChevronLeft} className="size-4" />
                  {t('crm:list.previous')}
                </span>
              </Button>
              <Button variant="secondary" isDisabled={pageNo >= pages} onPress={() => setParams({ page: String(pageNo + 1) }, { replace: false })} data-testid="leads-next">
                <span className="inline-flex items-center gap-1.5">
                  {t('crm:list.next')}
                  <DirectionalIcon icon={ChevronRight} className="size-4" />
                </span>
              </Button>
            </div>
          </nav>
        </>
      )}
      {contact.sheet}
    </div>
  );
}
