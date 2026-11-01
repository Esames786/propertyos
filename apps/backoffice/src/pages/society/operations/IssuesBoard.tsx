import type { RequestList, ResidentCount } from '@repo/contracts';
import { Button, DirectionalIcon, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { ChevronRight, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { OPS } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { MaintenanceTabs } from './MaintenancePages';
import { PriorityBadge, RequestBadge, useOpsWords, When } from './okit';

type IssueBoard = RequestList & { snapshotAt?: string; threshold: { minCount: number; minAudience: number }; residentViews: Record<string, ResidentCount>; live: Record<string, number> };

const STATUSES = ['open', 'in_progress', 'resolved', 'merged', 'hidden', 'all'] as const;

/**
 * MNT-012 community issues (D-28: the same request model, kind = community issue). Staff see the live
 * number of affected households and who they are; beside it, exactly what residents see now: a
 * scheduled count only when the privacy rule allows it (D-47), otherwise "Reported".
 */
export default function IssuesBoard() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const w = useOpsWords();
  const toast = useToast();
  const { can } = useSession();
  const [status] = useQueryParam('issueStatus');
  const setParams = useQueryParams();
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'open';
  const q = useApiQuery<IssueBoard>({ method: 'GET', path: '/issues', query: { status: filter === 'open' ? 'open' : 'all', issueStatus: filter } }, { placeholderData: (prev) => prev });
  const refresh = useApiMutation<{ snapshotAt: string }>();
  return (
    <div className="@container space-y-5" data-testid="issues-board">
      <PageHeader
        title={t('operations:issues.title')}
        description={t('operations:issues.intro')}
        actions={
          can('issues.manage') ? (
            <Button
              variant="secondary"
              icon={RefreshCw}
              isPending={refresh.isPending}
              onPress={async () => {
                await refresh.mutateAsync({ method: 'POST', path: '/issues/refresh' });
                toast.success(t('operations:issue.refreshed'));
                void q.refetch();
              }}
              data-testid="issues-refresh"
            >
              {t('operations:issue.refreshNow')}
            </Button>
          ) : undefined
        }
      />
      <MaintenanceTabs current="issues" />
      <InlineAlert tone="info" title={t('operations:issues.privacyTitle')}>
        <p>{t('operations:issues.privacyBody', { count: q.data?.threshold.minCount ?? 3, audience: q.data?.threshold.minAudience ?? 5 })}</p>
        {q.data?.snapshotAt && (
          <p className="mt-1 text-xs">
            {t('operations:issue.snapshotAt')} <When at={q.data.snapshotAt} />
          </p>
        )}
      </InlineAlert>
      <FilterPills label={t('operations:issues.status')} value={filter} onChange={(v) => setParams({ issueStatus: v === 'open' ? null : v })} testId="issue-status" options={STATUSES.map((s) => ({ id: s, label: t(`operations:issues.statuses.${s}`) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('operations:issues.emptyTitle')} body={t('operations:issues.emptyBody')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2" data-testid="issue-list">
          {q.data.items.map((i) => {
            const rv = q.data!.residentViews[i.id];
            return (
              <li key={i.id}>
                <Link href={OPS.request(i.id, undefined)} variant="plain" className="block space-y-2 rounded-card border border-border/70 bg-panel p-4 shadow-card hover:bg-raised" data-testid="issue-card" data-ref={i.ref} data-state={i.state}>
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-semibold text-text [overflow-wrap:anywhere]"><bdi>{i.title}</bdi></span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">{i.ref}</bdi> · {w.areaKey(i.where)} · {w.category(i.category)}
                      </span>
                    </span>
                    <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <RequestBadge state={i.state} />
                    {i.priority && <PriorityBadge priority={i.priority} />}
                  </span>
                  <span className="grid grid-cols-1 gap-1 text-sm @md:grid-cols-2">
                    <span className="flex items-center gap-1.5 text-text" data-testid="issue-live">
                      <Users aria-hidden className="size-4 text-muted" />
                      {t('operations:issues.staffCount', { count: fmt.count(i.affected ?? 0) })}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted" data-testid="issue-resident-view">
                      <ShieldCheck aria-hidden className="size-4" />
                      {rv?.shown ? t('operations:issues.residentsSee', { count: rv.site }) : t('operations:issues.residentsSeeReported')}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
