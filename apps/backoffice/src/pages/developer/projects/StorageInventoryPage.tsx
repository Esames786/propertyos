import { ApiError, STORAGE_FILTERS, type StorageFilter, type StorageList, type StorageTarget, type StorageUnitView } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, FilterPills, InlineAlert, Link, NotFoundState, PageHeader, PlainTextArea, PlainTextField, SelectControl, useAnnounce, useApiMutation, useApiQuery, useKeyedCreate, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ChevronDown, PackageCheck, PackageOpen } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert } from '../../society/kit';
import { LinkButton, SearchSelect } from '../../society/hr/hkit';
import { AreaNav, PRJ, ProvisionalNote, StorageBadge, unbroken, useInvFormat, useLocationText } from './pkit';
import { UnitDrawer } from './UnitDrawer';

/**
 * INV-010 storage inventory: lockers and store rooms as their own records (V2.1 01 §9), filtered by
 * state and project and searched by storage or unit reference. A storage unit is allocated only to a
 * booked unit of the same project (the server refuses another project's unit, hidden ones like
 * invented ones) and released with a reason; nothing is allocated twice, and every change stays in its
 * history. Allocating needs the storage permission; everyone else reads.
 */
export default function StorageInventoryPage() {
  const { t } = useT();
  const set = useQueryParams();
  const [project] = useQueryParam('project');
  const [statusParam] = useQueryParam('status');
  const [search] = useQueryParam('q');
  const [unit] = useQueryParam('unit');
  const status: StorageFilter = (STORAGE_FILTERS as readonly string[]).includes(statusParam ?? '') ? (statusParam as StorageFilter) : 'all';
  const query = { status, ...(project ? { project } : {}), ...(search ? { q: search } : {}) };
  const q = useApiQuery<StorageList>({ method: 'GET', path: '/inventory/storage', query }, { placeholderData: (prev) => prev, retry: false });
  const [allocating, setAllocating] = useState<StorageUnitView | null>(null);
  const [releasing, setReleasing] = useState<StorageUnitView | null>(null);
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} actions={<LinkButton href={PRJ.storage()}>{t('projects:storage.allProjects')}</LinkButton>} />;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="storage-inventory">
      <PageHeader title={t('projects:storage.title')} description={t('projects:storage.intro')} />
      <AreaNav current="storage" />
      {!d.canManage && <p className="text-sm text-muted">{t('projects:storage.manageNote')}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <FilterPills label={t('projects:storage.filterLabel')} options={STORAGE_FILTERS.map((s) => ({ id: s, label: t(`projects:storage.filter.${s}`), count: d.counts[s] }))} value={status} onChange={(v) => set({ status: v === 'all' ? null : v })} testId="storage-filter" />
        {d.projects.length > 1 && (
          <div className="w-full max-w-xs">
            <SelectControl label={t('projects:storage.project')} value={project ?? 'all'} onChange={(v) => set({ project: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('projects:storage.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]} testId="storage-project" />
          </div>
        )}
        <div className="w-full max-w-sm">
          <PlainTextField label={t('projects:storage.search')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional dir="ltr" testId="storage-search" />
        </div>
      </div>
      {d.items.length === 0 ? (
        <EmptyState title={t('projects:storage.empty')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @4xl:grid-cols-2" data-testid="storage-list">
          {d.items.map((s) => (
            <StorageCard key={s.id} s={s} canManage={d.canManage} onAllocate={() => setAllocating(s)} onRelease={() => setReleasing(s)} onOpenUnit={(id) => set({ unit: id }, { replace: false })} />
          ))}
        </ul>
      )}
      <ProvisionalNote />
      {allocating && <AllocateDrawer s={allocating} onClose={() => setAllocating(null)} />}
      {releasing && <ReleaseDialog s={releasing} onClose={() => setReleasing(null)} />}
      <UnitDrawer unitId={unit} onClose={() => set({ unit: null })} />
    </div>
  );
}

function StorageCard({ s, canManage, onAllocate, onRelease, onOpenUnit }: { s: StorageUnitView; canManage: boolean; onAllocate: () => void; onRelease: () => void; onOpenUnit: (id: string) => void }) {
  const { t } = useT();
  const f = useInvFormat();
  const location = useLocationText();
  const [open, setOpen] = useState(false);
  return (
    <li className="min-w-0 space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="storage-card" data-storage={s.id} data-state={s.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text">
            <bdi dir="ltr">{unbroken(s.ref)}</bdi> <span className="font-normal text-muted">· {t(`projects:storage.kind.${s.kind}`)}</span>
          </p>
          <p className="text-sm text-muted">
            <Link href={PRJ.p360(s.projectId)}>{s.projectName}</Link> · {location(s.location)} · <bdi dir="ltr">{f.area(s.areaSqft)}</bdi>
          </p>
        </div>
        <StorageBadge state={s.state} />
      </div>
      {s.state === 'out_of_service' && s.outOfServiceKey && <p className="text-sm text-text">{t(s.outOfServiceKey as 'projects:storage.outOfService.damp')}</p>}
      {s.allocation && (
        <div className="space-y-0.5 text-sm" data-testid="storage-allocation">
          <p className="text-text">
            {t('projects:storage.allocatedTo')}{' '}
            <button type="button" className="rounded-control font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => onOpenUnit(s.allocation!.unitId)} data-testid="storage-unit">
              <bdi dir="ltr">{unbroken(s.allocation.unitRef)}</bdi>
            </button>
          </p>
          <p className="text-muted">{t('projects:storage.allocatedBy', { name: s.allocation.byName, date: f.when(s.allocation.at) })}</p>
          {s.allocation.note && <p className="text-muted">{t('projects:storage.note', { note: s.allocation.note })}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canManage && s.state === 'available' && (
          <Button size="sm" variant="primary" icon={PackageCheck} onPress={onAllocate} data-testid="storage-allocate">
            {t('projects:storage.allocate')}
          </Button>
        )}
        {canManage && s.state === 'allocated' && (
          <Button size="sm" variant="secondary" icon={PackageOpen} onPress={onRelease} data-testid="storage-release">
            {t('projects:storage.release')}
          </Button>
        )}
        <Button size="sm" variant="quiet" icon={ChevronDown} onPress={() => setOpen((x) => !x)} aria-expanded={open} data-testid="storage-history-toggle">
          {t('projects:storage.history', { count: String(s.history.length) })}
        </Button>
      </div>
      {open && (
        <ol className="space-y-1.5 border-s border-border ps-4 text-sm" data-testid="storage-history">
          {s.history.length === 0 ? (
            <li className="text-muted">{t('projects:storage.historyEmpty')}</li>
          ) : (
            s.history.map((h, i) => (
              <li key={`${h.at}-${i}`} data-action={h.action}>
                <p className="text-text">{t(`projects:storage.historyRow.${h.action}`, { name: h.byName, unit: h.unitRef })}</p>
                <p className="text-xs text-muted">
                  {f.when(h.at)}
                  {h.note ? ` · ${h.note}` : ''}
                </p>
              </li>
            ))
          )}
        </ol>
      )}
    </li>
  );
}

function AllocateDrawer({ s, onClose }: { s: StorageUnitView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const targets = useApiQuery<StorageTarget[]>({ method: 'GET', path: `/inventory/storage/${s.id}/targets` });
  const allocate = useKeyedCreate<StorageUnitView>('inv-storage');
  const options = (targets.data ?? []).map((x) => ({ id: x.unitId, label: x.unitRef, hint: `${t(`projects:inventory.${x.inventory}`)} · ${t('projects:seed.badge')}${x.storage ? ` · ${t('projects:storage.targetStorage', { count: String(x.storage) })}` : ''}` }));
  const submit = async () => {
    setError(null);
    try {
      const res = await allocate.send({ method: 'POST', path: `/inventory/storage/${s.id}/allocate`, body: { unitId: unitId ?? '', note } });
      const msg = t('projects:storage.allocated', { ref: res.ref, unit: res.allocation?.unitRef ?? '' });
      toast.success(msg);
      announce(msg);
      onClose();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('projects:storage.allocateTitle', { ref: s.ref })}
      subtitle={s.projectName}
      testId="storage-allocate-drawer"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onPress={() => void submit()} isPending={allocate.isPending} isDisabled={!unitId} data-testid="storage-allocate-confirm">
            {t('projects:storage.confirmAllocate')}
          </Button>
          <Button variant="quiet" onPress={onClose}>
            {t('projects:common.close')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">{t('projects:storage.allocateIntro', { project: s.projectName })}</InlineAlert>
        {error ? <ProblemAlert error={error} /> : null}
        {targets.data && targets.data.length === 0 ? <p className="text-sm text-muted">{t('projects:storage.noTargets')}</p> : <SearchSelect options={options} value={unitId} onChange={setUnitId} label={t('projects:storage.target')} description={t('projects:storage.targetHint')} testId="storage-target" />}
        <PlainTextArea label={t('projects:storage.noteLabel')} value={note} onChange={setNote} description={t('projects:storage.noteHint')} optional testId="storage-note" />
      </div>
    </Drawer>
  );
}

function ReleaseDialog({ s, onClose }: { s: StorageUnitView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const release = useApiMutation<StorageUnitView>();
  const [error, setError] = useState<unknown>(null);
  return (
    <ConfirmDialog
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('projects:storage.releaseTitle', { ref: s.ref })}
      effect={t('projects:storage.releaseEffect', { ref: s.ref, unit: s.allocation?.unitRef ?? '' })}
      confirmLabel={t('projects:storage.release')}
      reasonLabel={t('projects:storage.releaseReason')}
      problem={error ? <ProblemAlert error={error} /> : undefined}
      onConfirm={async (reason) => {
        setError(null);
        try {
          await release.mutateAsync({ method: 'POST', path: `/inventory/storage/${s.id}/release`, body: { reason: reason ?? '' } });
          const msg = t('projects:storage.releasedToast', { ref: s.ref });
          toast.success(msg);
          announce(msg);
          onClose();
          return true;
        } catch (e) {
          setError(e);
          return false;
        }
      }}
    />
  );
}
