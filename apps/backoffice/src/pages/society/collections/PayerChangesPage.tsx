import type { LiabilityChange } from '@repo/contracts';
import { Badge, DateTime, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, PageHeader, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { BadgeCheck, ChevronRight, Clock3, History, Undo2, XCircle } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { useSocietySiteId } from './site';

const FILTERS = ['pending_approval', 'approved', 'all'] as const;
const STATE: Record<LiabilityChange['state'], ['warning' | 'success' | 'error' | 'neutral', typeof Clock3]> = {
  pending_approval: ['warning', Clock3],
  approved: ['success', BadgeCheck],
  rejected: ['error', XCircle],
  withdrawn: ['neutral', Undo2],
  superseded: ['neutral', History],
};

/** Liability (payer) changes across the site: what waits for a second person, and what was decided. */
export default function PayerChangesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const siteId = useSocietySiteId();
  const [state] = useQueryParam('state');
  const setParams = useQueryParams();
  const filter = (FILTERS as readonly string[]).includes(state ?? '') ? (state as (typeof FILTERS)[number]) : 'pending_approval';
  const q = useApiQuery<LiabilityChange[]>({ method: 'GET', path: '/payer-changes', query: { state: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="payer-changes">
      <PageHeader title={t('nav:pages.payerChanges')} description={t('sites:payer.pageIntro')} />
      <FilterPills label={t('sites:payer.filter')} value={filter} testId="payer-changes-filter" onChange={(v) => setParams({ state: v === 'pending_approval' ? null : v })} options={FILTERS.map((f) => ({ id: f, label: t(`sites:payer.filters.${f}`) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={5} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('sites:payer.emptyTitle')} body={t('sites:payer.emptyBody')} />
      ) : (
        <ul className="space-y-2">
          {q.data.map((c) => {
            const [tone, Icon] = STATE[c.state];
            return (
              <li key={c.id}>
                <Link href={siteId ? SOCIETY.flat(siteId, c.flatId, 'payer') : '#'} variant="plain" className="flex flex-wrap items-center gap-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised" data-testid="payer-change-row" data-state={c.state}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-text">
                      <bdi dir="ltr" className="ltr-ref">{c.flatCode}</bdi> · {t('sites:payer.changeLine', { name: c.partyName, date: fmt.date(c.from) })}
                    </span>
                    <span className="block text-xs text-muted">
                      {t('sites:payer.requestedBy', { name: c.requestedByName })} · <DateTime value={c.requestedAt} style="dateTime" /> · <bdi>{t('billing:quote', { text: c.reason })}</bdi>
                    </span>
                    {c.raisedBy && (
                      <span className="block text-xs text-text" data-testid="payer-change-raised-by">
                        {t('finance:payerChange.raisedBy', { ref: c.raisedBy.ref })}
                      </span>
                    )}
                  </span>
                  <Badge tone={tone} icon={Icon}>{t(`sites:payer.states.${c.state}`)}</Badge>
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
