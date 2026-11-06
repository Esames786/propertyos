import type { PayPeriodsList, PayPeriodState, PayPeriodView, PayRunView } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, useApiMutation, useApiQuery, useNavigation, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { CalendarPlus, Info, Lock, LockOpen, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { PAYROLL } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { DateInput, fieldErrorKey, unbroken, useFieldError, useProblemToast } from '../hr/hkit';
import { Activity, PayNav, PeriodBadge, RunBadge, WRAP } from './pkit';

/**
 * PAY-002 payroll periods: one month each, created in order from the licence month, one open at a
 * time per employer; a period closes once its run is approved. Every rule is the server's: this page
 * shows what it may do and why not.
 */
const VIEWS = ['all', 'draft', 'open', 'closed'] as const;
type View = (typeof VIEWS)[number];

export default function PayrollPeriodsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const [creating, setCreating] = useState(false);
  const view: View = (VIEWS as readonly string[]).includes(status ?? '') ? (status as View) : 'all';
  const q = useApiQuery<PayPeriodsList>({ method: 'GET', path: '/payroll/periods' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const shown = d.items.filter((p) => view === 'all' || p.state === view);
  return (
    <div className="@container space-y-5" data-testid="pay-periods">
      <PageHeader
        title={t('payroll:periods.title')}
        description={t('payroll:periods.intro')}
        actions={
          d.canCreate ? (
            <Button className={WRAP} variant="primary" icon={CalendarPlus} onPress={() => setCreating(true)} data-testid="pay-period-new">
              {t('payroll:periods.new')}
            </Button>
          ) : undefined
        }
      />
      <PayNav current="periods" />
      {d.scopeLimited && (
        <InlineAlert tone="info" data-testid="pay-periods-limited">
          {t('payroll:scopeLimited')}
        </InlineAlert>
      )}
      <FilterPills label={t('payroll:periods.show')} value={view} onChange={(v) => setParams({ status: v === 'all' ? null : v })} options={VIEWS.map((v) => ({ id: v, label: t(`payroll:periods.view.${v}`), count: v === 'all' ? d.items.length : d.counts[v as PayPeriodState] }))} testId="pay-periods-show" />
      {shown.length === 0 ? (
        <EmptyState title={t('payroll:periods.empty')} />
      ) : (
        <ul className="space-y-3" data-testid="pay-period-rows">
          {shown.map((p) => (
            <PeriodRow key={p.id} period={p} fmt={fmt} />
          ))}
        </ul>
      )}
      {d.next && <NewPeriodDrawer key={String(creating)} open={creating} onClose={() => setCreating(false)} next={d.next} />}
    </div>
  );
}

function PeriodRow({ period: p, fmt }: { period: PayPeriodView; fmt: ReturnType<typeof useSocietyFormat> }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const act = useApiMutation<PayPeriodView | PayRunView>();
  const [confirming, setConfirming] = useState<'open' | 'close' | null>(null);
  const prepare = async () => {
    try {
      const run = (await act.mutateAsync({ method: 'POST', path: `/payroll/periods/${p.id}/runs` })) as PayRunView;
      toast.success(t('payroll:periods.prepared', { ref: run.ref, version: run.version }));
      navigate(PAYROLL.run(run.id));
    } catch (e) {
      problem(e);
    }
  };
  return (
    <li className="rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-period-row" data-ref={p.ref} data-state={p.state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">
            {fmt.period(p.month)}
            <bdi dir="ltr" className="text-sm font-normal text-muted">
              {unbroken(p.ref)}
            </bdi>
            <PeriodBadge state={p.state} />
          </h2>
          <p className="text-sm text-muted">
            <bdi>{p.legalEntityName}</bdi> · {t('payroll:periods.dates', { from: fmt.date(p.from), to: fmt.date(p.to) })} · {t('payroll:periods.payOn', { date: fmt.date(p.payDate) })}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('payroll:periods.run')}:</span>
            {p.run ? (
              <>
                <Link href={PAYROLL.run(p.run.id)} data-testid="pay-period-run">
                  <bdi dir="ltr">{p.run.ref}</bdi>
                </Link>
                <RunBadge state={p.run.state} />
                <span className="text-muted">
                  <Money value={p.run.net} />
                </span>
              </>
            ) : (
              <span className="text-muted">{t('payroll:periods.noRun')}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.actions.prepareRun && (
            <Button className={WRAP} variant="primary" icon={PlayCircle} isPending={act.isPending} onPress={() => void prepare()} data-testid="pay-period-prepare">
              {t('payroll:periods.prepareRun')}
            </Button>
          )}
          {p.actions.open && (
            <Button className={WRAP} icon={LockOpen} onPress={() => setConfirming('open')} data-testid="pay-period-open">
              {t('payroll:periods.open')}
            </Button>
          )}
          {p.actions.close && (
            <Button className={WRAP} icon={Lock} onPress={() => setConfirming('close')} data-testid="pay-period-close">
              {t('payroll:periods.close')}
            </Button>
          )}
        </div>
      </div>
      {p.blocked && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted" data-testid="pay-period-blocked">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t(`payroll:blocked.${p.blocked}`)}
        </p>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">{t('payroll:run.historyTitle')}</summary>
        <div className="mt-2">
          <Activity events={p.history} />
        </div>
      </details>
      <ConfirmDialog
        isOpen={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={confirming ? t(`payroll:periods.confirm.${confirming}`, { ref: p.ref }) : ''}
        effect={confirming ? t(`payroll:periods.effect.${confirming}`) : ''}
        confirmLabel={confirming === 'close' ? t('payroll:periods.close') : t('payroll:periods.open')}
        onConfirm={async () => {
          if (!confirming) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/payroll/periods/${p.id}/${confirming}` });
            toast.success(t(confirming === 'open' ? 'payroll:periods.opened' : 'payroll:periods.closed', { ref: p.ref }));
          } catch (e) {
            problem(e);
          }
          setConfirming(null);
        }}
      />
    </li>
  );
}

function NewPeriodDrawer({ open, onClose, next }: { open: boolean; onClose: () => void; next: NonNullable<PayPeriodsList['next']> }) {
  const { t } = useT();
  const toast = useToast();
  const fmt = useSocietyFormat();
  const [month, setMonth] = useState(next.month);
  const [payDate, setPayDate] = useState(next.payDate);
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<PayPeriodView>();
  const fieldError = useFieldError(error);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('payroll:periods.new')}
      subtitle={t('payroll:periods.newSubtitle')}
      testId="pay-period-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                const p = await save.mutateAsync({ method: 'POST', path: '/payroll/periods', body: { legalEntityId: next.legalEntityId, month, payDate } });
                toast.success(t('payroll:periods.created', { ref: p.ref }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="pay-period-save"
          >
            {t('payroll:periods.create')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm">
          <span className="block text-muted">{t('payroll:periods.entity')}</span>
          <bdi className="font-medium text-text">{next.legalEntityName}</bdi>
        </p>
        <div className="space-y-1">
          <label htmlFor="pay-period-month" className="block text-sm font-medium text-text">
            {t('payroll:periods.month')}
          </label>
          <input id="pay-period-month" type="month" value={month} onChange={(e) => setMonth(e.currentTarget.value)} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" aria-describedby="pay-period-month-hint" data-testid="pay-period-month" />
          <p id="pay-period-month-hint" className="text-xs text-muted">
            {t('payroll:periods.monthHint')} {fmt.period(next.month)}.
          </p>
          {fieldError('month') && <p className="text-xs font-medium text-error">{fieldError('month')}</p>}
        </div>
        <div className="space-y-1">
          <DateInput id="pay-period-paydate" label={t('payroll:periods.payDate')} value={payDate} onChange={setPayDate} description={t('payroll:periods.payDateHint')} testId="pay-period-paydate" />
          {fieldErrorKey(error, 'payDate') && <p className="text-xs font-medium text-error">{fieldError('payDate')}</p>}
        </div>
        {error ? <ProblemAlert error={error} /> : null}
        <InlineAlert tone="info">{t('payroll:boundary.run')}</InlineAlert>
      </div>
    </Drawer>
  );
}
