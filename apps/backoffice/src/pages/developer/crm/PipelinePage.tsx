import { OPEN_STAGES, OPPORTUNITY_SORTS, OPPORTUNITY_STAGES, type OpenStage, type Opportunity, type OpportunityList, type OpportunitySort, type OpportunityStage } from '@repo/contracts';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterPills,
  HueChip,
  Link,
  PageHeader,
  PlainTextField,
  SegmentedControl,
  SelectControl,
  useAnnounce,
  useApiQuery,
  useIsDesktop,
  useIsTabletUp,
  useNavigation,
  useQueryParam,
  useQueryParams,
  useT,
} from '@repo/ui';
import { CalendarDays, RotateCcw, Sparkles, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { LinkButton, unbroken } from '../../society/hr/hkit';
import { Loading, ScrollRegion } from '../../society/kit';
import { ConvertDialog, LostDialog, MoveMenu, ReopenDialog, useStageMove } from './dialogs';
import { E1, Ref, ScopeNote, STAGE_ICON, StageBadge, TruthNote, useSalesFormat, type SalesFormat, WRAP } from './kit';
import { LeadAssignmentDrawer } from './LeadAssignmentDrawer';

/**
 * CRM-007 Opportunities pipeline. A board of stage columns on wider screens (drag a card to another
 * column, or use its "Move" menu: the keyboard and screen-reader way), one stage at a time on phones,
 * and a list view. Every stage figure opens the list filtered to that stage, and each figure equals
 * that list (the server computes both from the same scoped records). Lead assignment (CRM-006) and the
 * conversion of a qualified lead open over this page. Stages are conversation stages: moving a card
 * never creates a quotation, hold, reservation or booking, and "Won" waits for bookings (Gate E.5).
 */

const BOARD_STAGES: readonly OpportunityStage[] = [...OPEN_STAGES, 'lost'];
const DRAG_TYPE = 'application/x-propertyos-opportunity';

export default function PipelinePage({ assignmentRoute = false }: { assignmentRoute?: boolean }) {
  const { t } = useT();
  const f = useSalesFormat();
  const announce = useAnnounce();
  const { navigate, location } = useNavigation();
  const setParams = useQueryParams();
  const [view] = useQueryParam('view');
  const [stageParam] = useQueryParam('stage');
  const [qParam] = useQueryParam('q');
  const [project] = useQueryParam('project');
  const [owner] = useQueryParam('owner');
  const [sortParam] = useQueryParam('sort');
  const [pageParam] = useQueryParam('page');
  const [phoneStage, setPhoneStage] = useQueryParam('pstage');
  const [drawer] = useQueryParam('drawer');
  const [leadParam] = useQueryParam('lead');
  const [draft, setDraft] = useState(qParam ?? '');
  const isTablet = useIsTabletUp();
  const isDesktop = useIsDesktop();

  const isList = view === 'list';
  const stage = (['all', 'open', ...OPPORTUNITY_STAGES] as string[]).includes(stageParam ?? '') ? (stageParam as OpportunityStage | 'all' | 'open') : 'all';
  const sort: OpportunitySort = (OPPORTUNITY_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as OpportunitySort) : 'updated';
  const page = Math.max(1, Number(pageParam) || 1);
  const filters = { ...(qParam ? { q: qParam } : {}), ...(project ? { project } : {}), ...(owner ? { owner } : {}) };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((qParam ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const query = isList ? { ...filters, stage, sort, page: String(page) } : { ...filters, view: 'board' };
  const list = useApiQuery<OpportunityList>({ method: 'GET', path: '/opportunities', query }, { placeholderData: (prev) => prev });
  const [losing, setLosing] = useState<Opportunity | null>(null);
  const [reopening, setReopening] = useState<Opportunity | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const { move } = useStageMove(() => void list.refetch());

  const total = list.data?.total;
  const first = useRef(true);
  useEffect(() => {
    if (total === undefined) return;
    if (first.current) {
      first.current = false;
      return;
    }
    announce(t('sales:pipeline.updated', { count: total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, qParam, project, owner, stage]);

  // After a move the card is in another column: keep the keyboard on it (B2 focus rule).
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-opp-id="${focusId}"] [data-focus-target]`);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, list.data]);

  const closeOverlay = () => {
    if (assignmentRoute) {
      navigate(E1.pipeline(), { replace: true });
      return;
    }
    const p = new URLSearchParams(location.search);
    p.delete('drawer');
    p.delete('lead');
    const s = p.toString();
    navigate(`${location.pathname}${s ? `?${s}` : ''}`, { replace: true });
  };
  const openOverlay = (name: string) => setParams({ drawer: name, lead: null }, { replace: false });

  const doMove = async (o: Opportunity, to: OpenStage) => {
    const moved = await move(o, to);
    if (moved) {
      if (!isTablet) setPhoneStage(to);
      setFocusId(o.id);
    }
  };

  const d = list.data;
  const canManage = !!d?.canManage;
  return (
    <div className="space-y-5" data-testid="pipeline-page">
      <PageHeader
        title={t('sales:pipeline.title')}
        breadcrumbs={[{ label: t('nav:pages.salesHome'), href: '/backoffice/crm/sales-home' }]}
        description={t('sales:pipeline.intro')}
        actions={
          <>
            {canManage && (
              <Button className={WRAP} variant="primary" icon={Sparkles} onPress={() => openOverlay('convert')} data-testid="pipeline-convert">
                {t('sales:pipeline.convert')}
              </Button>
            )}
            <Button className={WRAP} variant="secondary" icon={UsersRound} onPress={() => openOverlay('lead-assignment')} data-testid="pipeline-assign">
              {d?.canAssign ? t('sales:pipeline.assignLeads') : t('sales:pipeline.myLeads')}
            </Button>
            <LinkButton href={E1.calendar()} variant="quiet" icon={CalendarDays} testId="pipeline-calendar">
              {t('sales:pipeline.visits')}
            </LinkButton>
          </>
        }
      />
      {d && <ScopeNote scope={d.scope} />}
      <TruthNote />

      <div className="grid grid-cols-1 gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card md:grid-cols-2 xl:grid-cols-4">
        <PlainTextField label={t('sales:pipeline.search')} value={draft} onChange={setDraft} optional placeholder={t('sales:pipeline.searchPlaceholder')} testId="pipeline-search" />
        {d && d.projects.length > 1 && (
          <SelectControl label={t('sales:common.project')} value={project ?? 'all'} onChange={(v) => setParams({ project: !v || v === 'all' ? null : v, page: null })} options={[{ id: 'all', label: t('sales:common.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]} testId="pipeline-project" />
        )}
        {d && d.owners.length > 1 && (
          <SelectControl label={t('sales:common.owner')} value={owner ?? 'all'} onChange={(v) => setParams({ owner: !v || v === 'all' ? null : v, page: null })} options={[{ id: 'all', label: t('sales:common.allOwners') }, ...d.owners.map((o) => ({ id: o.principalId, label: o.name }))]} testId="pipeline-owner" />
        )}
        <SegmentedControl
          label={t('sales:pipeline.viewLabel')}
          value={isList ? 'list' : 'board'}
          onChange={(v) => setParams({ view: v === 'list' ? 'list' : null, page: null, stage: v === 'list' ? stageParam : null })}
          options={[
            { id: 'board', label: t('sales:pipeline.board') },
            { id: 'list', label: t('sales:pipeline.list') },
          ]}
          testId="pipeline-view"
        />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !d ? (
        <Loading lines={10} />
      ) : (
        <>
          <StageStrip data={d} filters={filters} f={f} current={isList ? stage : null} />
          {isList ? (
            <ListView data={d} f={f} page={page} sort={sort} stage={stage} isDesktop={isDesktop} onLose={setLosing} onReopen={setReopening} onMove={doMove} onPage={(p) => setParams({ page: p > 1 ? String(p) : null }, { replace: false })} onSort={(s) => setParams({ sort: s === 'updated' ? null : s, page: null })} onClear={() => (setDraft(''), setParams({ q: null, project: null, owner: null, stage: null, page: null }))} />
          ) : isTablet ? (
            <Board data={d} f={f} filters={filters} onMove={doMove} onLose={setLosing} onReopen={setReopening} />
          ) : (
            <PhoneStages data={d} f={f} stage={(BOARD_STAGES as readonly string[]).includes(phoneStage ?? '') ? (phoneStage as OpportunityStage) : 'qualified'} onStage={(s) => setPhoneStage(s)} onMove={doMove} onLose={setLosing} onReopen={setReopening} />
          )}
        </>
      )}

      <LostDialog opportunity={losing} onClose={() => setLosing(null)} onDone={(o) => setFocusId(o.id)} />
      <ReopenDialog opportunity={reopening} onClose={() => setReopening(null)} onDone={(o) => setFocusId(o.id)} />
      {canManage && drawer === 'convert' && <ConvertDialog isOpen onClose={closeOverlay} presetLeadId={leadParam} />}
      <LeadAssignmentDrawer isOpen={assignmentRoute || drawer === 'lead-assignment'} onClose={closeOverlay} presetLeadId={leadParam} />
    </div>
  );
}

/** Every stage's count and expected value; each opens the list filtered to that stage. */
function StageStrip({ data, filters, f, current }: { data: OpportunityList; filters: Record<string, string>; f: SalesFormat; current: string | null }) {
  const { t } = useT();
  return (
    <nav aria-label={t('sales:pipeline.stagesLabel')}>
      <ul className="grid grid-cols-1 gap-2 min-[24rem]:grid-cols-2 md:grid-cols-4 xl:grid-cols-7" data-testid="stage-strip">
        {data.stages.map((s) => {
          const Icon = STAGE_ICON[s.stage];
          return (
            <li key={s.stage}>
              <Link
                href={E1.pipeline({ view: 'list', stage: s.stage, ...filters })}
                variant="plain"
                aria-current={current === s.stage ? 'page' : undefined}
                className="flex h-full min-w-0 flex-col gap-1 rounded-tile border border-border/70 bg-panel p-3 shadow-card outline-none data-hovered:border-primary data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft"
                data-testid={`stage-link-${s.stage}`}
                data-count={s.count}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 break-words">{t(`sales:stage.${s.stage}`)}</span>
                </span>
                <span className="text-xl font-bold text-text">{f.count(s.count)}</span>
                <span className="text-xs break-words text-muted">
                  <span aria-hidden>
                    <bdi dir="ltr">{f.money(s.value)}</bdi>
                  </span>
                  <span className="sr-only">{t('sales:pipeline.stageValue', { value: f.moneyExact(s.value) })}</span>
                </span>
                {s.stage === 'won' && <span className="text-xs text-muted">{t('sales:stageHint.won')}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OppCard({ o, f, canManage, onMove, onLose, onReopen, draggable }: { o: Opportunity; f: SalesFormat; canManage: boolean; onMove: (o: Opportunity, s: OpenStage) => void; onLose: (o: Opportunity) => void; onReopen: (o: Opportunity) => void; draggable: boolean }) {
  const { t } = useT();
  const open = o.stage !== 'lost' && o.stage !== 'won';
  const start = (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(DRAG_TYPE, o.id);
    e.dataTransfer.setData('text/plain', o.ref);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <article
      className="space-y-2 rounded-tile border border-border/70 bg-panel p-3 shadow-card"
      draggable={draggable && canManage && open}
      onDragStart={start}
      aria-labelledby={`opp-${o.id}-title`}
      data-testid="opp-card"
      data-opp-id={o.id}
      data-stage={o.stage}
      data-project={o.projectId}
      data-owner={o.owner.principalId}
    >
      <h3 id={`opp-${o.id}-title`} className="min-w-0 text-sm font-semibold">
        <Link href={E1.opportunity(o.id)} className="break-words" data-focus-target data-testid="opp-link">
          <bdi>{o.displayName}</bdi>
        </Link>
      </h3>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Ref value={o.ref} />
        <HueChip hue="teal">{o.projectName}</HueChip>
      </p>
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="break-words text-muted">
          <bdi>{o.owner.name}</bdi>
        </span>
        <span className="font-bold text-text">
          <span aria-hidden>
            <bdi dir="ltr">{f.money(o.value)}</bdi>
          </span>
          <span className="sr-only">{t('sales:common.valueExact', { value: f.moneyExact(o.value) })}</span>
        </span>
      </p>
      {o.stage === 'lost' && o.lostReason && <p className="text-xs text-muted">{t('sales:pipeline.lostBecause', { reason: t(`sales:lostReason.${o.lostReason}`) })}</p>}
      {open && (o.nextVisitAt || o.nextFollowUp) && (
        <p className="text-xs break-words text-muted">{unbroken(o.nextVisitAt ? t('sales:common.nextVisit', { when: f.when(o.nextVisitAt) }) : t('sales:common.followUpOn', { when: f.when(o.nextFollowUp!) }))}</p>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2 pt-1">
          {open ? (
            <MoveMenu opportunity={o} onMove={(s) => onMove(o, s)} onLose={() => onLose(o)} testId="opp-move" />
          ) : o.stage === 'lost' ? (
            <Button className={WRAP} size="sm" variant="secondary" icon={RotateCcw} onPress={() => onReopen(o)} data-testid="opp-reopen">
              {t('sales:pipeline.reopen')}
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function Board({ data, f, filters, onMove, onLose, onReopen }: { data: OpportunityList; f: SalesFormat; filters: Record<string, string>; onMove: (o: Opportunity, s: OpenStage) => void; onLose: (o: Opportunity) => void; onReopen: (o: Opportunity) => void }) {
  const { t } = useT();
  const [over, setOver] = useState<string | null>(null);
  const byStage = (s: OpportunityStage) => data.items.filter((o) => o.stage === s);
  const drop = (target: OpportunityStage) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const o = data.items.find((x) => x.id === id);
    if (!o || o.stage === target) return;
    if (target === 'lost') onLose(o);
    else onMove(o, target as OpenStage);
  };
  return (
    <section aria-labelledby="board-title" className="space-y-2">
      <h2 id="board-title" className="sr-only">
        {t('sales:pipeline.board')}
      </h2>
      {data.canManage && <p className="text-sm text-muted">{t('sales:pipeline.dragHint')}</p>}
      {/* Stage columns wrap onto further rows rather than scrolling sideways (nothing is ever off screen). */}
      <div role="group" aria-label={t('sales:pipeline.boardLabel')} className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]" data-testid="pipeline-board">
          {BOARD_STAGES.map((s) => {
            const cards = byStage(s);
            const summary = data.stages.find((x) => x.stage === s)!;
            const droppable = data.canManage;
            return (
              <section
                key={s}
                aria-labelledby={`col-${s}`}
                className={`flex min-w-0 flex-col gap-2 rounded-card border p-2 ${over === s ? 'border-primary bg-primary-soft' : 'border-border/70 bg-sunken/60'}`}
                onDragOver={droppable ? (e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'), setOver(s)) : undefined}
                onDragLeave={droppable ? () => setOver((x) => (x === s ? null : x)) : undefined}
                onDrop={droppable ? drop(s) : undefined}
                data-testid={`column-${s}`}
                data-count={cards.length}
              >
                <header className="space-y-1 px-1 pt-1">
                  <h3 id={`col-${s}`} className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    {(() => {
                      const Icon = STAGE_ICON[s];
                      return <Icon aria-hidden className="size-4 shrink-0" />;
                    })()}
                    {t(`sales:stage.${s}`)}
                  </h3>
                  <Link href={E1.pipeline({ view: 'list', stage: s, ...filters })} className="text-xs" data-testid={`column-count-${s}`}>
                    {t('sales:pipeline.columnCount', { count: summary.count, value: f.money(summary.value) })}
                  </Link>
                </header>
                {cards.length === 0 ? (
                  <p className="rounded-tile border border-dashed border-border p-3 text-center text-xs text-muted">{droppable ? t('sales:pipeline.dropHere') : t('sales:pipeline.columnEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {cards.map((o) => (
                      <li key={o.id}>
                        <OppCard o={o} f={f} canManage={data.canManage} onMove={onMove} onLose={onLose} onReopen={onReopen} draggable />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          <section aria-labelledby="col-won" className="flex min-w-0 flex-col gap-2 rounded-card border border-dashed border-border p-2" data-testid="column-won" data-count={0}>
            <h3 id="col-won" className="flex items-center gap-1.5 px-1 pt-1 text-sm font-semibold text-text">
              {(() => {
                const Icon = STAGE_ICON.won;
                return <Icon aria-hidden className="size-4 shrink-0" />;
              })()}
              {t('sales:stage.won')}
            </h3>
            <p className="px-1 text-xs text-muted">{t('sales:pipeline.wonPlanned')}</p>
          </section>
      </div>
    </section>
  );
}

/** Phones: one stage at a time (a radio group of stages with their counts), with the same actions. */
function PhoneStages({ data, f, stage, onStage, onMove, onLose, onReopen }: { data: OpportunityList; f: SalesFormat; stage: OpportunityStage; onStage: (s: string) => void; onMove: (o: Opportunity, s: OpenStage) => void; onLose: (o: Opportunity) => void; onReopen: (o: Opportunity) => void }) {
  const { t } = useT();
  const cards = data.items.filter((o) => o.stage === stage);
  return (
    <section aria-labelledby="phone-stage-title" className="space-y-3" data-testid="pipeline-phone">
      <h2 id="phone-stage-title" className="sr-only">
        {t('sales:pipeline.stageListTitle')}
      </h2>
      <FilterPills label={t('sales:pipeline.stageListLabel')} showLabel value={stage} onChange={(v) => onStage(v)} options={BOARD_STAGES.map((s) => ({ id: s, label: t(`sales:stage.${s}`), count: data.stages.find((x) => x.stage === s)!.count }))} testId="phone-stage" />
      {cards.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel p-6 text-center text-sm text-muted">{t('sales:pipeline.columnEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((o) => (
            <li key={o.id}>
              <OppCard o={o} f={f} canManage={data.canManage} onMove={onMove} onLose={onLose} onReopen={onReopen} draggable={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListView({
  data,
  f,
  page,
  sort,
  stage,
  isDesktop,
  onMove,
  onLose,
  onReopen,
  onPage,
  onSort,
  onClear,
}: {
  data: OpportunityList;
  f: SalesFormat;
  page: number;
  sort: OpportunitySort;
  stage: string;
  isDesktop: boolean;
  onMove: (o: Opportunity, s: OpenStage) => void;
  onLose: (o: Opportunity) => void;
  onReopen: (o: Opportunity) => void;
  onPage: (p: number) => void;
  onSort: (s: string) => void;
  onClear: () => void;
}) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total ? (page - 1) * data.pageSize + 1 : 0;
  const to = Math.min(data.total, page * data.pageSize);
  return (
    <section aria-labelledby="list-title" className="space-y-3" data-testid="pipeline-list" data-stage={stage} data-total={data.total}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="list-title" className="text-lg font-semibold text-text">
          {stage === 'all' ? t('sales:pipeline.listAll') : stage === 'open' ? t('sales:pipeline.listOpen') : t('sales:pipeline.listStage', { stage: t(`sales:stage.${stage as OpportunityStage}`) })}
        </h2>
        <div className="w-full max-w-xs">
          <SelectControl label={t('sales:pipeline.sort')} value={sort} onChange={(v) => onSort(v ?? 'updated')} options={OPPORTUNITY_SORTS.map((s) => ({ id: s, label: t(`sales:pipeline.sortBy.${s}`) }))} testId="pipeline-sort" />
        </div>
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          title={t('sales:pipeline.emptyTitle')}
          body={t('sales:pipeline.emptyBody')}
          actions={
            <Button className={WRAP} variant="secondary" onPress={onClear}>
              {t('sales:common.clearFilters')}
            </Button>
          }
        />
      ) : isDesktop ? (
        <ScrollRegion label={t('sales:pipeline.tableLabel')}>
          <table className="w-full text-sm" data-testid="pipeline-table">
            <caption className="sr-only">{t('sales:pipeline.tableLabel')}</caption>
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t('sales:common.customer')}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t('sales:common.stage')}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t('sales:common.project')}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t('sales:common.owner')}</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">{t('sales:common.value')}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t('sales:common.expectedClose')}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  <span className="sr-only">{t('sales:common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id} className="border-b border-border/60 align-top" data-testid="opp-row" data-opp-id={o.id} data-stage={o.stage}>
                  <td className="px-3 py-2">
                    <Link href={E1.opportunity(o.id)} className="font-semibold" data-focus-target>
                      <bdi>{o.displayName}</bdi>
                    </Link>
                    <p className="text-xs text-muted">
                      <Ref value={o.ref} />
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <StageBadge stage={o.stage} />
                  </td>
                  <td className="px-3 py-2">
                    <bdi>{o.projectName}</bdi>
                  </td>
                  <td className="px-3 py-2">
                    <bdi>{o.owner.name}</bdi>
                  </td>
                  <td className="px-3 py-2 text-end font-semibold">
                    <bdi dir="ltr">{f.moneyExact(o.value)}</bdi>
                  </td>
                  <td className="px-3 py-2">{o.expectedCloseOn ? f.day(o.expectedCloseOn) : '—'}</td>
                  <td className="px-3 py-2">
                    {data.canManage && o.stage !== 'lost' && o.stage !== 'won' ? (
                      <MoveMenu opportunity={o} onMove={(s) => onMove(o, s)} onLose={() => onLose(o)} testId="opp-move" />
                    ) : data.canManage && o.stage === 'lost' ? (
                      <Button className={WRAP} size="sm" variant="secondary" icon={RotateCcw} onPress={() => onReopen(o)} data-testid="opp-reopen">
                        {t('sales:pipeline.reopen')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      ) : (
        <ul className="space-y-2">
          {data.items.map((o) => (
            <li key={o.id}>
              <OppCard o={o} f={f} canManage={data.canManage} onMove={onMove} onLose={onLose} onReopen={onReopen} draggable={false} />
              <div className="mt-1 px-1">
                <StageBadge stage={o.stage} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label={t('sales:common.pagination')} className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" data-testid="pipeline-showing">
          {t('sales:common.showing', { from: f.count(from), to: f.count(to), total: f.count(data.total) })}
        </p>
        <div className="flex gap-2">
          <Button className={WRAP} variant="secondary" isDisabled={page <= 1} onPress={() => onPage(page - 1)}>
            {t('sales:common.previous')}
          </Button>
          <Button className={WRAP} variant="secondary" isDisabled={page >= pages} onPress={() => onPage(page + 1)} data-testid="pipeline-next">
            {t('sales:common.next')}
          </Button>
        </div>
      </nav>
    </section>
  );
}
