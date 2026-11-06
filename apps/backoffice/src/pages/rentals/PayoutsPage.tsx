import { SETTLEMENT_NEEDS, type PayoutsView, type PayoutView } from '@repo/contracts';
import { Button, ConfirmDialog, Dialog, Drawer, EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, PlainCheckbox, PlainTextArea, PlainTextField, useApiMutation, useApiQuery, useSession, useT, useToast } from '@repo/ui';
import { Ban, BadgeCheck, CircleDashed, FilePlus2, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ACCESS_DATE, RENTALS } from '../../nav.config';
import { Loading } from '../society/kit';
import { fieldErrorKey, unbroken, useProblemToast } from '../society/hr/hkit';
import { AccountText, Activity, ModelBadge, NotSettled, PayoutBadge, RentNav, STATEMENTS_TARGET, WRAP } from './rkit';

/**
 * RNT-006 owner payout instructions (PARTIAL). For each owner: the closing payable on a settled basis,
 * what is already instructed, and what is left to instruct (never more). An instruction is prepared
 * by one person and approved by another; an approved instruction is "not sent" and changes neither
 * cash nor the owner payable. Settlement would need a matched statement line on the paying
 * client-money account: no such evidence path exists here, so every instruction stays "Not settled —
 * no evidence" and there is no control that settles, sends or pays anything.
 */
export default function PayoutsPage() {
  const { t } = useT();
  const { allows } = useSession();
  const [preparing, setPreparing] = useState<PayoutsView['owners'][number] | null>(null);
  const q = useApiQuery<PayoutsView>({ method: 'GET', path: '/rentals/payouts' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="rent-payouts">
      <PageHeader title={t('rentals:payouts.title')} description={t('rentals:payouts.intro')} />
      <RentNav current="payouts" />
      <InlineAlert tone="warning" title={t('rentals:payouts.partialTitle')} data-testid="payouts-partial">
        {t('rentals:payouts.partial')}
      </InlineAlert>
      {d.scopeLimited && (
        <InlineAlert tone="info" data-testid="payouts-limited">
          {t('rentals:payouts.limited')}
        </InlineAlert>
      )}
      <Panel title={t('rentals:payouts.ownersTitle')}>
        {d.owners.length === 0 ? (
          <EmptyState title={t('rentals:payouts.noOwners')} />
        ) : (
          <ul className="space-y-3" data-testid="payout-owners">
            {d.owners.map((o) => (
              <li key={o.id} className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="payout-owner" data-owner={o.id} data-can-prepare={o.canPrepare}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <bdi className="font-semibold">{o.name}</bdi>
                    {o.model && <ModelBadge model={o.model} />}
                  </p>
                  {o.canPrepare && (
                    <Button className={WRAP} variant="primary" icon={FilePlus2} onPress={() => setPreparing(o)} data-testid="payout-prepare-open">
                      {t('rentals:payouts.prepare')}
                    </Button>
                  )}
                </div>
                {o.available ? (
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm @xl:grid-cols-3">
                    <div>
                      <dt className="text-muted">{t('rentals:payouts.closing')}</dt>
                      <dd data-testid="payout-closing">
                        <Money value={o.closing!} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t('rentals:payouts.pending')}</dt>
                      <dd>
                        <Money value={o.pending!} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t('rentals:payouts.available')}</dt>
                      <dd className="font-semibold" data-testid="payout-available" data-amount={o.available.amount}>
                        <Money value={o.available} />
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {o.beneficiary && (
                  <p className="text-xs text-muted">
                    {t('rentals:payouts.beneficiary')}: <AccountText label={o.beneficiary.bankName} last4={o.beneficiary.last4} verified={o.beneficiary.verified} />
                  </p>
                )}
                {o.holds.length > 0 && (
                  <ul className="space-y-1 text-sm" data-testid="payout-holds">
                    {o.holds.map((h) => (
                      <li key={h} className="flex items-start gap-1.5 text-muted" data-hold={h}>
                        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 break-words">{t(`rentals:payouts.hold.${h}`)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {allows(STATEMENTS_TARGET) && (
                  <p className="text-sm">
                    <Link href={RENTALS.statements(o.id, ACCESS_DATE.slice(0, 7))}>{t('rentals:payouts.toStatement')}</Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('rentals:payouts.instructionsTitle')}>
        {d.instructions.length === 0 ? (
          <EmptyState title={t('rentals:payouts.noInstructions')} body={t('rentals:payouts.noInstructionsHint')} />
        ) : (
          <ul className="space-y-3" data-testid="payout-instructions">
            {d.instructions.map((p) => (
              <Instruction key={p.id} p={p} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('rentals:payouts.needsTitle')}>
        <ul className="space-y-2 text-sm" data-testid="payout-settlement-needs">
          {SETTLEMENT_NEEDS.map((n) => (
            <li key={n} className="flex items-start gap-2">
              <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="min-w-0 break-words">{t(`rentals:payouts.needs.${n}`)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {preparing && <PrepareDrawer owner={preparing} onClose={() => setPreparing(null)} />}
    </div>
  );
}

function PrepareDrawer({ owner, onClose }: { owner: PayoutsView['owners'][number]; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const m = useApiMutation<PayoutView>();
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:payouts.prepareTitle', { name: owner.name })}
      testId="payout-prepare"
      footer={
        <Button
          className={WRAP}
          variant="primary"
          isPending={m.isPending}
          onPress={async () => {
            setError(null);
            try {
              const v = await m.mutateAsync({ method: 'POST', path: '/rentals/payouts', body: { ownerId: owner.id, amount, note } });
              toast.success(t('rentals:payouts.prepared', { ref: v.ref }));
              onClose();
            } catch (e) {
              setError(e);
              problem(e);
            }
          }}
          data-testid="payout-prepare-save"
        >
          {t('rentals:payouts.prepare')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          {t('rentals:payouts.available')}: <Money value={owner.available!} />
        </p>
        <PlainTextField label={t('rentals:payouts.amount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'amount')} testId="payout-amount" />
        <PlainTextArea label={t('rentals:payouts.note')} value={note} onChange={setNote} errorKey={fieldErrorKey(error, 'note')} testId="payout-note" />
        <p className="text-xs text-muted">{t('rentals:payouts.prepareEffect')}</p>
      </div>
    </Drawer>
  );
}

function Instruction({ p }: { p: PayoutView }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const act = useApiMutation<PayoutView>();
  const [approving, setApproving] = useState(false);
  const [ack, setAck] = useState(false);
  const [confirming, setConfirming] = useState<'reject' | 'cancel' | null>(null);
  const run = async (path: string, body: unknown, done: string) => {
    try {
      await act.mutateAsync({ method: 'POST', path: `/rentals/payouts/${p.id}/${path}`, body });
      toast.success(t(done as 'rentals:payouts.approvedToast', { ref: p.ref }));
    } catch (e) {
      problem(e);
    }
  };
  return (
    <li className="space-y-2 rounded-tile border border-border p-3" data-testid="payout-instruction" data-ref={p.ref} data-state={p.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <bdi dir="ltr">{unbroken(p.ref)}</bdi>
            <PayoutBadge state={p.state} />
            <NotSettled />
          </p>
          <p>
            <bdi>{p.ownerName}</bdi> · <Money value={p.amount} />
            {p.beneficiary && (
              <>
                {' · '}
                <AccountText label={p.beneficiary.bankName} last4={p.beneficiary.last4} verified={p.beneficiary.verified} />
              </>
            )}
          </p>
          <p className="text-xs break-words text-muted">“{p.note}”</p>
          <p className="text-xs text-muted">
            {t('rentals:payouts.who.prepared', { name: p.preparedByName })}
            {p.approvedByName ? ` · ${t('rentals:payouts.who.approved', { name: p.approvedByName })}` : ''}
            {p.rejectedByName ? ` · ${t('rentals:payouts.who.rejected', { name: p.rejectedByName })}` : ''}
            {p.cancelledByName ? ` · ${t('rentals:payouts.who.cancelled', { name: p.cancelledByName })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.actions.approve && (
            <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setApproving(true)} data-testid="payout-approve">
              {t('rentals:payouts.approve')}
            </Button>
          )}
          {p.actions.reject && (
            <Button className={WRAP} variant="quiet" icon={XCircle} onPress={() => setConfirming('reject')} data-testid="payout-reject">
              {t('rentals:payouts.reject')}
            </Button>
          )}
          {p.actions.cancel && (
            <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setConfirming('cancel')} data-testid="payout-cancel">
              {t('rentals:payouts.cancel')}
            </Button>
          )}
        </div>
      </div>
      {p.blocked && <p className="text-sm text-muted">{t(`rentals:payouts.blocked.${p.blocked}`)}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('rentals:payouts.historyTitle')}</summary>
        <div className="mt-2">
          <Activity events={p.history} />
        </div>
      </details>
      <Dialog
        isOpen={approving}
        onOpenChange={setApproving}
        title={t('rentals:payouts.approveTitle', { ref: p.ref })}
        footer={
          <>
            <Button variant="quiet" onPress={() => setApproving(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              className={WRAP}
              variant="primary"
              isDisabled={!ack}
              isPending={act.isPending}
              onPress={async () => {
                await run('approve', { acknowledge: ack }, 'rentals:payouts.approvedToast');
                setApproving(false);
              }}
              data-testid="payout-approve-confirm"
            >
              {t('rentals:payouts.approve')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{t('rentals:payouts.approveEffect')}</p>
          <PlainCheckbox isSelected={ack} onChange={setAck} testId="payout-approve-ack">
            {t('rentals:payouts.acknowledge')}
          </PlainCheckbox>
        </div>
      </Dialog>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`rentals:payouts.confirm.${confirming}`, { ref: p.ref }) : ''}
        effect={confirming ? t(`rentals:payouts.effect.${confirming}`) : ''}
        confirmLabel={confirming ? t(`rentals:payouts.${confirming}`) : ''}
        destructive
        reasonLabel={t('rentals:payouts.reason')}
        onConfirm={async (reason) => {
          if (confirming) await run(confirming, { reason }, confirming === 'reject' ? 'rentals:payouts.rejectedToast' : 'rentals:payouts.cancelledToast');
          setConfirming(null);
        }}
      />
    </li>
  );
}
