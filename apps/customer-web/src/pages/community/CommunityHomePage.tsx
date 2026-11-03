import { PROVIDER_CATEGORIES, type CommunityHome, type CommunityTab, type PollResident, type ResidentStaffOnDuty, type PollResults, type ProviderCategory, type ResourceResident, type ServiceDirectoryResident, type ServiceProviderResident } from '@repo/contracts';
import { Badge, Button, ChoiceCards, DirectionalIcon, Drawer, EmptyState, InlineAlert, KeepWords, Link, PlainCheckbox, PlainTextArea, PlainTextField, saveFile, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParams, useQueryParam, useT, useToast } from '@repo/ui';
import { BadgeCheck, ChevronRight, CircleDot, Clock3, Download, Flag, Info, Megaphone, MessagesSquare, Phone, ShieldCheck, ShieldOff, ThumbsUp, TriangleAlert, Undo2, Vote } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY, OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat, type PortalFormat } from '../portal/shared';
import { NotAvailable, ProblemText } from '../operations/ProblemText';
import { DEMO_TODAY } from '../operations/rkit';

/**
 * PORTAL-036 Community home. The notices summary needs only the resident app (official notices never
 * depend on an add-on, D-49): the latest notices open PORTAL-043, "All notices" opens PORTAL-023.
 * The chat card appears when the society has community chat; the polls, local services and
 * resources tabs each appear only when the community hub and that feature are in the plan for the
 * resident's site (the server decides; a tab it does not list is not shown). Everything is fictional.
 */
const TAB_ICON = { notices: Megaphone, polls: Vote, services: BadgeCheck, resources: Download, staff: ShieldCheck } as const;

export default function CommunityHomePage() {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [tabParam] = useQueryParam('tab');
  const setParams = useQueryParams();
  const q = useApiQuery<CommunityHome>({ method: 'GET', path: '/portal/community/home' });
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('community:home.title')} />;
  const home = q.data;
  const tab: CommunityTab = home.tabs.includes(tabParam as CommunityTab) ? (tabParam as CommunityTab) : 'notices';
  return (
    <div className="@container space-y-6" data-testid="community-home" data-tabs={home.tabs.join(',')}>
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">
          {t('community:home.title')}
        </h1>
        <p className="text-sm text-muted"><KeepWords text={t('community:home.intro', { site: home.siteName })} /></p>
      </header>
      {home.chat && <ChatCard chat={home.chat} />}
      {home.tabs.length > 1 && (
        <SegmentedControl
          label={t('community:home.sections')}
          value={tab}
          onChange={(v) => setParams({ tab: v === 'notices' ? null : v })}
          options={home.tabs.map((id) => ({ id, label: id === 'polls' && home.polls?.toAnswer ? t('community:home.tab.pollsCount', { count: home.polls.toAnswer }) : t(`community:home.tab.${id}`) }))}
          testId="community-tabs"
          wrap
        />
      )}
      <section aria-labelledby="community-section" className="space-y-4" data-testid={`community-tab-${tab}`}>
        <h2 id="community-section" className="flex items-center gap-2 text-xl font-semibold text-text">
          {(() => {
            const Icon = TAB_ICON[tab];
            return <Icon aria-hidden className="size-5 shrink-0 text-primary" />;
          })()}
          {t(`community:home.heading.${tab}`)}
        </h2>
        {tab === 'notices' && <NoticesSummary home={home} fmt={fmt} />}
        {tab === 'polls' && <PollsTab fmt={fmt} />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'resources' && <ResourcesTab fmt={fmt} />}
        {tab === 'staff' && home.staff && <StaffTab staff={home.staff} fmt={fmt} />}
      </section>
      <p className="flex items-start gap-1.5 text-xs text-muted" data-testid="community-simulated">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t('community:home.simulated')}
      </p>
    </div>
  );
}

function ChatCard({ chat }: { chat: NonNullable<CommunityHome['chat']> }) {
  const { t } = useT();
  return (
    <Link href={COMMUNITY.chat} variant="plain" className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-panel p-4 shadow-card hover:bg-raised" data-testid="community-chat-card" data-unread={chat.unread}>
      <MessagesSquare aria-hidden className="size-6 shrink-0 text-primary" />
      <span className="min-w-0 flex-[1_1_12em]">
        <span className="block font-semibold text-text">{t('community:home.chatTitle')}</span>
        <span className="block text-sm text-muted">{chat.available ? (chat.unread ? t('community:home.chatUnread', { count: chat.unread }) : t('community:home.chatNone')) : t('community:home.chatNotOpen')}</span>
      </span>
      <DirectionalIcon icon={ChevronRight} className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

function NoticesSummary({ home, fmt }: { home: CommunityHome; fmt: PortalFormat }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      {home.notices.latest.length === 0 ? (
        <EmptyState title={t('community:home.noNotices')} />
      ) : (
        <ul className="space-y-3" data-testid="community-notices">
          {home.notices.latest.map((n) => (
            <li key={n.id}>
              <Link href={OPS.notice(n.id)} variant="plain" className={`flex flex-wrap items-start justify-between gap-2 rounded-card border bg-panel p-4 hover:bg-raised ${n.unread || n.needsAck ? 'border-primary/40' : 'border-border'}`} data-testid="community-notice">
                <span className="min-w-0 flex-[1_1_10em]">
                  <span className="block font-semibold break-words text-text">
                    <bdi><KeepWords text={n.title} /></bdi>
                  </span>
                  <span className="block text-xs text-muted">{fmt.instant(n.publishedAt)}</span>
                </span>
                {n.needsAck ? (
                  <Badge tone="warning" icon={CircleDot}>
                    {t('community:home.needsAck')}
                  </Badge>
                ) : n.unread ? (
                  <Badge tone="info" icon={CircleDot}>
                    {t('community:home.unread')}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Link href={OPS.notices} className="inline-flex min-h-11 items-center gap-1 text-sm" data-testid="community-all-notices">
          {home.notices.unread ? t('community:home.allNoticesUnread', { count: home.notices.unread }) : t('community:home.allNotices')}
          <DirectionalIcon icon={ChevronRight} className="size-4" />
        </Link>
        {home.issues && (
          <Link href={OPS.issues} className="inline-flex min-h-11 items-center gap-1 text-sm" data-testid="community-issues">
            {t('community:home.issues')}
            <DirectionalIcon icon={ChevronRight} className="size-4" />
          </Link>
        )}
      </div>
      <p className="text-xs text-muted">{t('community:home.noticesOneWay')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Staff on duty (Gate S.2a): from the published roster; roles only, names with consent
// ---------------------------------------------------------------------------------------------

/** A time ("11:00 PM") isolated inside an Urdu sentence, so its Latin parts are not reordered. */
const isolated = (s: string) => String.fromCharCode(0x2068) + s + String.fromCharCode(0x2069);

function StaffTab({ staff, fmt }: { staff: ResidentStaffOnDuty; fmt: PortalFormat }) {
  const { t } = useT();
  return (
    <div className="space-y-4" data-testid="community-staff">
      <p className="text-sm text-muted">{t('community:staff.asOf', { time: isolated(fmt.time(staff.at)) })}</p>
      {staff.onDuty.length === 0 ? (
        <EmptyState title={t('community:staff.nobody')} body={t('community:staff.nobodyHint')} />
      ) : (
        <ul className="grid gap-3 @2xl:grid-cols-2" data-testid="community-staff-list">
          {staff.onDuty.map((s, i) => (
            <li key={`${s.role}-${i}`} className="flex items-start gap-3 rounded-card border border-border bg-panel p-4" data-testid="community-staff-person" data-role={s.role}>
              <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {s.initials ?? <ShieldCheck className="size-5" />}
              </span>
              <span className="min-w-0 flex-[1_1_10em]">
                <span className="block font-semibold break-words text-text">
                  <KeepWords text={t(`hr:role.${s.role}`)} />
                </span>
                {s.name && (
                  <span className="block text-sm text-text">
                    <bdi>{s.name}</bdi>
                  </span>
                )}
                <span className="block text-xs text-muted">
                  {s.post ? `${s.post} · ` : ''}
                  {t('community:staff.until', { time: isolated(fmt.time(s.until)) })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {staff.next.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-text" data-testid="community-staff-next">
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          {t('community:staff.next', { time: isolated(fmt.time(staff.next[0]!.startsAt)), list: staff.next.map((n) => `${t(`hr:role.${n.role}`)} × ${fmt.count(n.count)}`).join(', ') })}
        </p>
      )}
      <InlineAlert tone="info" data-testid="community-staff-privacy">
        {t('community:staff.privacy')}
      </InlineAlert>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Polls (PORTAL-039 answer drawer)
// ---------------------------------------------------------------------------------------------

function PollsTab({ fmt }: { fmt: PortalFormat }) {
  const { t } = useT();
  const q = useApiQuery<{ items: PollResident[] }>({ method: 'GET', path: '/portal/community/polls' });
  const [answering, setAnswering] = useState<PollResident | null>(null);
  if (q.isError) return <ProblemText error={q.error} />;
  if (!q.data)
    return (
      <p role="status" className="text-sm text-muted">
        {t('common:state.loading')}
      </p>
    );
  return (
    <div className="space-y-4">
      <InlineAlert tone="info" data-testid="polls-informal">
        {t('community:poll.informal')}
      </InlineAlert>
      {q.data.items.length === 0 ? (
        <EmptyState title={t('community:poll.none')} body={t('community:poll.noneBody')} />
      ) : (
        <ul className="space-y-3" data-testid="poll-list">
          {q.data.items.map((p) => (
            <li key={p.id} className="space-y-3 rounded-card border border-border bg-panel p-4" data-testid="poll-card" data-state={p.state}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-[1_1_10em] space-y-1">
                  <h3 className="font-semibold break-words text-text">
                    <bdi><KeepWords text={p.title} /></bdi>
                  </h3>
                  <p className="break-words text-text">
                    <bdi><KeepWords text={p.question} /></bdi>
                  </p>
                </div>
                <PollStateBadge poll={p} fmt={fmt} />
              </div>
              <p className="text-xs text-muted">
                {t(p.anonymous ? 'community:poll.anonymous' : 'community:poll.named')} {t(p.unit === 'flat' ? 'community:poll.perFlat' : 'community:poll.perPerson')}
              </p>
              {p.answered.length > 0 && (
                <ul className="space-y-1 text-sm text-text" data-testid="poll-answered">
                  {p.answered.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      <span className="min-w-0">
                        {a.flatCode ? (a.byMe ? t('community:poll.answeredFlatMe', { flat: a.flatCode }) : t('community:poll.answeredFlat', { flat: a.flatCode })) : t('community:poll.answeredMe')}
                        {a.optionId ? <> {t('community:poll.yourChoice', { option: p.options.find((o) => o.id === a.optionId)?.label ?? '' })}</> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {p.state === 'withdrawn' && p.withdrawnReason && (
                <p className="text-sm break-words text-muted">
                  {t('community:poll.withdrawnReason')} <bdi>{p.withdrawnReason}</bdi>
                </p>
              )}
              {p.state === 'closed' && <p className="text-sm text-muted">{t('community:poll.closedWaiting')}</p>}
              {p.state === 'published' && p.results && <Results results={p.results} options={p.options} fmt={fmt} />}
              {p.answerable.length > 0 && (
                <Button variant="primary" icon={Vote} onPress={() => setAnswering(p)} data-testid="poll-answer">
                  {t('community:poll.answer')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <AnswerDrawer poll={answering} onClose={() => setAnswering(null)} fmt={fmt} />
    </div>
  );
}

function PollStateBadge({ poll, fmt }: { poll: PollResident; fmt: PortalFormat }) {
  const { t } = useT();
  if (poll.state === 'open') return <Badge tone="info" icon={CircleDot}>{t('community:poll.openUntil', { date: fmt.date(poll.closesOn) })}</Badge>;
  if (poll.state === 'published') return <Badge tone="success" icon={BadgeCheck}>{t('community:poll.resultsOut')}</Badge>;
  if (poll.state === 'withdrawn') return <Badge tone="neutral" icon={Undo2}>{t('community:poll.withdrawn')}</Badge>;
  return <Badge tone="neutral" icon={CircleDot}>{t('community:poll.closed')}</Badge>;
}

/** Results as text first (count, share); the bar only repeats them (never colour alone). */
export function Results({ results, options, fmt, testId = 'poll-results' }: { results: PollResults; options: Array<{ id: string; label: string }>; fmt: Pick<PortalFormat, 'count' | 'percent'>; testId?: string }) {
  const { t } = useT();
  if (!results.shown)
    return (
      <p className="flex items-start gap-1.5 rounded-tile border border-border bg-sunken/40 p-3 text-sm text-muted" data-testid={testId} data-shown="false" data-reason={results.reason}>
        <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t(`community:poll.hidden.${results.reason}`)}
      </p>
    );
  // Issue #9: the turnout only, and why; never a partial breakdown, a percentage or a "the rest" line.
  if (!results.options)
    return (
      <div className="space-y-2" data-testid={testId} data-shown="withheld">
        <p className="text-sm text-muted">{t('community:poll.total', { count: results.total })}</p>
        <p className="flex items-start gap-1.5 rounded-tile border border-border bg-sunken/40 p-3 text-sm text-muted" data-testid="poll-withheld">
          <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('community:poll.withheld')}
        </p>
      </div>
    );
  const label = (id: string) => options.find((o) => o.id === id)?.label ?? '';
  return (
    <div className="space-y-3" data-testid={testId} data-shown="true">
      <p className="text-sm text-muted">{t('community:poll.total', { count: results.total })}</p>
      <ul className="space-y-2">
        {results.options.map((o) => {
          const share = results.total ? o.count / results.total : 0;
          return (
            <li key={o.id} className="space-y-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0 font-medium break-words text-text">
                  <bdi>{o.label}</bdi>
                </span>
                <span className="whitespace-nowrap text-muted">{t('community:poll.optionCount', { count: o.count, share: fmt.percent(share) })}</span>
              </p>
              <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-primary" style={{ inlineSize: `${Math.round(share * 100)}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {results.blocks.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('community:poll.byBlock')}</summary>
          <ul className="space-y-1 ps-1">
            {results.blocks.map((b) => (
              <li key={b.code} className="break-words text-text">
                {t('community:poll.blockLine', { block: b.code, count: b.total })}: {b.options.map((o) => `${label(o.id)} ${fmt.count(o.count)}`).join(' · ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted">{t('community:poll.privacyRule')}</p>
    </div>
  );
}

function AnswerDrawer({ poll, onClose, fmt }: { poll: PollResident | null; onClose: () => void; fmt: PortalFormat }) {
  const { t } = useT();
  const toast = useToast();
  const [choice, setChoice] = useState('');
  const [flat, setFlat] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const respond = useApiMutation<PollResident>();
  const close = () => {
    setChoice('');
    setFlat('');
    setConsent(false);
    setError(null);
    onClose();
  };
  const flats = poll?.unit === 'flat' ? poll.answerable : [];
  const flatId = flats.length === 1 ? flats[0]!.flatId! : flat;
  return (
    <Drawer
      isOpen={!!poll}
      onOpenChange={(o) => !o && close()}
      title={poll?.title ?? ''}
      subtitle={poll ? t('community:poll.openUntil', { date: fmt.date(poll.closesOn) }) : undefined}
      testId="poll-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={Vote}
            isPending={respond.isPending}
            isDisabled={!choice || (poll?.unit === 'flat' && !flatId) || (poll?.anonymous === false && !consent)}
            onPress={async () => {
              if (!poll) return;
              setError(null);
              try {
                await respond.mutateAsync({ method: 'POST', path: `/portal/community/polls/${poll.id}/respond`, body: { optionId: choice, ...(poll.unit === 'flat' ? { flatId } : {}), ...(poll.anonymous ? {} : { namedConsent: consent }) } });
                toast.success(t('community:poll.recorded'));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="poll-submit"
          >
            {t('community:poll.submit')}
          </Button>
        </div>
      }
    >
      {poll && (
        <div className="space-y-5">
          <p className="break-words text-text">
            <bdi><KeepWords text={poll.question} /></bdi>
          </p>
          {flats.length > 1 && (
            <ChoiceCards<string> label={t('community:poll.forFlat')} value={flat} onChange={setFlat} columns="list" options={flats.map((f) => ({ id: f.flatId!, label: f.flatCode ?? '' }))} testId="poll-flat" />
          )}
          <ChoiceCards<string> label={t('community:poll.yourAnswer')} value={choice} onChange={setChoice} columns="list" options={poll.options.map((o) => ({ id: o.id, label: o.label }))} testId="poll-option" />
          {poll.anonymous ? (
            <p className="text-sm text-muted">{t('community:poll.anonymousLong')}</p>
          ) : (
            // Named: said before the answer is given, and agreed to (Issue #9).
            <InlineAlert tone="warning" role="status" data-testid="poll-named-warning">
              <p>{t('community:poll.namedLong')}</p>
              <div className="mt-2">
                <PlainCheckbox isSelected={consent} onChange={setConsent} testId="poll-named-consent">
                  {t('community:poll.namedConsent')}
                </PlainCheckbox>
              </div>
            </InlineAlert>
          )}
          <p className="text-sm text-muted">{t('community:poll.informal')}</p>
          {error ? <ProblemText error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Local services
// ---------------------------------------------------------------------------------------------

function ServicesTab() {
  const { t } = useT();
  const [category] = useQueryParam('category');
  const [search, setSearch] = useState('');
  const setParams = useQueryParams();
  const cat = PROVIDER_CATEGORIES.includes(category as ProviderCategory) ? (category as ProviderCategory) : null;
  const q = useApiQuery<ServiceDirectoryResident>({ method: 'GET', path: '/portal/community/services', query: { ...(cat ? { category: cat } : {}), ...(search.trim() ? { q: search.trim() } : {}) } }, { placeholderData: (prev) => prev });
  const [reporting, setReporting] = useState<ServiceProviderResident | null>(null);
  return (
    <div className="space-y-4">
      <InlineAlert tone="info" data-testid="services-disclaimer">
        {t('community:services.disclaimer')}
      </InlineAlert>
      <div className="grid gap-3 @lg:grid-cols-2">
        <PlainTextField label={t('community:services.search')} value={search} onChange={setSearch} optional testId="services-search" />
        <SelectControl
          label={t('community:services.category')}
          value={cat ?? 'all'}
          onChange={(v) => setParams({ category: !v || v === 'all' ? null : v })}
          options={[{ id: 'all', label: t('community:services.allCategories') }, ...PROVIDER_CATEGORIES.map((c) => ({ id: c, label: `${t(`community:category.${c}`)} (${q.data?.categories.find((x) => x.key === c)?.listed ?? 0})` }))]}
          testId="services-category"
        />
      </div>
      {q.isError ? (
        <ProblemText error={q.error} />
      ) : !q.data ? (
        <p role="status" className="text-sm text-muted">
          {t('common:state.loading')}
        </p>
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('community:services.none')} body={t('community:services.noneBody')} />
      ) : (
        <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="services-list">
          {q.data.items.map((p) => (
            <ProviderCard key={p.id} p={p} onReport={() => setReporting(p)} />
          ))}
        </ul>
      )}
      <ReportProvider provider={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}

function ProviderCard({ p, onReport }: { p: ServiceProviderResident; onReport: () => void }) {
  const { t } = useT();
  const recommend = useApiMutation();
  return (
    <li className="min-w-0 space-y-2 rounded-card border border-border bg-panel p-4" data-testid="provider-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-[1_1_10em] font-semibold break-words text-text">
          <bdi><KeepWords text={p.name} /></bdi>
        </h3>
        <Badge tone="neutral">{t(`community:category.${p.category}`)}</Badge>
      </div>
      <p className="text-sm break-words text-text">
        <bdi><KeepWords text={p.description} /></bdi>
      </p>
      <p className="text-xs break-words text-muted">
        {t('community:services.serves')} <bdi><KeepWords text={p.serves} /></bdi>
      </p>
      {p.phone ? (
        <a href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline" data-testid="provider-phone">
          <Phone aria-hidden className="size-4" />
          <bdi dir="ltr">{p.phone}</bdi>
        </a>
      ) : (
        <p className="text-sm text-muted" data-testid="provider-no-phone">
          {t('community:services.noPhone')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted" data-testid="provider-recommendations">
          {t('community:services.recommendations', { count: p.recommendations })}
        </span>
        <Button
          size="sm"
          variant={p.recommendedByMe ? 'primary' : 'secondary'}
          icon={ThumbsUp}
          aria-pressed={p.recommendedByMe}
          isPending={recommend.isPending}
          onPress={() => void recommend.mutateAsync({ method: 'POST', path: `/portal/community/services/${p.id}/recommend`, body: { on: !p.recommendedByMe } }).catch(() => undefined)}
          data-testid="provider-recommend"
        >
          {t('community:services.recommend')}
        </Button>
        {p.reportedByMe ? (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Flag aria-hidden className="size-3.5" />
            {t('community:services.reported')}
          </span>
        ) : (
          <Button size="sm" variant="quiet" icon={Flag} onPress={onReport} data-testid="provider-report">
            {t('community:services.report')}
          </Button>
        )}
      </div>
    </li>
  );
}

function ReportProvider({ provider, onClose }: { provider: ServiceProviderResident | null; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const report = useApiMutation();
  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={!!provider}
      onOpenChange={(o) => !o && close()}
      title={t('community:services.reportTitle', { name: provider?.name ?? '' })}
      testId="provider-report-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={TriangleAlert}
            isPending={report.isPending}
            onPress={async () => {
              if (!provider) return;
              setError(null);
              try {
                await report.mutateAsync({ method: 'POST', path: `/portal/community/services/${provider.id}/report`, body: { reason } });
                toast.success(t('community:services.reportSent'));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="provider-report-submit"
          >
            {t('community:services.reportSubmit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <PlainTextArea label={t('community:services.reportReason')} description={t('community:services.reportHint')} value={reason} onChange={setReason} testId="provider-report-reason" />
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

function ResourcesTab({ fmt }: { fmt: PortalFormat }) {
  const { t } = useT();
  const q = useApiQuery<{ items: ResourceResident[] }>({ method: 'GET', path: '/portal/community/resources' });
  if (q.isError) return <ProblemText error={q.error} />;
  if (!q.data)
    return (
      <p role="status" className="text-sm text-muted">
        {t('common:state.loading')}
      </p>
    );
  if (!q.data.items.length) return <EmptyState title={t('community:resources.none')} />;
  return (
    <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="resources-list">
      {q.data.items.map((r) => (
        <li key={r.id} className="min-w-0 space-y-2 rounded-card border border-border bg-panel p-4" data-testid="resource-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 flex-[1_1_10em] font-semibold break-words text-text">
              <bdi><KeepWords text={r.title} /></bdi>
            </h3>
            <Badge tone="neutral">{t(`community:resourceCategory.${r.category}`)}</Badge>
          </div>
          {r.description && (
            <p className="text-sm break-words text-text">
              <bdi><KeepWords text={r.description} /></bdi>
            </p>
          )}
          <p className="text-xs break-words text-muted">
            <bdi dir="ltr">{r.file.name}</bdi> · <bdi>{t('community:resources.size', { size: fmt.count(Math.max(1, Math.round(r.file.sizeBytes / 1024))) })}</bdi> · <bdi>{t('community:resources.published', { date: fmt.instant(r.publishedAt) })}</bdi>
          </p>
          <Button
            size="sm"
            icon={Download}
            onPress={() => saveFile({ fileName: `${r.file.name.replace(/\.pdf$/i, '')}-demo.txt`, mime: 'text/plain', content: `${r.title}\n\n${t('community:resources.demoFile')}\n` })}
            data-testid="resource-download"
          >
            {t('community:resources.download')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
