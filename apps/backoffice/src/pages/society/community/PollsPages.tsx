import { ApiError, type AudienceRole, type ChatAudience, type PollOffice, type PollResults, type PollsOffice, type PollState } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, DirectionalIcon, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, IconButton, InlineAlert, Link, PageHeader, PlainCheckbox, PlainTextField, SelectControl, useApiMutation, useApiQuery, useNavigation, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ArrowLeft, BadgeCheck, CircleDashed, CircleDot, Lock, Pencil, Plus, Send, ShieldOff, Trash2, Undo2, Vote } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { Fact, FactGrid, HistoryList, WRAP } from '../finance/fkit';
import { When } from '../operations/okit';
import { AudiencePicker } from './ChatSettingsPage';

/**
 * CMTY-002 polls and surveys, CMTY-004 a poll's detail and results. Informal only (D-30): every
 * screen says it is not a formal vote under the bylaws. The office chooses the audience (from verified
 * links), one answer per person or per flat, anonymous or named, and the last day. While a poll is
 * open the office sees turnout only (no running tally); after it closes, the totals (and for a named
 * poll who answered what); residents see results once published, and only within D-47's thresholds.
 */
const VIEWS = ['open', 'draft', 'closed'] as const;
const STATE: Record<PollState, ['info' | 'neutral' | 'success' | 'warning', typeof CircleDot]> = { draft: ['neutral', CircleDashed], open: ['info', CircleDot], closed: ['warning', Lock], published: ['success', BadgeCheck], withdrawn: ['neutral', Undo2] };

export function PollStateBadge({ state }: { state: PollState }) {
  const { t } = useT();
  const [tone, icon] = STATE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="poll-state" data-state={state}>
      {t(`community:pollState.${state}`)}
    </Badge>
  );
}

export function PollsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const [creating, setCreating] = useState(false);
  const view = (VIEWS as readonly string[]).includes(status ?? '') ? (status as (typeof VIEWS)[number]) : 'open';
  const q = useApiQuery<PollsOffice>({ method: 'GET', path: '/ops/community/polls', query: { status: view } }, { placeholderData: (prev) => prev });
  const counts = q.data?.counts;
  return (
    <div className="@container space-y-5" data-testid="polls-office">
      <PageHeader
        title={t('community:polls.title')}
        description={t('community:polls.intro')}
        actions={
          <Button variant="primary" icon={Plus} onPress={() => setCreating(true)} className={WRAP} data-testid="poll-new">
            {t('community:polls.new')}
          </Button>
        }
      />
      <InlineAlert tone="info" data-testid="polls-informal-office">
        {t('community:poll.informal')}
      </InlineAlert>
      <FilterPills
        label={t('community:polls.show')}
        value={view}
        onChange={(v) => setParams({ status: v === 'open' ? null : v })}
        testId="polls-view"
        options={VIEWS.map((v) => ({ id: v, label: t(`community:polls.view.${v}`), ...(counts ? { count: v === 'closed' ? counts.closed + counts.published + counts.withdrawn : counts[v] } : {}) }))}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={5} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t(`community:polls.empty.${view}`)} />
      ) : (
        <ul className="space-y-2" data-testid="poll-rows">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <Link href={COMMUNITY.poll(p.id)} variant="plain" className="grid w-full gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="poll-row" data-state={p.state}>
                <span className="min-w-0">
                  <span className="block font-semibold break-words text-text">
                    <bdi>{p.title}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr">{p.ref}</bdi> · {t('community:polls.closesOn', { date: fmt.date(p.closesOn) })}
                  </span>
                </span>
                <span className="text-xs text-muted">{t('community:polls.turnout', { count: p.responses, eligible: p.eligible })}</span>
                <PollStateBadge state={p.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.data && <PollEditor open={creating} onClose={() => setCreating(false)} blocks={q.data.blocks} />}
    </div>
  );
}

interface Draft {
  title: string;
  question: string;
  options: string[];
  audience: ChatAudience;
  unit: 'person' | 'flat';
  anonymous: boolean;
  closesOn: string;
}

const blank = (): Draft => ({ title: '', question: '', options: ['', ''], audience: { scope: 'site', ids: [], roles: ['owner', 'occupant'] as AudienceRole[] }, unit: 'flat', anonymous: true, closesOn: '' });

function PollEditor({ open, onClose, blocks, poll }: { open: boolean; onClose: () => void; blocks: Array<{ id: string; code: string }>; poll?: PollOffice }) {
  const { t } = useT();
  const toast = useToast();
  const { navigate } = useNavigation();
  const initial = (): Draft => (poll ? { title: poll.title, question: poll.question, options: poll.options.map((o) => o.label), audience: { scope: poll.audience.scope, ids: poll.audience.ids, roles: poll.audience.roles }, unit: poll.unit, anonymous: poll.anonymous, closesOn: poll.closesOn } : blank());
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<PollOffice>();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const close = () => {
    setD(initial());
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={poll ? t('community:polls.edit') : t('community:polls.new')}
      subtitle={t('community:polls.draftNote')}
      size="lg"
      testId="poll-editor"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                const body = { ...d, options: d.options.map((o) => o.trim()).filter(Boolean) };
                const saved = await save.mutateAsync(poll ? { method: 'PATCH', path: `/ops/community/polls/${poll.id}`, body } : { method: 'POST', path: '/ops/community/polls', body });
                toast.success(t('community:polls.savedDraft'));
                close();
                if (!poll) navigate(COMMUNITY.poll(saved.id));
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="poll-save"
          >
            {t('community:polls.saveDraft')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <PlainTextField label={t('community:polls.fieldTitle')} value={d.title} onChange={(v) => set({ title: v })} testId="poll-title" />
        <PlainTextField label={t('community:polls.fieldQuestion')} value={d.question} onChange={(v) => set({ question: v })} testId="poll-question" />
        <fieldset className="space-y-2" data-testid="poll-options">
          <legend className="text-sm font-semibold text-text">{t('community:polls.options')}</legend>
          {d.options.map((o, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <PlainTextField label={t('community:polls.option', { n: i + 1 })} value={o} onChange={(v) => set({ options: d.options.map((x, j) => (j === i ? v : x)) })} testId={`poll-option-${i}`} />
              </div>
              {d.options.length > 2 && (
                <IconButton icon={Trash2} label={t('community:polls.removeOption', { n: i + 1 })} onPress={() => set({ options: d.options.filter((_, j) => j !== i) })} />
              )}
            </div>
          ))}
          {d.options.length < 6 && (
            <Button size="sm" variant="quiet" icon={Plus} onPress={() => set({ options: [...d.options, ''] })} data-testid="poll-add-option">
              {t('community:polls.addOption')}
            </Button>
          )}
        </fieldset>
        <AudiencePicker value={d.audience} onChange={(a) => set({ audience: a })} blocks={blocks} testId="poll-audience" />
        <SelectControl
          label={t('community:polls.unit')}
          value={d.unit}
          onChange={(v) => set({ unit: (v ?? 'flat') as Draft['unit'] })}
          options={[
            { id: 'flat', label: t('community:polls.unitFlat') },
            { id: 'person', label: t('community:polls.unitPerson') },
          ]}
          testId="poll-unit"
        />
        <PlainCheckbox isSelected={d.anonymous} onChange={(v) => set({ anonymous: v })} testId="poll-anonymous">
          {t('community:polls.anonymousLabel')}
        </PlainCheckbox>
        <p className="-mt-3 text-xs text-muted">{t(d.anonymous ? 'community:poll.anonymousLong' : 'community:polls.namedHint')}</p>
        <div className="space-y-1">
          <label htmlFor="poll-closes" className="block text-sm font-medium text-text">
            {t('community:polls.closesLabel')}
          </label>
          <input id="poll-closes" type="date" value={d.closesOn} onChange={(e) => set({ closesOn: e.currentTarget.value })} className="block min-h-11 w-full max-w-xs rounded-control border border-border-control bg-bg px-3 text-text" data-testid="poll-closes" />
          <p className="text-xs text-muted">{t('community:polls.closesHint')}</p>
        </div>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

export function PollDetailPage({ pollId }: { pollId: string }) {
  const { t } = useT();
  const toast = useToast();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const q = useApiQuery<PollOffice>({ method: 'GET', path: `/ops/community/polls/${pollId}` });
  const blocks = useApiQuery<PollsOffice>({ method: 'GET', path: '/ops/community/polls', query: { status: 'draft' } });
  const act = useApiMutation<PollOffice>();
  const [editing, setEditing] = useState(false);
  const [acting, setActing] = useState<'open' | 'close' | 'publish' | 'withdraw' | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const p = q.data;
  return (
    <div className="@container space-y-5" data-testid="poll-detail" data-state={p.state}>
      <Link href={COMMUNITY.polls()} className="inline-flex min-h-11 items-center gap-1.5 text-sm" data-testid="poll-back">
        <DirectionalIcon icon={ArrowLeft} className="size-4" />
        {t('community:polls.title')}
      </Link>
      <PageHeader title={p.title} description={p.question} badge={<PollStateBadge state={p.state} />} />
      <InlineAlert tone="info">
        {t('community:poll.informal')}
      </InlineAlert>
      <div className="flex flex-wrap gap-2">
        {p.actions.edit && (
          <Button icon={Pencil} onPress={() => setEditing(true)} className={WRAP} data-testid="poll-edit">
            {t('community:polls.edit')}
          </Button>
        )}
        {p.actions.open && (
          <Button variant="primary" icon={Send} onPress={() => setActing('open')} className={WRAP} data-testid="poll-open">
            {t('community:polls.open')}
          </Button>
        )}
        {p.actions.close && (
          <Button icon={Lock} onPress={() => setActing('close')} className={WRAP} data-testid="poll-close">
            {t('community:polls.close')}
          </Button>
        )}
        {p.actions.publish && (
          <Button variant="primary" icon={BadgeCheck} onPress={() => setActing('publish')} className={WRAP} data-testid="poll-publish">
            {t('community:polls.publish')}
          </Button>
        )}
        {p.actions.withdraw && (
          <Button variant="danger" icon={Undo2} onPress={() => setActing('withdraw')} className={WRAP} data-testid="poll-withdraw">
            {t('community:polls.withdraw')}
          </Button>
        )}
      </div>
      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
          <FactGrid testId="poll-facts">
            <Fact label={t('community:polls.ref')}>
              <bdi dir="ltr">{p.ref}</bdi>
            </Fact>
            <Fact label={t('community:polls.audience')}>{t('community:office.customAudience', { place: p.audience.label || t('community:office.wholeSite'), roles: p.audience.roles.map((r) => t(`community:role.${r}`)).join(', ') })}</Fact>
            <Fact label={t('community:polls.unit')}>{t(p.unit === 'flat' ? 'community:polls.unitFlat' : 'community:polls.unitPerson')}</Fact>
            <Fact label={t('community:polls.privacy')}>{t(p.anonymous ? 'community:polls.anonymousYes' : 'community:polls.anonymousNo')}</Fact>
            <Fact label={t('community:polls.closesLabel')}>{fmt.date(p.closesOn)}</Fact>
            <Fact label={t('community:polls.turnoutLabel')}>
              <span data-testid="poll-turnout">{t('community:polls.turnout', { count: p.responses, eligible: p.eligible })}</span>
            </Fact>
            <Fact label={t('community:polls.createdBy')}>
              <bdi>{p.createdByName}</bdi> · <When at={p.createdAt} style="date" />
            </Fact>
            {p.withdrawnReason && (
              <Fact label={t('community:polls.withdrawnReason')}>
                <bdi>{p.withdrawnReason}</bdi>
              </Fact>
            )}
          </FactGrid>
          <section className="space-y-2">
            <h2 className="font-semibold text-text">{t('community:polls.options')}</h2>
            <ul className="list-disc space-y-1 ps-5 text-sm text-text">
              {p.options.map((o) => (
                <li key={o.id} className="break-words">
                  <bdi>{o.label}</bdi>
                </li>
              ))}
            </ul>
          </section>
        </section>
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" data-testid="poll-results-office">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
            <Vote aria-hidden className="size-5 text-primary" />
            {t('community:polls.results')}
          </h2>
          {!p.totals ? (
            <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="poll-no-tally">
              <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t(p.state === 'withdrawn' ? 'community:polls.withdrawnNoResults' : 'community:polls.noTally')}
            </p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-text">{t('community:polls.totals')}</h3>
              <ul className="space-y-1 text-sm" data-testid="poll-totals">
                {p.totals.map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-x-3">
                    <bdi className="min-w-0 break-words">{o.label}</bdi>
                    <span className="text-muted">{t('community:polls.answers', { count: o.count })}</span>
                  </li>
                ))}
              </ul>
              {p.respondents && (
                <details className="text-sm" data-testid="poll-respondents">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('community:polls.respondents', { count: p.respondents.length })}</summary>
                  <ul className="space-y-1">
                    {p.respondents.map((r, i) => (
                      <li key={i} className="break-words">
                        <bdi>{r.name}</bdi> (<bdi dir="ltr">{r.flat}</bdi>): <bdi>{p.options.find((o) => o.id === r.optionId)?.label}</bdi>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <h3 className="text-sm font-semibold text-text">{t('community:polls.residentsSee')}</h3>
              {p.published ? <PublishedResults results={p.published} options={p.options} /> : <p className="text-sm text-muted">{t('community:polls.notPublished')}</p>}
            </>
          )}
        </section>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold text-text">{t('community:office.history')}</h2>
        <HistoryList label={t('community:office.history')} items={p.history.map((h) => ({ at: h.at, byName: h.byName || t('community:polls.automatic'), label: dt(`community:polls.event.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} testId="poll-history" />
      </section>
      {blocks.data && <PollEditor key={`${p.id}-${editing}`} open={editing} onClose={() => setEditing(false)} blocks={blocks.data.blocks} poll={p} />}
      <ConfirmDialog
        isOpen={!!acting}
        onOpenChange={(o) => !o && setActing(null)}
        title={acting ? t(`community:polls.confirm.${acting}.title`) : ''}
        effect={acting ? t(`community:polls.confirm.${acting}.effect`, { count: p.eligible }) : ''}
        confirmLabel={acting ? t(`community:polls.${acting}`) : ''}
        destructive={acting === 'withdraw'}
        {...(acting === 'withdraw' ? { reasonLabel: t('community:polls.withdrawReason') } : {})}
        onConfirm={async (reason) => {
          if (!acting) return;
          try {
            await act.mutateAsync({ method: 'POST', path: `/ops/community/polls/${p.id}/${acting}`, body: reason ? { reason } : {} });
            toast.success(t(`community:polls.done.${acting}`));
            setActing(null);
          } catch (e) {
            const fields = e instanceof ApiError ? Object.values(e.problem.errors ?? {}).flat() : [];
            toast.error(e instanceof ApiError ? (fields[0] ? dt(fields[0].code, fields[0].params) : dt(e.problem.messageKey)) : t('errors:network.unavailable'));
          }
        }}
      />
    </div>
  );
}

function PublishedResults({ results, options }: { results: PollResults; options: Array<{ id: string; label: string }> }) {
  const { t } = useT();
  if (!results.shown)
    return (
      <p className="text-sm text-muted" data-testid="poll-published" data-shown="false">
        {t(`community:poll.hidden.${results.reason}`)}
      </p>
    );
  return (
    <div className="space-y-1 text-sm" data-testid="poll-published" data-shown="true">
      <p className="text-muted">{t('community:poll.total', { count: results.total })}</p>
      <ul className="space-y-1">
        {results.options.map((o) => (
          <li key={o.id} className="flex flex-wrap justify-between gap-x-3">
            <bdi className="min-w-0 break-words">{options.find((x) => x.id === o.id)?.label ?? o.label}</bdi>
            <span className="text-muted">{t('community:polls.answers', { count: o.count })}</span>
          </li>
        ))}
      </ul>
      {results.blocks.length > 0 && <p className="text-muted">{t('community:polls.blocksShown', { blocks: results.blocks.map((b) => b.code).join(', ') })}</p>}
    </div>
  );
}
