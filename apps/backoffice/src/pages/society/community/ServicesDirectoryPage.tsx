import { PROVIDER_CATEGORIES, type ProviderCategory, type ProviderStatus, type ServiceDirectoryOffice, type ServiceProviderOffice } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, PageHeader, PlainCheckbox, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { BadgeCheck, Ban, CircleDashed, Flag, Phone, Plus, RotateCcw, ThumbsUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert } from '../kit';
import { Fact, FactGrid, HistoryList, WRAP } from '../finance/fkit';
import { When } from '../operations/okit';

/**
 * CMTY-001 local services directory (D-32). The office adds a provider with a consent record (its
 * contact number is kept only if the provider agreed to show it); someone other than whoever added
 * it vets it before residents see it; residents recommend (a count, no reviews) and report; the
 * office suspends or dismisses reports. The society does not guarantee the work (said to residents).
 */
const VIEWS = ['listed', 'pending', 'suspended', 'rejected', 'reports', 'categories'] as const;
type View = (typeof VIEWS)[number];
const STATUS: Record<ProviderStatus, ['success' | 'warning' | 'neutral' | 'error', typeof BadgeCheck]> = { listed: ['success', BadgeCheck], pending: ['warning', CircleDashed], suspended: ['error', Ban], rejected: ['neutral', XCircle] };

export function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const { t } = useT();
  const [tone, icon] = STATUS[status];
  return (
    <Badge tone={tone} icon={icon} data-testid="provider-status" data-status={status}>
      {t(`community:providerStatus.${status}`)}
    </Badge>
  );
}

export default function ServicesDirectoryPage() {
  const { t } = useT();
  const [status] = useQueryParam('status');
  const [category] = useQueryParam('category');
  const [record] = useQueryParam('record');
  const setParams = useQueryParams();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const view: View = (VIEWS as readonly string[]).includes(status ?? '') ? (status as View) : 'listed';
  const cat = PROVIDER_CATEGORIES.includes(category as ProviderCategory) ? (category as ProviderCategory) : null;
  const q = useApiQuery<ServiceDirectoryOffice>({ method: 'GET', path: '/ops/community/services', query: { status: view === 'categories' ? 'all' : view, ...(cat ? { category: cat } : {}), ...(search.trim() ? { q: search.trim() } : {}) } }, { placeholderData: (prev) => prev });
  // The open record is read from every provider, so it stays open when its status changes (vetted, suspended).
  const all = useApiQuery<ServiceDirectoryOffice>({ method: 'GET', path: '/ops/community/services', query: { status: 'all' } }, { enabled: !!record });
  const selected = all.data?.items.find((p) => p.id === record) ?? null;
  return (
    <div className="@container space-y-5" data-testid="services-office">
      <PageHeader
        title={t('community:directory.title')}
        description={t('community:directory.intro')}
        actions={
          <Button variant="primary" icon={Plus} onPress={() => setAdding(true)} className={WRAP} data-testid="provider-add">
            {t('community:directory.add')}
          </Button>
        }
      />
      <InlineAlert tone="info">
        {t('community:directory.rules')}
      </InlineAlert>
      <FilterPills
        label={t('community:directory.show')}
        value={view}
        onChange={(v) => setParams({ status: v === 'listed' ? null : v, record: null })}
        testId="directory-view"
        options={VIEWS.map((v) => ({ id: v, label: t(`community:directory.view.${v}`), ...(q.data && v !== 'categories' ? { count: v === 'reports' ? q.data.counts.reports : q.data.counts[v] } : {}) }))}
      />
      {view !== 'categories' && (
        <div className="grid gap-3 @2xl:grid-cols-2">
          <PlainTextField label={t('community:services.search')} value={search} onChange={setSearch} optional testId="directory-search" />
          <SelectControl label={t('community:services.category')} value={cat ?? 'all'} onChange={(v) => setParams({ category: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('community:services.allCategories') }, ...PROVIDER_CATEGORIES.map((c) => ({ id: c, label: t(`community:category.${c}`) }))]} testId="directory-category" />
        </div>
      )}
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : view === 'categories' ? (
        <ul className="grid gap-2 @2xl:grid-cols-2" data-testid="directory-categories">
          {q.data.categories.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border bg-panel p-3">
              <span className="font-medium text-text">{t(`community:category.${c.key}`)}</span>
              <span className="text-sm text-muted">{t('community:directory.listedCount', { count: c.listed })}</span>
            </li>
          ))}
        </ul>
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t(`community:directory.empty.${view}`)} />
      ) : (
        <ul className="space-y-2" data-testid="provider-list">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setParams({ record: p.id })} className="grid w-full gap-2 rounded-tile border border-border/70 bg-panel p-4 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="provider-row" data-status={p.status}>
                <span className="min-w-0">
                  <span className="block font-semibold break-words text-text">
                    <bdi>{p.name}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr">{p.ref}</bdi> · {t(`community:category.${p.category}`)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp aria-hidden className="size-3.5" />
                    {t('community:services.recommendations', { count: p.recommendations })}
                  </span>
                  {p.reports.some((r) => r.state === 'open') && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Flag aria-hidden className="size-3.5" />
                      {t('community:directory.openReports', { count: p.reports.filter((r) => r.state === 'open').length })}
                    </span>
                  )}
                </span>
                <ProviderStatusBadge status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ProviderDrawer provider={selected} onClose={() => setParams({ record: null })} />
      <AddProvider open={adding} onClose={() => setAdding(false)} onAdded={(id) => setParams({ status: 'pending', record: id })} />
    </div>
  );
}

function ProviderDrawer({ provider: p, onClose }: { provider: ServiceProviderOffice | null; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const dt = dynamicT(t);
  const [acting, setActing] = useState<'vet' | 'reject' | 'suspend' | 'reinstate' | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const act = useApiMutation<ServiceProviderOffice>();
  const fail = (e: unknown) => {
    const fields = e instanceof ApiError ? Object.values(e.problem.errors ?? {}).flat() : [];
    toast.error(e instanceof ApiError ? (fields[0] ? dt(fields[0].code, fields[0].params) : dt(e.problem.messageKey)) : t('errors:network.unavailable'));
  };
  return (
    <Drawer isOpen={!!p} onOpenChange={(o) => !o && onClose()} title={p?.name ?? ''} subtitle={p ? <ProviderStatusBadge status={p.status} /> : undefined} size="lg" testId="provider-drawer">
      {p && (
        <div className="space-y-5">
          <FactGrid>
            <Fact label={t('community:directory.ref')}>
              <bdi dir="ltr">{p.ref}</bdi>
            </Fact>
            <Fact label={t('community:services.category')}>{t(`community:category.${p.category}`)}</Fact>
            <Fact label={t('community:directory.description')}>
              <bdi>{p.description}</bdi>
            </Fact>
            <Fact label={t('community:directory.serves')}>
              <bdi>{p.serves}</bdi>
            </Fact>
            <Fact label={t('community:directory.phone')}>
              {p.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone aria-hidden className="size-3.5" />
                  <bdi dir="ltr">{p.phone}</bdi>
                </span>
              ) : (
                t('community:directory.noPhone')
              )}
            </Fact>
            <Fact label={t('community:directory.consent')}>
              {t(p.consent.showContact ? 'community:directory.consentShow' : 'community:directory.consentHide', { method: t(`community:consentMethod.${p.consent.method}`), name: p.consent.recordedByName })} <When at={p.consent.recordedAt} style="date" />
            </Fact>
            <Fact label={t('community:directory.added')}>
              <bdi>{p.addedByName}</bdi> · <When at={p.addedAt} style="date" />
            </Fact>
            {p.vettedByName && (
              <Fact label={t('community:directory.vetted')}>
                <bdi>{p.vettedByName}</bdi> · <When at={p.vettedAt!} style="date" />
              </Fact>
            )}
            {p.reason && (
              <Fact label={t('community:directory.reason')}>
                <bdi>{p.reason}</bdi>
              </Fact>
            )}
            <Fact label={t('community:directory.recommendations')}>{t('community:services.recommendations', { count: p.recommendations })}</Fact>
          </FactGrid>
          {p.status === 'pending' && !p.actions.vet && (
            <InlineAlert tone="info" data-testid="provider-vet-other">
              {t('community:directory.vetOther')}
            </InlineAlert>
          )}
          <div className="flex flex-wrap gap-2">
            {p.actions.vet && (
              <Button variant="primary" icon={BadgeCheck} onPress={() => setActing('vet')} className={WRAP} data-testid="provider-vet">
                {t('community:directory.vet')}
              </Button>
            )}
            {p.actions.reject && (
              <Button variant="danger" icon={XCircle} onPress={() => setActing('reject')} className={WRAP} data-testid="provider-reject">
                {t('community:directory.reject')}
              </Button>
            )}
            {p.actions.suspend && (
              <Button variant="danger" icon={Ban} onPress={() => setActing('suspend')} className={WRAP} data-testid="provider-suspend">
                {t('community:directory.suspend')}
              </Button>
            )}
            {p.actions.reinstate && (
              <Button icon={RotateCcw} onPress={() => setActing('reinstate')} className={WRAP} data-testid="provider-reinstate">
                {t('community:directory.reinstate')}
              </Button>
            )}
          </div>
          <section className="space-y-2">
            <h3 className="font-semibold text-text">{t('community:directory.reports')}</h3>
            {p.reports.length === 0 ? (
              <p className="text-sm text-muted">{t('community:directory.noReports')}</p>
            ) : (
              <ul className="space-y-2" data-testid="provider-reports">
                {p.reports.map((r) => (
                  <li key={r.id} className="space-y-1 rounded-tile border border-border p-3 text-sm">
                    <p className="break-words text-text">
                      <bdi>{r.reason}</bdi>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <When at={r.at} /> · {t(`community:directory.reportState.${r.state}`)}
                    </p>
                    {r.state === 'open' && (
                      <Button size="sm" variant="quiet" onPress={() => setDismissing(r.id)} data-testid="provider-report-dismiss">
                        {t('community:directory.dismissReport')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold text-text">{t('community:office.history')}</h3>
            <HistoryList label={t('community:office.history')} items={p.history.map((h) => ({ at: h.at, byName: h.byName || t('community:office.aResident'), label: dt(`community:directory.event.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          <ConfirmDialog
            isOpen={!!acting}
            onOpenChange={(o) => !o && setActing(null)}
            title={acting ? t(`community:directory.confirm.${acting}.title`, { name: p.name }) : ''}
            effect={acting ? t(`community:directory.confirm.${acting}.effect`) : ''}
            confirmLabel={acting ? t(`community:directory.${acting}`) : ''}
            destructive={acting === 'reject' || acting === 'suspend'}
            {...(acting && acting !== 'vet' ? { reasonLabel: t(`community:directory.confirm.${acting}.reason`) } : {})}
            onConfirm={async (note) => {
              if (!acting) return;
              try {
                await act.mutateAsync({ method: 'POST', path: `/ops/community/services/${p.id}/${acting}`, body: note ? { note } : {} });
                toast.success(t(`community:directory.done.${acting}`));
                setActing(null);
              } catch (e) {
                fail(e);
              }
            }}
          />
          <ConfirmDialog
            isOpen={!!dismissing}
            onOpenChange={(o) => !o && setDismissing(null)}
            title={t('community:directory.dismissReport')}
            effect={t('community:directory.dismissEffect')}
            confirmLabel={t('community:directory.dismissReport')}
            reasonLabel={t('community:office.decisionNote')}
            onConfirm={async (note) => {
              try {
                await act.mutateAsync({ method: 'POST', path: `/ops/community/services/${p.id}/reports/${dismissing}/dismiss`, body: { note } });
                toast.success(t('community:directory.dismissed'));
                setDismissing(null);
              } catch (e) {
                fail(e);
              }
            }}
          />
        </div>
      )}
    </Drawer>
  );
}

function AddProvider({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const { t } = useT();
  const toast = useToast();
  const empty = { name: '', category: '' as ProviderCategory | '', description: '', serves: '', phone: '', showContact: false, method: '' as '' | 'written' | 'verbal' | 'form' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<unknown>(null);
  const add = useApiMutation<ServiceProviderOffice>();
  const close = () => {
    setForm(empty);
    setError(null);
    onClose();
  };
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('community:directory.add')}
      size="lg"
      testId="provider-add-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={add.isPending}
            onPress={async () => {
              setError(null);
              try {
                const p = await add.mutateAsync({ method: 'POST', path: '/ops/community/services', body: { name: form.name, category: form.category, description: form.description, serves: form.serves, phone: form.phone, consent: { showContact: form.showContact, ...(form.method ? { method: form.method } : {}) } } });
                toast.success(t('community:directory.addedToast', { name: p.name }));
                close();
                onAdded(p.id);
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="provider-add-submit"
          >
            {t('community:directory.addSubmit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <PlainTextField label={t('community:directory.name')} value={form.name} onChange={(v) => set({ name: v })} testId="provider-name" />
        <SelectControl label={t('community:services.category')} value={form.category || null} onChange={(v) => set({ category: (v ?? '') as ProviderCategory })} options={PROVIDER_CATEGORIES.map((c) => ({ id: c, label: t(`community:category.${c}`) }))} testId="provider-category" />
        <PlainTextArea label={t('community:directory.description')} value={form.description} onChange={(v) => set({ description: v })} testId="provider-description" />
        <PlainTextField label={t('community:directory.serves')} description={t('community:directory.servesHint')} value={form.serves} onChange={(v) => set({ serves: v })} testId="provider-serves" />
        <fieldset className="space-y-3 rounded-tile border border-border p-3" data-testid="provider-consent">
          <legend className="px-1 text-sm font-semibold text-text">{t('community:directory.consentLegend')}</legend>
          <SelectControl label={t('community:directory.consentMethod')} value={form.method || null} onChange={(v) => set({ method: (v ?? '') as typeof form.method })} options={(['written', 'verbal', 'form'] as const).map((m) => ({ id: m, label: t(`community:consentMethod.${m}`) }))} testId="provider-consent-method" />
          <PlainCheckbox isSelected={form.showContact} onChange={(v) => set({ showContact: v })} testId="provider-show-contact">
            {t('community:directory.showContact')}
          </PlainCheckbox>
          <PlainTextField label={t('community:directory.phone')} value={form.phone} onChange={(v) => set({ phone: v })} optional={!form.showContact} inputMode="tel" type="tel" dir="ltr" testId="provider-phone" />
          <p className="text-xs text-muted">{t('community:directory.consentHint')}</p>
        </fieldset>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
