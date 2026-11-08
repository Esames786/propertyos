import { ASSIGNMENT_FILTERS, type AssigneeOption, type AssignmentEvent, type AssignmentFilter, type AssignmentList, type AssignmentResult, type SalesPerson } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import {
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  FilterPills,
  HueChip,
  InlineAlert,
  Link,
  PlainCheckbox,
  PlainTextArea,
  PlainTextField,
  SelectControl,
  StatusLabel,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useT,
  useToast,
} from '@repo/ui';
import { ChevronDown, ChevronUp, History, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SearchSelect, unbroken } from '../../society/hr/hkit';
import { Loading, ProblemAlert } from '../../society/kit';
import { E1, Ref, ScopeNote, useSalesFormat, WRAP } from './kit';

/**
 * CRM-006 Lead assignment (a drawer, as the register says, deep-linkable with
 * `?drawer=lead-assignment[&lead=…]`, and opened by the register address itself). A sales manager
 * searches and filters the leads of their projects, selects one or more and gives them to a colleague
 * who holds every selected lead's project, with a reason. Each lead's reassignment history is shown as
 * the server projects it for the reader. Anyone else sees their own leads and their history, read only.
 */
export function LeadAssignmentDrawer({ isOpen, onClose, presetLeadId }: { isOpen: boolean; onClose: () => void; presetLeadId?: string | null }) {
  const { t } = useT();
  return (
    <Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={t('sales:assign.title')} subtitle={t('sales:assign.subtitle')} size="lg" testId="lead-assignment-drawer">
      {isOpen && <AssignmentBody presetLeadId={presetLeadId ?? null} onClose={onClose} />}
    </Drawer>
  );
}

function AssignmentBody({ presetLeadId, onClose }: { presetLeadId: string | null; onClose: () => void }) {
  const { t } = useT();
  const f = useSalesFormat();
  const toast = useToast();
  const announce = useAnnounce();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<AssignmentFilter>('all');
  const [project, setProject] = useState('all');
  const [owner, setOwner] = useState('all');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>(presetLeadId ? [presetLeadId] : []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const query = { filter, page: String(page), ...(debounced ? { q: debounced } : {}), ...(project !== 'all' ? { project } : {}), ...(owner !== 'all' ? { owner } : {}), ...(source !== 'all' ? { source } : {}) };
  const list = useApiQuery<AssignmentList>({ method: 'GET', path: '/crm/assignments', query }, { placeholderData: (prev) => prev });
  const preset = useApiQuery<LeadHistory>(presetLeadId ? { method: 'GET', path: `/leads/${presetLeadId}/assignments` } : null);
  const assignees = useApiQuery<{ items: AssigneeOption[] }>(list.data?.canAssign && selected.length ? { method: 'GET', path: '/crm/assignees', query: { leads: selected.join(',') } } : null);
  const assign = useApiMutation<AssignmentResult>();

  useEffect(() => {
    const items = [...(list.data?.items ?? []), ...(preset.data ? [preset.data.lead] : [])];
    if (!items.length) return;
    setNames((prev) => ({ ...prev, ...Object.fromEntries(items.map((i) => [i.id, `${i.displayName} · ${i.ref}`])) }));
  }, [list.data, preset.data]);

  // A lead named in the address that this person cannot see is never kept in the selection.
  const presetHidden = preset.isError;
  useEffect(() => {
    if (presetHidden && presetLeadId) setSelected((s) => s.filter((x) => x !== presetLeadId));
  }, [presetHidden, presetLeadId]);

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loading lines={8} />;
  const d = list.data;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const toggle = (id: string, on: boolean) => {
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
    setAssignee(null);
  };
  const options = (assignees.data?.items ?? []).map((p) => ({ id: p.principalId, label: p.name, hint: [t(p.roleKey as 'sales:roles.salesManager'), p.owns ? t('sales:assign.owns', { count: p.owns }) : ''].filter(Boolean).join(' · ') }));
  const assigneeName = options.find((o) => o.id === assignee)?.label ?? '';

  const submit = async () => {
    setTried(true);
    if (!selected.length || !assignee || reason.trim().length < 3) return;
    setError(null);
    try {
      const res = await assign.mutateAsync({ method: 'POST', path: '/leads/assign', body: { leadIds: selected, assigneeId: assignee, reason: reason.trim() } });
      const message = t('sales:assign.done', { count: res.assigned, name: res.assignee.name });
      toast.success(message);
      announce(message);
      setSelected([]);
      setAssignee(null);
      setReason('');
      setTried(false);
    } catch (e) {
      setError(e);
      announce(e instanceof ApiError ? t('sales:common.refused') : t('errors:network.unavailable'));
    }
  };

  return (
    <div className="space-y-5" data-testid="lead-assignment" data-can-assign={d.canAssign}>
      <ScopeNote scope={d.scope} testId="assign-scope-note" />
      {presetLeadId && <PresetLead query={preset} />}
      {!d.canAssign && (
        <InlineAlert tone="info" data-testid="assign-read-only">
          {t('sales:assign.readOnly')}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlainTextField label={t('sales:assign.search')} value={search} onChange={setSearch} optional placeholder={t('sales:assign.searchPlaceholder')} testId="assign-search" className="sm:col-span-2" />
        {d.projects.length > 1 && (
          <SelectControl label={t('sales:common.project')} value={project} onChange={(v) => (setProject(v ?? 'all'), setPage(1))} options={[{ id: 'all', label: t('sales:common.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]} testId="assign-project" />
        )}
        {d.owners.length > 1 && (
          <SelectControl label={t('sales:common.owner')} value={owner} onChange={(v) => (setOwner(v ?? 'all'), setPage(1))} options={[{ id: 'all', label: t('sales:common.allOwners') }, ...d.owners.map((o) => ({ id: o.principalId, label: o.name }))]} testId="assign-owner" />
        )}
        <SelectControl label={t('sales:assign.source')} value={source} onChange={(v) => (setSource(v ?? 'all'), setPage(1))} options={[{ id: 'all', label: t('sales:assign.allSources') }, ...d.sources.map((s) => ({ id: s, label: t(`crm:source.${s}`) }))]} testId="assign-source" />
      </div>
      <FilterPills label={t('sales:assign.filterLabel')} showLabel value={filter} onChange={(v) => (setFilter(v), setPage(1))} options={ASSIGNMENT_FILTERS.map((x) => ({ id: x, label: unbroken(t(`sales:assign.filter.${x}`)), count: d.counts[x] }))} testId="assign-filter" />
      <p className="text-sm text-muted" role="status" data-testid="assign-count">
        {t('sales:assign.count', { count: d.total })}
      </p>
      {d.items.length === 0 ? (
        <EmptyState title={t('sales:assign.emptyTitle')} body={t('sales:assign.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="assign-list">
          {d.items.map((l) => (
            <li key={l.id} className="rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="assign-lead" data-lead={l.id} data-owner={l.owner.principalId} data-project={l.projectId}>
              <div className="flex flex-wrap items-start gap-3">
                {d.canAssign && (
                  <PlainCheckbox isSelected={selected.includes(l.id)} onChange={(on) => toggle(l.id, on)} testId="assign-select">
                    <span className="sr-only">{t('sales:assign.select', { name: l.displayName })}</span>
                  </PlainCheckbox>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={E1.lead(l.id)} className="font-semibold break-words">
                      <bdi>{l.displayName}</bdi>
                    </Link>
                    <span className="text-sm text-muted">
                      <Ref value={l.ref} />
                    </span>
                    <StatusLabel kind="lead" status={l.status} />
                    {l.overdue && <HueChip hue="amber">{unbroken(t('sales:assign.overdue'))}</HueChip>}
                  </p>
                  <p className="text-sm break-words text-muted">
                    <bdi>{l.projectName}</bdi> · {t('sales:common.owner')}: <bdi>{l.owner.name}</bdi> · {t(`crm:source.${l.source}`)}
                  </p>
                  <p className="text-sm text-muted">{unbroken(l.nextFollowUp ? t('sales:common.followUpOn', { when: f.when(l.nextFollowUp) }) : t('sales:common.noFollowUp'))}</p>
                </div>
                <Button className={WRAP} size="sm" variant="quiet" icon={open === l.id ? ChevronUp : ChevronDown} onPress={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id} data-testid="assign-history-toggle">
                  {t('sales:assign.history')}
                </Button>
              </div>
              {open === l.id && <AssignmentHistory leadId={l.id} />}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={t('sales:common.pagination')} className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{t('sales:common.page', { page: f.count(page), pages: f.count(pages) })}</p>
          <div className="flex gap-2">
            <Button className={WRAP} size="sm" isDisabled={page <= 1} onPress={() => setPage(page - 1)}>
              {t('sales:common.previous')}
            </Button>
            <Button className={WRAP} size="sm" isDisabled={page >= pages} onPress={() => setPage(page + 1)} data-testid="assign-next">
              {t('sales:common.next')}
            </Button>
          </div>
        </nav>
      )}

      {d.canAssign && (
        <section aria-labelledby="assign-to-heading" className="space-y-3 rounded-card border border-border bg-sunken/50 p-4" data-testid="assign-panel">
          <h3 id="assign-to-heading" className="text-base font-semibold text-text">
            {t('sales:assign.panelTitle', { count: selected.length })}
          </h3>
          {selected.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('sales:assign.selectedLabel')} data-testid="assign-selected">
              {selected.map((id) => (
                <li key={id}>
                  <HueChip hue="slate">{names[id] ?? id}</HueChip>
                </li>
              ))}
            </ul>
          )}
          {!!error && <ProblemAlert error={error} />}
          {tried && !selected.length && (
            <InlineAlert tone="warning" role="alert">
              {t('sales:assign.selectFirst')}
            </InlineAlert>
          )}
          <SearchSelect
            label={t('sales:assign.assignee')}
            options={options}
            value={assignee}
            onChange={setAssignee}
            testId="assign-assignee"
            description={selected.length ? t('sales:assign.assigneeHint') : t('sales:assign.selectFirst')}
            errorText={tried && !assignee ? t('sales:assign.assigneeRequired') : undefined}
          />
          <PlainTextArea label={t('sales:assign.reason')} value={reason} onChange={setReason} description={t('sales:assign.reasonHint')} errorKey={tried && reason.trim().length < 3 ? 'sales:errors.reasonRequired' : undefined} testId="assign-reason" />
          <div className="flex flex-wrap gap-2">
            <Button className={WRAP} variant="primary" icon={UserCheck} onPress={() => void submit()} isPending={assign.isPending} data-testid="assign-submit">
              {assignee ? t('sales:assign.submitTo', { count: selected.length, name: assigneeName }) : t('sales:assign.submit', { count: selected.length })}
            </Button>
            <Button className={WRAP} variant="secondary" onPress={onClose}>
              {t('common:actions.close')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

interface LeadHistory {
  lead: { id: string; ref: string; displayName: string; projectName: string; status: AssignmentList['items'][number]['status'] };
  owner: SalesPerson;
  items: AssignmentEvent[];
}

/** The lead the drawer was opened for (from Lead 360 or Opportunity 360): who owns it and its history. */
function PresetLead({ query }: { query: ReturnType<typeof useApiQuery<LeadHistory>> }) {
  const { t } = useT();
  if (query.isError) {
    return (
      <InlineAlert tone="warning" data-testid="assign-preset-missing">
        {t('sales:assign.presetMissing')}
      </InlineAlert>
    );
  }
  if (!query.data) return <Loading lines={2} />;
  const l = query.data.lead;
  return (
    <section aria-labelledby="assign-preset-heading" className="rounded-tile border border-primary/40 bg-panel p-3" data-testid="assign-preset">
      <h3 id="assign-preset-heading" className="flex flex-wrap items-center gap-2 font-semibold text-text">
        <bdi>{l.displayName}</bdi>
        <span className="text-sm font-normal text-muted">
          <Ref value={l.ref} />
        </span>
        <StatusLabel kind="lead" status={l.status} />
      </h3>
      <p className="text-sm text-muted">
        <bdi>{l.projectName}</bdi>
      </p>
      <HistoryList data={query.data} />
    </section>
  );
}

function historyText(t: ReturnType<typeof useT>['t'], e: AssignmentEvent) {
  if (e.sanitised) return e.mine === 'to_me' ? t('sales:assign.historyToMe') : e.mine === 'from_me' ? t('sales:assign.historyFromMe') : t('sales:assign.historyHidden');
  return e.fromName ? t('sales:assign.historyFull', { actor: e.actorName ?? '', from: e.fromName, to: e.toName ?? '' }) : t('sales:assign.historyFirst', { actor: e.actorName ?? '', to: e.toName ?? '' });
}

export function AssignmentHistory({ leadId }: { leadId: string }) {
  const h = useApiQuery<LeadHistory>({ method: 'GET', path: `/leads/${leadId}/assignments` });
  if (h.isError) return <ErrorState error={h.error} onRetry={() => void h.refetch()} />;
  if (!h.data) return <Loading lines={2} />;
  return <HistoryList data={h.data} />;
}

function HistoryList({ data }: { data: LeadHistory }) {
  const { t } = useT();
  const f = useSalesFormat();
  const h = { data };
  return (
    <div className="mt-3 space-y-2 border-t border-border/70 pt-3" data-testid="assign-history">
      <p className="flex items-center gap-2 text-sm font-medium text-text">
        <History aria-hidden className="size-4" />
        {t('sales:assign.currentOwner', { name: h.data.owner.name })}
      </p>
      {h.data.items.length === 0 ? (
        <p className="text-sm text-muted">{t('sales:assign.historyEmpty')}</p>
      ) : (
        <ol className="space-y-2">
          {h.data.items.map((e) => (
            <li key={e.id} className="text-sm" data-testid="assign-history-entry" data-sanitised={!!e.sanitised}>
              <p className="text-text">{historyText(t, e)}</p>
              {e.reason && <p className="break-words text-muted">{t('sales:assign.historyReason', { reason: e.reason })}</p>}
              <p className="text-xs text-muted">{f.when(e.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
