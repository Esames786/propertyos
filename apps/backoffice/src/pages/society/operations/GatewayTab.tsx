import type { GatewayEventResult, GatewaySettings } from '@repo/contracts';
import { Badge, Button, ErrorState, InlineAlert, Panel, PlainCheckbox, PlainTextField, SegmentedControl, useApiMutation, useApiQuery, useT, useToast, type StatusTone } from '@repo/ui';
import { BadgeCheck, CircleSlash, FlaskConical, Send, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AmountInput, FlatSelect, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { When } from './okit';

/**
 * BILL-011 online payments, sandbox only (Gate D.2). The society's gateway settings and simulated
 * "payment succeeded" events: only a verified signature is accepted, and even then nothing is paid,
 * because settlement still needs a matched bank statement line (C.2 ruling). No real card, wallet or
 * bank details are ever asked for.
 */
const METHODS = ['card', 'wallet', 'bank_account'] as const;
const RESULT_TONE: Record<GatewayEventResult, StatusTone> = { accepted_not_settled: 'info', refused_signature: 'error', refused_duplicate: 'warning', refused_mode_off: 'neutral' };

export function GatewayTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const q = useApiQuery<GatewaySettings>({ method: 'GET', path: '/ops/gateway' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const g = q.data;
  return (
    <div className="grid gap-5 @5xl:grid-cols-[3fr_2fr]" data-testid="gateway-tab" data-mode={g.mode}>
      <div className="min-w-0 space-y-5">
        <InlineAlert tone="info" title={t('operations:gateway.sandboxTitle')}>
          {t('operations:gateway.sandboxBody')}
        </InlineAlert>
        <SettingsPanel key={g.updatedAt ?? 'seed'} g={g} />
        <EventsPanel g={g} />
      </div>
      {g.canManage && (
        <div className="min-w-0">
          <TestEventPanel siteId={siteId} />
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ g }: { g: GatewaySettings }) {
  const { t } = useT();
  const toast = useToast();
  const save = useApiMutation<GatewaySettings>();
  const [mode, setMode] = useState(g.mode);
  const [merchant, setMerchant] = useState(g.merchantId);
  const [methods, setMethods] = useState<GatewaySettings['methods']>(g.methods);
  const [fee, setFee] = useState(g.feeBearer);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ method: 'PATCH', path: '/ops/gateway', body: { mode, merchantId: merchant, methods, feeBearer: fee } });
      toast.success(t('operations:gateway.saved'));
    } catch (e) {
      setError(e);
    }
  };
  const updated = g.updatedAt && g.updatedByName ? (
    <span>
      {t('operations:gateway.updated', { name: g.updatedByName })} · <When at={g.updatedAt} />
    </span>
  ) : null;
  if (!g.canManage)
    return (
      <Panel title={t('operations:gateway.settingsTitle')} description={updated ?? t('operations:gateway.readOnly')}>
        <dl className="grid gap-x-6 gap-y-3 text-sm @2xl:grid-cols-2" data-testid="gateway-settings">
          <Fact label={t('operations:gateway.provider')} value={<bdi>{g.provider}</bdi>} />
          <Fact label={t('operations:gateway.mode')} value={<Badge tone={g.mode === 'sandbox' ? 'info' : 'neutral'}>{t(`operations:gateway.modes.${g.mode}`)}</Badge>} />
          <Fact label={t('operations:gateway.merchantId')} value={<bdi dir="ltr" className="ltr-ref">{g.merchantId}</bdi>} />
          <Fact label={t('operations:gateway.methods')} value={g.methods.map((m) => t(`operations:gateway.method.${m}`)).join(' · ') || '—'} />
          <Fact label={t('operations:gateway.feeBearer')} value={t(`operations:gateway.fee.${g.feeBearer}`)} />
        </dl>
      </Panel>
    );
  return (
    <Panel title={t('operations:gateway.settingsTitle')} description={updated ?? <bdi>{g.provider}</bdi>}>
      <div className="space-y-4" data-testid="gateway-settings">
        <Labelled label={t('operations:gateway.mode')}>
          <SegmentedControl
            label={t('operations:gateway.mode')}
            value={mode}
            onChange={setMode}
            options={(['off', 'sandbox'] as const).map((m) => ({ id: m, label: t(`operations:gateway.modes.${m}`) }))}
            testId="gateway-mode"
          />
        </Labelled>
        <PlainTextField label={t('operations:gateway.merchantId')} description={t('operations:gateway.merchantHint')} value={merchant} onChange={setMerchant} testId="gateway-merchant" />
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium text-text">{t('operations:gateway.methods')}</legend>
          {METHODS.map((m) => (
            <PlainCheckbox key={m} isSelected={methods.includes(m)} onChange={(on) => setMethods(on ? [...methods, m] : methods.filter((x) => x !== m))} testId={`gateway-method-${m}`}>
              {t(`operations:gateway.method.${m}`)}
            </PlainCheckbox>
          ))}
        </fieldset>
        <Labelled label={t('operations:gateway.feeBearer')}>
          <SegmentedControl
            label={t('operations:gateway.feeBearer')}
            value={fee}
            onChange={setFee}
            options={(['society', 'resident'] as const).map((f) => ({ id: f, label: t(`operations:gateway.fee.${f}`) }))}
            testId="gateway-fee"
          />
        </Labelled>
        {error ? <ProblemAlert error={error} /> : null}
        <div>
          <Button isPending={save.isPending} onPress={() => void submit()} data-testid="gateway-save">
            {t('operations:gateway.save')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** A visible caption over a segmented control (the control carries the same name for screen readers). */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p aria-hidden className="text-sm font-medium text-text">
        {label}
      </p>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{value}</dd>
    </div>
  );
}

function EventsPanel({ g }: { g: GatewaySettings }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <Panel title={t('operations:gateway.eventsTitle')} description={t('operations:gateway.notPaid')}>
      {g.events.length === 0 ? (
        <p className="text-sm text-muted" data-testid="gateway-events-empty">
          {t('operations:gateway.eventsEmpty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-tile border border-border" data-testid="gateway-events">
          {g.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3" data-testid="gateway-event" data-result={e.result}>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold text-text">
                  <bdi dir="ltr" className="ltr-ref">{e.flatCode}</bdi> · {fmt.money(e.amount)}
                </span>
                <span className="block text-xs text-muted [overflow-wrap:anywhere]">
                  <bdi dir="ltr" className="ltr-ref">{e.eventId}</bdi> · <bdi>{e.byName}</bdi> · <When at={e.at} />
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {e.signature === 'valid' ? <BadgeCheck aria-hidden className="size-3.5 text-success" /> : <ShieldAlert aria-hidden className="size-3.5 text-error" />}
                  {t(`operations:gateway.signature.${e.signature}`)}
                </span>
              </span>
              <Badge tone={RESULT_TONE[e.result]} icon={e.result === 'accepted_not_settled' ? FlaskConical : CircleSlash}>
                {t(`operations:gateway.result.${e.result}`)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TestEventPanel({ siteId }: { siteId: string }) {
  const { t } = useT();
  const toast = useToast();
  const send = useApiMutation<GatewaySettings>();
  const [flatId, setFlatId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [signature, setSignature] = useState<'valid' | 'invalid'>('valid');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setError(null);
    try {
      const g = await send.mutateAsync({ method: 'POST', path: '/ops/gateway/test-event', body: { flatId, amount, signature, ...(eventId.trim() ? { eventId: eventId.trim() } : {}) } });
      const latest = g.events[0];
      if (latest) toast.success(t('operations:gateway.sent', { result: t(`operations:gateway.result.${latest.result}`) }));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Panel title={t('operations:gateway.testTitle')} description={t('operations:gateway.testBody')}>
      <div className="space-y-4" data-testid="gateway-test">
        <FlatSelect siteId={siteId} value={flatId} onChange={setFlatId} label={t('operations:gateway.flat')} testId="gateway-test-flat" />
        <AmountInput label={t('operations:gateway.amount')} value={amount} onChange={setAmount} testId="gateway-test-amount" />
        <Labelled label={t('operations:gateway.signatureLabel')}>
          <SegmentedControl
            label={t('operations:gateway.signatureLabel')}
            value={signature}
            onChange={setSignature}
            options={(['valid', 'invalid'] as const).map((s) => ({ id: s, label: t(`operations:gateway.sig.${s}`) }))}
            testId="gateway-test-signature"
          />
        </Labelled>
        <PlainTextField label={t('operations:gateway.eventId')} description={t('operations:gateway.eventIdHint')} value={eventId} onChange={setEventId} testId="gateway-test-event-id" />
        {error ? <ProblemAlert error={error} /> : null}
        <div>
          <Button variant="secondary" icon={Send} isPending={send.isPending} isDisabled={!flatId || !amount.trim()} onPress={() => void submit()} data-testid="gateway-test-send">
            {t('operations:gateway.send')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
