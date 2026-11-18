import { ApiError, type UnitPriceChangeDraft, type UnitPriceChangeDraftList, type UnitPriceHistory, type UnitPricePickerResponse } from '@repo/contracts';
import { useSavedFocus } from './saved-focus';
import { isNotFound, useRecordAddress } from './record-address';
import { wrappable } from './amount';
import { Badge, Button, Drawer, EmptyState, ErrorState, Link, NotFoundState, PageHeader, SkeletonBlock, dynamicT, useApiMutation, useApiQuery, useCreateKey, useQueryParam, useQueryParams, useSession, useT } from '@repo/ui';
import type { AccessTarget, DenyReason } from '@repo/contracts';
import { FileClock, Pencil, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion, type CommittedDraftFloor } from './revision-sync';
import { useCrmFormat } from '../../crm/format';

/**
 * INV-007 is a genuine accessible side drawer, not a direct price-edit widget.
 * It saves private, non-effective drafts only. Unit prices and price history stay immutable.
 */
/** Proposing needs pricing.manage on top of the screen's unit.view (no role holds it today). */
const PROPOSE: AccessTarget = { module: 'inventory', permission: 'pricing.manage' };

/**
 * Wave 2 integration: the drawer's refusal, in the access outcome's words for the actual reason (role, plan,
 * site, suspension) and no draft data, decided like DevScreen does (the session's `decide`). A 403 from the
 * server (a grant withdrawn since the session was read) is a missing permission.
 */
function ProposeRefused({ reason }: { reason: DenyReason }) {
  const { t } = useT();
  const tr = dynamicT(t);
  return (
    <div className="space-y-1 rounded-control border border-border p-3 text-sm" data-testid="price-change-no-pricing-permission" data-reason={reason}>
      <p className="font-medium text-text">{tr(`errors:access.${reason}`)}</p>
      <p className="text-muted">{t('pricing:priceChangeAccess')}</p>
    </div>
  );
}

export default function EditPriceDrawerPage() {
  const { t } = useT();
  const money = useCrmFormat();
  const { decide } = useSession();
  const propose = decide(PROPOSE);
  // The router seam (ADR-0001 §2.3): pages read and write the address through @repo/ui, never react-router.
  const [unitId] = useQueryParam('record');
  const setParams = useQueryParams();
  const [search, setSearch] = useState('');
  // The open draft lives in the address too (`&draft=`): a deep link opens it in its unit's drawer, Back returns.
  const [draftId, openDraft] = useRecordAddress('draft', () => redraft());
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
    unitId && propose.allowed ? { method: 'GET', path: `/units/${encodeURIComponent(unitId)}/price-change-drafts` } : null,
  );
  const selectedDraft = useApiQuery<UnitPriceChangeDraft>(
    draftId ? { method: 'GET', path: `/price-change-drafts/${encodeURIComponent(draftId)}` } : null,
  );
  const saveMutation = useApiMutation<UnitPriceChangeDraft>();
  const savedFocus = useSavedFocus();
  // The shell re-renders this page while it checks a `?record=` unit, so the card that opened the drawer is a
  // new element by the time the drawer closes and the dialog cannot hand focus back to it: this page does.
  const returnFocusTo = useRef<string | null>(null);
  const closeDrawer = () => {
    returnFocusTo.current = unitId;
    openUnit(null);
  };
  useEffect(() => {
    const id = returnFocusTo.current;
    if (unitId || !id) return;
    returnFocusTo.current = null;
    const card = [...document.querySelectorAll<HTMLElement>('[data-testid="price-change-unit"]')].find((el) => el.dataset.unitId === id);
    // After the dialog has finished closing (its exit and its own focus restore come first).
    const timer = window.setTimeout(() => card?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [unitId]);
  const openUnit = (id: string | null) => {
    // One navigation: the unit, and no draft of another unit.
    setParams({ record: id, draft: null }, { replace: false });
    setCommittedFloor(null); setPrice(''); setReason(''); setInvalid(false); setSaved(false); setDirty(false);
    renewCreate(); renewRevision();
  };
  const edit = () => {
    setInvalid(false); setSaved(false); setDirty(true);
    if (draftId) renewRevision(); else renewCreate();
  };
  const chooseDraft = (id: string | null) => {
    setCommittedFloor(null); void openDraft(id); setInvalid(false); setSaved(false);
    setPrice(''); setReason(''); setDirty(false); renewCreate(); renewRevision();
  };
  // Back, Forward or a link changed the draft in the address: show that draft as stored (or a new proposal).
  const redraft = () => {
    setCommittedFloor(null); setInvalid(false); setSaved(false); setPrice(''); setReason(''); setDirty(false);
    saveMutation.reset(); renewCreate(); renewRevision();
  };
  // A draft named in the address that is not this person's, was never issued, or belongs to another unit:
  // one not-found, whatever the reason (the server answers the first two alike; the third is not this drawer's).
  const draftMismatch = !!draftId && selectedDraft.data?.id === draftId && selectedDraft.data.unitId !== unitId;
  const draftMissing = !!draftId && (isNotFound(selectedDraft.error) || draftMismatch);
  useEffect(() => {
    if (!canHydrateDraft(draftId, selectedDraft.data, dirty, committedFloor) || selectedDraft.data.unitId !== unitId) return;
    setCommittedFloor((previous) => pinDraftVersion(previous, selectedDraft.data!));
    const current = selectedDraft.data.versions.at(-1);
    if (!current) return;
    setPrice(current.proposedPrice.amount);
    setReason(current.reason);
    setInvalid(false);
  }, [selectedDraft.data, draftId, dirty, committedFloor, unitId]);

  const save = async () => {
    // Nothing changed since the acknowledged save: a repeat press sends nothing (it would only duplicate the
    // draft under a fresh key). Save stays enabled, so keyboard focus is never dropped from it.
    if (saveMutation.isPending || saved || (draftId && expectedDraftVersion(draftId, committedFloor) === undefined)) return;
    if (!unitId || !history.data || draftMissing || (draftId && selectedDraft.data?.id !== draftId)) return;
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
      setCommittedFloor({ id: result.id, version: result.currentVersion });
      // A new draft takes its place in the address (replacing the new proposal's entry).
      if (result.id !== draftId) void openDraft(result.id, { replace: true });
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
                    data-testid="price-change-unit" data-unit-id={unit.id}>
                    <strong><bdi dir="ltr">{unit.ref}</bdi></strong>
                    <span className="break-words text-sm text-muted">{unit.projectName}</span>
                    <span className="text-sm"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(money.moneyExact(unit.currentListedPrice))}</bdi></span>
                  </button>
                </li>)}
              </ul>}
      </section>
      <Drawer isOpen={isOpen} onOpenChange={(open) => { if (!open && !saveMutation.isPending) closeDrawer(); }}
        title={t('pricing:priceChangeTitle')} subtitle={history.data?.unit.ref}
        testId="edit-price-change-drawer" size="lg"
        footer={history.data && propose.allowed && !drafts.isError && !!drafts.data ? <>
          <Button className="max-w-full whitespace-normal" variant="secondary" isDisabled={saveMutation.isPending} onPress={closeDrawer}>{t('pricing:priceChangeClose')}</Button>
          <Button className="max-w-full whitespace-normal" variant="primary" isDisabled={!!draftId && (draftMissing || selectedDraft.isError || selectedDraft.isPending || selectedDraft.data?.id !== draftId)} isPending={saveMutation.isPending} onPress={() => void save()} data-testid="price-change-save">
            {draftId ? t('pricing:priceChangeRevise') : t('pricing:priceChangeSave')}
          </Button>
        </> : undefined}>
        <div className="space-y-5">
          {/* Above every read state: a refresh failing after the POST succeeded must not hide that it was saved. */}
          {saved && <p role="status" ref={savedFocus} tabIndex={-1} className="text-sm text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="price-change-saved">{t('pricing:priceChangeSaved')}</p>}
          {/* "Not in your scope" only when the server says not found (404); an outage keeps the generic title. */}
          {history.isError ? <ErrorState error={history.error} {...(history.error instanceof ApiError && history.error.problem.status === 404 ? { title: t('pricing:unknown') } : {})} onRetry={() => void history.refetch()} />
            : !history.data ? <SkeletonBlock lines={4} />
              : <>
                <div className="rounded-control border border-border bg-sunken p-3">
                  <p className="text-sm text-muted">{t('pricing:priceChangeCurrent')}</p>
                  <p className="font-semibold text-text"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(money.moneyExact(history.data.baseline.price))}</bdi></p>
                  <Badge tone="info">{t('pricing:priceChangeBaseline')}</Badge>
                  <Link href={`/backoffice/inv/unit-price-history?record=${encodeURIComponent(history.data.unit.id)}`}
                    variant="plain" className="mt-2 block text-sm text-primary">{t('pricing:priceChangeViewHistory')}</Link>
                  <Link href={`/backoffice/inv/unit-quick-view?record=${encodeURIComponent(history.data.unit.id)}`}
                    variant="plain" className="mt-2 block text-sm text-primary" data-testid="price-change-open-unit">{t('pricing:openUnit')}</Link>
                </div>
                {!propose.allowed ? <ProposeRefused reason={propose.reason} />
                  : drafts.isError ? (
                  drafts.error instanceof ApiError && drafts.error.problem.status === 403 ? <ProposeRefused reason="permission_missing" />
                    : <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />
                ) : !drafts.data ? <SkeletonBlock lines={2} /> : <>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-text">{t('pricing:priceChangeYourDrafts')}</h3>
                    <Button className="max-w-full whitespace-normal" variant="secondary" icon={Pencil} isDisabled={saveMutation.isPending} onPress={() => chooseDraft(null)}>
                      {t('pricing:priceChangeNew')}
                    </Button>
                    {drafts.data.items.length === 0 ? <EmptyState title={t('pricing:priceChangeNone')} /> :
                      <ul className="space-y-2" data-testid="price-change-drafts">
                        {drafts.data.items.map((record) => <li key={record.id}>
                          <button type="button" disabled={saveMutation.isPending} onClick={() => chooseDraft(record.id)}
                            aria-current={draftId === record.id ? 'true' : undefined}
                            className="min-h-11 w-full rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                            <span className="font-medium">{t('pricing:priceChangeVersion', { version: record.currentVersion })}</span>
                            <span className="ms-3 inline-block"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(money.moneyExact(record.proposedPrice))}</bdi></span>
                          </button>
                        </li>)}
                      </ul>}
                  </div>
                  {draftMissing ? <NotFoundState />
                    : draftId && selectedDraft.isError ? <ErrorState error={selectedDraft.error} onRetry={() => void selectedDraft.refetch()} />
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
                {draftId && !draftMissing && selectedDraft.data?.id === draftId && <section className="space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-text"><FileClock aria-hidden className="size-4" />{t('pricing:priceChangeHistory')}</h3>
                  <ol className="space-y-2" data-testid="price-change-versions">
                    {selectedDraft.data.versions.map((version) => <li key={version.version}
                      className="rounded-control border border-border p-3 text-sm text-text">
                      <strong>{t('pricing:priceChangeVersion', { version: version.version })}</strong>
                      <p><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(money.moneyExact(version.proposedPrice))}</bdi></p>
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
