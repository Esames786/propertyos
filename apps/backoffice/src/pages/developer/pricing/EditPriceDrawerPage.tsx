import { ApiError, type UnitPriceChangeDraft, type UnitPriceChangeDraftList, type UnitPriceHistory, type UnitPricePickerResponse } from '@repo/contracts';
import { Badge, Button, Drawer, EmptyState, ErrorState, Link, PageHeader, SkeletonBlock, useApiMutation, useApiQuery, useCreateKey, useQueryParam, useT } from '@repo/ui';
import { FileClock, Pencil, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion, type CommittedDraftFloor } from './revision-sync';
import { useCrmFormat } from '../../crm/format';

/**
 * INV-007 is a genuine accessible side drawer, not a direct price-edit widget.
 * It saves private, non-effective drafts only. Unit prices and price history stay immutable.
 */
export default function EditPriceDrawerPage() {
  const { t } = useT();
  const money = useCrmFormat();
  // The router seam (ADR-0001 §2.3): pages read and write the address through @repo/ui, never react-router.
  const [unitId, setRecord] = useQueryParam('record');
  const [search, setSearch] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  // Protect an in-progress edit from stale React Query refreshes and invalidations.
  const [dirty, setDirty] = useState(false);
  const [committedFloor, setCommittedFloor] = useState<CommittedDraftFloor | null>(null);
  const [createKey, renewCreate] = useCreateKey('unit-price-change');
  const [revisionKey, renewRevision] = useCreateKey('unit-price-revise');
  const isOpen = !!unitId;
  const units = useApiQuery<UnitPricePickerResponse>({ method: 'GET', path: '/pricing/units', query: { q: search.trim() } });
  const history = useApiQuery<UnitPriceHistory>(
    unitId ? { method: 'GET', path: `/units/${encodeURIComponent(unitId)}/prices` } : null,
  );
  const drafts = useApiQuery<UnitPriceChangeDraftList>(
    unitId ? { method: 'GET', path: `/units/${encodeURIComponent(unitId)}/price-change-drafts` } : null,
  );
  const selectedDraft = useApiQuery<UnitPriceChangeDraft>(
    draftId ? { method: 'GET', path: `/price-change-drafts/${encodeURIComponent(draftId)}` } : null,
  );
  const saveMutation = useApiMutation<UnitPriceChangeDraft>();
  const openUnit = (id: string | null) => {
    setRecord(id, { replace: false });
    setDraftId(null); setCommittedFloor(null); setPrice(''); setReason(''); setInvalid(false); setSaved(false); setDirty(false);
    renewCreate(); renewRevision();
  };
  const edit = () => {
    setInvalid(false); setSaved(false); setDirty(true);
    if (draftId) renewRevision(); else renewCreate();
  };
  const chooseDraft = (id: string | null) => {
    setCommittedFloor(null); setDraftId(id); setInvalid(false); setSaved(false);
    setPrice(''); setReason(''); setDirty(false); renewCreate(); renewRevision();
  };
  useEffect(() => {
    if (!canHydrateDraft(draftId, selectedDraft.data, dirty, committedFloor)) return;
    setCommittedFloor((previous) => pinDraftVersion(previous, selectedDraft.data!));
    const current = selectedDraft.data.versions.at(-1);
    if (!current) return;
    setPrice(current.proposedPrice.amount);
    setReason(current.reason);
    setInvalid(false);
  }, [selectedDraft.data, draftId, dirty, committedFloor]);

  const save = async () => {
    if (saveMutation.isPending || (draftId && expectedDraftVersion(draftId, committedFloor) === undefined)) return;
    if (!unitId || !history.data || (draftId && selectedDraft.data?.id !== draftId)) return;
    const normalizedReason = reason.trim().replace(/\s+/g, ' ');
    const proposed = price.trim();
    if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(proposed) ||
      normalizedReason.length < 10 || normalizedReason.length > 500 ||
      BigInt(proposed.split('.')[0]!) * 100n + BigInt((proposed.split('.')[1] ?? '').padEnd(2, '0') || '00') > 10_000_000_000_000n ||
      (BigInt(proposed.split('.')[0]!) * 100n + BigInt((proposed.split('.')[1] ?? '').padEnd(2, '0') || '00')) ===
      (BigInt(history.data.baseline.price.amount.split('.')[0]!) * 100n +
        BigInt((history.data.baseline.price.amount.split('.')[1] ?? '').padEnd(2, '0') || '00'))) {
      setInvalid(true); return;
    }
    setInvalid(false);
    const key = draftId ? revisionKey : createKey;
    const path = draftId ? `/price-change-drafts/${encodeURIComponent(draftId)}/versions`
      : `/units/${encodeURIComponent(unitId)}/price-change-drafts`;
    const body = draftId
      ? { expectedVersion: expectedDraftVersion(draftId, committedFloor), proposedPrice: { amount: proposed, currency: 'PKR' }, reason: normalizedReason, idempotencyKey: key }
      : { proposedPrice: { amount: proposed, currency: 'PKR' }, reason: normalizedReason, idempotencyKey: key };
    try {
      const result = await saveMutation.mutateAsync({ method: 'POST', path, body, idempotencyKey: key });
      setCommittedFloor({ id: result.id, version: result.currentVersion }); setDraftId(result.id);
      renewCreate(); renewRevision();
      setSaved(true);
      setDirty(false);
      // Success is determined only by the draft POST, not by a subsequent GET.
      // A GET failure must not encourage the user to send a new-key duplicate.
      void drafts.refetch();
      if (draftId) void selectedDraft.refetch();
      void history.refetch(); // Still read-only: never applies the proposed price.
    } catch (e) {
      setSaved(false);
      // 409: the draft changed elsewhere (or its key was used). The cached copy is stale and a failed write
      // invalidates nothing, so fetch the latest now: reopening the draft then shows the version that won.
      if (e instanceof ApiError && e.problem.status === 409) { void drafts.refetch(); if (draftId) void selectedDraft.refetch(); }
    }
  };
  return (
    <div className="space-y-6 @container" data-testid="edit-price-drawer-page">
      <PageHeader title={t('pricing:priceChangeTitle')} description={t('pricing:priceChangeIntro')} />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="price-change-no-apply">{t('pricing:priceChangeWarning')}</p>
      <section className="space-y-4 rounded-card border border-border bg-panel p-4" aria-label={t('pricing:priceChangeSearch')}>
        <label className="flex flex-col gap-1 text-sm text-text">
          {t('pricing:priceChangeSearch')}
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-3 size-4 text-muted" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="price-change-unit-search"
              className="min-h-11 w-full rounded-control border border-border-control bg-panel pe-3 ps-10 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
          </span>
        </label>
        {units.isError ? <ErrorState error={units.error} onRetry={() => void units.refetch()} />
          : !units.data ? <SkeletonBlock lines={4} />
            : units.data.items.length === 0 ? <EmptyState title={t('pricing:noneFound')} />
              : <ul className="grid gap-2 @md:grid-cols-2 @3xl:grid-cols-3" data-testid="price-change-unit-list">
                {units.data.items.map((unit) => <li key={unit.id} className="min-w-0">
                  <button type="button" onClick={() => openUnit(unit.id)}
                    className="flex min-h-11 w-full min-w-0 flex-col gap-1 rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    data-testid="price-change-unit">
                    <strong><bdi dir="ltr">{unit.ref}</bdi></strong>
                    <span className="break-words text-sm text-muted">{unit.projectName}</span>
                    <span className="text-sm"><bdi dir="ltr">{money.moneyExact(unit.currentListedPrice)}</bdi></span>
                  </button>
                </li>)}
              </ul>}
      </section>
      <Drawer isOpen={isOpen} onOpenChange={(open) => { if (!open && !saveMutation.isPending) openUnit(null); }}
        title={t('pricing:priceChangeTitle')} subtitle={history.data?.unit.ref}
        testId="edit-price-change-drawer" size="lg"
        footer={history.data && !drafts.isError && !!drafts.data ? <>
          <Button variant="secondary" isDisabled={saveMutation.isPending} onPress={() => openUnit(null)}>{t('pricing:priceChangeClose')}</Button>
          {/* `saved`: nothing changed since the acknowledged save; sending it again would only duplicate it under a fresh key. */}
          <Button variant="primary" isDisabled={saved || (!!draftId && (selectedDraft.isError || selectedDraft.isPending || selectedDraft.data?.id !== draftId))} isPending={saveMutation.isPending} onPress={() => void save()} data-testid="price-change-save">
            {draftId ? t('pricing:priceChangeRevise') : t('pricing:priceChangeSave')}
          </Button>
        </> : undefined}>
        <div className="space-y-5">
          {/* Above every read state: a refresh failing after the POST succeeded must not hide that it was saved. */}
          {saved && <p role="status" className="text-sm text-success" data-testid="price-change-saved">{t('pricing:priceChangeSaved')}</p>}
          {history.isError ? <ErrorState error={history.error} title={t('pricing:unknown')} onRetry={() => void history.refetch()} />
            : !history.data ? <SkeletonBlock lines={4} />
              : <>
                <div className="rounded-control border border-border bg-sunken p-3">
                  <p className="text-sm text-muted">{t('pricing:priceChangeCurrent')}</p>
                  <p className="font-semibold text-text"><bdi dir="ltr">{money.moneyExact(history.data.baseline.price)}</bdi></p>
                  <Badge tone="info">{t('pricing:priceChangeBaseline')}</Badge>
                  <Link href={`/backoffice/inv/unit-price-history?record=${encodeURIComponent(history.data.unit.id)}`}
                    variant="plain" className="mt-2 block text-sm text-primary">{t('pricing:priceChangeViewHistory')}</Link>
                </div>
                {drafts.isError ? (
                  drafts.error instanceof ApiError && drafts.error.problem.status === 403 ? (
                    <p className="rounded-control border border-border p-3 text-sm text-muted" data-testid="price-change-no-pricing-permission">{t('pricing:priceChangeAccess')}</p>
                  ) : <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />
                ) : !drafts.data ? <SkeletonBlock lines={2} /> : <>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-text">{t('pricing:priceChangeYourDrafts')}</h3>
                    <Button variant="secondary" icon={Pencil} isDisabled={saveMutation.isPending} onPress={() => chooseDraft(null)}>
                      {t('pricing:priceChangeNew')}
                    </Button>
                    {drafts.data.items.length === 0 ? <EmptyState title={t('pricing:priceChangeNone')} /> :
                      <ul className="space-y-2" data-testid="price-change-drafts">
                        {drafts.data.items.map((record) => <li key={record.id}>
                          <button type="button" disabled={saveMutation.isPending} onClick={() => chooseDraft(record.id)}
                            aria-current={draftId === record.id ? 'true' : undefined}
                            className="min-h-11 w-full rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                            <span className="font-medium">{t('pricing:priceChangeVersion', { version: record.currentVersion })}</span>
                            <span className="ms-3"><bdi dir="ltr">{money.moneyExact(record.proposedPrice)}</bdi></span>
                          </button>
                        </li>)}
                      </ul>}
                  </div>
                  {draftId && selectedDraft.isError ? <ErrorState error={selectedDraft.error} onRetry={() => void selectedDraft.refetch()} />
                    : draftId && selectedDraft.data?.id !== draftId ? <SkeletonBlock lines={3} /> :
                    <fieldset disabled={saveMutation.isPending} className="space-y-4">
                      <label className="flex flex-col gap-1 text-sm font-medium text-text">
                        {t('pricing:priceChangeProposed')}
                        <input type="text" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); edit(); }}
                          data-testid="price-change-proposed"
                          className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-text">
                        {t('pricing:priceChangeReason')}
                        <textarea rows={4} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); edit(); }}
                          data-testid="price-change-reason"
                          className="w-full min-w-0 rounded-control border border-border-control bg-panel px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
                      </label>
                      {invalid && <p role="alert" className="text-sm text-error">{t('pricing:priceChangeValidation')}</p>}
                      {saveMutation.isError && <ErrorState error={saveMutation.error} title={t('pricing:priceChangeError')} />}
                    </fieldset>}
                </>}
                {draftId && selectedDraft.data?.id === draftId && <section className="space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-text"><FileClock aria-hidden className="size-4" />{t('pricing:priceChangeHistory')}</h3>
                  <ol className="space-y-2" data-testid="price-change-versions">
                    {selectedDraft.data.versions.map((version) => <li key={version.version}
                      className="rounded-control border border-border p-3 text-sm text-text">
                      <strong>{t('pricing:priceChangeVersion', { version: version.version })}</strong>
                      <p><bdi dir="ltr">{money.moneyExact(version.proposedPrice)}</bdi></p>
                      <p className="whitespace-pre-wrap break-words text-muted">{version.reason}</p>
                    </li>)}
                  </ol>
                </section>}
                <p className="text-sm text-muted">{t('pricing:priceChangeNeverApproved')}</p>
              </>}
        </div>
      </Drawer>
    </div>
  );
}
