import { ACTIVITY_RANGES, type ActivityItem, type ActivityResponse } from '@repo/contracts';
import { Button, dynamicT, EmptyState, ErrorState, FilterPills, Link, PageHeader, SegmentedControl, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { ChevronDown } from 'lucide-react';
import { Loading } from '../../society/kit';
import { byDay, DayHeading, DEMO_TODAY, HubNav, RecordLine, TYPE_ICON, useHubFormat } from './wkit';

/**
 * HOME-005 recent activity: what happened on the records the reader may open (lead history, document
 * uploads and versions, template and policy drafts and decisions), newest first. The server projects
 * it by the reader's scope before sending it (Issue #16 P0-1): nothing names a hidden record.
 */
function useParams() {
  const { t } = useT();
  const f = useHubFormat();
  return (item: ActivityItem) => {
    const p: Record<string, string> = { ...item.params };
    if (p.source) p.source = t(`crm:source.${p.source}` as 'crm:source.website');
    if (p.status) p.status = t(`status:lead.${p.status}` as 'status:lead.new');
    if (p.at) p.at = f.when(p.at);
    if (p.until) p.until = f.when(p.until);
    if (p.date) p.date = f.date(p.date);
    return p;
  };
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const f = useHubFormat();
  const params = useParams();
  const Icon = TYPE_ICON[item.record.type];
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="activity-row" data-group={item.group} data-record={item.record.id} data-mine={item.mine}>
      <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm text-text [overflow-wrap:anywhere]">
          <bdi className="font-medium">{item.mine ? t('workspace:hub.activity.you') : item.actorName}</bdi> {dt(item.messageKey, params(item))}
        </p>
        <p className="text-sm [overflow-wrap:anywhere]">
          <Link href={item.record.href} data-testid="activity-record">
            <bdi>{item.record.title}</bdi>
          </Link>
        </p>
        <RecordLine record={item.record} />
        <p className="text-xs text-muted">
          <time dateTime={item.at}>{f.when(item.at)}</time>
        </p>
      </div>
    </li>
  );
}

export default function RecentActivityPage() {
  const { t } = useT();
  const set = useQueryParams();
  const [range] = useQueryParam('range');
  const [group] = useQueryParam('group');
  const [who] = useQueryParam('who');
  const [limitParam] = useQueryParam('limit');
  const limit = Math.min(Math.max(Number(limitParam) || 40, 40), 400);
  const q = useApiQuery<ActivityResponse>({ method: 'GET', path: '/workspace/activity', query: { range: range ?? '7d', group: group ?? 'all', who: who ?? 'all', limit } }, { placeholderData: (prev) => prev });
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="recent-activity">
      <PageHeader title={t('workspace:hub.activity.title')} description={t('workspace:hub.activity.intro')} />
      <HubNav current="activity" />
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          label={t('workspace:hub.activity.rangeLabel')}
          options={ACTIVITY_RANGES.map((r) => ({ id: r, label: t(`workspace:hub.activity.range.${r}`) }))}
          value={(range ?? '7d') as (typeof ACTIVITY_RANGES)[number]}
          onChange={(v) => set({ range: v === '7d' ? null : v, limit: null })}
          testId="activity-range"
          wrap
        />
        <SegmentedControl
          label={t('workspace:hub.activity.whoLabel')}
          options={[
            { id: 'all', label: t('workspace:hub.activity.who.all') },
            { id: 'mine', label: t('workspace:hub.activity.who.mine') },
          ]}
          value={(who ?? 'all') as 'all' | 'mine'}
          onChange={(v) => set({ who: v === 'all' ? null : v, limit: null })}
          testId="activity-who"
          wrap
        />
      </div>
      {d && d.groups.length > 1 && (
        <FilterPills
          label={t('workspace:hub.activity.groupLabel')}
          options={[{ id: 'all', label: t('workspace:hub.activity.group.all') }, ...d.groups.map((g) => ({ id: g, label: t(`workspace:hub.activity.group.${g}`) }))]}
          value={group ?? 'all'}
          onChange={(v) => set({ group: v === 'all' ? null : v, limit: null })}
          testId="activity-group"
        />
      )}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Loading lines={8} />
      ) : d.items.length === 0 ? (
        <EmptyState title={t('workspace:hub.activity.none')} body={t('workspace:hub.activity.noneBody')} />
      ) : (
        <div className="space-y-5" data-testid="activity-list">
          {byDay(d.items, (i) => i.at).map((g) => (
            <section key={g.day} aria-labelledby={`activity-day-${g.day}`} className="space-y-2">
              <DayHeading id={`activity-day-${g.day}`} day={g.day} today={DEMO_TODAY} />
              <ul className="space-y-2">
                {g.items.map((i) => (
                  <ActivityRow key={i.id} item={i} />
                ))}
              </ul>
            </section>
          ))}
          {d.more && (
            <Button variant="secondary" icon={ChevronDown} onPress={() => set({ limit: String(limit + 40) })} data-testid="activity-more">
              {t('workspace:hub.activity.more')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
