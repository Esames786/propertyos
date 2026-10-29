import type { ExportFile, ExportRequest, PrivacyRequest } from '@repo/contracts';
import { formatCalendarDate, formatInstant, useLocale } from '@repo/i18n';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, saveFile, Skeleton, UrlTabs, useAnnounce, useApiMutation, useApiQuery, useCan, useT, useToast, type StatusTone } from '@repo/ui';
import { Ban, Check, DatabaseZap, Download, Eye, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { DataFlags, DecideExportDrawer, NewExportDrawer } from './ExportDrawers';

const EXPORT_TONE: Record<ExportRequest['state'], StatusTone> = {
  awaiting_approval: 'warning',
  approved: 'info',
  rejected: 'neutral',
  ready: 'success',
  downloaded: 'neutral',
  expired: 'neutral',
  cancelled: 'neutral',
};
const PRIVACY_TONE: Record<PrivacyRequest['state'], StatusTone> = { submitted: 'info', in_review: 'warning', completed: 'success', rejected: 'neutral' };

/**
 * ADM-024 Data & privacy (Gate D.1). Exports: a copy of records the requester can already open,
 * approved by someone else when personal or financial (D-40), generated for the requester at
 * download time, expiring after seven days. Privacy requests: residents' requests to see, correct or
 * delete their data, answered within 30 days. Every file is simulated demo data.
 */
export default function DataPrivacyPage() {
  const { t } = useT();
  const can = useCan();
  const mayExport = can('data_export.request') || can('data_export.approve');
  const items = [...(mayExport ? [{ id: 'exports', label: t('identity:data.tabs.exports') }] : []), ...(can('privacy.requests.manage') ? [{ id: 'privacy', label: t('identity:data.tabs.privacy') }] : [])];
  const [creating, setCreating] = useState(false);
  return (
    <div className="@container space-y-6">
      <PageHeader
        title={t('nav:pages.dataPrivacy')}
        description={t('identity:data.intro')}
        actions={
          can('data_export.request') ? (
            <Button variant="primary" icon={Plus} onPress={() => setCreating(true)} data-testid="export-new-button">
              {t('identity:export.new')}
            </Button>
          ) : undefined
        }
      />
      {items.length > 0 && (
        <UrlTabs label={t('identity:data.tabsLabel')} items={items}>
          {(tab) => (tab === 'privacy' ? <PrivacyList /> : <ExportList onNew={can('data_export.request') ? () => setCreating(true) : undefined} />)}
        </UrlTabs>
      )}
      <NewExportDrawer isOpen={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ExportList({ onNew }: { onNew?: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const announce = useAnnounce();
  const query = useApiQuery<ExportRequest[]>({ method: 'GET', path: '/data-exports' });
  const download = useApiMutation<ExportFile>();
  const cancel = useApiMutation<ExportRequest>();
  const [deciding, setDeciding] = useState<ExportRequest | null>(null);
  const [cancelling, setCancelling] = useState<ExportRequest | null>(null);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-48 w-full" />;
  if (!query.data.length)
    return (
      <EmptyState
        title={t('identity:export.empty')}
        body={t('identity:export.emptyBody')}
        actions={
          onNew && (
            <Button variant="primary" icon={Plus} onPress={onNew}>
              {t('identity:export.new')}
            </Button>
          )
        }
      />
    );
  const stamp = (iso: string) => formatInstant(iso, locale, 'dateTime');
  return (
    <>
      <ul className="space-y-3" data-testid="export-list">
        {query.data.map((r) => (
          <li key={r.id} className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5" data-testid="export-row" data-state={r.state} data-ref={r.reference}>
            <div className="flex flex-wrap items-start gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                <DatabaseZap className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-[min(100%,14rem)] space-y-1.5">
                <p className="flex flex-wrap items-center gap-2">
                  <bdi dir="ltr" className="ltr-ref font-semibold text-text">
                    {r.reference}
                  </bdi>
                  <Badge tone={EXPORT_TONE[r.state]}>{t(`identity:export.state.${r.state}`)}</Badge>
                  <span className="text-xs text-muted">
                    {r.format.toUpperCase()} · {t('identity:export.rows', { count: r.rows })}
                  </span>
                </p>
                <p className="text-sm text-text">{t('identity:export.purposeLine', { text: r.purpose })}</p>
                <ul className="flex flex-wrap gap-1.5" aria-label={t('identity:export.datasetsLabel')}>
                  {r.datasets.map((d) => (
                    <li key={d.dataset} className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-xs ${d.included ? 'border-border text-text' : 'border-dashed border-border text-muted line-through'}`} data-included={d.included}>
                      {t(`identity:export.datasets.${d.dataset}`)}
                      {!d.included && d.reason && <span className="sr-only">({t(`identity:export.reason.${d.reason}`)})</span>}
                    </li>
                  ))}
                  {r.datasets.some((d) => d.included && (d.personalData || d.financialData)) && (
                    <li className="inline-flex gap-1.5">
                      <DataFlags personal={r.datasets.some((d) => d.included && d.personalData)} financial={r.datasets.some((d) => d.included && d.financialData)} />
                    </li>
                  )}
                </ul>
                <p className="text-xs text-muted">
                  {t('identity:export.requestedBy', { name: r.requestedByName, date: stamp(r.requestedAt) })}
                  {r.decidedByName && r.decidedAt ? ` · ${t('identity:export.decidedBy', { state: t(`identity:export.state.${r.state === 'rejected' ? 'rejected' : 'approved'}`), name: r.decidedByName, date: stamp(r.decidedAt) })}` : ''}
                  {r.expiresAt && (r.state === 'ready' || r.state === 'downloaded') ? ` · ${t('identity:export.expires', { date: formatCalendarDate(r.expiresAt.slice(0, 10), locale) })}` : ''}
                </p>
                {r.decisionNote && <p className="text-sm text-muted">“{r.decisionNote}”</p>}
                {r.state === 'awaiting_approval' && !r.canDecide && <p className="text-xs text-muted">{t('identity:export.yours')}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.canDecide && (
                  <Button size="sm" variant="primary" icon={Eye} onPress={() => setDeciding(r)} data-testid="export-review">
                    {t('identity:export.review')}
                  </Button>
                )}
                {r.canDownload && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Download}
                    isPending={download.isPending && download.variables?.path.includes(r.id)}
                    onPress={() =>
                      download.mutate(
                        { method: 'POST', path: `/data-exports/${r.id}/download` },
                        {
                          onSuccess: (file) => {
                            saveFile(file);
                            toast.success(t('identity:export.downloaded', { file: file.fileName }));
                            announce(t('identity:export.downloaded', { file: file.fileName }));
                          },
                          onError: () => toast.error(t('identity:export.failed')),
                        },
                      )
                    }
                    data-testid="export-download"
                  >
                    {t('identity:export.download')}
                  </Button>
                )}
                {r.state === 'awaiting_approval' && !r.canDecide && (
                  <Button size="sm" variant="quiet" icon={Ban} onPress={() => setCancelling(r)} data-testid="export-cancel">
                    {t('identity:export.cancel')}
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <DecideExportDrawer request={deciding} onClose={() => setDeciding(null)} />
      <ConfirmDialog
        isOpen={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`${t('identity:export.cancel')}?`}
        effect={t('identity:export.cancelEffect')}
        confirmLabel={t('identity:export.cancel')}
        destructive
        onConfirm={async () => {
          if (!cancelling) return;
          await cancel.mutateAsync({ method: 'POST', path: `/data-exports/${cancelling.id}/cancel` }).then(
            () => toast.success(t('identity:export.cancelled', { ref: cancelling.reference })),
            () => toast.error(t('identity:export.failed')),
          );
        }}
      />
    </>
  );
}

function PrivacyList() {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const announce = useAnnounce();
  const query = useApiQuery<PrivacyRequest[]>({ method: 'GET', path: '/privacy-requests' });
  const decide = useApiMutation<PrivacyRequest>();
  const [acting, setActing] = useState<{ r: PrivacyRequest; decision: 'complete' | 'reject' } | null>(null);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-48 w-full" />;
  if (!query.data.length) return <EmptyState title={t('identity:privacy.empty')} />;
  return (
    <>
      <p className="text-sm text-muted">{t('identity:privacy.intro')}</p>
      <ul className="space-y-3" data-testid="privacy-list">
        {query.data.map((r) => {
          const open = r.state === 'submitted' || r.state === 'in_review';
          return (
            <li key={r.id} className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5" data-testid="privacy-row" data-state={r.state} data-kind={r.kind}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-[min(100%,14rem)] space-y-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text">{t(`identity:privacy.kind.${r.kind}`)}</span>
                    <Badge tone={PRIVACY_TONE[r.state]}>{t(`identity:myData.state.${r.state}`)}</Badge>
                    <bdi dir="ltr" className="ltr-ref text-xs text-muted">
                      {r.reference}
                    </bdi>
                  </p>
                  <p className="text-sm text-text">
                    <bdi className="font-medium">{r.personName}</bdi>
                    {r.flatCodes.length > 0 && (
                      <span className="text-muted">
                        {' · '}
                        {t('identity:privacy.flats', { flats: '⁦' + r.flatCodes.join(', ') + '⁩' })}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">“{r.details}”</p>
                  <p className="text-xs text-muted">
                    {t(`identity:privacy.via.${r.submittedVia}`)} · {formatInstant(r.submittedAt, locale, 'date')} · {t('identity:privacy.due', { date: formatCalendarDate(r.dueBy, locale) })}
                  </p>
                  {(r.decisionNote || r.retentionOutcome) && <p className="text-sm text-text">{[r.decisionNote, r.retentionOutcome && t(`identity:privacy.retention.${r.retentionOutcome}` as 'identity:privacy.retention.contacts_removed_financial_kept')].filter(Boolean).join(' ')}</p>}
                </div>
                {open && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" icon={Check} onPress={() => setActing({ r, decision: 'complete' })} data-testid="privacy-complete">
                      {t('identity:privacy.complete')}
                    </Button>
                    <Button size="sm" variant="secondary" icon={X} onPress={() => setActing({ r, decision: 'reject' })} data-testid="privacy-reject">
                      {t('identity:privacy.reject')}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        isOpen={!!acting}
        onOpenChange={(open) => !open && setActing(null)}
        title={acting ? t(acting.decision === 'complete' ? 'identity:privacy.completeTitle' : 'identity:privacy.rejectTitle', { ref: acting.r.reference }) : ''}
        effect={acting ? (acting.decision === 'complete' ? t(`identity:privacy.completeEffect.${acting.r.kind}`) : t('identity:privacy.rejectEffect')) : ''}
        confirmLabel={acting?.decision === 'reject' ? t('identity:privacy.reject') : t('identity:privacy.complete')}
        destructive={acting?.decision === 'reject' || acting?.r.kind === 'deletion'}
        reasonLabel={t('identity:privacy.noteLabel')}
        onConfirm={async (note) => {
          if (!acting) return;
          const { r, decision } = acting;
          try {
            await decide.mutateAsync({ method: 'POST', path: `/privacy-requests/${r.id}/decide`, body: { decision, note } });
            const msg = t(decision === 'complete' ? 'identity:privacy.completed' : 'identity:privacy.declined', { ref: r.reference });
            toast.success(msg);
            announce(msg);
          } catch {
            toast.error(t('identity:export.failed'));
          }
        }}
      />
    </>
  );
}
