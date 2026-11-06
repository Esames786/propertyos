import { ApiError, type IssuingModel, type LeaseOptions, type LeaseView } from '@repo/contracts';
import { Button, ErrorState, InlineAlert, KeyValueList, PageHeader, Panel, PlainCheckbox, PlainTextField, SelectControl, Stepper, useApiMutation, useApiQuery, useNavigation, useQueryParam, useT, useToast } from '@repo/ui';
import { ArrowLeft, ArrowRight, Save, Send, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { DateInput, fieldErrorKey, SearchSelect, useFieldError, useProblemToast } from '../society/hr/hkit';
import { D33Note, ModelBadge, RentNav, WRAP } from './rkit';

/**
 * RNT-003 new lease wizard: unit, landlords (shares add up to 100 %), tenant, term and rent, deposit,
 * the payer effect and the owner's written authority, then a review. The issuing model comes from the
 * landlords' management agreements (never chosen freely). Saving creates a draft; activation is a
 * second person's step on Lease 360, once every agreement is signed and in force. The server checks
 * everything again (ownership, agreements, model, overlaps, duplicates, dates and the deposit cap).
 */
const STEPS = ['unit', 'landlords', 'tenant', 'term', 'deposit', 'payer', 'review'] as const;
type Step = (typeof STEPS)[number];
const STEP_OF: Record<string, Step> = { unitId: 'unit', landlords: 'landlords', model: 'landlords', tenantPartyId: 'tenant', from: 'term', to: 'term', rent: 'term', dueDay: 'term', deposit: 'deposit', 'authority.reference': 'payer', 'authority.date': 'payer', 'authority.confirmed': 'payer' };

export default function NewLeasePage() {
  const { t } = useT();
  const q = useApiQuery<LeaseOptions>({ method: 'GET', path: '/rentals/leases/options' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  return (
    <div className="@container space-y-5" data-testid="rent-new-lease">
      <PageHeader title={t('rentals:wizard.title')} description={t('rentals:wizard.intro')} breadcrumbs={[{ label: t('rentals:leases.title'), href: RENTALS.leases() }]} />
      <RentNav current="leases" />
      <Wizard o={q.data} />
    </div>
  );
}

function Wizard({ o }: { o: LeaseOptions }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const [unitParam] = useQueryParam('unit');
  const [step, setStep] = useState<Step>('unit');
  const [unitId, setUnitId] = useState<string | null>(o.units.some((u) => u.id === unitParam) ? unitParam : null);
  const unit = o.units.find((u) => u.id === unitId);
  const [shares, setShares] = useState<Record<string, string>>(() => Object.fromEntries((unit?.owners ?? []).map((x) => [x.ownerId, x.share])));
  const [tenant, setTenant] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rent, setRent] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [deposit, setDeposit] = useState('');
  const [reference, setReference] = useState('');
  const [authDate, setAuthDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const create = useApiMutation<LeaseView>();
  const submit = useApiMutation<LeaseView>();
  const fe = useFieldError(error);
  const index = STEPS.indexOf(step);
  const landlords = (unit?.owners ?? []).filter((x) => (shares[x.ownerId] ?? '').trim() !== '' && Number(shares[x.ownerId]) > 0);
  const models = new Set(landlords.map((x) => x.agreement?.model).filter((m): m is IssuingModel => !!m));
  const model: IssuingModel | null = models.size === 1 ? [...models][0]! : null;
  const total = landlords.reduce((s, x) => s + Math.round(Number(shares[x.ownerId]) * 100), 0);
  const missingAgreement = landlords.some((x) => !x.agreement);
  const tenantName = o.tenants.find((x) => x.partyId === tenant)?.name ?? '';
  const ready: Record<Step, boolean> = {
    unit: !!unit,
    landlords: landlords.length > 0 && total === 10000 && !missingAgreement && !!model,
    tenant: !!tenant,
    term: !!from && !!to && !!rent.trim(),
    deposit: deposit.trim() !== '',
    payer: true,
    review: true,
  };
  const pick = (id: string) => {
    setUnitId(id);
    setShares(Object.fromEntries((o.units.find((u) => u.id === id)?.owners ?? []).map((x) => [x.ownerId, x.share])));
  };
  const save = async (andSubmit: boolean) => {
    setError(null);
    const authority = reference.trim() || authDate || confirmed ? { reference, date: authDate, confirmed } : undefined;
    try {
      const lease = await create.mutateAsync({
        method: 'POST',
        path: '/rentals/leases',
        body: { unitId, landlords: landlords.map((x) => ({ ownerId: x.ownerId, share: shares[x.ownerId] })), tenantPartyId: tenant, model, from, to, rent, dueDay: Number(dueDay), deposit, ...(authority ? { authority } : {}) },
      });
      if (andSubmit) await submit.mutateAsync({ method: 'POST', path: `/rentals/leases/${lease.id}/submit` });
      toast.success(t(andSubmit ? 'rentals:wizard.submitted' : 'rentals:wizard.saved', { ref: lease.ref }));
      navigate(RENTALS.lease(lease.id));
    } catch (e) {
      setError(e);
      const field = e instanceof ApiError ? Object.keys(e.problem.errors ?? {}).find((f) => STEP_OF[f]) : undefined;
      if (field) setStep(STEP_OF[field]!);
      else problem(e);
    }
  };
  return (
    <div className="space-y-4">
      <Stepper
        label={t('rentals:wizard.progress')}
        testId="wizard-steps"
        steps={STEPS.map((s, i) => ({ id: s, label: t(`rentals:wizard.step.${s}`), state: i < index ? 'done' : i === index ? 'current' : 'upcoming' }))}
      />
      <Panel title={t(`rentals:wizard.step.${step}`)}>
        <div className="space-y-4" data-testid={`wizard-step-${step}`}>
          {step === 'unit' && (
            <>
              <SearchSelect
                label={t('rentals:wizard.unit')}
                value={unitId}
                onChange={pick}
                options={o.units.map((u) => ({ id: u.id, label: u.code, hint: `${u.siteName} · ${u.current ? t('rentals:wizard.unitLet', { ref: u.current.ref, date: fmt.date(u.current.to) }) : u.owners.map((x) => x.name).join(', ') || t('rentals:wizard.unitNoOwner')}` }))}
                testId="wizard-unit"
                description={t('rentals:wizard.unitHint')}
                errorText={fe('unitId')}
              />
              {unit?.current && (
                <InlineAlert tone="warning" data-testid="wizard-unit-let">
                  {t('rentals:wizard.unitLetWarning', { ref: unit.current.ref, date: fmt.date(unit.current.to) })}
                </InlineAlert>
              )}
            </>
          )}
          {step === 'landlords' && unit && (
            <>
              <p className="text-sm text-muted">{t('rentals:wizard.landlordsIntro')}</p>
              <ul className="space-y-3" data-testid="wizard-landlords">
                {unit.owners.map((x) => (
                  <li key={x.ownerId} className="space-y-2 rounded-tile border border-border/70 p-3" data-owner={x.ownerId}>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <bdi className="font-medium">{x.name}</bdi>
                      <span className="text-muted">{t('rentals:wizard.registered', { share: x.share })}</span>
                      {x.agreement ? <ModelBadge model={x.agreement.model} /> : null}
                    </p>
                    {!x.agreement && (
                      <p className="flex items-start gap-1.5 text-sm text-error">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {t('rentals:wizard.noAgreement')}
                      </p>
                    )}
                    {x.agreement && !(x.agreement.signed && x.agreement.inForce) && (
                      <p className="flex items-start gap-1.5 text-sm text-warning" data-testid="wizard-unsigned">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {t('rentals:wizard.unsigned', { ref: x.agreement.ref })}
                      </p>
                    )}
                    <div className="max-w-40">
                      <PlainTextField label={t('rentals:wizard.share')} value={shares[x.ownerId] ?? ''} onChange={(v) => setShares({ ...shares, [x.ownerId]: v })} inputMode="decimal" dir="ltr" optional testId={`wizard-share-${x.ownerId}`} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className={total === 10000 ? 'text-sm text-muted' : 'text-sm font-medium text-error'} data-testid="wizard-share-total" data-total={total}>
                {t('rentals:wizard.shareTotal', { total: (total / 100).toFixed(2) })}
              </p>
              {models.size > 1 && <InlineAlert tone="error">{t('rentals:wizard.mixedModels')}</InlineAlert>}
              {model && (
                <div className="space-y-1 text-sm" data-testid="wizard-model" data-model={model}>
                  <p>
                    {t('rentals:wizard.model')}: <ModelBadge model={model} />
                  </p>
                  <p className="text-muted">{t(`rentals:model.${model}Hint`)}</p>
                  <D33Note />
                </div>
              )}
              {fe('landlords') && <p className="text-sm font-medium text-error">{fe('landlords')}</p>}
              {fe('model') && <p className="text-sm font-medium text-error">{fe('model')}</p>}
            </>
          )}
          {step === 'tenant' && (
            <SearchSelect label={t('rentals:wizard.tenant')} value={tenant} onChange={setTenant} options={o.tenants.map((x) => ({ id: x.partyId, label: x.name, hint: x.ref }))} testId="wizard-tenant" description={t('rentals:wizard.tenantHint')} errorText={fe('tenantPartyId')} />
          )}
          {step === 'term' && (
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <DateInput id="wizard-from" label={t('rentals:wizard.from')} value={from} onChange={setFrom} testId="wizard-from" description={fe('from')} />
              <DateInput id="wizard-to" label={t('rentals:wizard.to')} value={to} onChange={setTo} min={from || undefined} testId="wizard-to" description={fe('to') ?? t('rentals:wizard.termHint')} />
              <PlainTextField label={t('rentals:wizard.rent')} value={rent} onChange={setRent} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'rent')} testId="wizard-rent" />
              <SelectControl label={t('rentals:wizard.dueDay')} value={dueDay} onChange={(v) => v && setDueDay(v)} options={Array.from({ length: 28 }, (_, i) => ({ id: String(i + 1), label: t('rentals:lease.dueDayValue', { day: i + 1 }) }))} testId="wizard-due-day" />
            </div>
          )}
          {step === 'deposit' && (
            <>
              <PlainTextField label={t('rentals:wizard.deposit')} value={deposit} onChange={setDeposit} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'deposit')} testId="wizard-deposit" description={t('rentals:wizard.depositHint')} />
              {fe('deposit') && <p className="text-sm font-medium text-error">{fe('deposit')}</p>}
              <p className="text-sm text-muted">{t(model === 'principal' ? 'rentals:wizard.depositOwner' : 'rentals:wizard.depositClient')}</p>
            </>
          )}
          {step === 'payer' && (
            <>
              <InlineAlert tone="info" title={t('rentals:wizard.payerTitle')} data-testid="wizard-payer">
                {t('rentals:wizard.payerBody', { tenant: tenantName, date: from ? fmt.date(from) : '—' })}
              </InlineAlert>
              <p className="text-sm text-muted">{t('rentals:wizard.duesSeparate')}</p>
              <h3 className="text-sm font-semibold">{t('rentals:authority.title')}</h3>
              <p className="text-sm text-muted">{t('rentals:authority.intro')}</p>
              <PlainTextField label={t('rentals:authority.reference')} value={reference} onChange={setReference} dir="ltr" optional errorKey={fieldErrorKey(error, 'authority.reference')} testId="wizard-authority-reference" />
              <DateInput id="wizard-authority-date" label={t('rentals:authority.date')} value={authDate} onChange={setAuthDate} max={o.today} testId="wizard-authority-date" description={fe('authority.date')} />
              <PlainCheckbox isSelected={confirmed} onChange={setConfirmed} testId="wizard-authority-confirm">
                {t('rentals:authority.confirm')}
              </PlainCheckbox>
              {fe('authority.confirmed') && <p className="text-xs font-medium text-error">{fe('authority.confirmed')}</p>}
              <p className="text-xs text-muted">{t('rentals:wizard.authorityLater')}</p>
            </>
          )}
          {step === 'review' && (
            <div data-testid="wizard-review">
              <KeyValueList
                items={[
                  { label: t('rentals:wizard.unit'), value: unit ? `${unit.code} · ${unit.siteName}` : '—' },
                  { label: t('rentals:wizard.step.landlords'), value: landlords.map((x) => `${x.name} ${shares[x.ownerId]}%`).join(' · ') || '—' },
                  { label: t('rentals:wizard.model'), value: model ? <ModelBadge model={model} /> : '—' },
                  { label: t('rentals:wizard.tenant'), value: tenantName || '—' },
                  { label: t('rentals:wizard.step.term'), value: from && to ? t('rentals:leases.term', { from: fmt.date(from), to: fmt.date(to) }) : '—' },
                  { label: t('rentals:wizard.rent'), value: rent ? fmt.money({ amount: rent.replace(/,/g, '') || '0', currency: 'PKR' }) : '—' },
                  { label: t('rentals:wizard.dueDay'), value: t('rentals:lease.dueDayValue', { day: Number(dueDay) }) },
                  { label: t('rentals:wizard.deposit'), value: deposit ? fmt.money({ amount: deposit.replace(/,/g, '') || '0', currency: 'PKR' }) : '—' },
                  { label: t('rentals:authority.title'), value: reference || t('rentals:wizard.authorityNone') },
                ]}
              />
              <p className="mt-3 text-sm text-muted">{t('rentals:wizard.reviewNote')}</p>
            </div>
          )}
        </div>
      </Panel>
      <div className="flex flex-wrap justify-between gap-2">
        <Button className={WRAP} variant="quiet" icon={ArrowLeft} isDisabled={index === 0} onPress={() => setStep(STEPS[index - 1]!)} data-testid="wizard-back">
          {t('rentals:wizard.back')}
        </Button>
        {step !== 'review' ? (
          <Button className={WRAP} variant="primary" icon={ArrowRight} isDisabled={!ready[step]} onPress={() => setStep(STEPS[index + 1]!)} data-testid="wizard-next">
            {t('rentals:wizard.next')}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button className={WRAP} icon={Save} isPending={create.isPending} onPress={() => void save(false)} data-testid="wizard-save">
              {t('rentals:wizard.save')}
            </Button>
            <Button className={WRAP} variant="primary" icon={Send} isPending={create.isPending || submit.isPending} onPress={() => void save(true)} data-testid="wizard-submit">
              {t('rentals:wizard.saveSubmit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
