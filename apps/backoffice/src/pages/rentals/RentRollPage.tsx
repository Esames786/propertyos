import type { RentRollView } from '@repo/contracts';
import { Button, Dialog, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, Panel, PlainCheckbox, PlainTextArea, isKeyReused, useApiMutation, useApiQuery, useCreateKey, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { CircleDashed, ClipboardCheck, Eye, Info } from 'lucide-react';
import { useState } from 'react';
import { ACCESS_DATE, RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { unbroken, useProblemToast } from '../society/hr/hkit';
import { Activity, Boundary, ModelBadge, NotSettled, RENT_VIEW, RentNav, RollBadge, WRAP } from './rkit';

/**
 * RNT-004 rent roll and billing (PARTIAL). For a period: every let lease's rent line (keyed by lease,
 * period and schedule version, so a line is never doubled), previewed by a preparer and approved by
 * someone who previewed nothing. An approved roll is a **demand schedule**: posting it to invoices
 * through the shared C.1/C.2 engine needs a lease billing subject that does not exist yet, so there is
 * no post control and the server refuses posting. Nothing here is invoiced, collected or paid.
 */
export default function RentRollPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const { allows } = useSession();
  const [param, setPeriod] = useQueryParam('period');
  const period = param ?? ACCESS_DATE.slice(0, 7);
  const [approving, setApproving] = useState(false);
  const preview = useApiMutation<RentRollView>();
  // Issue #18 (FIN-02): one idempotency key per logical create, renewed after it succeeded or when the
  // server refused the key, so a second press while it runs replays it and never makes a second record.
  const [key, renewKey] = useCreateKey('roll');
  const q = useApiQuery<RentRollView>({ method: 'GET', path: '/rentals/rent-roll', query: { period } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const r = q.data;
  return (
    <div className="@container space-y-5" data-testid="rent-roll" data-period={r.period} data-state={r.state} data-version={r.version}>
      <PageHeader
        title={t('rentals:roll.title')}
        description={t('rentals:roll.intro')}
        badge={<RollBadge state={r.state} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {r.actions.preview && (
              <Button
                className={WRAP}
                variant={r.state === 'not_prepared' ? 'primary' : 'secondary'}
                icon={Eye}
                isPending={preview.isPending}
                onPress={async () => {
                  try {
                    const v = await preview.mutateAsync({ method: 'POST', path: `/rentals/rent-roll/${r.period}/preview`, idempotencyKey: key });
                    renewKey();
                    toast.success(t('rentals:roll.previewed', { month: fmt.period(v.period), version: v.version }));
                  } catch (e) {
                    if (isKeyReused(e)) renewKey();
                    problem(e);
                  }
                }}
                data-testid="roll-preview"
              >
                {t(r.state === 'not_prepared' ? 'rentals:roll.preview' : 'rentals:roll.previewAgain')}
              </Button>
            )}
            {r.actions.approve && (
              <Button className={WRAP} variant="primary" icon={ClipboardCheck} onPress={() => setApproving(true)} data-testid="roll-approve">
                {t('rentals:roll.approve')}
              </Button>
            )}
          </div>
        }
      />
      <RentNav current="rentRoll" />
      <FilterPills label={t('rentals:roll.period')} options={r.periods.map((p) => ({ id: p.period, label: `${fmt.period(p.period)} · ${t(`rentals:rollState.${p.state}`)}` }))} value={r.period} onChange={(v) => setPeriod(v)} testId="roll-periods" />
      <Boundary compact />
      {r.scopeLimited && (
        <InlineAlert tone="info" data-testid="roll-limited">
          {t('rentals:roll.limited')}
        </InlineAlert>
      )}
      {r.blocked && r.blocked !== 'other_sites' && (
        <InlineAlert tone={r.blocked === 'stale' ? 'warning' : 'info'} data-testid="roll-blocked" data-blocked={r.blocked}>
          {t(`rentals:roll.blocked.${r.blocked}`)}
        </InlineAlert>
      )}
      {r.stale && r.blocked !== 'stale' && (
        <InlineAlert tone="warning" data-testid="roll-stale">
          {t('rentals:roll.blocked.stale')}
        </InlineAlert>
      )}
      <InlineAlert tone="warning" title={t('rentals:roll.postingTitle')} data-testid="roll-posting-partial">
        <p>{t('rentals:roll.posting')}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 ps-5">
          {r.posting.needs.map((n) => (
            <li key={n}>{t(`rentals:roll.needs.${n as 'lease_subject'}`)}</li>
          ))}
        </ul>
      </InlineAlert>
      <Panel
        title={t(r.state === 'not_prepared' ? 'rentals:roll.wouldInclude' : 'rentals:roll.linesTitle', { month: fmt.period(r.period) })}
        description={
          r.preparedByName
            ? `${t('rentals:roll.prepared', { name: r.preparedByName, version: r.version })}${r.approvedByName ? ` · ${t('rentals:roll.approvedBy', { name: r.approvedByName })}` : ''}`
            : t('rentals:roll.notPrepared')
        }
      >
        {r.lines.length === 0 ? (
          <EmptyState title={t('rentals:roll.noLines')} />
        ) : (
          <>
            <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid="roll-lines">
              {r.lines.map((l) => (
                <li key={l.key} className="grid grid-cols-1 gap-1 p-2.5 text-sm @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto] @3xl:items-center @3xl:gap-3" data-testid="roll-line" data-key={l.key} data-site={l.siteId}>
                  <span className="min-w-0 space-y-0.5">
                    {allows(RENT_VIEW) ? (
                      <Link href={RENTALS.lease(l.leaseId)} className="font-medium">
                        <bdi dir="ltr">{unbroken(l.leaseRef)}</bdi>
                      </Link>
                    ) : (
                      <bdi dir="ltr" className="font-medium">
                        {unbroken(l.leaseRef)}
                      </bdi>
                    )}{' '}
                    · <bdi>{unbroken(l.unitCode)}</bdi> · <bdi>{l.siteName}</bdi>
                    <span className="block text-xs text-muted">
                      {t('rentals:leases.tenant')}: <bdi>{l.tenantName}</bdi> · {t('rentals:roll.payer', { ref: unbroken(l.payerAccountRef) })} · {t('rentals:roll.lineKey', { version: l.leaseVersion })}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {t('rentals:lease.dueOn', { date: fmt.date(l.dueDate) })} · <ModelBadge model={l.model} />
                  </span>
                  <Money value={l.amount} />
                  <NotSettled />
                </li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="roll-total">
              <span className="text-muted">{t('rentals:roll.total', { count: r.totals.lines })}</span>
              <span className="font-semibold">
                <Money value={r.totals.amount} />
              </span>
            </p>
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('rentals:roll.totalHint')}
            </p>
          </>
        )}
      </Panel>
      <Panel title={t('rentals:roll.historyTitle')}>
        <Activity events={r.history} testId="roll-history" />
      </Panel>
      {approving && <ApproveDialog r={r} onClose={() => setApproving(false)} />}
    </div>
  );
}

function ApproveDialog({ r, onClose }: { r: RentRollView; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const m = useApiMutation<RentRollView>();
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('rentals:roll.approveTitle', { month: fmt.period(r.period), version: r.version })}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            className={WRAP}
            variant="primary"
            icon={ClipboardCheck}
            isPending={m.isPending}
            isDisabled={!ack}
            onPress={async () => {
              try {
                await m.mutateAsync({ method: 'POST', path: `/rentals/rent-roll/${r.period}/approve`, body: { acknowledge: ack, note } });
                toast.success(t('rentals:roll.approved', { month: fmt.period(r.period) }));
                onClose();
              } catch (e) {
                problem(e);
              }
            }}
            data-testid="roll-approve-confirm"
          >
            {t('rentals:roll.approve')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {t('rentals:roll.approveBody', { count: r.totals.lines })} <Money value={r.totals.amount} />
        </p>
        <p className="flex items-start gap-1.5 text-muted">
          <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('rentals:roll.approveEffect')}
        </p>
        <PlainCheckbox isSelected={ack} onChange={setAck} testId="roll-approve-ack">
          {t('rentals:roll.acknowledge')}
        </PlainCheckbox>
        <PlainTextArea label={t('rentals:roll.note')} value={note} onChange={setNote} optional testId="roll-approve-note" />
      </div>
    </Dialog>
  );
}
