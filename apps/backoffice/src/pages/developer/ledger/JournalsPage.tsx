import { JOURNAL_FILTERS, type JournalFilter, type JournalsList, type JournalView } from '@repo/contracts';
import { Button, ConfirmDialog, Dialog, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, Link, NotFoundState, PageHeader, Panel, PlainCheckbox, PlainTextField, useApiQuery, useKeyedCreate, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { ArrowRightLeft, BadgeCheck, Ban, FilePlus2, PencilLine, Send, Stamp, Undo2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@repo/contracts';
import { Loading, ScrollRegion, useSocietyFormat } from '../../society/kit';
import { LinkButton, unbroken, useProblemToast } from '../../society/hr/hkit';
import { ACC, AccountRef, Blocked, DemoBadge, EntityBar, GL_POST, History, JournalBadge, LedgerNav, ProvisionalNotice, Ref, useAccountName, useEntityParam, WRAP, KEEP, Amount } from './lkit';

/**
 * ACC-003 Journal entries (PARTIAL, Gate E.7 Wave 1). The entity's journals by state, with search;
 * a journal opens in a drawer at its own address (`?record=`) with its lines, links to its reversal,
 * history and the next step the reader may take: submit (maker), approve or reject (someone else with
 * journal.approve), post (someone other than the maker), reverse (posted only, through ACC-005).
 * Nothing here is "paid" or "settled": a journal is proposed until it is posted.
 */
export default function JournalsPage() {
  const { t } = useT();
  const { allows } = useSession();
  const [entity, setEntity] = useEntityParam();
  const [filterRaw, setFilter] = useQueryParam('filter');
  const [record] = useQueryParam('record');
  const setParams = useQueryParams();
  const [term, setTerm] = useState('');
  const filter: JournalFilter = (JOURNAL_FILTERS as readonly string[]).includes(filterRaw ?? '') ? (filterRaw as JournalFilter) : 'all';
  const q = useApiQuery<JournalsList>({ method: 'GET', path: '/ledger/journals', query: { ...(entity ? { entity } : {}), filter, ...(term.trim() ? { q: term.trim() } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-journals">
      <PageHeader
        title={t('ledger:journals.title')}
        description={t('ledger:journals.intro')}
        actions={allows(GL_POST) && d.canCreate ? <LinkButton href={ACC.create(d.entity.id)} variant="primary" icon={FilePlus2} testId="journal-new">{t('ledger:journals.new')}</LinkButton> : undefined}
      />
      <LedgerNav current="journals" entity={entity} />
      <ProvisionalNotice screen="journals" />
      <EntityBar scope={d} onChange={setEntity} />
      <Panel title={t('ledger:journals.listTitle')}>
        <div className="space-y-4">
          <FilterPills label={t('ledger:journals.filterLabel')} options={JOURNAL_FILTERS.map((f) => ({ id: f, label: t(`ledger:journals.filter.${f}`), count: d.counts[f] }))} value={filter} onChange={(f) => setFilter(f)} testId="journal-filter" />
          <div className="max-w-md">
            <PlainTextField label={t('ledger:journals.search')} value={term} onChange={setTerm} testId="journal-search" />
          </div>
          {d.items.length === 0 ? (
            <EmptyState title={t('ledger:journals.empty')} body={t('ledger:journals.emptyHint')} />
          ) : (
            <ul className="divide-y divide-border/70" data-testid="journal-list">
              {d.items.map((j) => (
                <li key={j.id} data-testid="journal-row" data-ref={j.ref} data-state={j.state}>
                  <Link href={ACC.journals({ ...(entity ? { entity } : {}), ...(filter !== 'all' ? { filter } : {}), record: j.id })} variant="plain" className="flex flex-wrap items-start justify-between gap-2 rounded-control py-3 outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus">
                    <span className="min-w-0 space-y-1">
                      {/* The reference on its own line in a smaller size: whole at 320 px with 200 % text. */}
                      <span className="block text-xs font-semibold text-text">
                        <Ref value={j.ref} />
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <JournalBadge state={j.state} reversed={j.reversed} />
                        {j.demo && <DemoBadge />}
                      </span>
                      {j.kind === 'reversal' && <span className="block text-xs text-muted">{t('ledger:journal.reversalOf', { ref: unbroken(j.reversalOf?.ref ?? '') })}</span>}
                      <span className="block text-sm break-words text-text">{j.memo}</span>
                      <span className="block text-xs text-muted">
                        <JournalDate date={j.date} /> · {t('ledger:journal.maker', { name: j.makerName })}
                      </span>
                    </span>
                    <Amount value={j.total} className="font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      {record && <JournalDrawer id={record} onClose={() => setParams({ record: null })} />}
    </div>
  );
}

function JournalDate({ date }: { date: string }) {
  const fmt = useSocietyFormat();
  return <bdi>{fmt.date(date)}</bdi>;
}

/** The lines of a journal: a table where it fits, a list on phones and at large text sizes. */
export function JournalLines({ view, testId = 'journal-lines' }: { view: Pick<JournalView, 'lines' | 'totals'>; testId?: string }) {
  const { t } = useT();
  const name = useAccountName();
  return (
    <div data-testid={testId}>
      <ol className="space-y-2 @min-[48em]:hidden" aria-label={t('ledger:journal.lines')}>
        {view.lines.map((l) => (
          <li key={l.n} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="journal-line" data-account={l.accountCode}>
            <AccountRef code={l.accountCode} name={name(l)} href={ACC.account(l.accountId)} />
            <dl className="mt-1 grid grid-cols-1 gap-1">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">{t('ledger:journal.debit')}</dt>
                <dd>
                  <Amount value={l.debit} />
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">{t('ledger:journal.credit')}</dt>
                <dd>
                  <Amount value={l.credit} />
                </dd>
              </div>
            </dl>
            {(l.memo || l.costCentreLabelKey) && <LineNote memo={l.memo} cc={l.costCentreLabelKey} />}
          </li>
        ))}
        <li className="flex flex-wrap justify-between gap-2 rounded-tile bg-sunken p-3 text-sm font-semibold">
          <span>{t('ledger:journal.totals')}</span>
          <span>
            <Amount value={view.totals.debit} /> / <Amount value={view.totals.credit} />
          </span>
        </li>
      </ol>
      <div className="hidden @min-[48em]:block">
        <ScrollRegion label={t('ledger:journal.lines')}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('ledger:journal.account')}</th>
                <th scope="col" className="py-2 pe-3 text-end font-medium">{t('ledger:journal.debit')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t('ledger:journal.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => (
                <tr key={l.n} className="border-b border-border/60 align-top" data-testid="journal-line" data-account={l.accountCode}>
                  <td className="py-2 pe-3">
                    <AccountRef code={l.accountCode} name={name(l)} href={ACC.account(l.accountId)} />
                    {(l.memo || l.costCentreLabelKey) && <LineNote memo={l.memo} cc={l.costCentreLabelKey} />}
                  </td>
                  <td className="py-2 pe-3 text-end">
                    <Amount value={l.debit} />
                  </td>
                  <td className="py-2 text-end">
                    <Amount value={l.credit} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="py-2 pe-3 text-start">{t('ledger:journal.totals')}</th>
                <td className="py-2 pe-3 text-end">
                  <Amount value={view.totals.debit} />
                </td>
                <td className="py-2 text-end">
                  <Amount value={view.totals.credit} />
                </td>
              </tr>
            </tfoot>
          </table>
        </ScrollRegion>
      </div>
    </div>
  );
}

function LineNote({ memo, cc }: { memo?: string | undefined; cc?: string | undefined }) {
  const { t } = useT();
  const dt = dynamicT(t);
  return (
    <p className="mt-1 text-xs break-words text-muted">
      {memo}
      {memo && cc ? ' · ' : ''}
      {cc ? t('ledger:journal.costCentre', { name: dt(cc) }) : ''}
    </p>
  );
}

function JournalDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT();
  const q = useApiQuery<JournalView>({ method: 'GET', path: `/ledger/journals/${id}` });
  const notFound = q.error instanceof ApiError && q.error.problem.status === 404;
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={q.data ? t('ledger:journal.title', { ref: q.data.ref }) : t('ledger:journal.titlePlain')} size="lg" testId="journal-drawer">
      {notFound ? <NotFoundState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? <Loading lines={6} /> : <JournalDetail j={q.data} />}
    </Drawer>
  );
}

function JournalDetail({ j }: { j: JournalView }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <div className="@container space-y-5" data-testid="journal-detail" data-ref={j.ref} data-state={j.state} data-reversed={j.reversed}>
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <JournalBadge state={j.state} reversed={j.reversed} />
          {j.demo && <DemoBadge />}
          {!j.balanced && <span className="text-error">{t('ledger:journal.unbalanced')}</span>}
        </p>
        <p className="break-words font-medium">{j.memo}</p>
        <p className="text-muted">
          {t('ledger:journal.dated', { date: fmt.date(j.date), period: fmt.period(j.period) })} · {t(`ledger:periodState.${j.periodState}`)}
        </p>
        <p className="text-muted">
          {t('ledger:journal.maker', { name: j.makerName })}
          {j.approvedByName ? ` · ${t('ledger:journal.approver', { name: j.approvedByName })}` : ''}
          {j.postedByName ? ` · ${t('ledger:journal.poster', { name: j.postedByName })}` : ''}
          {j.rejectedByName ? ` · ${t('ledger:journal.rejecter', { name: j.rejectedByName })}` : ''}
        </p>
        {j.rejectReason && <p className="break-words text-muted">“{j.rejectReason}”</p>}
        {j.reversalOf && (
          <p data-testid="journal-reversal-of">
            {t('ledger:journal.reversesLabel')} <Link href={ACC.journal(j.reversalOf.id)}><Ref value={j.reversalOf.ref} /></Link>
          </p>
        )}
        {j.reversal && (
          <p data-testid="journal-reversal">
            {t(j.reversal.state === 'posted' ? 'ledger:journal.reversedByLabel' : 'ledger:journal.reversalPendingLabel')} <Link href={ACC.journal(j.reversal.id)}><Ref value={j.reversal.ref} /></Link>
          </p>
        )}
      </div>
      <JournalLines view={j} />
      <JournalActions j={j} />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('ledger:journal.historyTitle')}</summary>
        <div className="mt-2">
          <History events={j.history} testId="journal-history" />
        </div>
      </details>
    </div>
  );
}

type Step = 'submit' | 'approve' | 'post' | 'reject' | 'cancel';

function JournalActions({ j }: { j: JournalView }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  // One idempotency key per logical step (Issue #21): a second press replays it, never acts twice.
  const keyed = {
    submit: useKeyedCreate<JournalView>('jnl-submit'),
    approve: useKeyedCreate<JournalView>('jnl-approve'),
    post: useKeyedCreate<JournalView>('jnl-post'),
    reject: useKeyedCreate<JournalView>('jnl-reject'),
    cancel: useKeyedCreate<JournalView>('jnl-cancel'),
  };
  const pending = Object.values(keyed).some((k) => k.isPending);
  const [confirming, setConfirming] = useState<'approve' | 'post' | null>(null);
  const [ack, setAck] = useState(false);
  const [refusing, setRefusing] = useState<'reject' | 'cancel' | null>(null);
  const run = async (step: Step, body: Record<string, unknown> = {}) => {
    try {
      const v = await keyed[step].send({ method: 'POST', path: `/ledger/journals/${j.id}/${step}`, body });
      toast.success(t(`ledger:journal.done.${step}`, { ref: v.ref }));
      return true;
    } catch (e) {
      problem(e);
      return false;
    }
  };
  const a = j.actions;
  const any = Object.values(a).some(Boolean);
  return (
    <section aria-labelledby={`jnl-actions-${j.id}`} className="space-y-3" data-testid="journal-actions">
      <h3 id={`jnl-actions-${j.id}`} className="font-semibold">
        {t('ledger:journal.nextTitle')}
      </h3>
      {any ? (
        <div className="flex flex-wrap gap-2">
          {a.submit && (
            <Button className={WRAP} variant="primary" icon={Send} isPending={pending} onPress={() => void run('submit')} data-testid="journal-submit">
              {t('ledger:journal.submit')}
            </Button>
          )}
          {a.edit && <LinkButton href={ACC.edit(j.id)} icon={PencilLine} testId="journal-edit">{t('ledger:journal.edit')}</LinkButton>}
          {a.approve && (
            <Button className={WRAP} variant="primary" icon={BadgeCheck} onPress={() => setConfirming('approve')} data-testid="journal-approve">
              {t('ledger:journal.approve')}
            </Button>
          )}
          {a.reject && (
            <Button className={WRAP} variant="quiet" icon={XCircle} onPress={() => setRefusing('reject')} data-testid="journal-reject">
              {t('ledger:journal.reject')}
            </Button>
          )}
          {a.post && (
            <Button className={WRAP} variant="primary" icon={Stamp} onPress={() => setConfirming('post')} data-testid="journal-post">
              {t('ledger:journal.post')}
            </Button>
          )}
          {a.reverse && <LinkButton href={ACC.reverse(j.id)} icon={Undo2} testId="journal-reverse">{t('ledger:journal.reverse')}</LinkButton>}
          {a.cancel && (
            <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setRefusing('cancel')} data-testid="journal-cancel">
              {t('ledger:journal.cancel')}
            </Button>
          )}
        </div>
      ) : null}
      {j.blocked && <Blocked testId="journal-blocked">{t(`ledger:journal.blocked.${j.blocked}`)}</Blocked>}
      {!any && !j.blocked && <p className="text-sm text-muted">{t(j.state === 'posted' ? 'ledger:journal.postedFinal' : 'ledger:journal.nothingForYou')}</p>}
      {j.state === 'posted' && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ArrowRightLeft aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{t('ledger:journal.immutable')}</span>
        </p>
      )}
      <Dialog
        isOpen={!!confirming}
        onOpenChange={(o) => {
          if (!o) {
            setConfirming(null);
            setAck(false);
          }
        }}
        title={confirming ? t(`ledger:journal.confirm.${confirming}`, { ref: j.ref }) : ''}
        footer={
          <>
            <Button variant="quiet" onPress={() => setConfirming(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              className={WRAP}
              variant="primary"
              isDisabled={!ack}
              isPending={pending}
              onPress={async () => {
                if (confirming && (await run(confirming))) {
                  setConfirming(null);
                  setAck(false);
                }
              }}
              data-testid="journal-confirm"
            >
              {confirming ? t(`ledger:journal.${confirming}`) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{confirming ? t(`ledger:journal.effect.${confirming}`) : ''}</p>
          <p className="font-semibold">
            <Amount value={j.totals.debit} />
          </p>
          <PlainCheckbox isSelected={ack} onChange={setAck} testId="journal-ack">
            {t('ledger:journal.acknowledge')}
          </PlainCheckbox>
        </div>
      </Dialog>
      <ConfirmDialog
        isOpen={!!refusing}
        onOpenChange={(o) => !o && setRefusing(null)}
        title={refusing ? t(`ledger:journal.confirm.${refusing}`, { ref: j.ref }) : ''}
        effect={refusing ? t(`ledger:journal.effect.${refusing}`) : ''}
        confirmLabel={refusing ? t(`ledger:journal.${refusing}`) : ''}
        destructive
        {...(refusing === 'reject' ? { reasonLabel: t('ledger:journal.reason') } : {})}
        onConfirm={async (reason) => {
          if (!refusing) return;
          const ok = await run(refusing, refusing === 'reject' ? { reason } : {});
          if (ok) setRefusing(null);
          return ok;
        }}
      />
    </section>
  );
}
