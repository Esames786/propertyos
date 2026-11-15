import type { PaymentPlanTemplate, PaymentPlanTemplateList, PlanAllocationInput, PlanAllocationKind, UnitPricePickerResponse } from '@repo/contracts';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonBlock, useApiMutation, useApiQuery, useCreateKey, useT } from '@repo/ui';
import { FileClock, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const KINDS: readonly PlanAllocationKind[] = ['down_payment', 'instalments', 'on_possession', 'balloon', 'construction_linked'];
type DraftRow = { id: number; kind: PlanAllocationKind; percent: string; count: string; milestoneKey: string };
const newRows = (): DraftRow[] => [
  { id: 1, kind: 'down_payment', percent: '10', count: '1', milestoneKey: '' },
  { id: 2, kind: 'instalments', percent: '90', count: '12', milestoneKey: '' },
];
function bps(text: string): number | null {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || '0');
  return result <= 10000 ? result : null;
}
function allocationsOf(rows: DraftRow[]): PlanAllocationInput[] | null {
  if (rows.length < 1 || rows.length > 24) return null;
  const lines: PlanAllocationInput[] = [];
  for (const row of rows) {
    const shareBps = bps(row.percent);
    if (shareBps === null) return null;
    if (row.kind === 'instalments') {
      const count = Number(row.count);
      if (!/^\d{1,2}$/.test(row.count) || !Number.isInteger(count) || count < 1 || count > 36) return null;
      lines.push({ kind: row.kind, shareBps, count });
    } else if (row.kind === 'construction_linked') {
      if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(row.milestoneKey)) return null;
      lines.push({ kind: row.kind, shareBps, milestoneKey: row.milestoneKey });
    } else lines.push({ kind: row.kind, shareBps });
  }
  return lines.reduce((total, line) => total + line.shareBps, 0) === 10000 ? lines : null;
}
const asDraftRows = (v: PaymentPlanTemplate['versions'][number]['allocations']): DraftRow[] =>
  v.map((line, index) => ({
    id: index + 1, kind: line.kind,
    percent: `${Math.floor(line.shareBps / 100)}.${String(line.shareBps % 100).padStart(2, '0')}`,
    count: String(line.count ?? 1), milestoneKey: line.milestoneKey ?? '',
  }));

/** COM-001 — drafts only, private to creator. Approval and effective plan use are intentionally absent. */
export default function PaymentPlanTemplatesPage() {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(newRows);
  const [nextRowId, setNextRowId] = useState(3);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [createKey, renewCreate] = useCreateKey('plan-template');
  const [revisionKey, renewRevision] = useCreateKey('plan-revision');
  const mutation = useApiMutation<PaymentPlanTemplate>();
  const templates = useApiQuery<PaymentPlanTemplateList>({ method: 'GET', path: '/pricing/plan-templates', query: { q: query } });
  const units = useApiQuery<UnitPricePickerResponse>({ method: 'GET', path: '/pricing/units' });
  const selected = useApiQuery<PaymentPlanTemplate>(
    selectedId ? { method: 'GET', path: `/pricing/plan-templates/${encodeURIComponent(selectedId)}` } : null,
  );
  const projects = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const unit of units.data?.items ?? []) lookup.set(unit.projectId, unit.projectName);
    return [...lookup].map(([id, name]) => ({ id, name }));
  }, [units.data]);
  const makeNew = () => {
    setSelectedId(null); setTitle(''); setProjectId(''); setRows(newRows()); setNextRowId(3);
    renewCreate(); renewRevision(); setSaved(false); setError(false);
  };
  useEffect(() => {
    if (!selected.data || selected.data.id !== selectedId) return;
    const latest = selected.data.versions.at(-1);
    if (!latest) return;
    setTitle(latest.title);
    setProjectId(selected.data.projectId);
    setRows(asDraftRows(latest.allocations));
    setNextRowId(latest.allocations.length + 1);
    setSaved(false); setError(false);
  }, [selected.data, selectedId]);
  const change = () => { setSaved(false); setError(false); if (selectedId) renewRevision(); else renewCreate(); };
  const update = (id: number, patch: Partial<DraftRow>) => {
    setRows((old) => old.map((r) => r.id === id ? { ...r, ...patch } : r));
    change();
  };
  const submit = async () => {
    const allocations = allocationsOf(rows);
    const cleanTitle = title.trim().replace(/\s+/g, ' ');
    if (!projectId || !projects.some((p) => p.id === projectId) || cleanTitle.length < 3 || cleanTitle.length > 100 || !allocations) {
      setError(true); return;
    }
    setError(false);
    const key = selectedId ? revisionKey : createKey;
    const path = selectedId ? `/pricing/plan-templates/${encodeURIComponent(selectedId)}/versions` : '/pricing/plan-templates';
    const body = selectedId
      ? { expectedVersion: selected.data?.currentVersion, title: cleanTitle, allocations, idempotencyKey: key }
      : { projectId, title: cleanTitle, allocations, idempotencyKey: key };
    // A lost answer can retry with the same key. Any edit renews it; two new drafts never share it.
    try {
      const response = await mutation.mutateAsync({ method: 'POST', path, body, idempotencyKey: key });
      setSelectedId(response.id);
      renewCreate(); renewRevision();
      setSaved(true);
    } catch {
      setSaved(false);
    }
  };
  const options: Record<PlanAllocationKind, string> = {
    down_payment: t('pricing:previewKindDown'),
    instalments: t('pricing:previewKindInstalments'),
    on_possession: t('pricing:previewKindPossession'),
    balloon: t('pricing:previewKindBalloon'),
    construction_linked: t('pricing:previewKindConstruction'),
  };

  return (
    <div className="space-y-6 @container" data-testid="payment-plan-templates-page">
      <PageHeader title={t('pricing:templateTitle')} description={t('pricing:templateIntro')} />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="template-draft-notice">
        {t('pricing:templateNotApproved')}
      </p>
      <div className="grid gap-5 @3xl:grid-cols-[minmax(15rem,1fr)_minmax(0,1.6fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="template-list-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="template-list-title" className="font-semibold text-text">{t('pricing:templateList')}</h2>
            <Button icon={Plus} variant="secondary" onPress={makeNew}>{t('pricing:templateStartNew')}</Button>
          </div>
          <label className="flex flex-col gap-1 text-sm text-text">
            {t('pricing:templateSearch')}
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              data-testid="template-search"
              className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-focus" />
          </label>
          {templates.isError ? <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
            : !templates.data ? <SkeletonBlock lines={4} />
              : templates.data.items.length === 0 ? <EmptyState title={t('pricing:templateEmpty')} />
                : <ul className="space-y-2" data-testid="template-list">
                  {templates.data.items.map((item) => (
                    <li key={item.id}>
                      <button type="button" disabled={mutation.isPending}
                        data-testid="template-list-item"
                        aria-current={selectedId === item.id ? 'true' : undefined}
                        onClick={() => { setSelectedId(item.id); setSaved(false); setError(false); renewRevision(); }}
                        className="min-h-11 w-full rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                        <span className="block break-words font-medium">{item.title}</span>
                        <span className="text-sm text-muted">{t('pricing:templateVersion', { version: item.currentVersion })}</span>
                      </button>
                    </li>
                  ))}
                </ul>}
        </section>
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="template-editor-heading">
          <h2 id="template-editor-heading" className="font-semibold text-text">{selectedId ? t('pricing:templateEdit') : t('pricing:templateNew')}</h2>
          <p className="text-sm text-muted">{t('pricing:templatePrivate')}</p>
          {selectedId && selected.isError ? <ErrorState error={selected.error} onRetry={() => void selected.refetch()} /> :
            <fieldset disabled={mutation.isPending || (!!selectedId && !selected.data)} className="space-y-4">
              <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templateProject')}
                <select value={projectId} disabled={!!selectedId} onChange={(event) => { setProjectId(event.target.value); change(); }}
                  data-testid="template-project"
                  className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <option value="">{t('pricing:templateProjectPlaceholder')}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templateName')}
                <input type="text" maxLength={100} value={title} data-testid="template-name"
                  onChange={(event) => { setTitle(event.target.value); change(); }}
                  className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
              </label>
              <h3 className="font-semibold text-text">{t('pricing:templateAllocations')}</h3>
              {rows.map((row, index) => (
                <div key={row.id} className="grid min-w-0 gap-3 rounded-control border border-border bg-sunken p-3 @lg:grid-cols-2" data-testid="template-allocation">
                  <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templateKind')}
                    <select value={row.kind} onChange={(event) => update(row.id, { kind: event.target.value as PlanAllocationKind })}
                      className="min-h-11 min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-focus">
                      {KINDS.map((kind) => <option key={kind} value={kind}>{options[kind]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templatePercent')}
                    <input type="text" inputMode="decimal" value={row.percent} data-testid={`template-share-${index}`}
                      onChange={(event) => update(row.id, { percent: event.target.value })}
                      className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-focus" />
                  </label>
                  {row.kind === 'instalments' && <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templateInstalments')}
                    <input type="number" min="1" max="36" value={row.count} onChange={(event) => update(row.id, { count: event.target.value })}
                      className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text" />
                  </label>}
                  {row.kind === 'construction_linked' && <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:templateMilestone')}
                    <input type="text" value={row.milestoneKey} onChange={(event) => update(row.id, { milestoneKey: event.target.value })}
                      className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text" />
                  </label>}
                  <Button variant="secondary" icon={Trash2} isDisabled={rows.length === 1}
                    onPress={() => { setRows((old) => old.filter((r) => r.id !== row.id)); change(); }}>{t('pricing:templateDelete')}</Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={Plus} isDisabled={rows.length >= 24}
                  onPress={() => { setRows((old) => [...old, { id: nextRowId, kind: 'balloon', percent: '0', count: '1', milestoneKey: '' }]); setNextRowId((n) => n + 1); change(); }}>
                  {t('pricing:templateAdd')}
                </Button>
                <Button variant="primary" icon={Save} isPending={mutation.isPending} onPress={() => void submit()} data-testid="template-save">
                  {selectedId ? t('pricing:templateRevise') : t('pricing:templateSave')}
                </Button>
              </div>
              {error && <p role="alert" className="text-sm text-error">{t('pricing:templateValidation')}</p>}
              {mutation.isError && <ErrorState error={mutation.error} title={t('pricing:templateError')} />}
              {saved && <p role="status" className="text-sm text-success" data-testid="template-saved">{t('pricing:templateSaved')}</p>}
            </fieldset>}
          {selectedId && selected.data && <section className="space-y-3" aria-labelledby="template-versions-title">
            <h3 id="template-versions-title" className="flex items-center gap-2 font-semibold text-text"><FileClock aria-hidden className="size-4" />{t('pricing:templateHistory')}</h3>
            <Badge tone="warning">{t('pricing:templateCurrent')}</Badge>
            <ol className="space-y-2" data-testid="template-version-history">
              {selected.data.versions.map((version) =>
                <li key={version.version} className="rounded-control border border-border p-3 text-sm text-text">
                  <strong>{t('pricing:templateVersion', { version: version.version })}</strong>
                  <p className="break-words">{version.title}</p>
                  <p className="text-muted">{version.allocations.length} {t('pricing:templateAllocations')}</p>
                </li>)}
            </ol>
            <p className="text-sm text-muted">{t('pricing:templateTitleUnchanged')}</p>
          </section>}
        </section>
      </div>
    </div>
  );
}
