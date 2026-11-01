import { GATE_PURPOSES, type CheckInResult, type GatePass, type GatePurpose, type GateQueue, type GateRequest, type GateVisit, type PassList, type VisitorDashboard } from '@repo/contracts';
import { Badge, Button, buttonClass, cn, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, PlainTextField, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { CheckCircle2, DoorOpen, LogIn, LogOut, QrCode, RefreshCw, ScanLine, Send, ShieldCheck, ShieldX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OPS } from '../../../nav.config';
import { FlatSelect, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { Fact, FactGrid, HistoryList, WRAP } from '../finance/fkit';
import { Figure, GateRequestBadge, PassBadge, useOpsWords, VisitBadge, When } from './okit';

/**
 * Visitors and the gate (Gate D.2 reference experience 2, office end): VIS-001 dashboard, VIS-002
 * passes, VIS-003 pass detail, VIS-004 gate check-in with the VIS-007 live queue, VIS-005 history and
 * VIS-006 scan. The guard types (or scans) the code; the server says let in or not and why. A visitor
 * without a pass is asked about through the queue: only the flat's occupants are asked, and only their
 * approval lets the visitor in. Refreshing is simulated: there is no real security feed.
 */

export function VisitorTabs({ current }: { current: 'dashboard' | 'gate' | 'passes' | 'history' | 'scan' }) {
  const { t } = useT();
  const { can } = useSession();
  const tabs = [
    { id: 'dashboard', href: OPS.visitors, label: t('operations:visitorTabs.dashboard') },
    ...(can('visitors.manage') ? [{ id: 'gate', href: OPS.gate(), label: t('operations:visitorTabs.gate') }, { id: 'scan', href: OPS.scan, label: t('operations:visitorTabs.scan') }] : []),
    { id: 'passes', href: OPS.passes(), label: t('operations:visitorTabs.passes') },
    { id: 'history', href: OPS.visits(), label: t('operations:visitorTabs.history') },
  ];
  return (
    <nav aria-label={t('operations:visitorTabs.label')} className="-mx-1 overflow-x-auto px-1" data-testid="visitor-tabs">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link href={tab.href} variant="plain" aria-current={tab.id === current ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium', tab.id === current ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text')}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function VisitorDashboardPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const w = useOpsWords();
  const { can } = useSession();
  const q = useApiQuery<VisitorDashboard>({ method: 'GET', path: '/ops/visitors/dashboard' }, { refetchInterval: 15_000 });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-6" data-testid="visitor-dashboard">
      <PageHeader
        title={t('operations:visitorDash.title')}
        description={t('operations:visitorDash.intro')}
        actions={
          can('visitors.manage') ? (
            <Link href={OPS.gate()} variant="plain" className={cn(buttonClass('primary', 'md', 'gap-2'), WRAP)} data-testid="open-gate">
              <DoorOpen aria-hidden className="size-4" />
              {t('operations:visitorDash.openGate')}
            </Link>
          ) : undefined
        }
      />
      <VisitorTabs current="dashboard" />
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
        <Figure label={t('operations:visitorDash.expected')} value={fmt.count(d.expectedToday)} href={OPS.gate('queue')} testId="vfig-expected" />
        <Figure label={t('operations:visitorDash.inside')} value={fmt.count(d.inside)} href={OPS.visits({ outcome: 'inside' })} testId="vfig-inside" />
        <Figure label={t('operations:visitorDash.waiting')} value={fmt.count(d.waiting)} href={OPS.gate('queue')} tone={d.waiting ? 'warning' : 'default'} testId="vfig-waiting" />
        <Figure label={t('operations:visitorDash.refused')} value={fmt.count(d.refusedToday)} href={OPS.visits({ outcome: 'refused' })} tone={d.refusedToday ? 'error' : 'default'} testId="vfig-refused" />
        <Figure label={t('operations:visitorDash.passes')} value={fmt.count(d.passesActive)} href={OPS.passes({ status: 'active' })} testId="vfig-passes" />
        <Figure label={t('operations:visitorDash.week')} value={fmt.count(d.visitsThisWeek)} href={OPS.visits()} testId="vfig-week" />
      </div>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="recent-visits">
          <h2 id="recent-visits" className="text-lg font-semibold text-text">{t('operations:visitorDash.recent')}</h2>
          <VisitList items={d.recent} />
        </section>
        <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="by-purpose">
          <h2 id="by-purpose" className="text-lg font-semibold text-text">{t('operations:visitorDash.byPurpose')}</h2>
          <ul className="space-y-1.5 text-sm">
            {d.byPurpose.map((p) => (
              <li key={p.purpose} className="flex items-center justify-between gap-3">
                <span className="text-text">{w.purpose(p.purpose)}</span>
                <span className="font-semibold tabular-nums text-text">{fmt.count(p.count)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('operations:visitorDash.simulated')}</p>
        </section>
      </div>
    </div>
  );
}

export function VisitList({ items, onCheckOut, pending }: { items: GateVisit[]; onCheckOut?: (id: string) => void; pending?: boolean }) {
  const { t } = useT();
  const w = useOpsWords();
  if (!items.length) return <p className="text-sm text-muted">{t('operations:visitors.noVisits')}</p>;
  return (
    <ul className="space-y-2" data-testid="visit-list">
      {items.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm" data-testid="visit-row" data-outcome={v.outcome}>
          <span className="min-w-0">
            <bdi className="font-medium text-text">{v.visitorName}</bdi> · <bdi dir="ltr" className="ltr-ref">{v.flatCode}</bdi>
            <span className="block text-xs text-muted">
              {w.purpose(v.purpose)} · <When at={v.at} />
              {v.checkedOutAt ? <> → <When at={v.checkedOutAt} style="time" /></> : null}
              {v.vehiclePlate ? <> · <bdi dir="ltr">{v.vehiclePlate}</bdi></> : null}
              {v.passRef ? <> · <bdi dir="ltr" className="ltr-ref">{v.passRef}</bdi></> : null}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {v.refusal ? <Badge tone="error" icon={ShieldX}>{t(`operations:refusal.${v.refusal}`)}</Badge> : <VisitBadge state={v.outcome} />}
            {onCheckOut && v.outcome === 'inside' && (
              <Button variant="secondary" size="sm" icon={LogOut} isPending={pending} onPress={() => onCheckOut(v.id)} data-testid="check-out">
                {t('operations:gate.checkOut')}
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** VIS-004 gate check-in, with the VIS-007 live queue as its second tab. */
export function GatePage() {
  const { t } = useT();
  const [tab] = useQueryParam('tab');
  const setParams = useQueryParams();
  const q = useApiQuery<GateQueue>({ method: 'GET', path: '/ops/gate/queue' }, { refetchInterval: 15_000 });
  const current = tab === 'queue' ? 'queue' : 'check-in';
  return (
    <div className="@container space-y-5" data-testid="gate-page">
      <PageHeader title={t('operations:gate.title')} description={t('operations:gate.intro')} />
      <VisitorTabs current="gate" />
      <FilterPills label={t('operations:gate.show')} value={current} onChange={(v) => setParams({ tab: v === 'check-in' ? null : v })} testId="gate-tabs" options={[{ id: 'check-in', label: t('operations:gate.checkInTab') }, { id: 'queue', label: t('operations:gate.queueTab'), ...(q.data ? { count: q.data.waiting.length } : {}) }]} />
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? <Loading lines={8} /> : current === 'queue' ? <LiveQueue data={q.data} refetch={() => void q.refetch()} /> : <CheckIn data={q.data} refetch={() => void q.refetch()} />}
    </div>
  );
}

function Refreshed({ data, refetch }: { data: GateQueue; refetch: () => void }) {
  const { t } = useT();
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="queue-refreshed" role="status">
      <RefreshCw aria-hidden className="size-3.5" />
      {t('operations:gate.updated', { seconds: data.refreshSeconds })} <When at={data.refreshedAt} style="time" />
      <button type="button" onClick={refetch} className="text-primary underline">{t('operations:gate.refresh')}</button>
    </p>
  );
}

function CheckIn({ data, refetch }: { data: GateQueue; refetch: () => void }) {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const check = useApiMutation<CheckInResult>();
  const out = useApiMutation<GateVisit>();
  const submit = async () => {
    setError(null);
    try {
      const r = await check.mutateAsync({ method: 'POST', path: '/ops/gate/check-in', body: { code, plate } });
      setResult(r);
      setCode('');
      setPlate('');
      refetch();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <form
          className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          data-testid="check-in-form"
        >
          <h2 className="text-lg font-semibold text-text">{t('operations:gate.withPass')}</h2>
          <PlainTextField label={t('operations:gate.code')} description={t('operations:gate.codeHint')} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" testId="gate-code" autoFocus />
          <PlainTextField label={t('operations:gate.plate')} value={plate} onChange={setPlate} dir="ltr" optional testId="gate-plate" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" icon={ShieldCheck} isPending={check.isPending} isDisabled={code.length !== 6} data-testid="gate-check">
              {t('operations:gate.check')}
            </Button>
            <Link href={OPS.scan} variant="plain" className={buttonClass('secondary', 'md', 'gap-2')}>
              <QrCode aria-hidden className="size-4" />
              {t('operations:gate.scan')}
            </Link>
          </div>
          {error ? <ProblemAlert error={error} /> : null}
        </form>
        {result && <CheckResult result={result} />}
        <WalkIn onAsked={refetch} liveQueue={data.liveQueue} flats={data.flats} />
      </div>
      <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="inside-now" data-testid="inside-now">
        <h2 id="inside-now" className="text-lg font-semibold text-text">{t('operations:gate.inside', { count: data.inside.length })}</h2>
        <Refreshed data={data} refetch={refetch} />
        <VisitList
          items={data.inside}
          pending={out.isPending}
          onCheckOut={async (id) => {
            await out.mutateAsync({ method: 'POST', path: `/ops/gate/visits/${id}/check-out`, body: {} });
            toast.success(t('operations:gate.checkedOut'));
            refetch();
          }}
        />
        <h3 className="pt-2 font-semibold text-text">{t('operations:gate.expected', { count: data.expected.length })}</h3>
        <ul className="space-y-2" data-testid="expected-list">
          {data.expected.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm">
              <span>
                <bdi className="font-medium text-text">{p.visitorName}</bdi> · <bdi dir="ltr" className="ltr-ref">{p.flat.code}</bdi>
                <span className="block text-xs text-muted">
                  {w.purpose(p.purpose)} · <When at={p.from} style="time" /> – <When at={p.to} style="time" />
                </span>
              </span>
              <PassBadge state={p.state} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CheckResult({ result: r }: { result: CheckInResult }) {
  const { t } = useT();
  const w = useOpsWords();
  if (r.ok)
    return (
      <section className="space-y-1 rounded-card border-2 border-success/60 bg-success-soft/50 p-5" role="status" data-testid="check-result" data-ok="true">
        <p className="flex items-center gap-2 text-lg font-bold text-success">
          <CheckCircle2 aria-hidden className="size-6" />
          {t('operations:gate.letIn')}
        </p>
        <p className="text-text">
          {t('operations:gate.letInLine', { name: r.pass.visitorName, flat: r.pass.flat.code, purpose: w.purpose(r.pass.purpose), host: r.pass.hostName })}
        </p>
        {r.pass.vehiclePlate && <p className="text-sm text-text">{t('operations:gate.vehicle')} <bdi dir="ltr">{r.pass.vehiclePlate}</bdi></p>}
      </section>
    );
  return (
    <section className="space-y-1 rounded-card border-2 border-error/60 bg-error-soft/50 p-5" role="alert" data-testid="check-result" data-ok="false" data-refusal={r.refusal}>
      <p className="flex items-center gap-2 text-lg font-bold text-error">
        <ShieldX aria-hidden className="size-6" />
        {t('operations:gate.doNotLetIn')}
      </p>
      <p className="text-text">{t(`operations:refusal.${r.refusal}`)}</p>
      <p className="text-sm text-text">{t(`operations:refusalHelp.${r.refusal}`)}</p>
      {r.pass && (
        <p className="text-xs text-muted">
          <bdi>{r.pass.visitorName}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.pass.flat.code}</bdi> · <When at={r.pass.from} /> – <When at={r.pass.to} />
        </p>
      )}
    </section>
  );
}

function WalkIn({ onAsked, liveQueue, flats }: { onAsked: () => void; liveQueue: boolean; flats: GateQueue['flats'] }) {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const setParams = useQueryParams();
  const ask = useApiMutation<GateRequest>();
  const [flatId, setFlatId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<GatePurpose>('guest');
  const [plate, setPlate] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (!liveQueue) return <InlineAlert tone="info" title={t('operations:gate.noLiveQueueTitle')}><p>{t('operations:gate.noLiveQueue')}</p></InlineAlert>;
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="walk-in" data-testid="walk-in">
      <h2 id="walk-in" className="text-lg font-semibold text-text">{t('operations:gate.withoutPass')}</h2>
      <p className="text-sm text-muted">{t('operations:gate.withoutPassHint')}</p>
      <FlatSelect siteId="" options={flats} value={flatId} onChange={setFlatId} label={t('operations:gate.flat')} testId="walk-in-flat" />
      <PlainTextField label={t('operations:gate.visitorName')} value={name} onChange={setName} testId="walk-in-name" />
      <SelectControl label={t('operations:gate.purpose')} value={purpose} onChange={(v) => setPurpose((v ?? 'guest') as GatePurpose)} options={GATE_PURPOSES.map((p) => ({ id: p, label: w.purpose(p) }))} testId="walk-in-purpose" />
      <PlainTextField label={t('operations:gate.plate')} value={plate} onChange={setPlate} dir="ltr" optional testId="walk-in-plate" />
      <Button
        variant="secondary"
        icon={Send}
        isPending={ask.isPending}
        isDisabled={!flatId || name.trim().length < 2}
        onPress={async () => {
          setError(null);
          try {
            const r = await ask.mutateAsync({ method: 'POST', path: '/ops/gate/requests', body: { flatId, visitorName: name, purpose, plate } });
            toast.success(t('operations:gate.asked', { count: r.askedCount }));
            setName('');
            setPlate('');
            onAsked();
            setParams({ tab: 'queue' });
          } catch (e) {
            setError(e);
          }
        }}
        data-testid="walk-in-ask"
      >
        {t('operations:gate.askResident')}
      </Button>
      {error ? <ProblemAlert error={error} /> : null}
    </section>
  );
}

function LiveQueue({ data, refetch }: { data: GateQueue; refetch: () => void }) {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const act = useApiMutation<unknown>();
  const [error, setError] = useState<unknown>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const run = async (path: string, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body: {} });
      toast.success(message);
      refetch();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="space-y-5" data-testid="live-queue">
      <Refreshed data={data} refetch={refetch} />
      {!data.liveQueue && <InlineAlert tone="info" title={t('operations:gate.noLiveQueueTitle')}><p>{t('operations:gate.noLiveQueue')}</p></InlineAlert>}
      <section className="space-y-3" aria-labelledby="waiting">
        <h2 id="waiting" className="text-lg font-semibold text-text">{t('operations:gate.waiting', { count: data.waiting.length })}</h2>
        {data.waiting.length === 0 ? (
          <p className="text-sm text-muted">{t('operations:gate.nobodyWaiting')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {data.waiting.map((r) => (
              <li key={r.id} className="space-y-2 rounded-card border-2 border-warning/50 bg-warning-soft/30 p-4" data-testid="queue-request" data-state={r.state}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-text"><bdi>{r.visitorName}</bdi> → <bdi dir="ltr" className="ltr-ref">{r.flat.code}</bdi></span>
                  <GateRequestBadge state={r.state} />
                </p>
                <p className="text-sm text-muted">
                  {w.purpose(r.purpose)} · {t('operations:gate.askedCount', { count: r.askedCount })} · {t('operations:gate.expiresAt')} <When at={r.expiresAt} style="time" />
                  {r.callRequested ? ` · ${t('operations:gate.callBack')}` : ''}
                </p>
                <Button variant="quiet" size="sm" isPending={act.isPending} onPress={() => void run(`/ops/gate/requests/${r.id}/withdraw`, t('operations:gate.withdrawn'))} data-testid="queue-withdraw">
                  {t('operations:gate.visitorLeft')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <DecidedRequests onAdmit={(id) => void run(`/ops/gate/requests/${id}/admit`, t('operations:gate.admitted'))} onTurnAway={(id) => void run(`/ops/gate/requests/${id}/turn-away`, t('operations:gate.turnedAway'))} pending={act.isPending} />
      {error ? <ProblemAlert error={error} /> : null}
      <p className="text-xs text-muted">{t('operations:gate.simulatedQueue')}</p>
    </div>
  );
}

/** Answers that came back from residents today: approved visitors are let in, denied ones turned away. */
function DecidedRequests({ onAdmit, onTurnAway, pending }: { onAdmit: (id: string) => void; onTurnAway: (id: string) => void; pending: boolean }) {
  const { t } = useT();
  const w = useOpsWords();
  const q = useApiQuery<{ items: GateRequest[] }>({ method: 'GET', path: '/ops/gate/requests' }, { refetchInterval: 15_000 });
  const items = (q.data?.items ?? []).filter((r) => r.state !== 'waiting').slice(0, 8);
  return (
    <section className="space-y-3" aria-labelledby="answered">
      <h2 id="answered" className="text-lg font-semibold text-text">{t('operations:gate.answeredTitle')}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('operations:gate.noneAnswered')}</p>
      ) : (
        <ul className="space-y-2" data-testid="answered-list">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm" data-testid="answered-row" data-state={r.state}>
              <span>
                <bdi className="font-medium text-text">{r.visitorName}</bdi> → <bdi dir="ltr" className="ltr-ref">{r.flat.code}</bdi>
                <span className="block text-xs text-muted">
                  {w.purpose(r.purpose)}
                  {r.decidedByName ? ` · ${t('operations:gate.decidedBy', { name: r.decidedByName })}` : ''}
                  {r.decidedAt ? <> · <When at={r.decidedAt} style="time" /></> : null}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <GateRequestBadge state={r.state} />
                {r.state === 'approved' && !r.history.some((h) => h.action === 'admitted') && (
                  <Button variant="primary" size="sm" icon={LogIn} isPending={pending} onPress={() => onAdmit(r.id)} data-testid="queue-admit">
                    {t('operations:gate.admit')}
                  </Button>
                )}
                {(r.state === 'denied' || r.state === 'expired') && !r.history.some((h) => h.action === 'turned_away') && (
                  <Button variant="secondary" size="sm" isPending={pending} onPress={() => onTurnAway(r.id)} data-testid="queue-turn-away">
                    {t('operations:gate.turnAway')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PassesPage() {
  const { t } = useT();
  const w = useOpsWords();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const [text, setText] = useState('');
  const states = ['all', 'active', 'scheduled', 'checked_in', 'checked_out', 'expired', 'cancelled'] as const;
  const filter = (states as readonly string[]).includes(status ?? '') ? status! : 'all';
  const q = useApiQuery<PassList>({ method: 'GET', path: '/ops/passes', query: { status: filter, ...(text.trim() ? { q: text.trim() } : {}) } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-5" data-testid="passes-page">
      <PageHeader title={t('operations:passes.title')} description={t('operations:passes.intro')} />
      <VisitorTabs current="passes" />
      <PlainTextField label={t('operations:passes.search')} value={text} onChange={setText} testId="pass-search" />
      <FilterPills label={t('operations:passes.status')} value={filter} onChange={(v) => setParams({ status: v === 'all' ? null : v })} testId="pass-status" options={states.map((s) => ({ id: s, label: s === 'all' ? t('operations:list.statuses.all') : t(`operations:passState.${s}`), ...(q.data ? { count: q.data.counts[s] } : {}) }))} />
      {q.isError ? (
        <ErrorState error={q.error} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('operations:passes.emptyTitle')} body={t('operations:passes.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="pass-list">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <Link href={OPS.pass(p.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-3 hover:bg-raised @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="pass-row" data-ref={p.ref} data-state={p.state}>
                <span className="min-w-0">
                  <bdi className="font-semibold text-text">{p.visitorName}</bdi>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{p.flat.code}</bdi> · {w.purpose(p.purpose)} · {t('operations:passes.host', { name: p.hostName })}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  <When at={p.from} /> – <When at={p.to} />
                </span>
                <PassBadge state={p.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PassDetailPage({ passId }: { passId: string }) {
  const { t } = useT();
  const w = useOpsWords();
  const toast = useToast();
  const q = useApiQuery<{ pass: GatePass; visits: GateVisit[]; canCancel: boolean; hostLivesThere: boolean }>({ method: 'GET', path: `/ops/passes/${passId}` });
  const cancel = useApiMutation<GatePass>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (q.isError) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading lines={8} />;
  const { pass: p, visits } = q.data;
  return (
    <div className="@container space-y-5" data-testid="pass-detail" data-state={p.state}>
      <PageHeader title={t('operations:passes.detailTitle', { name: p.visitorName })} breadcrumbs={[{ label: t('operations:passes.title'), href: OPS.passes() }, { label: p.ref }]} badge={<PassBadge state={p.state} testId="pass-state" />} />
      <VisitorTabs current="passes" />
      {!q.data.hostLivesThere && <InlineAlert tone="warning" title={t('operations:passes.hostLeftTitle')}><p>{t('operations:passes.hostLeft')}</p></InlineAlert>}
      <section className="space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <FactGrid testId="pass-facts">
          <Fact label={t('operations:visitors.code')}><bdi dir="ltr" className="ltr-ref text-lg font-bold tracking-widest">{p.code}</bdi></Fact>
          <Fact label={t('operations:passes.flat')}><Link href={`/backoffice/sites/${p.siteId}/units/${p.flat.id}?tab=services`}><bdi dir="ltr">{p.flat.code}</bdi></Link></Fact>
          <Fact label={t('operations:passes.hostLabel')}><bdi>{p.hostName}</bdi></Fact>
          <Fact label={t('operations:visitors.purpose')}>{w.purpose(p.purpose)}</Fact>
          <Fact label={t('operations:passes.window')}><When at={p.from} /> – <When at={p.to} /></Fact>
          <Fact label={t('operations:visitors.entries')}>{p.entries === 'single' ? t('operations:visitors.single') : t('operations:visitors.multiple')} · {t('operations:visitors.usedCount', { count: p.usedCount })}</Fact>
          {p.vehiclePlate && <Fact label={t('operations:visitors.plate')}><bdi dir="ltr">{p.vehiclePlate}</bdi></Fact>}
          {p.visitorPhone && <Fact label={t('operations:visitors.phone')}><bdi dir="ltr">{p.visitorPhone}</bdi></Fact>}
          {p.note && <Fact label={t('operations:visitors.note')}><bdi>{p.note}</bdi></Fact>}
        </FactGrid>
      </section>
      <section className="space-y-2" aria-labelledby="pass-visits">
        <h2 id="pass-visits" className="font-semibold text-text">{t('operations:passes.visits')}</h2>
        <VisitList items={visits} />
      </section>
      <section className="space-y-2" aria-labelledby="pass-history">
        <h2 id="pass-history" className="font-semibold text-text">{t('operations:passes.history')}</h2>
        <HistoryList testId="pass-history" label={t('operations:passes.history')} items={p.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`operations:passEvent.${h.action}` as 'operations:passEvent.created', { reason: h.values?.reason ? t(`operations:refusal.${h.values.reason}` as 'operations:refusal.expired') : '' }), ...(h.note ? { note: h.note } : {}) }))} />
      </section>
      {q.data.canCancel && (
        <section className="space-y-2 rounded-card border border-border/70 bg-panel p-4">
          <PlainTextField label={t('operations:passes.cancelReason')} value={reason} onChange={setReason} testId="pass-cancel-reason" />
          <Button
            variant="secondary"
            isPending={cancel.isPending}
            isDisabled={reason.trim().length < 5}
            onPress={async () => {
              setError(null);
              try {
                await cancel.mutateAsync({ method: 'POST', path: `/ops/passes/${p.id}/cancel`, body: { reason } });
                toast.success(t('operations:visitors.cancelled'));
                void q.refetch();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="pass-cancel"
          >
            {t('operations:passes.cancel')}
          </Button>
          {error ? <ProblemAlert error={error} /> : null}
        </section>
      )}
    </div>
  );
}

export function VisitHistoryPage() {
  const { t } = useT();
  const [outcome] = useQueryParam('outcome');
  const setParams = useQueryParams();
  const [text, setText] = useState('');
  const filter = outcome === 'inside' || outcome === 'left' || outcome === 'refused' ? outcome : 'all';
  const q = useApiQuery<{ items: GateVisit[]; counts: Record<'all' | 'inside' | 'left' | 'refused', number> }>({ method: 'GET', path: '/ops/visits', query: { outcome: filter, ...(text.trim() ? { q: text.trim() } : {}) } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-5" data-testid="visit-history">
      <PageHeader title={t('operations:history.title')} description={t('operations:history.intro')} />
      <VisitorTabs current="history" />
      <PlainTextField label={t('operations:history.search')} value={text} onChange={setText} testId="visit-search" />
      <FilterPills label={t('operations:history.outcome')} value={filter} onChange={(v) => setParams({ outcome: v === 'all' ? null : v })} testId="visit-outcome" options={(['all', 'inside', 'left', 'refused'] as const).map((s) => ({ id: s, label: s === 'all' ? t('operations:list.statuses.all') : t(`operations:visitOutcome.${s}`), ...(q.data ? { count: q.data.counts[s] } : {}) }))} />
      {q.isError ? <ErrorState error={q.error} /> : !q.data ? <Loading lines={8} /> : <VisitList items={q.data.items} />}
    </div>
  );
}

/**
 * VIS-006 scan a code. The prototype never opens a camera: the guard picks a demo code (as if scanned)
 * or types it, and the same check as the gate runs. Labelled as simulated.
 */
export function ScanPage() {
  const { t } = useT();
  const passes = useApiQuery<PassList>({ method: 'GET', path: '/ops/passes', query: { status: 'all' } });
  const check = useApiMutation<CheckInResult>();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const samples = (passes.data?.items ?? []).filter((p) => ['active', 'expired', 'checked_in', 'scheduled'].includes(p.state)).slice(0, 6);
  return (
    <div className="@container space-y-5" data-testid="scan-page">
      <PageHeader title={t('operations:scan.title')} description={t('operations:scan.intro')} />
      <VisitorTabs current="scan" />
      <InlineAlert tone="info" title={t('operations:scan.simulatedTitle')}>
        <p>{t('operations:scan.simulated')}</p>
      </InlineAlert>
      <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-2">
        <div className="grid aspect-square max-w-sm place-items-center rounded-card border-2 border-dashed border-border bg-sunken/50" aria-hidden>
          <ScanLine className="size-16 text-muted" />
        </div>
        <section className="space-y-3" aria-labelledby="scan-samples">
          <h2 id="scan-samples" className="font-semibold text-text">{t('operations:scan.samples')}</h2>
          <ul className="space-y-2">
            {samples.map((p) => (
              <li key={p.id}>
                <Button
                  variant="secondary"
                  icon={QrCode}
                  isPending={check.isPending}
                  className="w-full justify-start"
                  onPress={async () => {
                    setError(null);
                    try {
                      setResult(await check.mutateAsync({ method: 'POST', path: '/ops/gate/check-in', body: { code: p.code } }));
                      void passes.refetch();
                    } catch (e) {
                      setError(e);
                    }
                  }}
                  data-testid="scan-sample"
                >
                  {t('operations:scan.sample', { name: p.visitorName, flat: p.flat.code })}
                </Button>
              </li>
            ))}
          </ul>
          <Link href={OPS.gate()} className="text-sm">{t('operations:scan.typeInstead')}</Link>
        </section>
      </div>
      {result && <CheckResult result={result} />}
      {error ? <ProblemAlert error={error} /> : null}
    </div>
  );
}

