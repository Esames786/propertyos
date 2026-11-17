import { ApiError, TEMPLATE_CATEGORIES, type TemplateDetail, type TemplatesList, type TemplateSummary, type TemplateVersionState, type TemplateVersionView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, FilterPills, InlineAlert, Link, NotFoundState, PageHeader, Panel, PlainTextArea, PlainTextField, SelectControl, useAnnounce, useApiMutation, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useQueryParams, useT, useToast, type StatusTone } from '@repo/ui';
import { BadgeCheck, CalendarClock, CheckCircle2, CircleDashed, FilePlus2, Hourglass, PencilLine, ScrollText, Undo2, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Loading, ProblemAlert } from '../../society/kit';
import { DateInput, unbroken, useFieldError, useProblemToast } from '../../society/hr/hkit';
import { NOWRAP, DEMO_TODAY, FavouriteButton, HUB, HubNav, ShortcutsHelp, useFavourites, useHubFormat, useShortcuts, type Shortcut } from '../workspace/wkit';

/**
 * DOC-006 templates and policies (the APR-004 versioned-policy pattern): a version is drafted, then
 * approved by another person (never its drafter) and takes effect on its date; a returned draft says
 * why. Nothing is edited in place: every change is a new version and the history keeps every step.
 * Organisation-wide templates need organisation-wide scope to change; a project's need that project.
 */
const STATE: Record<TemplateVersionState, [StatusTone, LucideIcon]> = {
  pending: ['warning', Hourglass],
  effective: ['success', CheckCircle2],
  scheduled: ['info', CalendarClock],
  superseded: ['neutral', CircleDashed],
  returned: ['error', Undo2],
};

export function VersionStateBadge({ state }: { state: TemplateVersionState }) {
  const { t } = useT();
  const [tone, icon] = STATE[state];
  return (
    <Badge tone={tone} icon={icon} data-state={state}>
      {t(`documents:templates.state.${state}`)}
    </Badge>
  );
}

export default function TemplatesPage() {
  const [record] = useQueryParam('record');
  return record ? <TemplateWorkspace id={record} /> : <TemplateList />;
}

function TemplateRow({ item }: { item: TemplateSummary }) {
  const { t } = useT();
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="template-row" data-template={item.id}>
      <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
        <ScrollText className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={item.href} className="font-semibold [overflow-wrap:anywhere]" data-testid="template-link">
            <bdi>{item.name}</bdi>
          </Link>
          <Badge tone="neutral">{t(`documents:templates.category.${item.category}`)}</Badge>
          {item.pendingVersion !== null && (
            <Badge tone="warning" icon={Hourglass}>
              {t('documents:templates.pendingBadge', { n: item.pendingVersion })}
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          <bdi dir="ltr" className={NOWRAP}>{unbroken(item.ref)}</bdi> · {item.project ? <bdi>{item.project.name}</bdi> : t('documents:templates.wholeOrg')} ·{' '}
          {item.effectiveVersion !== null ? t('documents:templates.effectiveVersion', { n: item.effectiveVersion }) : t('documents:templates.noEffective')}
        </p>
      </div>
    </li>
  );
}

function TemplateList() {
  const { t } = useT();
  const set = useQueryParams();
  const { navigate } = useNavigation();
  const [category] = useQueryParam('category');
  const [project] = useQueryParam('project');
  const [q] = useQueryParam('q');
  const [drawer, setDrawer] = useQueryParam('drawer');
  const field = useRef<HTMLDivElement>(null);
  const list = useApiQuery<TemplatesList>({ method: 'GET', path: '/document-templates', query: { ...(category ? { category } : {}), ...(project ? { project } : {}), ...(q ? { q } : {}) } }, { placeholderData: (prev) => prev });
  const d = list.data;
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() },
      ...(d?.canDraft ? [{ code: 'KeyN' as const, label: t('documents:shortcuts.newTemplate'), run: () => setDrawer('new') }] : []),
    ],
    [t, d?.canDraft, setDrawer],
  );
  const keys = useShortcuts(shortcuts);
  return (
    <div className="@container space-y-5" data-testid="templates">
      <PageHeader
        title={t('documents:templates.title')}
        description={t('documents:templates.intro')}
        actions={
          d?.canDraft ? (
            <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={FilePlus2} onPress={() => setDrawer('new')} data-testid="template-new">
              {t('documents:templates.new')}
            </Button>
          ) : undefined
        }
      />
      <HubNav current="templates" />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !d ? (
        <Loading lines={6} />
      ) : (
        <>
          {d.awaitingYou > 0 && (
            <InlineAlert tone="warning" data-testid="templates-awaiting">
              {t('documents:templates.awaiting', { count: d.awaitingYou })}
            </InlineAlert>
          )}
          <InlineAlert tone="info">{t('documents:templates.illustrative')}</InlineAlert>
          <div className="flex flex-wrap items-end gap-3">
            <FilterPills
              label={t('documents:templates.categoryLabel')}
              options={[{ id: 'all', label: t('documents:templates.allCategories') }, ...TEMPLATE_CATEGORIES.map((c) => ({ id: c, label: t(`documents:templates.categoryPlural.${c}`) }))]}
              value={category ?? 'all'}
              onChange={(v) => set({ category: v === 'all' ? null : v })}
              testId="templates-category"
            />
            <div className="w-full max-w-xs">
              <SelectControl
                label={t('documents:templates.scopeLabel')}
                value={project ?? 'all'}
                onChange={(v) => set({ project: !v || v === 'all' ? null : v })}
                options={[{ id: 'all', label: t('documents:templates.allScopes') }, { id: 'org', label: t('documents:templates.wholeOrg') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]}
                testId="templates-scope"
              />
            </div>
            <div ref={field} className="w-full max-w-sm">
              <PlainTextField label={t('documents:templates.search')} value={q ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="templates-search" />
            </div>
          </div>
          <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
          {d.items.length === 0 ? (
            <EmptyState title={t('documents:templates.none')} body={t('documents:templates.noneBody')} />
          ) : (
            <ul className="space-y-2" data-testid="templates-list">
              {d.items.map((item) => (
                <TemplateRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
      {drawer === 'new' && d?.canDraft && <DraftDrawer mode={{ kind: 'new', projects: d.projects }} onClose={() => setDrawer(null)} onDone={(href) => navigate(href)} />}
    </div>
  );
}

function TemplateWorkspace({ id }: { id: string }) {
  const { t } = useT();
  const f = useHubFormat();
  const set = useQueryParams();
  const [drawer, setDrawer] = useQueryParam('drawer');
  const [versionParam] = useQueryParam('version');
  const favourites = useFavourites();
  const toast = useToast();
  const announce = useAnnounce();
  const problem = useProblemToast();
  const decide = useApiMutation<TemplateDetail>();
  const [deciding, setDeciding] = useState<{ v: TemplateVersionView; decision: 'approve' | 'return' } | null>(null);
  const q = useApiQuery<TemplateDetail>({ method: 'GET', path: `/document-templates/${id}` }, { retry: (n, e) => !(e instanceof ApiError && e.problem.status === 404) && n < 2 });
  const d = q.data;
  const fav = useMemo(() => (d ? { id: d.id, title: d.name, favouritable: true } : null), [d]);
  if (q.isError) {
    return q.error instanceof ApiError && q.error.problem.status === 404 ? (
      <div className="space-y-4" data-testid="template-unavailable">
        <PageHeader title={t('documents:templates.unavailable')} description={t('documents:unavailable.body')} />
        <NotFoundState actions={<Link href={HUB.templates}>{t('documents:templates.back')}</Link>} />
      </div>
    ) : (
      <ErrorState error={q.error} onRetry={() => void q.refetch()} />
    );
  }
  if (!d) return <Loading lines={8} />;
  const effective = d.versions.find((v) => v.state === 'effective');
  const focus = d.versions.find((v) => String(v.n) === versionParam);
  const run = async (reason?: string) => {
    if (!deciding) return;
    try {
      await decide.mutateAsync({ method: 'POST', path: `/document-templates/${d.id}/versions/${deciding.v.n}/decision`, body: { decision: deciding.decision, note: reason ?? '' } });
      const message = t(deciding.decision === 'approve' ? 'documents:templates.approved' : 'documents:templates.returned', { n: deciding.v.n, name: d.name });
      toast.success(message);
      announce(message);
      setDeciding(null);
    } catch (e) {
      problem(e);
      return false;
    }
  };

  return (
    <div className="@container space-y-5" data-testid="template-workspace" data-template={d.id}>
      <PageHeader
        title={d.name}
        breadcrumbs={[{ label: t('documents:templates.title'), href: HUB.templates }, { label: d.ref }]}
        badge={<Badge tone="neutral">{t(`documents:templates.category.${d.category}`)}</Badge>}
        description={d.project ? t('documents:templates.forProject', { project: d.project.name }) : t('documents:templates.forOrg')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {d.canDraft && (
              <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={PencilLine} onPress={() => setDrawer('draft')} data-testid="template-draft">
                {t('documents:templates.draft')}
              </Button>
            )}
            <FavouriteButton record={fav!} isFavourite={favourites.isFavourite(d.id)} onToggle={() => void favourites.toggle(fav!)} testId="template-favourite" />
          </div>
        }
      />
      <HubNav current="templates" />
      {d.versions.some((v) => v.state === 'pending' && v.mine) && (
        <InlineAlert tone="info" data-testid="template-own-draft">
          {t('documents:templates.ownDraft')}
        </InlineAlert>
      )}
      <Panel title={effective ? t('documents:templates.effectiveTitle', { n: effective.n, date: f.date(effective.effectiveFrom) }) : t('documents:templates.noEffective')}>
        {effective ? (
          <pre className="max-h-96 overflow-auto rounded-control border border-border bg-sunken p-4 font-sans text-sm whitespace-pre-wrap text-text [overflow-wrap:anywhere]" tabIndex={0} aria-label={t('documents:templates.bodyLabel', { n: effective.n })} data-testid="template-effective-body">
            {effective.body}
          </pre>
        ) : (
          <p className="text-sm text-muted">{t('documents:templates.noEffectiveBody')}</p>
        )}
      </Panel>
      <Panel title={t('documents:templates.versions', { count: d.versions.length })}>
        <ol className="space-y-3" data-testid="template-versions">
          {d.versions.map((v) => (
            <li key={v.n} className={`rounded-tile border p-3 ${focus?.n === v.n ? 'border-primary' : 'border-border/70'} bg-panel`} data-testid="template-version" data-n={v.n} data-state={v.state}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                    {t('documents:version', { n: v.n })}
                    <VersionStateBadge state={v.state} />
                  </p>
                  <p className="text-xs text-muted">{t('documents:templates.drafted', { name: v.draftedByName, when: f.when(v.draftedAt), date: f.date(v.effectiveFrom) })}</p>
                  {v.note && (
                    <p className="text-sm text-text">
                      “<bdi>{v.note}</bdi>”
                    </p>
                  )}
                  {v.decidedByName && (
                    <p className="text-xs text-muted">
                      {t(v.state === 'returned' ? 'documents:templates.returnedBy' : 'documents:templates.approvedBy', { name: v.decidedByName, when: f.when(v.decidedAt!) })}
                      {v.decisionNote ? ` · “${v.decisionNote}”` : ''}
                    </p>
                  )}
                  {v.state === 'pending' && v.mine && <p className="text-xs text-muted">{t('documents:templates.mineNote')}</p>}
                </div>
                {v.canDecide && (
                  <div className="flex flex-wrap gap-2">
                    <Button className="max-w-full whitespace-normal text-center" variant="primary" size="sm" icon={BadgeCheck} onPress={() => setDeciding({ v, decision: 'approve' })} data-testid="template-approve">
                      {t('documents:templates.approve')}
                    </Button>
                    <Button className="max-w-full whitespace-normal text-center" variant="secondary" size="sm" icon={Undo2} onPress={() => setDeciding({ v, decision: 'return' })} data-testid="template-return">
                      {t('documents:templates.return')}
                    </Button>
                  </div>
                )}
              </div>
              {v.state !== 'effective' && (
                <details className="mt-2 text-sm">
                  <summary className="min-h-9 cursor-pointer rounded-control px-1 font-medium text-primary outline-none focus-visible:outline-2 focus-visible:outline-focus">{t('documents:templates.showText')}</summary>
                  <pre className="mt-2 overflow-auto rounded-control border border-border bg-sunken p-3 font-sans text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{v.body}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title={t('documents:templates.history')}>
        <ol className="space-y-2" data-testid="template-history">
          {d.history.map((e) => (
            <li key={`${e.version}-${e.action}`} className="text-sm">
              <bdi className="font-medium">{e.byName}</bdi> {t(`documents:templates.event.${e.action}`, { n: e.version })} · <span className="text-xs text-muted">{f.when(e.at)}</span>
            </li>
          ))}
        </ol>
      </Panel>
      {deciding && (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => !open && setDeciding(null)}
          title={t(deciding.decision === 'approve' ? 'documents:templates.approveTitle' : 'documents:templates.returnTitle', { n: deciding.v.n })}
          effect={t(deciding.decision === 'approve' ? 'documents:templates.approveEffect' : 'documents:templates.returnEffect', { date: f.date(deciding.v.effectiveFrom) })}
          confirmLabel={t(deciding.decision === 'approve' ? 'documents:templates.approve' : 'documents:templates.return')}
          {...(deciding.decision === 'return' ? { reasonLabel: t('documents:templates.returnReason') } : {})}
          onConfirm={run}
          problem={decide.isError ? <ProblemAlert error={decide.error} /> : undefined}
        />
      )}
      {drawer === 'draft' && d.canDraft && <DraftDrawer mode={{ kind: 'version', template: d }} onClose={() => set({ drawer: null })} onDone={() => set({ drawer: null })} />}
    </div>
  );
}

type DraftMode = { kind: 'new'; projects: Array<{ id: string; name: string }> } | { kind: 'version'; template: TemplateDetail };

function DraftDrawer({ mode, onClose, onDone }: { mode: DraftMode; onClose: () => void; onDone: (href: string) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const ids = useId();
  const create = useKeyedCreate<{ id: string; ref: string; href: string } & Partial<TemplateDetail>>(mode.kind === 'new' ? 'tpl-create' : 'tpl-version');
  const base = mode.kind === 'version' ? (mode.template.versions.find((v) => v.state === 'effective') ?? mode.template.versions[0]) : undefined;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [body, setBody] = useState(base?.body ?? '');
  const [from, setFrom] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const server = useFieldError(create.error);
  const local: Record<string, string> = {};
  if (mode.kind === 'new') {
    if (name.trim().length < 3) local.name = t('documents:templates.errors.name');
    if (!category) local.category = t('documents:templates.errors.category');
    if (!scope) local.scope = t('documents:templates.errors.scope');
  }
  if (body.trim().length < 20) local.body = t('documents:templates.errors.body');
  if (!from || from < DEMO_TODAY) local.effectiveFrom = t('documents:templates.errors.effectiveFrom');
  if (note.trim().length < 3) local.note = t('documents:templates.errors.note');
  const err = (f: string) => (tried ? (local[f] ?? server(f)) : server(f));
  // One draft per form: a second press while it is sent, or after it succeeded, does nothing.
  const busy = useRef(false);
  const done = useRef(false);
  const submit = async () => {
    if (busy.current || done.current) return;
    setTried(true);
    if (Object.keys(local).length) return announce(t('documents:upload.errors.summary'));
    busy.current = true;
    try {
      const res = await create.send({
        method: 'POST',
        path: mode.kind === 'new' ? '/document-templates' : `/document-templates/${mode.template.id}/versions`,
        body: mode.kind === 'new' ? { name: name.trim(), category, projectId: scope === 'org' ? null : scope, body, effectiveFrom: from, note: note.trim() } : { body, effectiveFrom: from, note: note.trim() },
      });
      const message = mode.kind === 'new' ? t('documents:templates.created', { ref: res.ref }) : t('documents:templates.draftDone', { n: (res.versions?.[0]?.n ?? 0) });
      done.current = true;
      toast.success(message);
      announce(message);
      onDone(mode.kind === 'new' ? res.href : HUB.templates);
    } catch {
      announce(t('documents:upload.errors.refused'));
    } finally {
      busy.current = false;
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={mode.kind === 'new' ? t('documents:templates.newTitle') : t('documents:templates.draftTitle')}
      subtitle={mode.kind === 'version' ? <bdi>{mode.template.name}</bdi> : t('documents:templates.newSubtitle')}
      testId="template-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="max-w-full whitespace-normal text-center" variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button className="max-w-full whitespace-normal text-center" variant="primary" icon={FilePlus2} isPending={create.isPending} onPress={() => void submit()} data-testid="template-submit">
            {t('documents:templates.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">{t('documents:templates.drawerNote')}</InlineAlert>
        {create.isError && !(create.error instanceof ApiError && create.error.problem.status === 422) && <ProblemAlert error={create.error} />}
        {mode.kind === 'new' && (
          <>
            <PlainTextField label={t('documents:templates.name')} value={name} onChange={setName} errorKey={err('name') ? 'documents:templates.errors.name' : undefined} testId="template-name" />
            <SelectControl label={t('documents:templates.categoryField')} value={category} onChange={setCategory} placeholder={t('documents:upload.kindPlaceholder')} options={TEMPLATE_CATEGORIES.map((c) => ({ id: c, label: t(`documents:templates.category.${c}`) }))} errorKey={err('category') ? 'documents:templates.errors.category' : undefined} testId="template-category" />
            <SelectControl
              label={t('documents:templates.scopeField')}
              value={scope}
              onChange={setScope}
              placeholder={t('documents:upload.kindPlaceholder')}
              options={[{ id: 'org', label: t('documents:templates.wholeOrg') }, ...mode.projects.map((p) => ({ id: p.id, label: p.name }))]}
              errorKey={err('scope') || err('projectId') ? 'documents:templates.errors.scope' : undefined}
              testId="template-scope"
            />
          </>
        )}
        <PlainTextArea label={t('documents:templates.bodyField')} value={body} onChange={setBody} rows={10} description={t('documents:templates.bodyHint')} errorKey={err('body') ? 'documents:templates.errors.body' : undefined} testId="template-body" />
        <DateInput id={`${ids}-from`} label={t('documents:templates.effectiveFrom')} value={from} min={DEMO_TODAY} onChange={setFrom} description={t('documents:templates.effectiveHint')} testId="template-from" />
        {err('effectiveFrom') && (
          <p className="-mt-2 text-xs font-medium text-error" role="alert" data-testid="template-from-error">
            {err('effectiveFrom')}
          </p>
        )}
        <PlainTextArea label={t('documents:templates.noteField')} value={note} onChange={setNote} description={t('documents:templates.noteHint')} errorKey={err('note') ? 'documents:templates.errors.note' : undefined} testId="template-note" />
      </div>
    </Drawer>
  );
}
