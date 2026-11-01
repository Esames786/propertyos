import { REQUEST_CATEGORIES, REQUEST_PRIORITIES, type OpsFile, type RequestCommentVisibility, type RequestDetail, type RequestList, type RequestPriority, type Technician, type WorkOrder } from '@repo/contracts';
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  ErrorState,
  InlineAlert,
  Link,
  PageHeader,
  PlainTextArea,
  SegmentedControl,
  SelectControl,
  UrlTabs,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useT,
  useToast,
} from '@repo/ui';
import { Ban, CheckCircle2, ClipboardCheck, EyeOff, GitMerge, Hammer, Lock, MessageSquarePlus, PauseCircle, Play, RefreshCw, Send, UserCheck, Users, Wrench } from 'lucide-react';
import { useState } from 'react';
import { OPS, SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { Fact, FactGrid, HistoryList, WRAP } from '../finance/fkit';
import { PhotoList, PhotoPicker, PriorityBadge, ReopenedBadge, RequestBadge, SlaBadge, useOpsWords, When, WhereText, WorkOrderBadge } from './okit';

/**
 * MNT-003 Request 360 (repairs and community issues, D-28), with MNT-005 assignment and MNT-013 merge
 * as drawers. One page answers "what is this, where, who is on it, how late is it, what happens next":
 * the next step is offered as the main action, and only to someone the server would let do it.
 */
export default function RequestWorkspace({ requestId }: { requestId: string }) {
  const { t } = useT();
  const q = useApiQuery<RequestDetail>({ method: 'GET', path: `/ops/requests/${requestId}` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} label={t('operations:request.loading')} />;
  return <Workspace detail={q.data} refetch={() => void q.refetch()} />;
}

type Run = (path: string, body: unknown, message: string, method?: 'POST' | 'PATCH') => Promise<boolean>;

function Workspace({ detail: d, refetch }: { detail: RequestDetail; refetch: () => void }) {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const act = useApiMutation<RequestDetail>();
  const [error, setError] = useState<unknown>(null);
  const r = d.request;
  const order = [...d.workOrders].reverse().find((x) => x.state !== 'cancelled' && x.state !== 'done');
  const issue = r.kind === 'community_issue';
  const run: Run = async (path, body, message, method = 'POST') => {
    setError(null);
    try {
      await act.mutateAsync({ method, path, body });
      toast.success(message);
      refetch();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  const open = (name: string) => setParams({ drawer: name });
  const close = () => setParams({ drawer: null });
  return (
    <div className="@container space-y-5" data-testid="request-workspace" data-state={r.state} data-kind={r.kind}>
      <PageHeader
        title={r.title}
        breadcrumbs={[{ label: t('operations:list.title'), href: OPS.requests(issue ? { kind: 'community_issue' } : {}) }, { label: r.ref }]}
        description={
          <span>
            <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · {w.kind(r.kind)} · <WhereText {...(r.flat ? { flatCode: r.flat.code } : {})} {...(r.room ? { room: r.room } : {})} {...(r.area ? { area: r.area } : {})} /> · {w.category(r.category)}
          </span>
        }
        badge={
          <span className="flex flex-wrap gap-1.5">
            <RequestBadge state={r.state} testId="request-state" />
            {r.sla && <PriorityBadge priority={r.sla.priority} />}
            <ReopenedBadge count={r.reopenCount} />
          </span>
        }
      />
      <NextStep detail={d} order={order} onOpen={open} run={run} pending={act.isPending} />
      {error ? <ProblemAlert error={error} /> : null}
      <UrlTabs
        label={t('operations:request.tabs.label')}
        phoneLimit={2}
        items={[
          { id: 'details', label: t('operations:request.tabs.details') },
          { id: 'work', label: t('operations:request.tabs.work', { count: d.workOrders.length }) },
          ...(issue ? [{ id: 'affected', label: t('operations:request.tabs.affected') }] : []),
          { id: 'discussion', label: t('operations:request.tabs.discussion', { count: d.comments.length }) },
          ...(issue && (r.mergedFrom?.length || r.mergedInto) ? [{ id: 'merged', label: t('operations:request.tabs.merged') }] : []),
          { id: 'timeline', label: t('operations:request.tabs.timeline') },
        ]}
      >
        {(tab) =>
          tab === 'work' ? (
            <WorkOrders orders={d.workOrders} />
          ) : tab === 'affected' ? (
            <Affected detail={d} run={run} pending={act.isPending} />
          ) : tab === 'discussion' ? (
            <Discussion detail={d} run={run} pending={act.isPending} />
          ) : tab === 'merged' ? (
            <Merged detail={d} />
          ) : tab === 'timeline' ? (
            <HistoryList testId="request-timeline" label={t('operations:request.tabs.timeline')} items={d.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`operations:event.${h.action}` as 'operations:event.submitted', { ...(h.values ?? {}), ...(h.values?.priority ? { priority: t(`operations:priority.${h.values.priority}` as 'operations:priority.p1') } : {}) }), ...(h.note ? { note: h.note } : {}) }))} />
          ) : (
            <Details detail={d} />
          )
        }
      </UrlTabs>
      <TriageDrawer isOpen={drawer === 'triage'} onClose={close} detail={d} run={run} pending={act.isPending} />
      <AssignDrawer isOpen={drawer === 'assign'} onClose={close} detail={d} run={run} pending={act.isPending} />
      {order && <CompleteDrawer isOpen={drawer === 'complete'} onClose={close} order={order} run={run} pending={act.isPending} issue={issue} />}
      {order && <HoldDrawer isOpen={drawer === 'hold'} onClose={close} order={order} run={run} pending={act.isPending} />}
      {issue && <MergeDrawer isOpen={drawer === 'merge'} onClose={close} detail={d} run={run} pending={act.isPending} />}
      {issue && <ResolveDrawer isOpen={drawer === 'resolve'} onClose={close} detail={d} run={run} pending={act.isPending} />}
      <ConfirmDialog isOpen={drawer === 'close'} onOpenChange={(o) => !o && close()} title={t('operations:request.closeTitle', { ref: r.ref })} effect={t('operations:request.closeEffect')} confirmLabel={t('operations:request.closeForResident')} reasonLabel={t('operations:request.closeReason')} onConfirm={async (reason) => void ((await run(`/ops/requests/${r.id}/close`, { reason }, t('operations:request.closed'))) && close())} />
      <ConfirmDialog isOpen={drawer === 'cancel'} onOpenChange={(o) => !o && close()} title={t('operations:request.cancelTitle', { ref: r.ref })} effect={t('operations:request.cancelEffect')} confirmLabel={t('operations:request.cancel')} destructive reasonLabel={t('operations:request.cancelReason')} onConfirm={async (reason) => void ((await run(`/ops/requests/${r.id}/cancel`, { reason }, t('operations:request.cancelled'))) && close())} />
      <ConfirmDialog isOpen={drawer === 'hide'} onOpenChange={(o) => !o && close()} title={t('operations:issue.hideTitle', { ref: r.ref })} effect={t('operations:issue.hideEffect')} confirmLabel={t('operations:issue.hide')} destructive reasonLabel={t('operations:issue.hideReason')} onConfirm={async (reason) => void ((await run(`/issues/${r.id}/hide`, { reason }, t('operations:issue.hidden'))) && close())} />
    </div>
  );
}

/** The one next step for this request, offered to whoever may take it (and why not, otherwise). */
function NextStep({ detail: d, order, onOpen, run, pending }: { detail: RequestDetail; order?: WorkOrder; onOpen: (drawer: string) => void; run: Run; pending: boolean }) {
  const { t } = useT();
  const r = d.request;
  const a = d.actions;
  const issue = r.kind === 'community_issue';
  const primary: Array<{ id: string; label: string; icon: typeof Play; onPress: () => void; variant?: 'primary' | 'secondary' | 'quiet' }> = [];
  if (a.triage && r.state === 'submitted') primary.push({ id: 'triage', label: t('operations:request.triage'), icon: ClipboardCheck, onPress: () => onOpen('triage') });
  if (a.assign && !order && ['submitted', 'triaged'].includes(r.state)) primary.push({ id: 'assign', label: t('operations:request.assign'), icon: UserCheck, onPress: () => onOpen('assign') });
  if (a.progress && order && (order.state === 'assigned' || order.state === 'accepted')) primary.push({ id: 'start', label: t('operations:request.start'), icon: Play, onPress: () => void run(`/ops/work-orders/${order.id}/start`, {}, t('operations:request.started')) });
  if (a.progress && order && order.state === 'on_hold') primary.push({ id: 'resume', label: t('operations:request.resume'), icon: Play, onPress: () => void run(`/ops/work-orders/${order.id}/resume`, {}, t('operations:request.started')) });
  if (a.complete && order) primary.push({ id: 'complete', label: issue ? t('operations:request.workDone') : t('operations:request.complete'), icon: CheckCircle2, onPress: () => onOpen('complete'), variant: order.state === 'in_progress' ? 'primary' : 'secondary' });
  if (a.resolve) primary.push({ id: 'resolve', label: t('operations:issue.resolve'), icon: CheckCircle2, onPress: () => onOpen('resolve'), variant: 'secondary' });
  if (a.closeForResident) primary.push({ id: 'close', label: t('operations:request.closeForResident'), icon: Lock, onPress: () => onOpen('close'), variant: 'secondary' });
  const secondary: typeof primary = [];
  if (a.triage && r.state !== 'submitted') secondary.push({ id: 'retriage', label: t('operations:request.reprioritise'), icon: ClipboardCheck, onPress: () => onOpen('triage') });
  if (a.assign && order) secondary.push({ id: 'reassign', label: t('operations:request.reassign'), icon: Users, onPress: () => onOpen('assign') });
  if (a.progress && order && order.state !== 'on_hold') secondary.push({ id: 'hold', label: t('operations:request.hold'), icon: PauseCircle, onPress: () => onOpen('hold') });
  if (a.merge) secondary.push({ id: 'merge', label: t('operations:issue.merge'), icon: GitMerge, onPress: () => onOpen('merge') });
  if (a.moderate) secondary.push({ id: 'hide', label: t('operations:issue.hide'), icon: EyeOff, onPress: () => onOpen('hide') });
  if (a.cancel) secondary.push({ id: 'cancel', label: t('operations:request.cancel'), icon: Ban, onPress: () => onOpen('cancel') });
  const explain = r.state === 'completed' ? t('operations:next.awaitingResident') : r.state === 'closed' ? t(`operations:next.closed.${r.confirmation ?? 'confirmed'}` as 'operations:next.closed.confirmed') : r.state === 'merged' ? t('operations:next.merged', { ref: r.mergedInto?.ref ?? '' }) : t(`operations:next.${r.state}` as 'operations:next.submitted');
  return (
    <section className="space-y-3 rounded-card border border-primary/25 bg-primary-soft/30 p-4" aria-label={t('operations:next.label')} data-testid="next-step">
      <p className="text-sm text-text">{explain}</p>
      {r.sla && !['closed', 'cancelled', 'merged', 'hidden', 'resolved'].includes(r.state) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text" data-testid="request-sla">
          <SlaBadge state={r.sla.response === 'breached' ? 'breached' : r.sla.resolution} />
          {r.state === 'submitted' ? t('operations:request.respondBy') : t('operations:request.resolveBy')} <When at={r.state === 'submitted' ? r.sla.respondBy : r.sla.resolveBy} />
        </p>
      )}
      {(primary.length > 0 || secondary.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {primary.map((b, i) => (
            <Button key={b.id} variant={b.variant ?? (i === 0 ? 'primary' : 'secondary')} icon={b.icon} isPending={pending} onPress={b.onPress} className={WRAP} data-testid={`action-${b.id}`}>
              {b.label}
            </Button>
          ))}
          {secondary.map((b) => (
            <Button key={b.id} variant="quiet" icon={b.icon} onPress={b.onPress} className={WRAP} data-testid={`action-${b.id}`}>
              {b.label}
            </Button>
          ))}
        </div>
      )}
      {a.reason && primary.length === 0 && <p className="text-sm text-muted" data-testid="action-reason">{t(`operations:reason.${a.reason}` as 'operations:reason.read_only')}</p>}
    </section>
  );
}

function Details({ detail: d }: { detail: RequestDetail }) {
  const { t } = useT();
  const w = useOpsWords();
  const r = d.request;
  return (
    <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card" data-testid="request-details">
        <p className="text-text [overflow-wrap:anywhere]">
          <bdi>{r.description}</bdi>
        </p>
        <PhotoList files={r.files} />
        <FactGrid>
          <Fact label={t('operations:request.raisedBy')}>
            <bdi>{r.raisedBy.name}</bdi> · {t(`operations:actor.${r.raisedBy.kind}`)}
          </Fact>
          <Fact label={t('operations:request.raisedOn')}>
            <When at={r.createdAt} />
          </Fact>
          <Fact label={t('operations:request.urgency')}>{w.urgency(r.urgency)}</Fact>
          {r.contact && (
            <Fact label={t('operations:request.contact')}>
              {t(`operations:contact.${r.contact.preference}`)} · {t(`operations:entry.${r.contact.entry}`)}
              {r.contact.preferredOn ? (
                <>
                  {' '}
                  · <When at={`${r.contact.preferredOn}T00:00:00Z`} style="date" />
                </>
              ) : null}
            </Fact>
          )}
          {r.assignee && <Fact label={t('operations:request.assignee')}><bdi>{r.assignee.name}</bdi></Fact>}
          {r.rating ? <Fact label={t('operations:request.rating')}>{t('operations:request.ratingValue', { rating: r.rating })}</Fact> : null}
          {r.publicSummary && <Fact label={t('operations:issue.summary')}><bdi>{r.publicSummary}</bdi></Fact>}
          {r.hidden && <Fact label={t('operations:issue.hiddenBecause')}><bdi>{r.hidden.reason}</bdi></Fact>}
        </FactGrid>
      </section>
      <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="related" data-testid="request-related">
        <h2 id="related" className="font-semibold text-text">
          {t('operations:request.related')}
        </h2>
        {r.sla && (
          <dl className="grid grid-cols-1 gap-2 text-sm" data-testid="sla-detail">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted">{t('operations:request.response')}</dt>
              <dd className="flex items-center gap-2"><SlaBadge state={r.sla.response} /></dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted">{t('operations:request.resolution')}</dt>
              <dd className="flex items-center gap-2"><SlaBadge state={r.sla.resolution} /></dd>
            </div>
          </dl>
        )}
        <ul className="space-y-2 text-sm">
          {d.related.map((x) => (
            <li key={`${x.kind}-${x.id}`}>
              <Link href={x.kind === 'flat' && r.flat ? SOCIETY.flat(r.siteId, x.id, 'services') : x.kind === 'person' ? SOCIETY.person(x.id) : OPS.request(x.id)} data-testid={`related-${x.kind}`}>
                {t(`operations:request.relatedKind.${x.kind}`)}: <bdi>{x.label}</bdi>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkOrders({ orders }: { orders: WorkOrder[] }) {
  const { t } = useT();
  const w = useOpsWords();
  if (!orders.length) return <p className="text-sm text-muted">{t('operations:request.noWorkOrders')}</p>;
  return (
    <ol className="space-y-3" data-testid="work-orders">
      {[...orders].reverse().map((o) => (
        <li key={o.id} className="space-y-2 rounded-card border border-border/70 bg-panel p-4" data-testid="work-order" data-state={o.state}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-text">
              <bdi dir="ltr" className="ltr-ref">{o.ref}</bdi> · <bdi>{o.technicianName}</bdi>
            </p>
            <WorkOrderBadge state={o.state} />
          </div>
          <p className="text-sm text-muted">
            {o.scheduledOn ? (
              <>
                {t('operations:request.visit')} <When at={`${o.scheduledOn}T00:00:00Z`} style="date" />
                {o.slot ? ` · ${w.slot(o.slot)}` : ''}
              </>
            ) : (
              t('operations:board.notScheduled')
            )}
            {' · '}
            {t('operations:request.assignedBy', { name: o.assignedByName })}
          </p>
          {o.instructions && <p className="text-sm text-text"><bdi>{o.instructions}</bdi></p>}
          {o.completion && (
            <div className="space-y-2 rounded-tile bg-success-soft/40 p-3" data-testid="completion">
              <p className="text-sm text-text">
                {t('operations:request.completedBy', { name: o.completion.byName })} · <When at={o.completion.at} />
              </p>
              <p className="text-sm text-text"><bdi>{o.completion.note}</bdi></p>
              <PhotoList files={o.completion.files} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function Discussion({ detail: d, run, pending }: { detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<RequestCommentVisibility>('public');
  const r = d.request;
  return (
    <div className="space-y-4" data-testid="discussion">
      {d.comments.length === 0 ? (
        <p className="text-sm text-muted">{t('operations:request.noComments')}</p>
      ) : (
        <ol className="space-y-2">
          {d.comments.map((c) => (
            <li key={c.id} className={c.visibility === 'internal' ? 'rounded-tile border border-warning/40 bg-warning-soft/30 p-3' : c.visibility === 'assignee' ? 'rounded-tile border border-info/40 bg-info-soft/30 p-3' : 'rounded-tile border border-border/70 bg-panel p-3'} data-testid="comment" data-visibility={c.visibility}>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <bdi className="font-medium text-text">{c.byName}</bdi> · {t(`operations:actor.${c.byKind}`)} · <When at={c.at} />
                {c.visibility === 'internal' && <Badge tone="warning" icon={Lock}>{t('operations:request.internal')}</Badge>}
                {c.visibility === 'assignee' && <Badge tone="info" icon={Wrench}>{t('operations:request.assignee')}</Badge>}
                {c.hidden && <Badge tone="neutral" icon={EyeOff}>{t('operations:issue.commentHidden')}</Badge>}
              </p>
              <p className="mt-1 text-sm text-text [overflow-wrap:anywhere]"><bdi>{c.text}</bdi></p>
              {c.hidden && <p className="text-xs text-muted">{t('operations:issue.hiddenReason', { reason: c.hidden.reason })}</p>}
              {d.actions.moderate && r.kind === 'community_issue' && c.byKind === 'resident' && !c.hidden && (
                <Button variant="quiet" size="sm" icon={EyeOff} onPress={() => void run(`/issues/${r.id}/comments/${c.id}/hide`, { reason: t('operations:issue.defaultHideReason') }, t('operations:issue.commentHiddenToast'))} data-testid="hide-comment">
                  {t('operations:issue.hideComment')}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {d.actions.comment && (
        <div className="space-y-3 rounded-card border border-border/70 bg-panel p-4">
          <SegmentedControl
            label={t('operations:request.visibility')}
            value={visibility}
            onChange={setVisibility}
            options={[{ id: 'public', label: t('operations:request.public') }, { id: 'internal', label: t('operations:request.internal') }, ...(d.actions.commentAssignee ? [{ id: 'assignee' as const, label: t('operations:request.assignee') }] : [])]}
            testId="comment-visibility"
          />
          <p className="text-xs text-muted">{visibility === 'public' ? t('operations:request.publicHint') : visibility === 'assignee' ? t('operations:request.assigneeHint') : t('operations:request.internalHint')}</p>
          <PlainTextArea label={t('operations:request.comment')} value={text} onChange={setText} testId="comment-text" />
          <Button variant="secondary" icon={MessageSquarePlus} isPending={pending} isDisabled={text.trim().length < 2} onPress={async () => (await run(`/ops/requests/${r.id}/comments`, { text, visibility }, t('operations:request.commented'))) && setText('')} data-testid="comment-send">
            {t('operations:request.addComment')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Affected({ detail: d, run, pending }: { detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const a = d.affected!;
  const rv = a.residentView;
  return (
    <div className="space-y-4" data-testid="affected">
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
        <section className="space-y-2 rounded-card border border-border/70 bg-panel p-4" data-testid="affected-live">
          <h3 className="font-semibold text-text">{t('operations:issue.liveTitle')}</h3>
          <p className="text-sm text-text">{t('operations:issue.liveLine', { count: a.live.site, audience: a.audience.site })}</p>
          <ul className="text-sm text-muted">
            {Object.entries(a.live.blocks).map(([code, n]) => (
              <li key={code}>{t('operations:issue.blockLine', { block: code, count: n, audience: a.audience.blocks[code] ?? 0 })}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('operations:issue.staffOnly')}</p>
        </section>
        <section className="space-y-2 rounded-card border border-primary/25 bg-primary-soft/30 p-4" data-testid="affected-resident-view">
          <h3 className="font-semibold text-text">{t('operations:issue.residentsSee')}</h3>
          <p className="text-sm text-text" data-testid="resident-count" data-shown={rv.shown}>
            {rv.shown ? (rv.blocks.length ? t('operations:issue.shownWithBlocks', { count: rv.site, blocks: rv.blocks.map((b) => t('operations:issue.blockCount', { block: b.code, count: b.count })).join(', ') }) : t('operations:issue.shown', { count: rv.site })) : t(`operations:issue.notShown.${rv.reason}`)}
          </p>
          <p className="text-xs text-muted">
            {a.snapshotAt ? <>{t('operations:issue.snapshotAt')} <When at={a.snapshotAt} /></> : t('operations:issue.noSnapshot')}
          </p>
          <p className="text-xs text-muted">{t('operations:issue.privacyRule')}</p>
          {d.actions.merge && (
            <Button variant="quiet" size="sm" icon={RefreshCw} isPending={pending} onPress={() => void run('/issues/refresh', {}, t('operations:issue.refreshed'))} data-testid="refresh-snapshot">
              {t('operations:issue.refreshNow')}
            </Button>
          )}
        </section>
      </div>
      <section className="space-y-2" aria-labelledby="households">
        <h3 id="households" className="font-semibold text-text">{t('operations:issue.households', { count: a.households.filter((h) => !h.withdrawnAt).length })}</h3>
        <ul className="divide-y divide-border rounded-card border border-border/70 bg-panel" data-testid="affected-households">
          {a.households.map((h) => (
            <li key={`${h.flatCode}-${h.at}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                <bdi dir="ltr" className="ltr-ref font-medium">{h.flatCode}</bdi> · <bdi>{h.name}</bdi>
                {h.fromMerge ? ` · ${t('operations:issue.fromMerge', { ref: h.fromMerge })}` : ''}
              </span>
              <span className="text-xs text-muted">{h.withdrawnAt ? t('operations:issue.withdrawn') : <When at={h.at} />}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('operations:issue.count', { count: fmt.count(a.live.site) })}</p>
      </section>
    </div>
  );
}

function Merged({ detail: d }: { detail: RequestDetail }) {
  const { t } = useT();
  const r = d.request;
  return (
    <div className="space-y-3 text-sm" data-testid="merged">
      {r.mergedInto && (
        <p>
          {t('operations:issue.mergedInto')} <Link href={OPS.request(r.mergedInto.id)}>{r.mergedInto.ref}</Link>
        </p>
      )}
      {(r.mergedFrom ?? []).length > 0 && (
        <>
          <p className="text-muted">{t('operations:issue.mergedFrom')}</p>
          <ul className="space-y-1">
            {r.mergedFrom!.map((m) => (
              <li key={m.id}>
                <Link href={OPS.request(m.id)}>{m.ref}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TriageDrawer({ isOpen, onClose, detail: d, run, pending }: { isOpen: boolean; onClose: () => void; detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const w = useOpsWords();
  const r = d.request;
  const [priority, setPriority] = useState<RequestPriority>(r.sla?.priority ?? 'p3');
  const [category, setCategory] = useState<string>(r.category);
  const [note, setNote] = useState('');
  const target = d.request.sla;
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('operations:triage.title', { ref: r.ref })}
      subtitle={t('operations:triage.subtitle')}
      testId="triage-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={ClipboardCheck} isPending={pending} onPress={async () => (await run(`/ops/requests/${r.id}/triage`, { priority, category, note }, t('operations:triage.done'))) && onClose()} data-testid="triage-submit">
            {t('operations:triage.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text">{t('operations:triage.residentSaid', { urgency: w.urgency(r.urgency) })}</p>
        <SelectControl label={t('operations:triage.priority')} value={priority} onChange={(v) => setPriority((v ?? 'p3') as RequestPriority)} options={REQUEST_PRIORITIES.map((p) => ({ id: p, label: `${t(`operations:priority.${p}`)} · ${t(`operations:priority.hint.${p}`)}` }))} testId="triage-priority" />
        <SelectControl label={t('operations:triage.category')} value={category} onChange={(v) => setCategory(v ?? r.category)} options={REQUEST_CATEGORIES.map((c) => ({ id: c, label: w.category(c) }))} testId="triage-category" />
        <PlainTextArea label={t('operations:triage.note')} optional value={note} onChange={setNote} testId="triage-note" />
        {target && <p className="text-xs text-muted">{t('operations:triage.slaNote')}</p>}
      </div>
    </Drawer>
  );
}

const DEMO_TODAY = '2026-10-26';
const addDays = (n: number) => new Date(Date.parse(`${DEMO_TODAY}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

function AssignDrawer({ isOpen, onClose, detail: d, run, pending }: { isOpen: boolean; onClose: () => void; detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const w = useOpsWords();
  const fmt = useSocietyFormat();
  const r = d.request;
  const techs: Technician[] = d.technicians ?? [];
  const suggested = techs.filter((x) => x.available).sort((a, b) => Number(b.trade === tradeOf(r.category)) - Number(a.trade === tradeOf(r.category)) || a.load - b.load)[0];
  const [technician, setTechnician] = useState<string | null>(null);
  const [day, setDay] = useState(addDays(1));
  const [slot, setSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const [instructions, setInstructions] = useState('');
  const chosen = technician ?? suggested?.id ?? null;
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('operations:assign.title', { ref: r.ref })}
      subtitle={t('operations:assign.subtitle')}
      testId="assign-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={Send} isPending={pending} isDisabled={!chosen} onPress={async () => (await run(`/ops/requests/${r.id}/assign`, { technicianId: chosen, scheduledOn: day, slot, instructions }, t('operations:assign.done'))) && onClose()} data-testid="assign-submit">
            {t('operations:assign.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text">{t('operations:assign.technician')}</legend>
          <div className="space-y-2" role="radiogroup" aria-label={t('operations:assign.technician')}>
            {techs.map((x) => (
              <div key={x.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen === x.id}
                  disabled={!x.available}
                  onClick={() => setTechnician(x.id)}
                  className={`w-full rounded-tile border p-3 text-start text-sm ${chosen === x.id ? 'border-primary bg-primary-soft/50' : 'border-border/70 hover:bg-raised'} disabled:opacity-60`}
                  data-testid="technician-option"
                  data-technician={x.id}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-text"><bdi>{x.name}</bdi></span>
                    <span className="flex gap-1.5">
                      {x.id === suggested?.id && <Badge tone="info" icon={Hammer}>{t('operations:assign.suggested')}</Badge>}
                      {!x.available && <Badge tone="neutral">{t('operations:board.unavailable')}</Badge>}
                    </span>
                  </span>
                  <span className="block text-xs text-muted">
                    {t(`operations:trade.${x.trade}`)} · {x.kind === 'vendor' ? t('operations:board.vendor') : t('operations:board.staff')} · {t('operations:maintenance.jobs', { count: x.load })}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </fieldset>
        <SelectControl label={t('operations:assign.day')} value={day} onChange={(v) => setDay(v ?? addDays(1))} options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: addDays(n), label: n === 0 ? t('operations:assign.today') : n === 1 ? t('operations:assign.tomorrow') : new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${addDays(n)}T00:00:00Z`)) }))} testId="assign-day" />
        <SegmentedControl label={t('operations:assign.slot')} value={slot} onChange={setSlot} options={(['morning', 'afternoon', 'evening'] as const).map((s) => ({ id: s, label: w.slot(s) }))} testId="assign-slot" />
        <PlainTextArea label={t('operations:assign.instructions')} optional value={instructions} onChange={setInstructions} testId="assign-instructions" />
        {r.contact && (
          <InlineAlert tone="info" title={t('operations:assign.residentPrefers')}>
            <p>{t(`operations:contact.${r.contact.preference}`)} · {t(`operations:entry.${r.contact.entry}`)}</p>
          </InlineAlert>
        )}
        <p className="text-xs text-muted">{t('operations:assign.notifies')}</p>
      </div>
    </Drawer>
  );
}

const tradeOf = (category: string) => ({ electrical: 'electrical', plumbing: 'plumbing', water: 'plumbing', carpentry: 'carpentry', civil: 'civil', lift: 'lift' } as Record<string, string>)[category] ?? 'general';

function CompleteDrawer({ isOpen, onClose, order, run, pending, issue }: { isOpen: boolean; onClose: () => void; order: WorkOrder; run: Run; pending: boolean; issue: boolean }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<Array<Omit<OpsFile, 'id'>>>([]);
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('operations:complete.title', { ref: order.ref })}
      subtitle={issue ? t('operations:complete.subtitleIssue') : t('operations:complete.subtitle')}
      testId="complete-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={CheckCircle2} isPending={pending} isDisabled={note.trim().length < 10 || !files.length || files.some((f) => f.alt.trim().length < 3)} onPress={async () => (await run(`/ops/work-orders/${order.id}/complete`, { note, files }, t('operations:complete.done'))) && onClose()} data-testid="complete-submit">
            {t('operations:complete.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PlainTextArea label={t('operations:complete.note')} description={t('operations:complete.noteHint')} value={note} onChange={setNote} testId="complete-note" />
        <PhotoPicker label={t('operations:complete.evidence')} files={files} onChange={setFiles} testId="complete-photos" />
        <p className="text-xs text-muted">{issue ? t('operations:complete.issueNext') : t('operations:complete.next')}</p>
      </div>
    </Drawer>
  );
}

function HoldDrawer({ isOpen, onClose, order, run, pending }: { isOpen: boolean; onClose: () => void; order: WorkOrder; run: Run; pending: boolean }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('operations:hold.title', { ref: order.ref })}
      testId="hold-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={PauseCircle} isPending={pending} isDisabled={note.trim().length < 5} onPress={async () => (await run(`/ops/work-orders/${order.id}/hold`, { note }, t('operations:hold.done'))) && onClose()} data-testid="hold-submit">
            {t('operations:hold.save')}
          </Button>
        </>
      }
    >
      <PlainTextArea label={t('operations:hold.note')} description={t('operations:hold.hint')} value={note} onChange={setNote} testId="hold-note" />
    </Drawer>
  );
}

/** MNT-013: merge a duplicate into the issue that stays (its affected households move with it). */
function MergeDrawer({ isOpen, onClose, detail: d, run, pending }: { isOpen: boolean; onClose: () => void; detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const w = useOpsWords();
  const r = d.request;
  const issues = useApiQuery<RequestList>({ method: 'GET', path: '/ops/requests', query: { kind: 'community_issue', status: 'open' } }, { enabled: isOpen });
  const [into, setInto] = useState<string | null>(null);
  const candidates = (issues.data?.items ?? []).filter((x) => x.id !== r.id).sort((a, b) => Number(b.where === (r.area?.key ?? '')) - Number(a.where === (r.area?.key ?? '')));
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('operations:merge.title', { ref: r.ref })}
      subtitle={t('operations:merge.subtitle')}
      testId="merge-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" icon={GitMerge} isPending={pending} isDisabled={!into} onPress={async () => (await run(`/issues/${r.id}/merge`, { intoId: into }, t('operations:merge.done'))) && onClose()} data-testid="merge-submit">
            {t('operations:merge.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text">{t('operations:merge.explain', { count: d.affected?.live.site ?? 0 })}</p>
        {!issues.data ? (
          <Loading lines={4} />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted">{t('operations:merge.none')}</p>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label={t('operations:merge.target')}>
            {candidates.map((c) => (
              <div key={c.id}>
                <button type="button" role="radio" aria-checked={into === c.id} onClick={() => setInto(c.id)} className={`w-full rounded-tile border p-3 text-start text-sm ${into === c.id ? 'border-primary bg-primary-soft/50' : 'border-border/70 hover:bg-raised'}`} data-testid="merge-candidate" data-ref={c.ref}>
                  <span className="block font-medium text-text"><bdi>{c.title}</bdi></span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{c.ref}</bdi> · {w.areaKey(c.where)} · {t('operations:issue.affectedShort', { count: c.affected ?? 0 })}
                    {c.where === r.area?.key ? ` · ${t('operations:merge.samePlace')}` : ''}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ResolveDrawer({ isOpen, onClose, detail: d, run, pending }: { isOpen: boolean; onClose: () => void; detail: RequestDetail; run: Run; pending: boolean }) {
  const { t } = useT();
  const r = d.request;
  const [summary, setSummary] = useState(r.publicSummary ?? '');
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('operations:issue.resolveTitle', { ref: r.ref })}
      subtitle={t('operations:issue.resolveSubtitle')}
      testId="resolve-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="secondary" isPending={pending} isDisabled={summary.trim().length < 10} onPress={async () => (await run(`/issues/${r.id}/summary`, { summary }, t('operations:issue.summarySaved'))) && onClose()} data-testid="summary-submit">
            {t('operations:issue.saveSummary')}
          </Button>
          <Button variant="primary" icon={CheckCircle2} isPending={pending} isDisabled={summary.trim().length < 10} onPress={async () => (await run(`/issues/${r.id}/resolve`, { summary }, t('operations:issue.resolved'))) && onClose()} data-testid="resolve-submit">
            {t('operations:issue.resolve')}
          </Button>
        </>
      }
    >
      <PlainTextArea label={t('operations:issue.summary')} description={t('operations:issue.summaryHint')} value={summary} onChange={setSummary} testId="issue-summary" />
    </Drawer>
  );
}
