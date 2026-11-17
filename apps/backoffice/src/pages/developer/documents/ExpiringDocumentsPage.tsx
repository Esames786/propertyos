import { DOC_KINDS, EXPIRY_WINDOWS, type DocumentSummary, type ExpiringDocuments, type ExpiryWindow } from '@repo/contracts';
import { Button, EmptyState, ErrorState, FilterPills, InlineAlert, PageHeader, PlainTextField, SelectControl, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Loading } from '../../society/kit';
import { HubNav, ShortcutsHelp, useHubFormat, useShortcuts, type Shortcut } from '../workspace/wkit';
import { DocumentRow } from './dkit';
import { UploadDrawer } from './UploadDrawer';

/**
 * DOC-005 expiring documents: documents of records the reader may open whose current version has
 * expired or expires within 30, 60 or 90 days of the business date, soonest first. Each count opens
 * its list; each row opens the document or uploads its renewal as a new version (DOC-003).
 */
export default function ExpiringDocumentsPage() {
  const { t } = useT();
  const f = useHubFormat();
  const set = useQueryParams();
  const [win] = useQueryParam('window');
  const [kind] = useQueryParam('kind');
  const [project] = useQueryParam('project');
  const [q] = useQueryParam('q');
  const [renewing, setRenewing] = useState<DocumentSummary | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const span: ExpiryWindow = (EXPIRY_WINDOWS as readonly string[]).includes(win ?? '') ? (win as ExpiryWindow) : '30';
  const list = useApiQuery<ExpiringDocuments>({ method: 'GET', path: '/documents/expiring', query: { window: span, ...(kind ? { kind } : {}), ...(project ? { project } : {}), ...(q ? { q } : {}) } }, { placeholderData: (prev) => prev });
  const d = list.data;
  const shortcuts = useMemo<Shortcut[]>(() => [{ code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() }], [t]);
  const keys = useShortcuts(shortcuts);
  return (
    <div className="@container space-y-5" data-testid="expiring-documents">
      <PageHeader title={t('documents:expiring.title')} description={t('documents:expiring.intro')} />
      <HubNav current="expiring" />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !d ? (
        <Loading lines={8} />
      ) : (
        <>
          <InlineAlert tone="info" data-testid="expiring-basis">
            {t('documents:expiring.basis', { date: f.date(d.today) })}
          </InlineAlert>
          <FilterPills
            label={t('documents:expiring.windowLabel')}
            options={EXPIRY_WINDOWS.map((w) => ({ id: w, label: t(`documents:expiring.window.${w}`), count: d.counts[w] }))}
            value={span}
            onChange={(v) => set({ window: v === '30' ? null : v })}
            testId="expiring-window"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div ref={field} className="w-full max-w-sm">
              <PlainTextField label={t('documents:finder.search')} value={q ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="expiring-search" />
            </div>
            <div className="w-full max-w-xs">
              <SelectControl
                label={t('documents:finder.kind')}
                value={kind ?? 'all'}
                onChange={(v) => set({ kind: !v || v === 'all' ? null : v })}
                options={[{ id: 'all', label: t('documents:finder.allKinds') }, ...DOC_KINDS.map((k) => ({ id: k, label: t(`documents:kinds.${k}`) }))]}
                testId="expiring-kind"
              />
            </div>
            {d.projects.length > 1 && (
              <div className="w-full max-w-xs">
                <SelectControl
                  label={t('documents:finder.project')}
                  value={project ?? 'all'}
                  onChange={(v) => set({ project: !v || v === 'all' ? null : v })}
                  options={[{ id: 'all', label: t('documents:finder.allProjects') }, ...d.projects.map((p) => ({ id: p.id, label: p.name }))]}
                  testId="expiring-project"
                />
              </div>
            )}
          </div>
          <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
          {d.items.length === 0 ? (
            <EmptyState title={t(span === 'expired' ? 'documents:expiring.noneExpired' : 'documents:expiring.none', { days: span })} body={t('documents:expiring.noneBody')} />
          ) : (
            <ul className="space-y-2" data-testid="expiring-list">
              {d.items.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  testId="expiring-row"
                  actions={
                    d.canUpload ? (
                      <Button className="max-w-full whitespace-normal text-center" variant="secondary" size="sm" icon={Upload} onPress={() => setRenewing(doc)} aria-label={t('documents:expiring.renewFor', { title: doc.title })} data-testid="expiring-renew">
                        {t('documents:expiring.renew')}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
      {renewing && <UploadDrawer isOpen onOpenChange={(open) => !open && setRenewing(null)} mode={{ kind: 'version', doc: renewing }} onDone={() => setRenewing(null)} />}
    </div>
  );
}
