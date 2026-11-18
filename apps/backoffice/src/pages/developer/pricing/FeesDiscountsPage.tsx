import { ApiError, type CommercialDiscountRule, type CommercialFeeRule, type CommercialRulesDraft, type CommercialRulesDraftList, type CommercialRulesPreview, type UnitPricePickerResponse } from '@repo/contracts';
import { useSavedFocus } from './saved-focus';
import { isNotFound, useRecordAddress } from './record-address';
import { deductionSign, wrappable } from './amount';
import { Badge, Button, EmptyState, ErrorState, NotFoundState, PageHeader, SkeletonBlock, useApiMutation, useApiQuery, useCreateKey, useT } from '@repo/ui';
import { Calculator, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion, type CommittedDraftFloor } from './revision-sync';
import { useCrmFormat } from '../../crm/format';
import { PricingRelatedLinks } from './PricingRelatedLinks';

type FeeDraft = { id: number; code: string; label: string; mode: 'fixed' | 'rate_bps'; amount: string; bps: string };
type DiscountDraft = { id: number; code: string; label: string; bps: string; cap: string };
const feeDefault = (id: number): FeeDraft => ({ id, code: `FEE_${id}`, label: 'Illustrative fee', mode: 'fixed', amount: '0.00', bps: '0' });
const discountDefault = (id: number): DiscountDraft => ({ id, code: `DISC_${id}`, label: 'Illustrative discount', bps: '0', cap: '0.00' });
const rate = (x: string): number | null =>
  /^\d{1,5}$/.test(x) && Number(x) <= 10000 ? Number(x) : null;
const validMoney = (x: string) => /^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(x) &&
  BigInt(x.split('.')[0]!) * 100n + BigInt((x.split('.')[1] ?? '').padEnd(2, '0') || '00') <= 10_000_000_000_000n;
const validCode = (x: string) => /^[A-Z][A-Z0-9_]{1,23}$/.test(x);
const validLabel = (x: string) => x.trim().replace(/\s+/g, ' ').length >= 3 && x.trim().length <= 80;
function canonicalDraft(fees: FeeDraft[], discounts: DiscountDraft[]) {
  if ((!fees.length && !discounts.length) || fees.length > 16 || discounts.length > 16) return null;
  const used = new Set<string>();
  const resultFees: CommercialFeeRule[] = [], resultDiscounts: CommercialDiscountRule[] = [];
  for (const fee of fees) {
    if (!validCode(fee.code) || used.has(fee.code) || !validLabel(fee.label)) return null;
    used.add(fee.code);
    if (fee.mode === 'fixed') {
      if (!validMoney(fee.amount)) return null;
      resultFees.push({ code: fee.code, label: fee.label.trim(), mode: 'fixed', amount: { amount: fee.amount, currency: 'PKR' } });
    } else {
      const bps = rate(fee.bps);
      if (bps === null) return null;
      resultFees.push({ code: fee.code, label: fee.label.trim(), mode: 'rate_bps', rateBps: bps });
    }
  }
  for (const discount of discounts) {
    const bps = rate(discount.bps);
    if (!validCode(discount.code) || used.has(discount.code) || !validLabel(discount.label) || bps === null || !validMoney(discount.cap)) return null;
    used.add(discount.code);
    resultDiscounts.push({ code: discount.code, label: discount.label.trim(), rateBps: bps, maxAmount: { amount: discount.cap, currency: 'PKR' } });
  }
  return { fees: resultFees, discounts: resultDiscounts };
}
const toDraftFees = (v: CommercialFeeRule[]): FeeDraft[] => v.map((r, i) => ({
  id: i + 1, code: r.code, label: r.label, mode: r.mode,
  amount: r.amount?.amount ?? '0.00', bps: String(r.rateBps ?? 0),
}));
const toDraftDiscounts = (v: CommercialDiscountRule[]): DiscountDraft[] => v.map((r, i) => ({
  id: i + 101, code: r.code, label: r.label, bps: String(r.rateBps), cap: r.maxAmount.amount,
}));

export default function FeesDiscountsPage() {
  const { t } = useT();
  const fmt = useCrmFormat();
  const [search, setSearch] = useState('');
  // The open draft lives in the address (`?record=`): a deep link opens it, Back and Forward move between drafts.
  const [selectedId, openRecord] = useRecordAddress('record', (id) => reopen(id));
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [fees, setFees] = useState<FeeDraft[]>([feeDefault(1)]);
  const [discounts, setDiscounts] = useState<DiscountDraft[]>([discountDefault(101)]);
  const [nextId, setNextId] = useState(200);
  const [unitId, setUnitId] = useState('');
  const [previewResult, setPreviewResult] = useState<CommercialRulesPreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [committedFloor, setCommittedFloor] = useState<CommittedDraftFloor | null>(null);
  const [createKey, renewCreate] = useCreateKey('commercial-create');
  const [reviseKey, renewRevise] = useCreateKey('commercial-revise');
  const projects = useApiQuery<{ items: Array<{ id: string; name: string }>; total: number }>({ method: 'GET', path: '/pricing/template-projects' });
  const list = useApiQuery<CommercialRulesDraftList>({ method: 'GET', path: '/pricing/commercial-rules', query: { q: search } });
  const detail = useApiQuery<CommercialRulesDraft>(selectedId ? { method: 'GET', path: `/pricing/commercial-rules/${encodeURIComponent(selectedId)}` } : null);
  const units = useApiQuery<UnitPricePickerResponse>({ method: 'GET', path: '/pricing/units', query: { project: projectId } });
  const mutation = useApiMutation<CommercialRulesDraft>();
  const savedFocus = useSavedFocus();
  const preview = useApiMutation<CommercialRulesPreview>();

  useEffect(() => {
    if (!canHydrateDraft(selectedId, detail.data, dirty, committedFloor)) return;
    setCommittedFloor((previous) => pinDraftVersion(previous, detail.data!));
    const latest = detail.data.versions.at(-1);
    if (!latest) return;
    setTitle(latest.title);
    setProjectId(detail.data.projectId);
    setFees(toDraftFees(latest.fees));
    setDiscounts(toDraftDiscounts(latest.discounts));
    setNextId(200);
    setPreviewResult(null);
    setInvalid(false);
    setDirty(false);
  }, [detail.data, selectedId, dirty, committedFloor]);

  const changed = () => {
    setPreviewResult(null); setInvalid(false); setSaved(false); setDirty(true);
    if (selectedId) renewRevise(); else renewCreate();
  };
  const blank = () => {
    setCommittedFloor(null); setProjectId(''); setTitle('');
    setFees([feeDefault(1)]); setDiscounts([discountDefault(101)]); setNextId(200); setUnitId('');
    renewCreate(); renewRevise(); setPreviewResult(null); setInvalid(false); setSaved(false); setDirty(false);
  };
  const reset = () => { void openRecord(null); blank(); };
  // Back, Forward or a link changed the draft in the address: show that draft as stored (or a blank form).
  const reopen = (id: string | null) => {
    if (!id) { blank(); return; }
    setCommittedFloor(null); setSaved(false); setInvalid(false); setPreviewResult(null); setDirty(false); mutation.reset(); renewRevise();
  };
  const save = async () => {
    // Nothing changed since the acknowledged save: a repeat press sends nothing (it would only duplicate the
    // draft under a fresh key). Save stays enabled, so keyboard focus is never dropped from it.
    if (mutation.isPending || saved || (selectedId && expectedDraftVersion(selectedId, committedFloor) === undefined)) return;
    const rules = canonicalDraft(fees, discounts), cleanTitle = title.trim().replace(/\s+/g, ' ');
    if (!rules || !projectId || !projects.data?.items.some((p) => p.id === projectId) ||
        cleanTitle.length < 3 || cleanTitle.length > 100) { setInvalid(true); return; }
    const key = selectedId ? reviseKey : createKey;
    const path = selectedId ? `/pricing/commercial-rules/${encodeURIComponent(selectedId)}/versions` : '/pricing/commercial-rules';
    const body = selectedId
      ? { expectedVersion: expectedDraftVersion(selectedId, committedFloor), title: cleanTitle, ...rules, idempotencyKey: key }
      : { projectId, title: cleanTitle, ...rules, idempotencyKey: key };
    setInvalid(false);
    try {
      const response = await mutation.mutateAsync({ method: 'POST', path, body, idempotencyKey: key });
      setCommittedFloor({ id: response.id, version: response.currentVersion });
      // A new draft takes its place in the address (replacing the blank form's entry).
      if (response.id !== selectedId) void openRecord(response.id, { replace: true });
      renewCreate(); renewRevise(); setSaved(true); setPreviewResult(null); setDirty(false);
      // The draft POST succeeded; cache refresh cannot turn that into a failed save.
      // useApiMutation also invalidates all API queries after success.
      void list.refetch();
      if (selectedId) void detail.refetch();
    } catch (e) {
      setSaved(false);
      // 409: the draft changed elsewhere (or its key was used). The cached copy is stale and a failed write
      // invalidates nothing, so fetch the latest now: reopening the draft then shows the version that won.
      if (e instanceof ApiError && e.problem.status === 409) { void list.refetch(); if (selectedId) void detail.refetch(); }
    }
  };
  const doPreview = async () => {
    if (dirty || !selectedId || !unitId || !detail.data || detail.data.id !== selectedId ||
      (committedFloor?.id === selectedId && detail.data.currentVersion < committedFloor.version)) return;
    try {
      const result = await preview.mutateAsync({ method: 'POST', path: '/pricing/commercial-preview', body: { draftId: selectedId, unitId } });
      setPreviewResult(result);
    } catch {
      setPreviewResult(null);
    }
  };
  const input = (label: string, value: string, onChange: (s: string) => void, mode: 'text' | 'decimal' | 'numeric' = 'text') => (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
      {label}
      <input type="text" inputMode={mode === 'text' ? 'text' : mode} value={value} onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
    </label>
  );

  return (
    <div className="space-y-6 @container" data-testid="fees-discounts-page">
      <PageHeader title={t('pricing:commercialTitle')} description={t('pricing:commercialIntro')} />
      <PricingRelatedLinks current="commercial" />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="commercial-no-posting">{t('pricing:commercialWarning')}</p>
      <div className="grid gap-5 @3xl:grid-cols-[minmax(16rem,1fr)_minmax(0,1.7fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-text">{t('pricing:commercialMyDrafts')}</h2>
            <Button className="max-w-full whitespace-normal" variant="secondary" icon={Plus} isDisabled={mutation.isPending} onPress={reset}>{t('pricing:commercialCreate')}</Button>
          </div>
          {input(t('pricing:commercialSearch'), search, setSearch)}
          {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data ? <SkeletonBlock lines={4} />
            : list.data.items.length === 0 ? <EmptyState title={t('pricing:commercialEmpty')} /> :
              <ul className="space-y-2" data-testid="commercial-draft-list">
                {list.data.items.map((item) => <li key={item.id}>
                  <button type="button" disabled={mutation.isPending} onClick={() => { setCommittedFloor(null); void openRecord(item.id); setSaved(false); setPreviewResult(null); setDirty(false); renewRevise(); }}
                    aria-current={selectedId === item.id ? 'true' : undefined}
                    className="min-h-11 w-full min-w-0 rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    <span className="block break-words font-semibold">{item.title}</span>
                    <span className="text-sm text-muted">{t('pricing:commercialVersion', { version: item.currentVersion })}</span>
                  </button>
                </li>)}
              </ul>}
        </section>
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-card border border-border bg-panel p-4" aria-label={selectedId ? t('pricing:commercialEdit') : t('pricing:commercialNew')}>
            <h2 className="font-semibold text-text">{selectedId ? t('pricing:commercialEdit') : t('pricing:commercialNew')}</h2>
            {projects.isError && <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />}
            {detail.isError && selectedId && (isNotFound(detail.error) ? <NotFoundState /> : <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />)}
            {projects.data?.items.length === 0 && <EmptyState title={t('pricing:commercialNoProject')} />}
            {!(selectedId && isNotFound(detail.error)) && <fieldset disabled={mutation.isPending || !projects.data || (!!selectedId && detail.data?.id !== selectedId)} className="min-w-0 space-y-4">
              <label className="flex min-w-0 flex-col gap-1 text-sm text-text">{t('pricing:commercialProject')}
                <select value={projectId} disabled={!!selectedId} onChange={(e) => { setProjectId(e.target.value); setUnitId(''); changed(); }}
                  className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text">
                  <option value="">{t('pricing:templateProjectPlaceholder')}</option>
                  {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {input(t('pricing:commercialName'), title, (s) => { setTitle(s); changed(); })}
              <h3 className="font-semibold text-text">{t('pricing:commercialFee')}</h3>
              {fees.map((fee) => <div key={fee.id} className="space-y-3 rounded-control border border-border bg-sunken p-3" data-testid="commercial-fee-row">
                <div className="grid gap-3 @lg:grid-cols-2">
                  {input(t('pricing:commercialCode'), fee.code, (s) => { setFees((old) => old.map((f) => f.id === fee.id ? { ...f, code: s } : f)); changed(); })}
                  {input(t('pricing:commercialLabel'), fee.label, (s) => { setFees((old) => old.map((f) => f.id === fee.id ? { ...f, label: s } : f)); changed(); })}
                  <label className="flex min-w-0 flex-col gap-1 text-sm text-text">{t('pricing:commercialMode')}
                    <select value={fee.mode} onChange={(e) => { setFees((old) => old.map((f) => f.id === fee.id ? { ...f, mode: e.target.value as FeeDraft['mode'] } : f)); changed(); }}
                      className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text">
                      <option value="fixed">{t('pricing:commercialFixed')}</option>
                      <option value="rate_bps">{t('pricing:commercialPercent')}</option>
                    </select>
                  </label>
                  {fee.mode === 'fixed' ? input(t('pricing:commercialAmount'), fee.amount, (s) => { setFees((old) => old.map((f) => f.id === fee.id ? { ...f, amount: s } : f)); changed(); }, 'decimal')
                    : input(t('pricing:commercialPercent'), fee.bps, (s) => { setFees((old) => old.map((f) => f.id === fee.id ? { ...f, bps: s } : f)); changed(); }, 'numeric')}
                </div>
                <Button className="max-w-full whitespace-normal" variant="secondary" icon={Trash2} onPress={() => { setFees((old) => old.filter((f) => f.id !== fee.id)); changed(); }}>{t('pricing:commercialRemove')}</Button>
              </div>)}
              <Button className="max-w-full whitespace-normal" variant="secondary" icon={Plus} isDisabled={fees.length >= 16} onPress={() => {
                setFees((old) => [...old, feeDefault(nextId)]); setNextId((n) => n + 1); changed();
              }}>{t('pricing:commercialAddFee')}</Button>
              <h3 className="font-semibold text-text">{t('pricing:commercialDiscount')}</h3>
              {discounts.map((discount) => <div key={discount.id} className="space-y-3 rounded-control border border-border bg-sunken p-3" data-testid="commercial-discount-row">
                <div className="grid gap-3 @lg:grid-cols-2">
                  {input(t('pricing:commercialCode'), discount.code, (s) => { setDiscounts((old) => old.map((d) => d.id === discount.id ? { ...d, code: s } : d)); changed(); })}
                  {input(t('pricing:commercialLabel'), discount.label, (s) => { setDiscounts((old) => old.map((d) => d.id === discount.id ? { ...d, label: s } : d)); changed(); })}
                  {input(t('pricing:commercialPercent'), discount.bps, (s) => { setDiscounts((old) => old.map((d) => d.id === discount.id ? { ...d, bps: s } : d)); changed(); }, 'numeric')}
                  {input(t('pricing:commercialCap'), discount.cap, (s) => { setDiscounts((old) => old.map((d) => d.id === discount.id ? { ...d, cap: s } : d)); changed(); }, 'decimal')}
                </div>
                <Button className="max-w-full whitespace-normal" variant="secondary" icon={Trash2} onPress={() => { setDiscounts((old) => old.filter((d) => d.id !== discount.id)); changed(); }}>{t('pricing:commercialRemove')}</Button>
              </div>)}
              <Button className="max-w-full whitespace-normal" variant="secondary" icon={Plus} isDisabled={discounts.length >= 16} onPress={() => {
                setDiscounts((old) => [...old, discountDefault(nextId)]); setNextId((n) => n + 1); changed();
              }}>{t('pricing:commercialAddDiscount')}</Button>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="max-w-full whitespace-normal" variant="primary" icon={Save} isPending={mutation.isPending} onPress={() => void save()} data-testid="commercial-save">
                  {selectedId ? t('pricing:commercialRevise') : t('pricing:commercialSave')}
                </Button>
                {saved && <span role="status" ref={savedFocus} tabIndex={-1} className="text-sm text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{t('pricing:commercialSaved')}</span>}
              </div>
              {invalid && <p role="alert" className="text-sm text-error">{t('pricing:commercialValidation')}</p>}
              {mutation.isError && <ErrorState error={mutation.error} title={t('pricing:commercialError')} />}
            </fieldset>}
            <p className="text-sm text-muted">{t('pricing:commercialHelp')}</p>
          </section>

          {selectedId && detail.data?.id === selectedId && <section className="space-y-3 rounded-card border border-border bg-panel p-4">
            <h3 className="font-semibold text-text">{t('pricing:commercialHistory')}</h3>
            <Badge tone="warning">{t('pricing:commercialWarning')}</Badge>
            <ol className="space-y-2" data-testid="commercial-revisions">{detail.data.versions.map((v) => <li key={v.version}
              className="rounded-control border border-border p-3 text-sm text-text">
              <strong>{t('pricing:commercialVersion', { version: v.version })}</strong>
              <p className="break-words">{v.title}</p>
              <p className="text-muted">{v.fees.length} {t('pricing:commercialFee')}, {v.discounts.length} {t('pricing:commercialDiscount')}</p>
            </li>)}</ol>
          </section>}

          {selectedId && detail.data?.id === selectedId && <section className="space-y-4 rounded-card border border-border bg-panel p-4">
            <h3 className="flex items-center gap-2 font-semibold text-text"><Calculator aria-hidden className="size-4" />{t('pricing:commercialPreview')}</h3>
            <p className="text-sm text-muted">{t('pricing:commercialPreviewOnly')}</p>
            {dirty && <p role="status" className="text-sm text-muted" data-testid="commercial-save-first">{t('pricing:commercialUnsaved')}</p>}
            <label className="flex min-w-0 flex-col gap-1 text-sm text-text">{t('pricing:commercialUnit')}
              <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setPreviewResult(null); }}
                disabled={preview.isPending}
                className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text">
                <option value="">{t('pricing:commercialSelectUnit')}</option>
                {units.data?.items.filter((u) => u.projectId === projectId).map((u) => <option key={u.id} value={u.id}>{u.ref}</option>)}
              </select>
            </label>
            {units.isError && <ErrorState error={units.error} onRetry={() => void units.refetch()} />}
            {units.data?.items.filter((u) => u.projectId === projectId).length === 0 && <p className="text-sm text-muted">{t('pricing:commercialNoUnit')}</p>}
            <Button className="max-w-full whitespace-normal" variant="primary" icon={Calculator} isDisabled={!unitId || dirty || (committedFloor?.id === selectedId && (detail.data?.currentVersion ?? 0) < committedFloor.version) || preview.isPending} isPending={preview.isPending} onPress={() => void doPreview()}
              data-testid="commercial-compute">{t('pricing:commercialCompute')}</Button>
            {preview.isError && <ErrorState error={preview.error} title={t('pricing:commercialPreviewError')} />}
            {previewResult && <div className="space-y-3" data-testid="commercial-preview-result">
              <dl className="grid gap-3 @lg:grid-cols-2">
                {([
                  [t('pricing:commercialListed'), previewResult.listedPrice],
                  [t('pricing:commercialTotalFee'), previewResult.totalFees],
                  [t('pricing:commercialTotalDiscount'), previewResult.totalDiscounts, true],
                  [t('pricing:commercialPayable'), previewResult.illustrativePayable],
                ] as const).map(([label, amount, deduction]) => <div key={label} className="rounded-control bg-sunken p-3" {...(deduction ? { 'data-testid': 'commercial-total-deduction' } : {})}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-semibold text-text"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{deduction ? deductionSign(amount) : ''}{wrappable(fmt.moneyExact(amount))}</bdi></dd>
                </div>)}
              </dl>
              <h4 className="font-semibold text-text">{t('pricing:commercialLines')}</h4>
              <ul className="divide-y divide-border">{previewResult.lines.map((line) =>
                <li key={line.code} className="flex min-w-0 flex-wrap justify-between gap-3 py-3 text-sm" data-testid="commercial-preview-line" data-kind={line.kind}>
                  {/* A discount says so in words (visible, so also read by screen readers) and carries a minus sign. */}
                  <span className="min-w-0 break-words text-text">{line.label} ({line.code}){line.kind === 'discount' && <> <Badge tone="info">{t('pricing:commercialDeduction')}</Badge></>}</span>
                  <strong className="text-text"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{line.kind === 'discount' ? deductionSign(line.amount) : ''}{wrappable(fmt.moneyExact(line.amount))}</bdi></strong>
                </li>)}</ul>
            </div>}
          </section>}
        </div>
      </div>
    </div>
  );
}
