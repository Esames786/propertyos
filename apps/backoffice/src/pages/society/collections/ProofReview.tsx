import { ApiError, type AllocationPreview, type MatchCandidate, type MatchReason, type PaymentDetail, type SubmissionDetail, type SubmissionQueue } from '@repo/contracts';
import {
  Badge,
  Breadcrumbs,
  Button,
  buttonClass,
  cn,
  ConfirmDialog,
  DateTime,
  Dialog,
  DirectionalIcon,
  ErrorState,
  InlineAlert,
  KeyValueList,
  Link,
  Money,
  Switch,
  PlainTextArea,
  useApiMutation,
  useApiQuery,
  useNavigation,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { emitTourEvent } from '@repo/ui/onboarding';
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Copy, FileQuestion, Hand, Landmark, Link2, Lock, ReceiptText, Repeat, ShieldAlert, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Radio, RadioGroup, Label as AriaLabel } from 'react-aria-components';
import { COLLECTIONS, SOCIETY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { AllocationTable, ProofPreview, SubmissionStateBadge, SubmissionStepper } from './ckit';

/** The choice "not on a statement yet": the proof waits for its bank line (nothing is settled). */
const AWAIT = 'await-bank';

/**
 * FIN-009 proof review and verification (Gate C.2 reference experience 2). Left: what the resident
 * sent (a stand-in for the image, the details, every version, the history). Right: the decision —
 * the statement lines that could be the transfer (with the reasons, whether they match fully, and
 * whether the money reached the association's account in force), what the money settles (oldest
 * first, only this payer's lines; editing needs a reason), then:
 * - verify against a fully matching line;
 * - ask for an exception (a partly matching line, approved by someone else);
 * - mark it checked and wait for the bank line (nothing is settled);
 * - ask for information, or reject.
 * The server decides every one of these rules.
 */
export default function ProofReview({ submissionId }: { submissionId: string }) {
  const query = useApiQuery<SubmissionDetail>({ method: 'GET', path: `/payment-submissions/${submissionId}` });
  const { can } = useSession();
  const mutation = useApiMutation<SubmissionDetail>();
  const started = useRef(false);
  // Opening a waiting proof marks it as being reviewed by this person (others see who).
  useEffect(() => {
    if (started.current || !query.data || query.data.submission.state !== 'submitted' || !can('finance.evidence.review')) return;
    started.current = true;
    void mutation.mutateAsync({ method: 'POST', path: `/payment-submissions/${submissionId}/review` }).catch(() => undefined);
  }, [query.data, can, mutation, submissionId]);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Loading lines={12} />;
  return <ReviewView key={`${query.data.submission.id}-${query.data.submission.versions.length}`} data={query.data} />;
}

function useNeighbours(currentId: string) {
  const queue = useApiQuery<SubmissionQueue>({ method: 'GET', path: '/payment-submissions', query: { state: 'to_review' } });
  const ids = (queue.data?.items ?? []).map((r) => r.id);
  const at = ids.indexOf(currentId);
  const next = ids.find((id, i) => id !== currentId && (at < 0 ? true : i > at)) ?? ids.find((id) => id !== currentId);
  const previous = at > 0 ? ids[at - 1] : undefined;
  return { next, previous, remaining: ids.filter((id) => id !== currentId).length };
}

function ReviewView({ data }: { data: SubmissionDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { submission: sub, actions } = data;
  const nav = useNeighbours(sub.id);
  const [paid, setPaid] = useState<PaymentDetail | null>(null);
  const titleId = useId();
  const decided = sub.state === 'verified' || sub.state === 'rejected' || sub.state === 'needs_information';

  return (
    <div className="@container space-y-6" data-testid="proof-review" data-state={sub.state} data-flat={sub.flats[0]}>
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: t('nav:pages.proofInbox'), href: COLLECTIONS.inbox() }, { label: sub.ref }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 id={titleId} className="text-2xl font-bold tracking-tight text-text sm:text-figure-sm">
              {t('collections:review.title', { name: sub.payerName })}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <bdi dir="ltr" className="ltr-ref">{sub.ref}</bdi>
              <span aria-hidden>·</span>
              <Link href={SOCIETY.account(sub.billingAccountId)}><bdi dir="ltr" className="ltr-ref">{sub.accountNo}</bdi></Link>
              <span aria-hidden>·</span>
              <bdi dir="ltr" className="ltr-ref">{sub.flats.join(', ')}</bdi>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SubmissionStateBadge state={sub.state} />
            {nav.previous && (
              <Link href={COLLECTIONS.review(nav.previous)} variant="plain" className={buttonClass('quiet', 'sm')} aria-label={t('collections:review.previous')} data-testid="review-previous">
                <DirectionalIcon icon={ArrowLeft} className="size-4" />
              </Link>
            )}
            {nav.next && (
              <Link href={COLLECTIONS.review(nav.next)} variant="plain" className={cn(buttonClass('secondary', 'sm'), 'gap-1.5')} data-testid="review-next">
                {t('collections:review.next', { count: nav.remaining })}
                <DirectionalIcon icon={ArrowRight} className="size-4" />
              </Link>
            )}
          </div>
        </div>
        <div className="rounded-card bg-panel p-4 shadow-card sm:p-5">
          <SubmissionStepper state={sub.state} versions={sub.versions.length} />
        </div>
      </div>

      {paid ? (
        <VerifiedBanner detail={paid} next={nav.next} />
      ) : sub.state === 'verified' ? (
        <InlineAlert tone="success" title={t('collections:review.alreadyVerified', { receipt: sub.receiptRef ?? '' })}>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {sub.paymentId && <Link href={COLLECTIONS.payment(sub.paymentId)}>{t('collections:review.openPayment', { ref: sub.paymentRef ?? '' })}</Link>}
          </p>
        </InlineAlert>
      ) : sub.state === 'rejected' ? (
        <InlineAlert tone="error" title={t('collections:review.rejectedTitle')}>
          <p><bdi>{sub.rejectionReason}</bdi></p>
        </InlineAlert>
      ) : sub.state === 'awaiting_bank_evidence' && sub.awaiting ? (
        <InlineAlert tone="info" title={t('collections:review.awaitingTitle', { name: sub.awaiting.byName })} data-testid="awaiting-banner">
          <p>{t('collections:review.awaitingBody')}</p>
          <p className="text-muted"><bdi>{t('billing:quote', { text: sub.awaiting.note })}</bdi></p>
        </InlineAlert>
      ) : sub.state === 'needs_information' ? (
        <InlineAlert tone="warning" title={t('collections:review.waitingTitle')}>
          <p><bdi>{sub.request}</bdi></p>
        </InlineAlert>
      ) : null}

      {data.possibleDuplicates.length > 0 && !decided && (
        <InlineAlert tone="warning" title={t('collections:review.duplicateTitle')} data-testid="duplicate-warning">
          <p>{t('collections:review.duplicateBody', { refs: data.possibleDuplicates.map((d) => `${d.ref} (${t(`collections:states.${d.state}`)})`).join(', ') })}</p>
        </InlineAlert>
      )}

      <div className="grid gap-6 @5xl:grid-cols-12">
        <section aria-label={t('collections:review.sentTitle')} className="min-w-0 space-y-5 @5xl:col-span-5">
          <div className="space-y-4 rounded-card bg-panel p-5 shadow-card">
            <h2 className="text-lg font-bold tracking-tight text-text">{t('collections:review.sentTitle')}</h2>
            <ProofPreview file={sub.current.file} amount={sub.current.amount.amount} reference={sub.current.bankReference} date={sub.current.transferDate} payer={sub.payerName} />
            <KeyValueList
              items={[
                { label: t('collections:review.claimed'), value: <Money value={sub.current.amount} className="font-semibold" /> },
                { label: t('collections:review.transferDate'), value: fmt.date(sub.current.transferDate) },
                { label: t('collections:review.reference'), value: <bdi dir="ltr" className="ltr-ref">{sub.current.bankReference}</bdi> },
                { label: t('collections:review.sentAt'), value: <DateTime value={sub.current.submittedAt} style="dateTime" /> },
                ...(sub.current.note ? [{ label: t('collections:review.note'), value: <bdi>{sub.current.note}</bdi> }] : []),
                { label: t('collections:review.payee'), value: data.beneficiary ? <span><bdi>{data.beneficiary.accountTitle}</bdi><bdi dir="ltr" className="ltr-ref block text-xs text-muted">{data.beneficiary.iban}</bdi></span> : '—' },
              ]}
            />
          </div>
          {sub.versions.length > 1 && (
            <div className="rounded-card bg-panel p-5 shadow-card" data-testid="proof-versions">
              <h2 className="text-base font-bold text-text">{t('collections:review.versionsTitle', { count: sub.versions.length })}</h2>
              <ol className="mt-3 space-y-2">
                {[...sub.versions].reverse().map((v) => (
                  <li key={v.n} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border px-3 py-2 text-sm">
                    <span>
                      {t('collections:review.version', { n: v.n })} · <bdi dir="ltr" className="ltr-ref">{v.file.name}</bdi>
                    </span>
                    <span className="text-xs text-muted"><DateTime value={v.submittedAt} style="dateTime" /></span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <History data={data} />
        </section>

        <section aria-label={t('collections:review.decideTitle')} className="min-w-0 @5xl:col-span-7">
          {sub.state === 'exception_pending' && sub.exception && !paid ? (
            <ExceptionCard data={data} onVerified={setPaid} />
          ) : actions.verify && !paid ? (
            <Decision data={data} onVerified={setPaid} />
          ) : (
            <div className="space-y-4 rounded-card bg-panel p-5 shadow-card">
              <h2 className="text-lg font-bold tracking-tight text-text">{t('collections:review.matchTitle')}</h2>
              <Candidates candidates={data.candidates} submissionId={sub.id} value={null} onChange={() => undefined} readOnly />
              {!actions.verify && actions.reason === 'permission_missing' && (
                <p className="text-sm text-muted" data-testid="review-read-only">{t('collections:review.readOnly')}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function History({ data }: { data: SubmissionDetail }) {
  const { t } = useT();
  return (
    <div className="rounded-card bg-panel p-5 shadow-card" data-testid="proof-history">
      <h2 className="text-base font-bold text-text">{t('collections:review.historyTitle')}</h2>
      <ol className="mt-3 space-y-3">
        {[...data.submission.history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`} className="flex gap-3 text-sm">
            <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-pill', h.action === 'verified' ? 'bg-success' : h.action === 'rejected' ? 'bg-error' : h.action === 'information_requested' ? 'bg-warning' : 'bg-border-control')} />
            <span className="min-w-0">
              <span className="block text-text">
                {t(`collections:history.${h.action}`, { name: h.byName })}
              </span>
              {h.note && <span className="block text-xs text-muted"><bdi>{t('billing:quote', { text: h.note })}</bdi></span>}
              <span className="block text-xs text-muted"><DateTime value={h.at} style="dateTime" /></span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Missing reasons as words ("reference, name"). */
function useMissing() {
  const { t } = useT();
  return (missing: readonly MatchReason[]) => missing.map((m) => t(`collections:review.field.${m}`)).join(', ');
}

/** A line this proof could be settled against now (the server checks again). */
const selectable = (c: MatchCandidate, submissionId: string) => c.destination === 'ok' && (!c.heldFor || c.heldFor.submissionId === submissionId);

/**
 * Statement lines that could be this payment, with the reasons. A line on another account or entity,
 * or held for another proof's exception, is shown (so it is understood) but cannot be chosen; a line
 * already settling a payment can be chosen and is refused with the reason.
 */
function Candidates({ candidates, submissionId, value, onChange, readOnly, allowAwait }: { candidates: MatchCandidate[]; submissionId: string; value: string | null; onChange: (id: string) => void; readOnly?: boolean; allowAwait?: boolean }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  if (readOnly) {
    return (
      <ul className="space-y-2" data-testid="match-candidates">
        {candidates.length === 0 && <li className="text-sm text-muted">{t('collections:review.noCandidates')}</li>}
        {candidates.map((c) => (
          <li key={c.bankLine.id} className="rounded-tile border-2 border-border" data-testid="match-candidate-read" data-txn={c.bankLine.bankTxnId}>
            <CandidateCard c={c} fmt={fmt} submissionId={submissionId} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <RadioGroup value={value} onChange={onChange} className="space-y-2" data-testid="match-choice">
      <AriaLabel className="sr-only">{t('collections:review.matchTitle')}</AriaLabel>
      {candidates.length === 0 && <p className="text-sm text-muted">{t('collections:review.noCandidates')}</p>}
      {candidates.map((c) => (
        <Radio
          key={c.bankLine.id}
          value={c.bankLine.id}
          isDisabled={!selectable(c, submissionId)}
          className="block cursor-pointer rounded-tile border-2 border-border bg-panel outline-none data-disabled:cursor-not-allowed data-disabled:bg-sunken/50 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-border-control data-selected:border-primary data-selected:bg-primary-soft/40"
          data-testid="match-candidate"
          data-txn={c.bankLine.bankTxnId}
          data-account={c.bankLine.beneficiaryId}
          data-strength={c.strength}
          data-destination={c.destination}
          data-taken={c.alreadyMatched ? 'true' : undefined}
        >
          <CandidateCard c={c} fmt={fmt} submissionId={submissionId} />
        </Radio>
      ))}
      {allowAwait && (
        <Radio value={AWAIT} className="block cursor-pointer rounded-tile border-2 border-dashed border-border bg-panel px-4 py-3 outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-selected:border-info data-selected:bg-info-soft/40" data-testid="match-await">
          <span className="flex items-start gap-3">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              <span className="block text-sm font-semibold text-text">{t('collections:review.awaitOption')}</span>
              <span className="block text-xs text-muted">{t('collections:review.awaitOptionBody')}</span>
            </span>
          </span>
        </Radio>
      )}
    </RadioGroup>
  );
}

function CandidateCard({ c, fmt, submissionId }: { c: MatchCandidate; fmt: ReturnType<typeof useSocietyFormat>; submissionId: string }) {
  const { t } = useT();
  const missing = useMissing();
  const line = c.bankLine;
  return (
    <span className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{line.counterpartyName}</bdi></span>
          <span className="block text-xs text-muted">
            <bdi dir="ltr" className="ltr-ref">{line.bankTxnId}</bdi> · {fmt.date(line.valueDate)} · <bdi dir="ltr" className="ltr-ref">{line.reference}</bdi>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Landmark aria-hidden className="size-3" />
            <bdi dir="ltr" className="ltr-ref">{line.accountIban}</bdi>
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <Money value={line.amount} className="text-base font-bold" />
          {c.destination === 'ok' && (
            <Badge tone={c.strength === 'full' ? 'success' : 'warning'} icon={c.strength === 'full' ? BadgeCheck : TriangleAlert} data-testid="candidate-strength">
              {t(c.strength === 'full' ? 'collections:review.strengthFull' : 'collections:review.strengthPartial')}
            </Badge>
          )}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {(['amount', 'date', 'reference', 'name'] as const).map((r) => (
          <Badge key={r} tone={c.reasons.includes(r) ? 'success' : 'neutral'} icon={c.reasons.includes(r) ? CheckCircle2 : XCircle}>
            {t(`collections:review.reason.${r}`)}
          </Badge>
        ))}
      </span>
      {c.destination !== 'ok' && (
        <span className="flex items-start gap-2 rounded-control bg-error-soft px-3 py-2 text-xs text-error" data-testid="candidate-wrong-destination">
          <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {c.destination === 'wrong_entity' ? t('collections:review.wrongEntity') : t('collections:review.wrongAccount', { iban: line.accountIban })}
        </span>
      )}
      {c.destination === 'ok' && c.strength === 'partial' && !c.alreadyMatched && (
        <span className="text-xs text-warning" data-testid="candidate-missing">{t('collections:review.missing', { list: missing(c.missing) })}</span>
      )}
      {c.heldFor && c.heldFor.submissionId !== submissionId && (
        <span className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-text" data-testid="candidate-held">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('collections:review.held', { ref: c.heldFor.submissionRef })}
        </span>
      )}
      {c.alreadyMatched && (
        <span className="flex items-start gap-2 rounded-control bg-error-soft px-3 py-2 text-xs text-error" data-testid="candidate-taken">
          <Copy aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('collections:review.taken', { payment: c.alreadyMatched.paymentRef })}
        </span>
      )}
      {c.sharesReferenceWith && !c.alreadyMatched && (
        <span className="flex items-start gap-2 rounded-control bg-info-soft px-3 py-2 text-xs text-info" data-testid="candidate-shared-ref">
          <Repeat aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('collections:review.sharedRef', { count: c.sharesReferenceWith.length })}
        </span>
      )}
    </span>
  );
}

type Edits = Record<string, string>;

function Decision({ data, onVerified }: { data: SubmissionDetail; onVerified: (p: PaymentDetail) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const missingWords = useMissing();
  const { navigate } = useNavigation();
  const sub = data.submission;
  // Only a full match on the right account is proposed; anything else is the reviewer's choice.
  const best = data.candidates.find((c) => !c.alreadyMatched && selectable(c, sub.id) && c.strength === 'full');
  const [choice, setChoice] = useState<string | null>(best?.bankLine.id ?? null);
  const candidate = data.candidates.find((c) => c.bankLine.id === choice);
  const line = candidate?.bankLine;
  const waiting = choice === AWAIT;
  const partial = !!candidate && candidate.strength === 'partial' && !candidate.alreadyMatched;
  const amount = line ? line.amount.amount : sub.current.amount.amount;
  const [awaitNote, setAwaitNote] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [preview, setPreview] = useState<AllocationPreview>(data.allocation);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<null | 'info' | 'reject'>(null);
  const previewMutation = useApiMutation<AllocationPreview>();
  const verify = useApiMutation<PaymentDetail>();
  const decide = useApiMutation<SubmissionDetail>();

  // The allocation follows the amount received (and any edit), checked by the server.
  const editedList = useMemo(() => (editing ? data.openLines.map((l) => ({ lineId: l.lineId, amount: edits[l.lineId] ?? '0' })) : undefined), [editing, edits, data.openLines]);
  useEffect(() => {
    const id = setTimeout(() => {
      previewMutation
        .mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/allocation`, body: { amount, ...(editedList ? { allocations: editedList, overrideReason: 'preview' } : {}) } })
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e: unknown) => setPreviewError(e));
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, editedList, sub.id]);

  const startEditing = () => {
    setEdits(Object.fromEntries(data.openLines.map((l) => [l.lineId, preview.lines.find((p) => p.lineId === l.lineId)?.amount.amount ?? '0'])));
    setEditing(true);
  };

  const allocationOk = !previewError && (!editing || overrideReason.trim().length >= 5 || !preview.edited);
  const canVerify = !!line && !partial && allocationOk;
  const canAskException = !!line && partial && exceptionReason.trim().length >= 20 && allocationOk;
  const canWait = waiting && awaitNote.trim().length >= 10;
  const allocationBody = editing && preview.edited ? { allocations: editedList, overrideReason } : {};

  const submit = async () => {
    setError(null);
    try {
      const result = await verify.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/verify`, body: { amount, bankLineId: line!.id, ...allocationBody } });
      toast.success(t('collections:review.verifiedToast', { receipt: result.receipt.ref }));
      emitTourEvent('collections.proof.verified');
      onVerified(result);
    } catch (e) {
      setError(e);
    }
  };

  const askException = async () => {
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/exception`, body: { bankLineId: line!.id, reason: exceptionReason.trim(), ...allocationBody } });
      toast.success(t('collections:review.exceptionToast'));
    } catch (e) {
      setError(e);
    }
  };

  const wait = async () => {
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/await-bank`, body: { note: awaitNote.trim() } });
      toast.success(t('collections:review.awaitToast'));
    } catch (e) {
      setError(e);
    }
  };

  const act = async (kind: 'info' | 'reject', text?: string) => {
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/${kind === 'info' ? 'request-information' : 'reject'}`, body: kind === 'info' ? { message: text } : { reason: text } });
      toast.success(t(kind === 'info' ? 'collections:review.infoToast' : 'collections:review.rejectToast'));
      setDialog(null);
      navigate(COLLECTIONS.inbox());
    } catch (e) {
      setError(e);
      throw e;
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-tour-id="review-match">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text">{t('collections:review.matchTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('collections:review.matchBody')}</p>
        </div>
        <Candidates candidates={data.candidates} submissionId={sub.id} value={choice} onChange={setChoice} allowAwait={data.actions.awaitBank} />
        {waiting && (
          <div className="rounded-tile border border-info/40 bg-info-soft/30 p-4">
            <PlainTextArea label={t('collections:review.awaitNote')} description={t('collections:review.awaitNoteHelp')} value={awaitNote} onChange={setAwaitNote} testId="await-note" />
          </div>
        )}
        {line && !partial && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-text" data-testid="received-amount">
            <Link2 aria-hidden className="size-4 text-success" />
            {t('collections:review.receivedFromBank', { amount: fmt.money(line.amount), txn: line.bankTxnId })}
          </p>
        )}
        {partial && (
          <div className="space-y-3 rounded-tile border border-warning/50 bg-warning-soft/30 p-4" data-testid="exception-form">
            <p className="flex items-start gap-2 text-sm font-semibold text-text">
              <Hand aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {t('collections:review.exceptionTitle')}
            </p>
            <p className="text-sm text-text">{t('collections:review.exceptionBody', { list: missingWords(candidate!.missing) })}</p>
            {line!.amount.amount !== sub.current.amount.amount && <Badge tone="warning" icon={TriangleAlert}>{t('collections:review.differsFromClaim', { claim: fmt.money(sub.current.amount) })}</Badge>}
            <PlainTextArea label={t('collections:review.exceptionReason')} description={t('collections:review.exceptionReasonHelp')} value={exceptionReason} onChange={setExceptionReason} testId="exception-reason" />
          </div>
        )}
      </div>

      {!waiting && (
        <div className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-tour-id="review-allocation">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-text">{t('collections:review.allocationTitle')}</h2>
              <p className="mt-0.5 text-sm text-muted">{t('collections:review.allocationBody', { payer: sub.payerName })}</p>
            </div>
            <Switch isSelected={editing} onChange={(on) => (on ? startEditing() : setEditing(false))} label={t('collections:review.editAllocation')} testId="allocation-edit" />
          </div>
          {previewError ? <ProblemAlert error={previewError} /> : null}
          <AllocationTable
            lines={editing ? data.openLines.map((l) => ({ ...l, amount: { amount: edits[l.lineId] ?? '0', currency: 'PKR' as const } })) : preview.lines}
            unapplied={preview.unapplied}
            label={t('collections:review.allocationTitle')}
            {...(editing
              ? {
                  edit: (l) => (
                    <input
                      aria-label={t('collections:review.allocationFor', { invoice: l.invoiceRef, flat: l.unitCode })}
                      inputMode="decimal"
                      dir="ltr"
                      value={edits[l.lineId] ?? ''}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                      className="ltr-input w-28 rounded-control border border-border-control bg-panel px-2 py-1.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus"
                      data-testid={`allocation-input-${l.unitCode}-${l.kind}`}
                    />
                  ),
                }
              : {})}
          />
          {editing && preview.edited && (
            <PlainTextArea label={t('collections:review.overrideReason')} description={t('collections:review.overrideHelp')} value={overrideReason} onChange={setOverrideReason} testId="override-reason" />
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
            {t('collections:review.allocationRule')}
          </p>
        </div>
      )}

      {error ? <ProblemAlert error={error} /> : null}
      {error instanceof ApiError && error.problem.code === 'bank_line_already_matched' && (
        <p className="text-sm text-text" data-testid="already-matched-help">{t('collections:review.alreadyMatchedHelp')}</p>
      )}

      <div className="flex flex-col gap-3 rounded-card border border-primary/25 bg-primary-soft/30 p-4 @lg:flex-row @lg:items-center @lg:justify-between" data-tour-id="review-actions">
        <p className="text-sm text-text">
          {waiting
            ? t('collections:review.awaitOptionBody')
            : !line
              ? t('collections:review.chooseFull')
              : t('collections:review.verifySummary', { amount: fmt.money({ amount, currency: 'PKR' }), unapplied: fmt.money(preview.unapplied) })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={FileQuestion} onPress={() => setDialog('info')} data-testid="review-request-info">
            {t('collections:review.requestInfo')}
          </Button>
          <Button variant="danger" icon={XCircle} onPress={() => setDialog('reject')} data-testid="review-reject">
            {t('collections:review.reject')}
          </Button>
          {waiting ? (
            <Button variant="primary" icon={CalendarClock} isDisabled={!canWait} isPending={decide.isPending} onPress={() => void wait()} data-testid="review-await">
              {t('collections:review.awaitSubmit')}
            </Button>
          ) : partial ? (
            <Button variant="primary" icon={Hand} isDisabled={!canAskException} isPending={decide.isPending} onPress={() => void askException()} data-testid="review-exception">
              {t('collections:review.exceptionSubmit')}
            </Button>
          ) : (
            <Button variant="primary" icon={BadgeCheck} isDisabled={!canVerify} isPending={verify.isPending} onPress={() => void submit()} data-testid="review-verify">
              {t('collections:review.verify')}
            </Button>
          )}
        </div>
      </div>

      <MessageDialog isOpen={dialog === 'info'} onOpenChange={(o) => !o && setDialog(null)} title={t('collections:review.infoTitle')} label={t('collections:review.infoLabel')} help={t('collections:review.infoHelp')} confirm={t('collections:review.infoSend')} defaultText={t('collections:review.infoSuggestion')} onConfirm={(text) => act('info', text)} testId="info-dialog" />
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('collections:review.rejectTitle')}
        effect={t('collections:review.rejectEffect')}
        confirmLabel={t('collections:review.rejectConfirm')}
        destructive
        reasonLabel={t('collections:review.rejectReason')}
        onConfirm={(reason) => act('reject', reason)}
      />
    </div>
  );
}

/**
 * An exception waiting for a second person: the partly matching line, what it does not match, the
 * requester's reason and what it would settle. Only someone else holding the approval may decide.
 */
function ExceptionCard({ data, onVerified }: { data: SubmissionDetail; onVerified: (p: PaymentDetail) => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const missingWords = useMissing();
  const sub = data.submission;
  const exception = sub.exception!;
  const candidate = data.candidates.find((c) => c.bankLine.id === exception.bankLineId);
  const approve = useApiMutation<PaymentDetail>();
  const reject = useApiMutation<SubmissionDetail>();
  const previewMutation = useApiMutation<AllocationPreview>();
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!candidate) return;
    previewMutation
      .mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/allocation`, body: { amount: candidate.bankLine.amount.amount, ...(exception.allocations ? { allocations: exception.allocations, overrideReason: exception.overrideReason ?? 'preview' } : {}) } })
      .then(setPreview)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id, candidate?.bankLine.id]);
  const decideApprove = async () => {
    setError(null);
    try {
      const result = await approve.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/exception/approve` });
      toast.success(t('collections:review.exceptionApprovedToast', { receipt: result.receipt.ref }));
      onVerified(result);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="space-y-5 rounded-card border-2 border-warning/40 bg-panel p-5 shadow-card" data-testid="exception-card">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-text">
          <Hand aria-hidden className="size-5 text-warning" />
          {t('collections:review.exceptionPendingTitle')}
        </h2>
        <p className="text-sm text-text">{t('collections:review.exceptionPendingBody', { name: exception.requestedByName, txn: exception.bankTxnId, list: missingWords(exception.missing) })}</p>
        <p className="text-sm text-muted"><bdi>{t('billing:quote', { text: exception.reason })}</bdi></p>
      </div>
      {candidate && (
        <div className="rounded-tile border-2 border-border">
          <CandidateCard c={candidate} fmt={fmt} submissionId={sub.id} />
        </div>
      )}
      {preview && <AllocationTable lines={preview.lines} unapplied={preview.unapplied} label={t('collections:review.allocationTitle')} />}
      {error ? <ProblemAlert error={error} /> : null}
      {data.actions.decideException ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger" icon={XCircle} onPress={() => setRejecting(true)} data-testid="review-exception-reject">
            {t('collections:review.exceptionReject')}
          </Button>
          <Button variant="primary" icon={BadgeCheck} isPending={approve.isPending} onPress={() => void decideApprove()} data-testid="review-exception-approve">
            {t('collections:review.exceptionApprove')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted" data-testid="exception-waiting">
          {data.actions.reason === 'maker_checker_required' ? t('collections:review.exceptionYours') : t('collections:review.exceptionWaiting')}
        </p>
      )}
      <ConfirmDialog
        isOpen={rejecting}
        onOpenChange={setRejecting}
        title={t('collections:review.exceptionRejectTitle')}
        effect={t('collections:review.exceptionRejectEffect')}
        confirmLabel={t('collections:review.exceptionReject')}
        destructive
        reasonLabel={t('collections:review.exceptionRejectReason')}
        onConfirm={async (note) => {
          setError(null);
          try {
            await reject.mutateAsync({ method: 'POST', path: `/payment-submissions/${sub.id}/exception/reject`, body: { note } });
            toast.success(t('collections:review.exceptionRejectedToast'));
          } catch (e) {
            setError(e);
          }
        }}
      />
    </div>
  );
}

function MessageDialog({ isOpen, onOpenChange, title, label, help, confirm, defaultText, onConfirm, testId }: { isOpen: boolean; onOpenChange: (o: boolean) => void; title: string; label: string; help: string; confirm: string; defaultText: string; onConfirm: (text: string) => Promise<void>; testId: string }) {
  const { t } = useT();
  const [text, setText] = useState(defaultText);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="quiet" onPress={() => onOpenChange(false)}>{t('common:actions.cancel')}</Button>
          <Button
            variant="primary"
            isPending={busy}
            isDisabled={text.trim().length < 10}
            onPress={() => {
              setBusy(true);
              void onConfirm(text.trim()).catch(() => undefined).finally(() => setBusy(false));
            }}
            data-testid={`${testId}-confirm`}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div data-testid={testId}>
        <PlainTextArea label={label} description={help} value={text} onChange={setText} testId={`${testId}-text`} />
      </div>
    </Dialog>
  );
}

function VerifiedBanner({ detail, next }: { detail: PaymentDetail; next?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const p = detail.payment;
  return (
    <section aria-label={t('collections:review.verifiedTitle')} className="space-y-3 rounded-card border border-success/30 bg-success-soft/50 p-5 motion-safe:animate-rise-in" data-testid="verified-banner" role="status">
      <p className="flex items-center gap-2 text-lg font-bold text-success">
        <CheckCircle2 aria-hidden className="size-5" />
        {t('collections:review.verifiedTitle')}
      </p>
      <p className="text-sm text-text">
        {t('collections:review.verifiedBody', { amount: fmt.money(p.amount), receipt: detail.receipt.ref, balance: fmt.money(detail.accountBalance) })}
      </p>
      {Number(p.unapplied.amount) > 0 && <p className="text-sm text-text">{t('collections:review.verifiedCredit', { amount: fmt.money(p.unapplied) })}</p>}
      <div className="flex flex-wrap gap-2">
        <Link href={COLLECTIONS.payment(p.id)} variant="plain" className={cn(buttonClass('secondary'), 'gap-2')} data-testid="open-payment">
          <ReceiptText aria-hidden className="size-4" />
          {t('collections:review.openPayment', { ref: p.ref })}
        </Link>
        <Link href={COLLECTIONS.statement(p.billingAccountId)} variant="plain" className={buttonClass('secondary')}>
          {t('collections:review.openStatement')}
        </Link>
        {next ? (
          <Link href={COLLECTIONS.review(next)} variant="plain" className={cn(buttonClass('primary'), 'gap-2')} data-testid="verified-next">
            {t('collections:review.nextProof')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        ) : (
          <Link href={COLLECTIONS.inbox()} variant="plain" className={buttonClass('primary')}>
            {t('collections:review.backToInbox')}
          </Link>
        )}
      </div>
    </section>
  );
}
