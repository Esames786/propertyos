import { TASK_URGENCIES, type TaskItem, type TaskKind, type TaskUrgency, type TasksResponse, type WorkQueueResponse } from '@repo/contracts';
import { Badge, dynamicT, EmptyState, ErrorState, FilterPills, PageHeader, PlainTextField, SelectControl, useApiQuery, useQueryParam, useQueryParams, useT, type StatusTone } from '@repo/ui';
import { AlarmClock, ArrowRight, CalendarClock, CircleDashed, Clock3, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Loading } from '../../society/kit';
import { unbroken, LinkButton } from '../../society/hr/hkit';
import { HubNav, RecordLine, ShortcutsHelp, TYPE_ICON, useFavourites, useHubFormat, useShortcuts, FavouriteButton, type Shortcut } from './wkit';

/**
 * HOME-002 my tasks and HOME-004 work queue: real work from the person's modules (follow-ups, site
 * visits, unit holds, document expiry, template approvals, a society's billing and approval steps),
 * each re-resolved by the server for the reader. Every count opens the items behind it; nothing
 * hidden is counted. Each item links straight to where the work is done.
 */
const URGENCY: Record<TaskUrgency, [StatusTone, LucideIcon]> = {
  overdue: ['error', TriangleAlert],
  today: ['warning', AlarmClock],
  soon: ['info', Clock3],
  later: ['neutral', CircleDashed],
};

export function UrgencyBadge({ urgency }: { urgency: TaskUrgency }) {
  const { t } = useT();
  const [tone, icon] = URGENCY[urgency];
  return (
    <Badge tone={tone} icon={icon} data-urgency={urgency}>
      {t(`workspace:hub.tasks.urgency.${urgency}`)}
    </Badge>
  );
}

function TaskRow({ task, favourites }: { task: TaskItem; favourites: ReturnType<typeof useFavourites> }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const f = useHubFormat();
  const Icon = task.record ? TYPE_ICON[task.record.type] : CalendarClock;
  const title = task.record ? task.record.title : dt(task.titleKey ?? '', task.params);
  const owner = task.owner ? (task.owner.mine ? t('workspace:hub.tasks.ownerYou') : t('workspace:hub.tasks.owner', { name: task.owner.name })) : t('workspace:hub.tasks.ownerNobody');
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-3 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="task-row" data-kind={task.kind} data-urgency={task.urgency} data-record={task.record?.id ?? ''} data-mine={task.owner?.mine ?? false}>
      <div className="flex min-w-0 flex-1 basis-[16rem] items-start gap-3">
      <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-muted">{dt(`workspace:hub.tasks.kind.${task.kind}`, { ...task.detail, ...task.params })}</p>
        <p className="text-sm font-semibold text-text [overflow-wrap:anywhere]">
          <bdi>{unbroken(title)}</bdi>
        </p>
        {task.record && <RecordLine record={task.record} />}
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UrgencyBadge urgency={task.urgency} />
          {task.due && <span>{t('workspace:hub.tasks.due', { when: f.when(task.due) })}</span>}
          <span>{owner}</span>
        </p>
        {task.detail?.note && <p className="text-xs text-muted">{t('workspace:hub.tasks.returnedNote', { note: task.detail.note })}</p>}
      </div>
      </div>
      <div className="ms-auto flex max-w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-1">
        <LinkButton href={task.actionHref} size="sm" variant="secondary" icon={ArrowRight} testId="task-action">
          {t(`workspace:hub.tasks.action.${task.kind}`)}
        </LinkButton>
        {task.record && <FavouriteButton record={task.record} isFavourite={favourites.isFavourite(task.record.id)} onToggle={() => void favourites.toggle(task.record!)} />}
      </div>
    </li>
  );
}

function TaskGroups({ items }: { items: readonly TaskItem[] }) {
  const { t } = useT();
  const favourites = useFavourites();
  return (
    <div className="space-y-5" data-testid="task-list">
      {TASK_URGENCIES.filter((u) => items.some((i) => i.urgency === u)).map((u) => (
        <section key={u} aria-labelledby={`tasks-${u}`} className="space-y-2">
          <h2 id={`tasks-${u}`} className="text-sm font-semibold text-muted">
            {t(`workspace:hub.tasks.group.${u}`)}
          </h2>
          <ul className="space-y-2">
            {items.filter((i) => i.urgency === u).map((i) => (
              <TaskRow key={i.id} task={i} favourites={favourites} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function UrgencyPills({ counts, value, onChange }: { counts: Record<TaskUrgency, number>; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const total = TASK_URGENCIES.reduce((n, u) => n + counts[u], 0);
  return (
    <FilterPills
      label={t('workspace:hub.tasks.urgencyLabel')}
      options={[{ id: 'all', label: t('workspace:hub.tasks.urgency.all'), count: total }, ...TASK_URGENCIES.map((u) => ({ id: u, label: t(`workspace:hub.tasks.urgency.${u}`), count: counts[u] }))]}
      value={value}
      onChange={onChange}
      testId="task-urgency"
    />
  );
}

function KindSelect({ kinds, value, onChange }: { kinds: readonly TaskKind[]; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const dt = dynamicT(t);
  if (kinds.length < 2) return null;
  return (
    <div className="w-full max-w-xs">
      <SelectControl
        label={t('workspace:hub.tasks.kindLabel')}
        value={value}
        onChange={(v) => onChange(v ?? 'all')}
        options={[{ id: 'all', label: t('workspace:hub.tasks.allKinds') }, ...kinds.map((k) => ({ id: k, label: dt(`workspace:hub.tasks.kindName.${k}`) }))]}
        testId="task-kind"
      />
    </div>
  );
}

export function MyTasksPage() {
  const { t } = useT();
  const set = useQueryParams();
  const [urgency] = useQueryParam('urgency');
  const [kind] = useQueryParam('kind');
  const q = useApiQuery<TasksResponse>({ method: 'GET', path: '/workspace/tasks', query: { urgency: urgency ?? 'all', kind: kind ?? 'all' } }, { placeholderData: (prev) => prev });
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="my-tasks">
      <PageHeader title={t('workspace:hub.tasks.title')} description={t('workspace:hub.tasks.intro')} />
      <HubNav current="tasks" />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Loading lines={8} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <UrgencyPills counts={d.counts} value={urgency ?? 'all'} onChange={(v) => set({ urgency: v === 'all' ? null : v })} />
            <KindSelect kinds={d.kinds} value={kind ?? 'all'} onChange={(v) => set({ kind: v === 'all' ? null : v })} />
          </div>
          {d.items.length === 0 ? (
            <EmptyState title={t(urgency || kind ? 'workspace:hub.tasks.noneFiltered' : 'workspace:hub.tasks.none')} body={t('workspace:hub.tasks.noneBody')} />
          ) : (
            <TaskGroups items={d.items} />
          )}
        </>
      )}
    </div>
  );
}

export function WorkQueuePage() {
  const { t } = useT();
  const set = useQueryParams();
  const [urgency] = useQueryParam('urgency');
  const [kind] = useQueryParam('kind');
  const [owner] = useQueryParam('owner');
  const [project] = useQueryParam('project');
  const [search] = useQueryParam('q');
  const field = useRef<HTMLDivElement>(null);
  const query = { urgency: urgency ?? 'all', kind: kind ?? 'all', owner: owner ?? 'all', ...(project ? { project } : {}), ...(search ? { q: search } : {}) };
  const q = useApiQuery<WorkQueueResponse>({ method: 'GET', path: '/workspace/queue', query }, { placeholderData: (prev) => prev });
  const d = q.data;
  const shortcuts = useMemo<Shortcut[]>(() => [{ code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() }], [t]);
  const keys = useShortcuts(shortcuts);
  const filtered = !!(urgency || kind || owner || project || search);
  return (
    <div className="@container space-y-5" data-testid="work-queue">
      <PageHeader title={t('workspace:hub.queue.title')} description={t('workspace:hub.queue.intro')} />
      <HubNav current="queue" />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Loading lines={8} />
      ) : (
        <>
          <UrgencyPills counts={d.counts} value={urgency ?? 'all'} onChange={(v) => set({ urgency: v === 'all' ? null : v })} />
          <div className="flex flex-wrap items-end gap-3">
            <KindSelect kinds={d.kinds} value={kind ?? 'all'} onChange={(v) => set({ kind: v === 'all' ? null : v })} />
            <div className="w-full max-w-xs">
              <SelectControl
                label={t('workspace:hub.queue.ownerLabel')}
                value={owner ?? 'all'}
                onChange={(v) => set({ owner: !v || v === 'all' ? null : v })}
                options={(['all', 'mine', 'others', 'unassigned'] as const).map((o) => ({ id: o, label: t(`workspace:hub.queue.owner.${o}`) }))}
                testId="queue-owner"
              />
            </div>
            {d.projects.length > 1 && (
              <div className="w-full max-w-xs">
                <SelectControl
                  label={t('workspace:hub.queue.projectLabel')}
                  value={project ?? 'all'}
                  onChange={(v) => set({ project: !v || v === 'all' ? null : v })}
                  options={[{ id: 'all', label: t('workspace:hub.queue.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]}
                  testId="queue-project"
                />
              </div>
            )}
            <div ref={field} className="w-full max-w-sm">
              <PlainTextField label={t('workspace:hub.queue.search')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="queue-search" />
            </div>
          </div>
          <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
          {d.items.length === 0 ? <EmptyState title={t(filtered ? 'workspace:hub.tasks.noneFiltered' : 'workspace:hub.queue.none')} body={t('workspace:hub.queue.noneBody')} /> : <TaskGroups items={d.items} />}
        </>
      )}
    </div>
  );
}
