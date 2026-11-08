import { ApiError, type JournalsList, type JournalView } from '@repo/contracts';
import { Button, EmptyState, ErrorState, Link, Money, NotFoundState, PageHeader, Panel, PlainTextArea, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useT, useToast } from '@repo/ui';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert, useSocietyFormat } from '../../society/kit';
import { DateInput, fieldErrorKey, useFieldError } from '../../society/hr/hkit';
import { JournalLines } from './JournalsPage';
import { ACC, Blocked, EntityBar, JournalBadge, LedgerNav, ProvisionalNotice, Ref, useEntityParam, WRAP } from './lkit';

/**
 * ACC-005 Reverse journal (PARTIAL, Gate E.7 Wave 1). A posted journal is never edited: the correction
 * is a reversal journal with every line on the other side, dated in an open period on or after the
 * original, linked both ways. The reversal is itself approved and posted by someone other than the
 * person who asked for it; until then the original reads "reversal pending". `?record=` names the
 * journal; without one the entity's posted journals that can still be reversed are offered.
 */
export default function ReverseJournalPage() {
  const [record] = useQueryParam('record');
  return record ? <ReverseOne id={record} /> : <ChooseJournal />;
}

function ChooseJournal() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<JournalsList>({ method: 'GET', path: '/ledger/journals', query: { ...(entity ? { entity } : {}), filter: 'posted' } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const items = q.data.items.filter((j) => j.kind === 'manual' && !j.reversal);
  return (
    <div className="@container space-y-5" data-testid="reverse-choose">
      <PageHeader title={t('ledger:reverse.title')} description={t('ledger:reverse.intro')} />
      <LedgerNav current={null} entity={entity} />
      <ProvisionalNotice screen="reverse" />
      <EntityBar scope={q.data} onChange={setEntity} />
      <Panel title={t('ledger:reverse.chooseTitle')}>
        {items.length === 0 ? (
          <EmptyState title={t('ledger:reverse.none')} />
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid="reverse-candidate" data-ref={j.ref}>
                <span className="min-w-0 text-sm">
                  <Link href={ACC.reverse(j.id)}>
                    <Ref value={j.ref} />
                  </Link>{' '}
                  · <bdi>{fmt.date(j.date)}</bdi>
                  <span className="block break-words text-muted">{j.memo}</span>
                </span>
                <Money value={j.total} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReverseOne({ id }: { id: string }) {
  const { t } = useT();
  const q = useApiQuery<JournalView>({ method: 'GET', path: `/ledger/journals/${id}` });
  if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const j = q.data;
  return (
    <div className="@container space-y-5" data-testid="reverse-journal" data-ref={j.ref}>
      <PageHeader title={t('ledger:reverse.titleOf', { ref: j.ref })} description={t('ledger:reverse.intro')} />
      <LedgerNav current={null} entity={j.entity.id} />
      <ProvisionalNotice screen="reverse" />
      <Panel title={t('ledger:reverse.originalTitle')}>
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={ACC.journal(j.id)}>
              <Ref value={j.ref} />
            </Link>
            <JournalBadge state={j.state} reversed={j.reversed} />
          </p>
          <p className="text-sm break-words">{j.memo}</p>
          <JournalLines view={j} testId="reverse-original-lines" />
        </div>
      </Panel>
      {j.actions.reverse ? (
        <ReverseForm j={j} />
      ) : (
        <Panel title={t('ledger:reverse.formTitle')}>
          <Blocked testId="reverse-blocked">{t(j.reversal ? 'ledger:reverse.blocked.reversed' : j.kind === 'reversal' ? 'ledger:reverse.blocked.reversal' : j.state !== 'posted' ? 'ledger:reverse.blocked.notPosted' : 'ledger:reverse.blocked.permission')}</Blocked>
          {j.reversal && (
            <p className="mt-2 text-sm">
              <Link href={ACC.journal(j.reversal.id)}>
                <Ref value={j.reversal.ref} />
              </Link>
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function ReverseForm({ j }: { j: JournalView }) {
  const { t } = useT();
  const toast = useToast();
  const { navigate } = useNavigation();
  const [date, setDate] = useState(j.today >= j.date ? j.today : j.date);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const reverse = useKeyedCreate<JournalView>('jnl-reverse');
  const fieldError = useFieldError(error);
  const preview = { lines: j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })), totals: { debit: j.totals.credit, credit: j.totals.debit } };
  return (
    <Panel title={t('ledger:reverse.formTitle')}>
      <div className="space-y-4" data-testid="reverse-form">
        {error ? <ProblemAlert error={error} /> : null}
        <p className="text-sm">{t('ledger:reverse.previewIntro')}</p>
        <JournalLines view={preview} testId="reverse-preview-lines" />
        <DateInput id="reverse-date" label={t('ledger:reverse.date')} value={date} onChange={setDate} min={j.date} max={j.today} testId="reverse-date" description={fieldError('date') ?? t('ledger:reverse.dateHint')} />
        <PlainTextArea label={t('ledger:reverse.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(error, 'reason')} testId="reverse-reason" />
        <p className="text-xs text-muted">{t('ledger:reverse.effect')}</p>
        <Button
          className={WRAP}
          variant="primary"
          icon={Undo2}
          isPending={reverse.isPending}
          isDisabled={reason.trim().length < 3}
          disabledReason={t('ledger:reverse.reasonNeeded')}
          onPress={async () => {
            setError(null);
            try {
              const r = await reverse.send({ method: 'POST', path: `/ledger/journals/${j.id}/reverse`, body: { date, reason } });
              toast.success(t('ledger:reverse.requested', { ref: r.ref, original: j.ref }));
              navigate(ACC.journal(r.id));
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="reverse-submit"
        >
          {t('ledger:reverse.submit')}
        </Button>
      </div>
    </Panel>
  );
}
