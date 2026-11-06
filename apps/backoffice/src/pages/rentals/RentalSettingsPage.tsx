import type { AgreementView, IssuingModel, RentalSettings } from '@repo/contracts';
import { Button, Dialog, Drawer, EmptyState, ErrorState, InlineAlert, Link, PageHeader, Panel, PlainCheckbox, PlainTextArea, PlainTextField, SelectControl, UrlTabs, isKeyReused, useApiMutation, useApiQuery, useCreateKey, useT, useToast } from '@repo/ui';
import { BadgeCheck, FilePen, Info } from 'lucide-react';
import { useState } from 'react';
import { ACCESS_DATE, RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { DateInput, fieldErrorKey, unbroken, useFieldError, useProblemToast } from '../society/hr/hkit';
import { AccountText, D33Note, ModelBadge, RentNav, VersionBadge, WRAP } from './rkit';

/**
 * RNT-007 rental settings. Each owner's management agreement is versioned: the issuing model (agent or
 * principal, a fictional alternative until D-33), the signed agreement on file, the authority to
 * collect on the owner's behalf, the fee and the deposit rules. A new version is drafted by one person
 * and approved by another, takes effect from today or later, and never rewrites a lease, rent roll or
 * statement already bound to an earlier version. Without a signed agreement nothing is collected on
 * the owner's behalf. Notice templates are read-only fictional samples.
 */
const TABS = ['agreements', 'fees', 'deposits', 'templates'] as const;

export default function RentalSettingsPage() {
  const { t } = useT();
  const q = useApiQuery<RentalSettings>({ method: 'GET', path: '/rentals/settings' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const s = q.data;
  return (
    <div className="@container space-y-5" data-testid="rent-settings">
      <PageHeader title={t('rentals:settings.title')} description={t('rentals:settings.intro')} />
      <RentNav current="settings" />
      <D33Note />
      <UrlTabs label={t('rentals:settings.tabsLabel')} items={TABS.map((x) => ({ id: x, label: t(`rentals:settings.tab.${x}`) }))} defaultId="agreements">
        {(tab) => (
          <div className="space-y-4 pt-3" data-testid={`settings-tab-${tab}`}>
            {tab === 'agreements' && (s.agreements.length === 0 ? <EmptyState title={t('rentals:settings.none')} /> : s.agreements.map((a) => <Agreement key={a.id} a={a} />))}
            {tab === 'fees' &&
              (s.feesLicensed ? (
                <Panel title={t('rentals:settings.feesTitle')} description={t('rentals:settings.feesHint')}>
                  <Rules agreements={s.agreements} kind="fees" />
                </Panel>
              ) : (
                <InlineAlert tone="info" data-testid="settings-fees-not-licensed">
                  {t('rentals:settings.feesNotLicensed')}
                </InlineAlert>
              ))}
            {tab === 'deposits' && (
              <Panel title={t('rentals:settings.depositsTitle')} description={t('rentals:settings.depositsHint')}>
                <Rules agreements={s.agreements} kind="deposits" />
              </Panel>
            )}
            {tab === 'templates' && (
              <Panel title={t('rentals:settings.templatesTitle')} description={t('rentals:settings.templatesHint')}>
                <ul className="space-y-3" data-testid="settings-templates">
                  {s.templates.map((x) => (
                    <li key={x} className="rounded-tile border border-border/70 p-3 text-sm" data-template={x}>
                      <p className="font-semibold">{t(`rentals:settings.template.${x}.name`)}</p>
                      <p className="mt-1 whitespace-pre-line text-muted">{t(`rentals:settings.template.${x}.body`)}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}
      </UrlTabs>
    </div>
  );
}

function Rules({ agreements, kind }: { agreements: AgreementView[]; kind: 'fees' | 'deposits' }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid={`settings-${kind}`}>
      {agreements.flatMap((a) =>
        a.versions
          .filter((v) => v.state !== 'superseded')
          .map((v) => (
            <li key={`${a.id}-${v.n}`} className="grid grid-cols-1 gap-1 p-2.5 text-sm @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto] @2xl:items-center @2xl:gap-3">
              <span>
                <bdi className="font-medium">{a.owner.name}</bdi> · <bdi dir="ltr">{unbroken(a.ref)}</bdi> {t('rentals:lease.agreementVersion', { n: v.n })}
              </span>
              <span className="text-muted">
                {kind === 'fees'
                  ? t(v.model === 'agent' ? 'rentals:settings.feeAgent' : 'rentals:settings.feePrincipal', { pct: v.feePct })
                  : t('rentals:settings.depositRule', { months: v.depositMaxMonths, where: t(`rentals:holding.${v.depositHolding}`) })}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <VersionBadge state={v.state} />
                <span className="text-xs text-muted">{t('rentals:settings.from', { date: fmt.date(v.effectiveFrom) })}</span>
              </span>
            </li>
          )),
      )}
    </ul>
  );
}

function Agreement({ a }: { a: AgreementView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const [drafting, setDrafting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [ack, setAck] = useState(false);
  const approve = useApiMutation<AgreementView>();
  const draft = a.versions.find((v) => v.state === 'draft');
  return (
    <section aria-labelledby={`agr-${a.id}`} className="space-y-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="agreement" data-ref={a.ref} data-owner={a.owner.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 id={`agr-${a.id}`} className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <bdi>{a.owner.name}</bdi>
            <bdi dir="ltr" className="text-muted">
              {unbroken(a.ref)}
            </bdi>
          </h2>
          <p className="text-sm text-muted">{a.sites.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.actions.draft && (
            <Button className={WRAP} icon={FilePen} onPress={() => setDrafting(true)} data-testid="agreement-draft-open">
              {t(draft ? 'rentals:settings.editDraft' : 'rentals:settings.newVersion')}
            </Button>
          )}
          {a.actions.approve && (
            <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setApproving(true)} data-testid="agreement-approve">
              {t('rentals:settings.approve')}
            </Button>
          )}
        </div>
      </div>
      {a.scopeLimited && (
        <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="agreement-limited">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('rentals:settings.limited')}
        </p>
      )}
      {a.blocked === 'own_draft' && <p className="text-sm text-muted">{t('rentals:settings.ownDraft')}</p>}
      {draft && !draft.signed && (
        <InlineAlert tone="warning" data-testid="agreement-unsigned">
          {t('rentals:settings.unsigned')}
        </InlineAlert>
      )}
      <ol className="space-y-2" data-testid="agreement-versions">
        {a.versions.map((v) => (
          <li key={v.n} className="space-y-1 rounded-tile border border-border p-3 text-sm" data-version={v.n} data-state={v.state}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{t('rentals:lease.agreementVersion', { n: v.n })}</span>
              <VersionBadge state={v.state} />
              <ModelBadge model={v.model} />
              <span className="text-muted">{t('rentals:settings.from', { date: fmt.date(v.effectiveFrom) })}</span>
            </p>
            <p>
              {t('rentals:settings.issuer')}: <bdi>{v.issuingEntityName}</bdi>
            </p>
            <p>
              {t(`rentals:lease.account.${v.account.kind}`)}: <AccountText label={v.account.label} last4={v.account.last4} verified={v.account.verified} />
              {v.subLedger ? (
                <>
                  {' · '}
                  {t('rentals:lease.subLedgers')}: <bdi dir="ltr">{unbroken(v.subLedger)}</bdi>
                </>
              ) : null}
            </p>
            <p className="text-muted">
              {v.signed ? t('rentals:settings.signed', { ref: unbroken(v.signed.reference), date: fmt.date(v.signed.date) }) : t('rentals:settings.notSigned')} ·{' '}
              {t(v.collectOnBehalf ? 'rentals:settings.collects' : 'rentals:settings.noCollect')} · {t('rentals:settings.feeShort', { pct: v.feePct })}
            </p>
            <p className="text-xs text-muted">
              {t('rentals:settings.draftedBy', { name: v.draftedByName })}
              {v.approvedByName ? ` · ${t('rentals:settings.approvedBy', { name: v.approvedByName })}` : ''}
            </p>
            {v.note && <p className="text-xs break-words text-muted">“{v.note}”</p>}
            {v.boundLeases.length > 0 && (
              <p className="text-xs text-muted" data-testid="agreement-bound">
                {t('rentals:settings.bound')}:{' '}
                {v.boundLeases.map((ref, i) => (
                  <span key={ref}>
                    {i > 0 ? ', ' : ''}
                    <Link href={RENTALS.leases({ q: ref })}>
                      <bdi dir="ltr">{unbroken(ref)}</bdi>
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
      {drafting && <DraftDrawer a={a} onClose={() => setDrafting(false)} />}
      <Dialog
        isOpen={approving}
        onOpenChange={setApproving}
        title={t('rentals:settings.approveTitle', { ref: a.ref, name: a.owner.name })}
        footer={
          <>
            <Button variant="quiet" onPress={() => setApproving(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              className={WRAP}
              variant="primary"
              isDisabled={!ack}
              isPending={approve.isPending}
              onPress={async () => {
                try {
                  await approve.mutateAsync({ method: 'POST', path: `/rentals/settings/agreements/${a.id}/approve`, body: { acknowledge: ack } });
                  toast.success(t('rentals:settings.approved', { ref: a.ref }));
                  setApproving(false);
                } catch (e) {
                  problem(e);
                }
              }}
              data-testid="agreement-approve-confirm"
            >
              {t('rentals:settings.approve')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{t('rentals:settings.approveEffect')}</p>
          <PlainCheckbox isSelected={ack} onChange={setAck} testId="agreement-approve-ack">
            {t('rentals:settings.acknowledge')}
          </PlainCheckbox>
        </div>
      </Dialog>
    </section>
  );
}

function DraftDrawer({ a, onClose }: { a: AgreementView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const base = a.versions.find((v) => v.state === 'draft') ?? a.versions.find((v) => v.state === 'active') ?? a.versions[0];
  const [effectiveFrom, setEffectiveFrom] = useState(base && base.state === 'draft' ? base.effectiveFrom : ACCESS_DATE);
  const [model, setModel] = useState<IssuingModel>(base?.model ?? 'agent');
  const [feePct, setFeePct] = useState(base?.feePct ?? '8.00');
  const [months, setMonths] = useState(String(base?.depositMaxMonths ?? 2));
  const [collect, setCollect] = useState(base?.collectOnBehalf ?? true);
  const [reference, setReference] = useState(base?.signed?.reference ?? '');
  const [signedDate, setSignedDate] = useState(base?.signed?.date ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldError(error);
  const m = useApiMutation<AgreementView>();
  // Issue #18 (FIN-02): one idempotency key per logical create, renewed after it succeeded or when the
  // server refused the key, so a second press while it runs replays it and never makes a second record.
  const [key, renewKey] = useCreateKey('agr');
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:settings.draftTitle', { name: a.owner.name })}
      subtitle={<bdi dir="ltr">{a.ref}</bdi>}
      testId="agreement-draft"
      footer={
        <Button
          className={WRAP}
          variant="primary"
          isPending={m.isPending}
          onPress={async () => {
            setError(null);
            try {
              await m.mutateAsync({
                method: 'POST',
                path: `/rentals/settings/agreements/${a.id}/versions`,
                body: { effectiveFrom, model, feePct, depositHolding: model === 'agent' ? 'client_deposit_account' : 'owner_account', depositMaxMonths: Number(months), collectOnBehalf: model === 'agent' ? collect : false, signedReference: reference, signedDate, note },
                idempotencyKey: key,
              });
              renewKey();
              toast.success(t('rentals:settings.drafted', { ref: a.ref }));
              onClose();
            } catch (e) {
              if (isKeyReused(e)) renewKey();
              setError(e);
              problem(e);
            }
          }}
          data-testid="agreement-draft-save"
        >
          {t('rentals:settings.saveDraft')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('rentals:settings.draftIntro')}</p>
        <DateInput id="agr-from" label={t('rentals:settings.effectiveFrom')} value={effectiveFrom} onChange={setEffectiveFrom} min={ACCESS_DATE} testId="agreement-from" description={fe('effectiveFrom') ?? t('rentals:settings.noBackdating')} />
        <SelectControl label={t('rentals:settings.model')} value={model} onChange={(v) => v && setModel(v as IssuingModel)} options={(['agent', 'principal'] as const).map((x) => ({ id: x, label: t(`rentals:model.${x}`) }))} testId="agreement-model" />
        <p className="text-xs text-muted">{t(`rentals:model.${model}Hint`)}</p>
        <PlainTextField label={t('rentals:settings.feePct')} value={feePct} onChange={setFeePct} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'feePct')} testId="agreement-fee" />
        <SelectControl label={t('rentals:settings.depositMonths')} value={months} onChange={(v) => v && setMonths(v)} options={[0, 1, 2, 3].map((n) => ({ id: String(n), label: t('rentals:settings.months', { count: n }) }))} testId="agreement-months" />
        {model === 'agent' && (
          <PlainCheckbox isSelected={collect} onChange={setCollect} testId="agreement-collect">
            {t('rentals:settings.collectLabel')}
          </PlainCheckbox>
        )}
        <PlainTextField label={t('rentals:settings.signedReference')} value={reference} onChange={setReference} dir="ltr" optional errorKey={fieldErrorKey(error, 'signedReference')} testId="agreement-reference" description={t('rentals:settings.signedHint')} />
        <DateInput id="agr-signed" label={t('rentals:settings.signedDate')} value={signedDate} onChange={setSignedDate} max={ACCESS_DATE} testId="agreement-signed-date" description={fe('signedDate')} />
        <PlainTextArea label={t('rentals:settings.note')} value={note} onChange={setNote} optional testId="agreement-note" />
      </div>
    </Drawer>
  );
}
