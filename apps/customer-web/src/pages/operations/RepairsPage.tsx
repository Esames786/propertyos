import { CONTACT_PREFERENCES, ENTRY_PERMISSIONS, FLAT_ROOMS, REQUEST_URGENCIES, type OpsFile, type RequestCategory, type RequestState, type ResidentRequest, type ResidentRequests } from '@repo/contracts';
import { Button, cn, DirectionalIcon, EmptyState, InlineAlert, Link, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, Stepper, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast, type StepperStep } from '@repo/ui';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, Hammer, MessageSquarePlus, Plus, RotateCcw, Send, Star, XCircle } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DEMO_TODAY, PhotoField, PhotoStrip, ResidentStateChip, Sheet, useWords } from './rkit';
import { NotAvailable, ProblemText } from './ProblemText';

/**
 * PORTAL-018 repairs (Gate D.2 reference experience 1, resident end). A resident reports a problem in
 * their flat (what, where, how urgent, a photo, how to reach them), sees who is coming and when, and
 * says whether it was fixed: confirming closes it, "Not fixed" sends it back to the same technician.
 * Problems in shared places are community issues (PORTAL-034), not repairs.
 */
const CATEGORIES: RequestCategory[] = ['plumbing', 'electrical', 'carpentry', 'civil', 'pest_control', 'cleaning', 'other'];
/** The booked visit is news only while the job is still open; once fixed, the completion card says what happened. */
const VISIT_AHEAD: readonly RequestState[] = ['assigned', 'in_progress', 'on_hold'];

export default function RepairsPage() {
  const { t } = useT();
  const [record] = useQueryParam('record');
  const [isNew] = useQueryParam('new');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentRequests>({ method: 'GET', path: '/portal/requests' });
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:repairs.title')} />;
  const d = q.data;
  const awaiting = d.items.filter((r) => r.canConfirm);
  const open = d.items.filter((r) => !r.canConfirm && !['closed', 'cancelled'].includes(r.state));
  const done = d.items.filter((r) => ['closed', 'cancelled'].includes(r.state));
  const current = record ? d.items.find((r) => r.id === record) : undefined;
  return (
    <div className="@container space-y-6" data-testid="repairs-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">
          {t('operations:repairs.title')}
        </h1>
        <p className="text-sm text-muted">{t('operations:repairs.intro')}</p>
        {d.canRaiseFor.length > 0 ? (
          <Button variant="primary" size="lg" icon={Plus} onPress={() => setParams({ new: '1', record: null })} className="w-full justify-center whitespace-normal text-center sm:w-auto" data-testid="repair-new">
            {t('operations:repairs.new')}
          </Button>
        ) : (
          <p className="text-sm text-muted" data-testid="repair-cannot">{t('operations:repairs.cannotRaise')}</p>
        )}
        <p className="text-sm text-muted">
          {t('operations:repairs.sharedPlace')}{' '}
          <Link href={OPS.issues} data-testid="repairs-to-issues">
            {t('operations:repairs.reportIssue')}
          </Link>
        </p>
      </header>

      {awaiting.length > 0 && (
        <section className="space-y-3" aria-labelledby="repairs-awaiting" data-testid="repairs-awaiting">
          <h2 id="repairs-awaiting" className="text-lg font-bold text-text">{t('operations:repairs.needsYou')}</h2>
          {awaiting.map((r) => (
            <RepairCard key={r.id} request={r} highlight onOpen={() => setParams({ record: r.id, new: null })} />
          ))}
        </section>
      )}
      <section className="space-y-3" aria-labelledby="repairs-open" data-testid="repairs-open">
        <h2 id="repairs-open" className="text-lg font-bold text-text">{t('operations:repairs.open')}</h2>
        {open.length === 0 ? <EmptyState title={t('operations:repairs.emptyTitle')} body={t('operations:repairs.emptyBody')} /> : open.map((r) => <RepairCard key={r.id} request={r} onOpen={() => setParams({ record: r.id, new: null })} />)}
      </section>
      {done.length > 0 && (
        <section className="space-y-3" aria-labelledby="repairs-done" data-testid="repairs-done">
          <h2 id="repairs-done" className="text-lg font-bold text-text">{t('operations:repairs.done')}</h2>
          {done.map((r) => (
            <RepairCard key={r.id} request={r} onOpen={() => setParams({ record: r.id, new: null })} />
          ))}
        </section>
      )}
      <NewRepairSheet isOpen={isNew === '1'} data={d} onClose={() => setParams({ new: null })} onCreated={(id) => { setParams({ new: null, record: id }); void q.refetch(); }} />
      <RepairSheet request={current ?? null} notFound={!!record && !current} onClose={() => setParams({ record: null })} onChanged={() => void q.refetch()} />
    </div>
  );
}

/** Reported → accepted → technician booked → fixed → confirmed (or what stopped it). */
export function RepairSteps({ request: r }: { request: ResidentRequest }) {
  const { t } = useT();
  const at: Record<string, number> = { submitted: 0, triaged: 1, assigned: 2, in_progress: 2, on_hold: 2, completed: 3, closed: 4, cancelled: -1 };
  const i = at[r.state] ?? 0;
  const steps: StepperStep[] = ['reported', 'accepted', 'booked', 'fixed', 'confirmed'].map((id, n) => ({
    id,
    label: n === 2 && r.state === 'on_hold' ? t('operations:repairs.steps.waiting') : t(`operations:repairs.steps.${id}` as 'operations:repairs.steps.reported'),
    state: r.state === 'cancelled' ? (n === 0 ? 'done' : 'upcoming') : n < i || (n === i && r.state === 'closed') ? 'done' : n === i ? (r.state === 'on_hold' ? 'waiting' : 'current') : 'upcoming',
  }));
  return <Stepper steps={steps} label={t('operations:repairs.steps.label')} testId="repair-steps" />;
}

function RepairCard({ request: r, highlight, onOpen }: { request: ResidentRequest; highlight?: boolean; onOpen: () => void }) {
  const { t } = useT();
  const w = useWords();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('block w-full space-y-3 rounded-card border bg-panel p-4 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus', highlight ? 'border-success/50 bg-success-soft/30' : 'border-border')}
      data-testid="repair-card"
      data-ref={r.ref}
      data-state={r.state}
    >
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-[1_1_10em]">
          <span className="block font-semibold text-text break-words"><bdi>{r.title}</bdi></span>
          <span className="block text-xs text-muted">
            <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.flatCode}</bdi>
            {r.room ? ` · ${w.room(r.room)}` : ''} · {w.category(r.category)}
          </span>
        </span>
        <ResidentStateChip state={r.state} />
      </span>
      <RepairSteps request={r} />
      {r.visit && VISIT_AHEAD.includes(r.state) && (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-text" data-testid="repair-visit">
          <CalendarClock aria-hidden className="size-4 text-muted" />
          {r.visit.on ? t('operations:repairs.visitOn', { name: r.visit.technicianName, date: fmt.date(r.visit.on), slot: r.visit.slot ? w.slot(r.visit.slot) : '' }) : t('operations:repairs.visitBooked', { name: r.visit.technicianName })}
        </span>
      )}
      {highlight && (
        <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 aria-hidden className="size-4" />
          {t('operations:repairs.confirmPrompt')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </span>
      )}
      {!highlight && (
        <span className="flex items-center justify-end text-sm text-primary">
          {t('operations:repairs.open1')}
          <DirectionalIcon icon={ChevronRight} className="size-4" />
        </span>
      )}
    </button>
  );
}

function NewRepairSheet({ isOpen, data, onClose, onCreated }: { isOpen: boolean; data: ResidentRequests; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const create = useApiMutation<ResidentRequest>();
  const flats = data.flats.filter((f) => data.canRaiseFor.includes(f.id));
  const [flatId, setFlatId] = useState<string | null>(flats[0]?.id ?? null);
  const [room, setRoom] = useState<string>('kitchen');
  const [category, setCategory] = useState<RequestCategory>('plumbing');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<string>('normal');
  const [files, setFiles] = useState<Array<Omit<OpsFile, 'id'>>>([]);
  const [preference, setPreference] = useState<string>('app');
  const [entry, setEntry] = useState<string>('when_home');
  const [error, setError] = useState<unknown>(null);
  const [key, setKey] = useState(() => `rep-${Date.now().toString(36)}`);
  const reset = () => {
    setTitle('');
    setDescription('');
    setFiles([]);
    setError(null);
    setKey(`rep-${Date.now().toString(36)}`);
  };
  const ready = !!flatId && title.trim().length >= 5 && description.trim().length >= 10 && files.every((f) => f.alt.trim().length >= 3);
  return (
    <Sheet
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('operations:repairs.newTitle')}
      subtitle={t('operations:repairs.newSubtitle')}
      testId="repair-new-sheet"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          className="w-full justify-center"
          isPending={create.isPending}
          isDisabled={!ready}
          onPress={async () => {
            setError(null);
            try {
              const r = await create.mutateAsync({ method: 'POST', path: '/portal/requests', body: { flatId, room, category, title, description, urgency, files, contact: { preference, entry }, idempotencyKey: key } });
              toast.success(t('operations:repairs.created', { ref: r.ref }));
              reset();
              onCreated(r.id);
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="repair-submit"
        >
          {t('operations:repairs.submit')}
        </Button>
      }
    >
      <div className="space-y-5">
        {flats.length > 1 && <SelectControl label={t('operations:repairs.flat')} value={flatId} onChange={setFlatId} options={flats.map((f) => ({ id: f.id, label: f.code }))} testId="repair-flat" />}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text">{t('operations:repairs.what')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('operations:repairs.what')}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={cn('min-h-11 rounded-pill border px-4 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus', category === c ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-panel text-text hover:bg-raised')} data-testid={`repair-category-${c}`}>
                {w.category(c)}
              </button>
            ))}
          </div>
        </fieldset>
        <SelectControl label={t('operations:repairs.where')} value={room} onChange={(v) => setRoom(v ?? 'kitchen')} options={FLAT_ROOMS.map((r) => ({ id: r, label: w.room(r) }))} testId="repair-room" />
        <PlainTextField label={t('operations:repairs.titleField')} description={t('operations:repairs.titleHint')} value={title} onChange={setTitle} testId="repair-title" />
        <PlainTextArea label={t('operations:repairs.describe')} description={t('operations:repairs.describeHint')} value={description} onChange={setDescription} testId="repair-description" />
        <SegmentedControl label={t('operations:repairs.urgency')} value={urgency} onChange={setUrgency} options={REQUEST_URGENCIES.map((u) => ({ id: u, label: w.urgency(u) }))} testId="repair-urgency" wrap />
        {urgency === 'emergency' && (
          <InlineAlert tone="warning" title={t('operations:repairs.emergencyTitle')}>
            <p>{t('operations:repairs.emergencyBody')}</p>
          </InlineAlert>
        )}
        <PhotoField label={t('operations:repairs.photos')} files={files} onChange={setFiles} testId="repair-photos" />
        <SelectControl label={t('operations:repairs.contact')} value={preference} onChange={(v) => setPreference(v ?? 'app')} options={CONTACT_PREFERENCES.map((c) => ({ id: c, label: t(`operations:contact.${c}`) }))} testId="repair-contact" />
        <SelectControl label={t('operations:repairs.entry')} value={entry} onChange={(v) => setEntry(v ?? 'when_home')} options={ENTRY_PERMISSIONS.map((e) => ({ id: e, label: t(`operations:entry.${e}`) }))} testId="repair-entry" />
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Sheet>
  );
}

function RepairSheet({ request: r, notFound, onClose, onChanged }: { request: ResidentRequest | null; notFound: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const act = useApiMutation<ResidentRequest>();
  const [mode, setMode] = useState<'view' | 'reopen'>('view');
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      onChanged();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  return (
    <Sheet isOpen={!!r || notFound} onClose={() => { setMode('view'); onClose(); }} title={r ? r.title : t('operations:repairs.notFoundTitle')} subtitle={r ? <ResidentStateChip state={r.state} /> : undefined} testId="repair-sheet">
      {!r ? (
        <p className="text-sm text-text" data-testid="repair-not-found">{t('operations:repairs.notFound')}</p>
      ) : (
        <div className="space-y-5" data-testid="repair-detail" data-state={r.state}>
          <p className="text-xs text-muted">
            <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.flatCode}</bdi>
            {r.room ? ` · ${w.room(r.room)}` : ''} · {w.category(r.category)} · {t('operations:repairs.reportedOn', { date: fmt.instant(r.createdAt) })}
          </p>
          <RepairSteps request={r} />
          <p className="text-text [overflow-wrap:anywhere]"><bdi>{r.description}</bdi></p>
          <PhotoStrip files={r.files} />
          {r.visit && VISIT_AHEAD.includes(r.state) && (
            <p className="flex items-start gap-2 rounded-tile bg-sunken/50 p-3 text-sm text-text" data-testid="repair-visit-detail">
              <Hammer aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {r.visit.on ? t('operations:repairs.visitOn', { name: r.visit.technicianName, date: fmt.date(r.visit.on), slot: r.visit.slot ? w.slot(r.visit.slot) : '' }) : t('operations:repairs.visitBooked', { name: r.visit.technicianName })}
            </p>
          )}
          {r.completion && (
            <section className="space-y-2 rounded-card border border-success/40 bg-success-soft/30 p-4" data-testid="repair-completion">
              <h3 className="font-semibold text-text">{t('operations:repairs.fixedOn', { date: fmt.instant(r.completion.at) })}</h3>
              <p className="text-sm text-text"><bdi>{r.completion.note}</bdi></p>
              <PhotoStrip files={r.completion.files} />
            </section>
          )}
          {r.canConfirm && mode === 'view' && (
            <section className="space-y-3 rounded-card border-2 border-primary/30 p-4" data-testid="repair-confirm">
              <h3 className="font-semibold text-text">{t('operations:repairs.confirmQuestion')}</h3>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('operations:repairs.rating')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('operations:repairs.stars', { count: n })} onClick={() => setRating(n)} className="grid size-11 place-items-center rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-focus" data-testid={`rating-${n}`}>
                    <Star aria-hidden className={cn('size-6', n <= rating ? 'fill-accent text-accent' : 'text-muted')} />
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="primary" size="lg" icon={CheckCircle2} isPending={act.isPending} onPress={() => void run(`/portal/requests/${r.id}/confirm`, rating ? { rating } : {}, t('operations:repairs.confirmed'))} className="justify-center" data-testid="repair-confirm-yes">
                  {t('operations:repairs.yesFixed')}
                </Button>
                <Button variant="secondary" size="lg" icon={RotateCcw} onPress={() => setMode('reopen')} className="justify-center" data-testid="repair-confirm-no">
                  {t('operations:repairs.notFixed')}
                </Button>
              </div>
            </section>
          )}
          {mode === 'reopen' && (
            <section className="space-y-3 rounded-card border border-warning/50 p-4" data-testid="repair-reopen">
              <PlainTextArea label={t('operations:repairs.whatsWrong')} description={t('operations:repairs.whatsWrongHint')} value={reason} onChange={setReason} testId="repair-reopen-reason" />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={RotateCcw} isPending={act.isPending} isDisabled={reason.trim().length < 10} onPress={async () => (await run(`/portal/requests/${r.id}/reopen`, { reason }, t('operations:repairs.reopened'))) && setMode('view')} data-testid="repair-reopen-submit">
                  {t('operations:repairs.sendBack')}
                </Button>
                <Button variant="quiet" onPress={() => setMode('view')}>{t('common:actions.cancel')}</Button>
              </div>
            </section>
          )}
          {r.comments.length > 0 && (
            <section className="space-y-2" aria-labelledby="repair-messages">
              <h3 id="repair-messages" className="font-semibold text-text">{t('operations:repairs.messages')}</h3>
              <ol className="space-y-2" data-testid="repair-comments">
                {r.comments.map((c) => (
                  <li key={c.id} className="rounded-tile border border-border p-3 text-sm">
                    <p className="text-xs text-muted">{c.byKind === 'resident' ? t('operations:repairs.you') : c.byKind === 'technician' ? c.byName : t('operations:repairs.office')} · {fmt.instantTime(c.at)}</p>
                    <p className="text-text [overflow-wrap:anywhere]"><bdi>{c.text}</bdi></p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {r.canComment && (
            <div className="space-y-2">
              <PlainTextArea label={t('operations:repairs.addMessage')} value={comment} onChange={setComment} testId="repair-comment" />
              <Button variant="secondary" icon={MessageSquarePlus} isPending={act.isPending} isDisabled={comment.trim().length < 2} onPress={async () => (await run(`/portal/requests/${r.id}/comments`, { text: comment }, t('operations:repairs.messageSent'))) && setComment('')} data-testid="repair-comment-send">
                {t('operations:repairs.send')}
              </Button>
            </div>
          )}
          {r.canCancel && (
            <Button variant="quiet" icon={XCircle} isPending={act.isPending} onPress={() => void run(`/portal/requests/${r.id}/cancel`, {}, t('operations:repairs.cancelled'))} data-testid="repair-cancel">
              {t('operations:repairs.cancel')}
            </Button>
          )}
          {error ? <ProblemText error={error} /> : null}
          <ol className="space-y-1 border-s border-border ps-4 text-xs text-muted" aria-label={t('operations:repairs.history')} data-testid="repair-timeline">
            {r.timeline.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {t(`operations:residentEvent.${h.action}` as 'operations:residentEvent.submitted')} · {fmt.instantTime(h.at)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Sheet>
  );
}

