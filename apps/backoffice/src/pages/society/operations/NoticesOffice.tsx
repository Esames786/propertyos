import { AUDIENCE_ROLES, NOTICE_CATEGORIES, type AudiencePreview, type BroadcastMessage, type NoticeAudience, type NoticeCategory, type NoticeDetail, type NoticeList, type SiteStructure, type SiteSummary } from '@repo/contracts';
import { Badge, Button, buttonClass, cn, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, PlainCheckbox, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, Eye, Mail, Megaphone, MessageSquare, MessagesSquare, PenLine, Plus, Send, Smartphone, Undo2, UserX, Users } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY, OPS } from '../../../nav.config';
import { Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { Fact, FactGrid, HistoryList, WRAP } from '../finance/fkit';
import { AudienceText, NoticeBadge, When } from './okit';

/**
 * RES-005 official notices (Gate D.2 reference experience 3, office end) and NOT-003 quick broadcast.
 * Compose, choose the audience from verified links (part of the site × owners, occupants, liable
 * payers) with a preview of who it reaches, publish now or schedule, ask for an acknowledgement; then
 * see delivered, read and acknowledged, and which flats have not acknowledged (staff only). An edit is
 * a new version; a withdrawal keeps a dated tombstone. No community add-on is involved.
 */
const STATUSES = ['published', 'scheduled', 'draft', 'withdrawn', 'expired'] as const;

export default function NoticesOffice() {
  const { t } = useT();
  const { can } = useSession();
  const [status] = useQueryParam('status');
  const [record] = useQueryParam('record');
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'published';
  const q = useApiQuery<NoticeList>({ method: 'GET', path: '/notices', query: { status: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-5" data-testid="notices-office">
      <PageHeader
        title={t('operations:notices.title')}
        description={t('operations:notices.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {can('notices.publish') && (
              <Button variant="primary" icon={Plus} onPress={() => setParams({ drawer: 'compose', record: null })} className={WRAP} data-testid="notice-new">
                {t('operations:notices.new')}
              </Button>
            )}
            {/* Gate D.3: where the society has community chat, its groups and reports are one step away
                (notices themselves never depend on it). */}
            {(can('chat.groups.manage') || can('chat.moderate')) && (
              <Link href={COMMUNITY.settings()} variant="plain" className={cn(buttonClass('secondary', 'md', 'gap-2'), WRAP)} data-testid="notices-chat-admin">
                <MessagesSquare aria-hidden className="size-4" />
                {t('community:office.title')}
              </Link>
            )}
            {can('messages.send') && (
              <Link href={OPS.message} variant="plain" className={cn(buttonClass('secondary', 'md', 'gap-2'), WRAP)} data-testid="notice-quick-message">
                <MessageSquare aria-hidden className="size-4" />
                {t('operations:notices.quick')}
              </Link>
            )}
          </div>
        }
      />
      <p className="text-sm text-muted">{t('operations:notices.noAddon')}</p>
      <FilterPills label={t('operations:notices.status')} value={filter} onChange={(v) => setParams({ status: v === 'published' ? null : v })} testId="notice-status" options={STATUSES.map((s) => ({ id: s, label: t(`operations:noticeState.${s}`), ...(q.data ? { count: q.data.counts[s] } : {}) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('operations:notices.emptyTitle')} body={t('operations:notices.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="notice-list">
          {q.data.items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setParams({ record: n.id, drawer: null })} className="grid w-full gap-2 rounded-tile border border-border/70 bg-panel p-4 text-start shadow-card outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="notice-row" data-ref={n.ref} data-state={n.state}>
                <span className="min-w-0">
                  <span className="block font-semibold text-text [overflow-wrap:anywhere]"><bdi>{n.title}</bdi></span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{n.ref}</bdi> · {t(`operations:noticeCategory.${n.category}`)}
                    {n.version > 1 ? ` · ${t('operations:notices.version', { version: n.version })}` : ''}
                    {n.publishedAt ? <> · <When at={n.publishedAt} /></> : n.publishAt ? <> · {t('operations:notices.scheduledFor')} <When at={n.publishAt} /></> : null}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-xs text-muted">
                  {n.stats && (
                    <>
                      <span>{t('operations:notices.statDelivered', { count: n.stats.delivered })}</span>·<span>{t('operations:notices.statRead', { count: n.stats.read })}</span>
                      {n.ackRequired && <>·<span>{t('operations:notices.statAck', { count: n.stats.acknowledged, total: n.stats.recipients - n.stats.leftAudience })}</span></>}
                    </>
                  )}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <NoticeBadge state={n.state} />
                  {n.ackRequired && <Badge tone="info" icon={BadgeCheck}>{t('operations:notices.askAck')}</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ComposeDrawer isOpen={drawer === 'compose'} onClose={() => setParams({ drawer: null })} onDone={(id) => { setParams({ drawer: null, record: id, status: null }); void q.refetch(); }} />
      <NoticeDrawer noticeId={record} onClose={() => setParams({ record: null })} onChanged={() => void q.refetch()} />
    </div>
  );
}

/** Choose the audience: part of the site, then owners / occupants / liable payers (from verified links). */
export function AudienceBuilder({ value, onChange, testId = 'audience' }: { value: NoticeAudience; onChange: (a: NoticeAudience) => void; testId?: string }) {
  const { t } = useT();
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const siteId = sites.data?.[0]?.id;
  const structure = useApiQuery<SiteStructure>({ method: 'GET', path: `/sites/${siteId}/structure` }, { enabled: !!siteId });
  const buildings = structure.data?.buildings ?? [];
  const toggle = (id: string) => onChange({ ...value, ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id] });
  const choices =
    value.scope === 'blocks'
      ? buildings.map((b) => ({ id: b.id, label: b.name }))
      : value.scope === 'floors'
        ? buildings.flatMap((b) => b.levels.map((l) => ({ id: l.floor.id, label: t('operations:audience.floorOf', { block: b.code, level: l.floor.level }) })))
        : value.scope === 'units'
          ? buildings.flatMap((b) => b.levels.flatMap((l) => l.flats.map((f) => ({ id: f.id, label: f.code }))))
          : [];
  return (
    <fieldset className="space-y-3" data-testid={testId}>
      <legend className="text-sm font-medium text-text">{t('operations:audience.title')}</legend>
      <SelectControl label={t('operations:audience.where')} value={value.scope} onChange={(v) => onChange({ ...value, scope: (v ?? 'site') as NoticeAudience['scope'], ids: [] })} options={(['site', 'blocks', 'floors', 'units'] as const).map((s) => ({ id: s, label: t(`operations:audience.scope.${s}`) }))} testId={`${testId}-scope`} />
      {choices.length > 0 && (
        <div className={cn('grid gap-1.5', value.scope === 'units' ? 'max-h-56 grid-cols-3 overflow-y-auto rounded-tile border border-border p-2 @md:grid-cols-6' : 'grid-cols-1 @md:grid-cols-2')} role="group" aria-label={t(`operations:audience.scope.${value.scope}`)}>
          {choices.map((c) => (
            <PlainCheckbox key={c.id} isSelected={value.ids.includes(c.id)} onChange={() => toggle(c.id)} testId={`${testId}-pick-${c.id}`}>
              <bdi dir={value.scope === 'units' ? 'ltr' : undefined}>{c.label}</bdi>
            </PlainCheckbox>
          ))}
        </div>
      )}
      <div className="space-y-1.5" role="group" aria-label={t('operations:audience.who')}>
        <p className="text-sm font-medium text-text">{t('operations:audience.who')}</p>
        {AUDIENCE_ROLES.map((r) => (
          <PlainCheckbox key={r} isSelected={value.roles.includes(r)} onChange={(on) => onChange({ ...value, roles: on ? [...value.roles, r] : value.roles.filter((x) => x !== r) })} testId={`${testId}-role-${r}`}>
            {t(`operations:audience.roleLong.${r}`)}
          </PlainCheckbox>
        ))}
      </div>
    </fieldset>
  );
}

export function PreviewBox({ audience, testId = 'audience-preview' }: { audience: NoticeAudience; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const ready = audience.roles.length > 0 && (audience.scope === 'site' || audience.ids.length > 0);
  const q = useApiQuery<AudiencePreview>({ method: 'GET', path: '/notices/preview', query: { audience: JSON.stringify(audience) } }, { enabled: ready, placeholderData: (prev) => prev });
  if (!ready) return <p className="text-sm text-muted">{t('operations:audience.chooseFirst')}</p>;
  if (q.isError) return <ProblemAlert error={q.error} />;
  if (!q.data) return <Loading lines={2} />;
  const p = q.data;
  return (
    <section className="space-y-2 rounded-tile border border-primary/30 bg-primary-soft/30 p-3 text-sm" aria-live="polite" data-testid={testId} data-households={p.households}>
      <p className="font-semibold text-text">{t('operations:audience.reaches', { households: fmt.count(p.households), people: fmt.count(p.people) })}</p>
      <p className="text-text">{t('operations:audience.byRole', { owners: p.byRole.owner, occupants: p.byRole.occupant, payers: p.byRole.payer })}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Smartphone aria-hidden className="size-3.5" />{t('operations:audience.app', { count: p.withAppAccount })}</span>
        <span className="inline-flex items-center gap-1"><MessageSquare aria-hidden className="size-3.5" />{t('operations:audience.sms', { count: p.smsConsent })}</span>
        <span className="inline-flex items-center gap-1"><Mail aria-hidden className="size-3.5" />{t('operations:audience.whatsapp', { count: p.whatsappConsent })}</span>
      </p>
      <details>
        <summary className="cursor-pointer text-xs text-primary">{t('operations:audience.showFlats', { count: p.flats.length })}</summary>
        <p className="mt-1 text-xs text-muted" dir="ltr">{p.flats.join(', ')}</p>
      </details>
    </section>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const DEMO_TODAY = '2026-10-26';

function ComposeDrawer({ isOpen, onClose, onDone, edit }: { isOpen: boolean; onClose: () => void; onDone: (id: string) => void; edit?: NoticeDetail }) {
  const { t } = useT();
  const toast = useToast();
  const save = useApiMutation<NoticeDetail>();
  const published = edit?.notice.state === 'published';
  const [title, setTitle] = useState(edit?.notice.current.title ?? '');
  const [body, setBody] = useState(edit?.notice.current.body ?? '');
  const [category, setCategory] = useState<NoticeCategory>(edit?.notice.current.category ?? 'general');
  const [audience, setAudience] = useState<NoticeAudience>(edit?.notice.audience ?? { scope: 'site', ids: [], roles: ['owner', 'occupant'] });
  const [ack, setAck] = useState(edit?.notice.ackRequired ?? false);
  const [sms, setSms] = useState(edit?.notice.channels.sms ?? false);
  const [whatsapp, setWhatsapp] = useState(edit?.notice.channels.whatsapp ?? false);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(`2026-10-27T${pad(9)}:00`);
  const [expires, setExpires] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [renotify, setRenotify] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [key] = useState(() => `ntc-${Date.now().toString(36)}`);
  const input = { title, body, category, audience, ackRequired: ack, channels: { sms, whatsapp }, ...(expires ? { expiresOn: expires } : {}) };
  const submit = async (action: 'draft' | 'publish' | 'schedule') => {
    setError(null);
    try {
      const r = edit
        ? await save.mutateAsync({ method: 'PATCH', path: `/notices/${edit.notice.id}`, body: { ...input, ...(published ? { changeNote, renotify } : {}) } })
        : await save.mutateAsync({ method: 'POST', path: '/notices', body: { ...input, action, idempotencyKey: `${key}-${action}`, ...(action === 'schedule' ? { publishAt: new Date(`${at}:00+05:00`).toISOString() } : {}) } });
      toast.success(edit ? (published ? t('operations:notices.newVersion', { version: r.notice.current.version }) : t('operations:notices.saved')) : t(`operations:notices.done.${action}`, { ref: r.notice.ref }));
      onDone(r.notice.id);
    } catch (e) {
      setError(e);
    }
  };
  const valid = title.trim().length >= 5 && body.trim().length >= 20 && audience.roles.length > 0 && (audience.scope === 'site' || audience.ids.length > 0);
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={edit ? (published ? t('operations:notices.editPublished', { ref: edit.notice.ref }) : t('operations:notices.editDraft', { ref: edit.notice.ref })) : t('operations:notices.composeTitle')}
      subtitle={t('operations:notices.composeSubtitle')}
      testId="compose-drawer"
      footer={
        edit ? (
          <>
            <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
            <Button variant="primary" icon={PenLine} isPending={save.isPending} isDisabled={!valid || (published && changeNote.trim().length < 5)} onPress={() => void submit('draft')} data-testid="compose-save-edit">
              {published ? t('operations:notices.saveVersion') : t('operations:notices.saveDraft')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" isPending={save.isPending} isDisabled={!valid} onPress={() => void submit('draft')} data-testid="compose-draft">
              {t('operations:notices.saveDraft')}
            </Button>
            {when === 'later' ? (
              <Button variant="primary" icon={Send} isPending={save.isPending} isDisabled={!valid} onPress={() => void submit('schedule')} data-testid="compose-schedule">
                {t('operations:notices.schedule')}
              </Button>
            ) : (
              <Button variant="primary" icon={Megaphone} isPending={save.isPending} isDisabled={!valid} onPress={() => void submit('publish')} data-testid="compose-publish">
                {t('operations:notices.publishNow')}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <PlainTextField label={t('operations:notices.titleField')} value={title} onChange={setTitle} testId="compose-title" />
        <SelectControl label={t('operations:notices.category')} value={category} onChange={(v) => setCategory((v ?? 'general') as NoticeCategory)} options={NOTICE_CATEGORIES.map((c) => ({ id: c, label: t(`operations:noticeCategory.${c}`) }))} testId="compose-category" />
        <PlainTextArea label={t('operations:notices.body')} description={t('operations:notices.bodyHint')} value={body} onChange={setBody} rows={6} testId="compose-body" />
        {published ? (
          <>
            <InlineAlert tone="info" title={t('operations:notices.versionTitle')}><p>{t('operations:notices.versionBody')}</p></InlineAlert>
            <PlainTextField label={t('operations:notices.changeNote')} value={changeNote} onChange={setChangeNote} testId="compose-change-note" />
            <PlainCheckbox isSelected={renotify} onChange={setRenotify} testId="compose-renotify">{t('operations:notices.renotify')}</PlainCheckbox>
          </>
        ) : (
          <>
            <AudienceBuilder value={audience} onChange={setAudience} testId="compose-audience" />
            <PreviewBox audience={audience} />
            <PlainCheckbox isSelected={ack} onChange={setAck} testId="compose-ack">{t('operations:notices.askAckLong')}</PlainCheckbox>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-text">{t('operations:notices.channels')}</legend>
              <p className="text-xs text-muted">{t('operations:notices.inAppAlways')}</p>
              <PlainCheckbox isSelected={sms} onChange={setSms} testId="compose-sms">{t('operations:notices.smsCopy')}</PlainCheckbox>
              <PlainCheckbox isSelected={whatsapp} onChange={setWhatsapp} testId="compose-whatsapp">{t('operations:notices.whatsappCopy')}</PlainCheckbox>
            </fieldset>
            {!edit && (
              <>
                <SegmentedControl label={t('operations:notices.when')} value={when} onChange={setWhen} options={[{ id: 'now', label: t('operations:notices.now') }, { id: 'later', label: t('operations:notices.later') }]} testId="compose-when" />
                {when === 'later' && (
                  <>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
                      {t('operations:notices.publishAt')}
                      <input type="datetime-local" min={`${DEMO_TODAY}T00:00`} value={at} onChange={(e) => setAt(e.target.value)} className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-sm text-text" data-testid="compose-at" />
                    </label>
                    <p className="text-xs text-muted" data-testid="compose-schedule-simulated">{t('operations:notices.scheduleSimulated')}</p>
                  </>
                )}
              </>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
              {t('operations:notices.expires')} <span className="text-xs font-normal text-muted">{t('operations:notices.optional')}</span>
              <input type="date" min={DEMO_TODAY} value={expires} onChange={(e) => setExpires(e.target.value)} className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-sm text-text" data-testid="compose-expires" />
            </label>
          </>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function NoticeDrawer({ noticeId, onClose, onChanged }: { noticeId: string | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const fmt = useSocietyFormat();
  const q = useApiQuery<NoticeDetail>({ method: 'GET', path: `/notices/${noticeId}` }, { enabled: !!noticeId });
  const act = useApiMutation<NoticeDetail>();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const d = q.data;
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      void q.refetch();
      onChanged();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Drawer
      isOpen={!!noticeId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={d ? d.notice.current.title : t('operations:notices.loading')}
      subtitle={d ? <NoticeBadge state={d.notice.state} testId="notice-state" /> : undefined}
      testId="notice-drawer"
      footer={
        d ? (
          <div className="flex flex-wrap gap-2">
            {d.actions.publish && (
              <Button variant="primary" icon={Megaphone} isPending={act.isPending} onPress={() => void run(`/notices/${d.notice.id}/publish`, {}, t('operations:notices.published'))} data-testid="notice-publish">
                {t('operations:notices.publishNow')}
              </Button>
            )}
            {d.actions.edit && (
              <Button variant="secondary" icon={PenLine} onPress={() => setEditing(true)} data-testid="notice-edit">
                {d.notice.state === 'published' ? t('operations:notices.newVersionAction') : t('operations:notices.edit')}
              </Button>
            )}
            {d.actions.withdraw && (
              <Button variant="quiet" icon={Undo2} onPress={() => setWithdrawOpen(true)} data-testid="notice-withdraw">
                {t('operations:notices.withdraw')}
              </Button>
            )}
            <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
          </div>
        ) : undefined
      }
    >
      {!d ? (
        q.isError ? <ErrorState error={q.error} /> : <Loading lines={6} />
      ) : (
        <div className="space-y-5" data-testid="notice-detail">
          {d.notice.withdrawn && (
            <InlineAlert tone="warning" title={t('operations:notices.withdrawnOn', { date: fmt.date(d.notice.withdrawn.at), name: d.notice.withdrawn.byName })}>
              <p><bdi>{d.notice.withdrawn.reason}</bdi></p>
              <p className="text-xs">{t('operations:notices.tombstone')}</p>
            </InlineAlert>
          )}
          {d.stats && (
            <div className="grid grid-cols-2 gap-2 @md:grid-cols-4" data-testid="notice-stats">
              {[
                ['recipients', d.stats.recipients, Users],
                ['delivered', d.stats.delivered, Send],
                ['read', d.stats.read, Eye],
                ['acknowledged', d.stats.acknowledged, BadgeCheck],
              ].map(([k, v, Icon]) => {
                const I = Icon as typeof Users;
                return (
                  <div key={k as string} className="rounded-tile border border-border/70 p-3" data-testid={`stat-${k as string}`}>
                    <p className="flex items-center gap-1.5 text-xs text-muted"><I aria-hidden className="size-3.5" />{t(`operations:notices.stat.${k as 'read'}`)}</p>
                    <p className="text-xl font-bold text-text tabular-nums">{fmt.count(v as number)}</p>
                  </div>
                );
              })}
            </div>
          )}
          {d.stats && (
            <p className="text-xs text-muted">
              {t('operations:notices.statsLine', { noApp: d.stats.noAppAccount, sms: d.stats.smsSent, whatsapp: d.stats.whatsappSent, left: d.stats.leftAudience })}
            </p>
          )}
          <FactGrid>
            <Fact label={t('operations:notices.audienceLabel')}><AudienceText audience={d.notice.audience} label={d.notice.audienceLabel} /></Fact>
            <Fact label={t('operations:notices.category')}>{t(`operations:noticeCategory.${d.notice.current.category}`)}</Fact>
            <Fact label={t('operations:notices.reference')}><bdi dir="ltr" className="ltr-ref">{d.notice.ref}</bdi></Fact>
            <Fact label={t('operations:notices.ackLabel')}>{d.notice.ackRequired ? t('operations:notices.ackYes') : t('operations:notices.ackNo')}</Fact>
            {d.notice.publishedAt && <Fact label={t('operations:notices.publishedOn')}><When at={d.notice.publishedAt} /></Fact>}
            {d.notice.publishAt && (
              <Fact label={t('operations:notices.scheduledFor')}>
                <When at={d.notice.publishAt} />
                {d.notice.state === 'scheduled' && <span className="block text-xs text-muted">{t('operations:notices.scheduleSimulated')}</span>}
              </Fact>
            )}
            {d.notice.expiresOn && <Fact label={t('operations:notices.expires')}><When at={`${d.notice.expiresOn}T00:00:00Z`} style="date" /></Fact>}
            {d.notice.fromMessage && <Fact label={t('operations:notices.fromMessage')}><bdi dir="ltr" className="ltr-ref">{d.notice.fromMessage.ref}</bdi></Fact>}
          </FactGrid>
          <section className="space-y-2">
            <h3 className="font-semibold text-text">{t('operations:notices.text', { version: d.notice.current.version })}</h3>
            <p className="whitespace-pre-line rounded-tile bg-sunken/40 p-3 text-sm text-text [overflow-wrap:anywhere]"><bdi>{d.notice.current.body}</bdi></p>
          </section>
          {d.unacknowledgedFlats.length > 0 && (
            <section className="space-y-2" data-testid="unacknowledged">
              <h3 className="flex items-center gap-2 font-semibold text-text"><UserX aria-hidden className="size-4" />{t('operations:notices.notAcked', { count: d.unacknowledgedFlats.length })}</h3>
              <p className="text-sm text-muted" dir="ltr">{d.unacknowledgedFlats.join(', ')}</p>
              <p className="text-xs text-muted">{t('operations:notices.staffOnly')}</p>
            </section>
          )}
          {d.recipients.length > 0 && (
            <details data-testid="recipients">
              <summary className="cursor-pointer text-sm font-semibold text-primary">{t('operations:notices.recipients', { count: d.recipients.length })}</summary>
              <div className="mt-2 overflow-x-auto" role="region" aria-label={t('operations:notices.recipientsLabel')} tabIndex={0}>
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="py-1.5 text-start font-medium">{t('operations:notices.colFlat')}</th>
                      <th className="py-1.5 text-start font-medium">{t('operations:notices.colPerson')}</th>
                      <th className="py-1.5 text-start font-medium">{t('operations:notices.colApp')}</th>
                      <th className="py-1.5 text-start font-medium">{t('operations:notices.colRead')}</th>
                      <th className="py-1.5 text-start font-medium">{t('operations:notices.colAck')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recipients.map((r) => (
                      <tr key={r.partyId} className="border-t border-border/60" data-testid="recipient-row" data-left={r.leftAudience || undefined}>
                        <td className="py-1.5"><bdi dir="ltr">{r.flatCodes.join(', ')}</bdi></td>
                        <td className="py-1.5"><bdi>{r.name}</bdi>{r.leftAudience ? ` · ${t('operations:notices.left')}` : ''}</td>
                        <td className="py-1.5">{t(`operations:delivery.${r.inApp}`)}</td>
                        <td className="py-1.5">{r.readAt ? <When at={r.readAt} /> : '—'}</td>
                        <td className="py-1.5">{r.acknowledgedAt && (r.acknowledgedVersion ?? 0) >= d.notice.current.version ? <When at={r.acknowledgedAt} /> : d.notice.ackRequired ? t('operations:notices.pending') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <section className="space-y-2">
            <h3 className="font-semibold text-text">{t('operations:notices.history')}</h3>
            <HistoryList testId="notice-history" label={t('operations:notices.history')} items={d.notice.history.map((h) => ({ at: h.at, byName: h.byName, label: dynamicT(t)(`operations:noticeEvent.${h.action}`, h.values ?? {}), ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          {error ? <ProblemAlert error={error} /> : null}
          {d.actions.reason && <p className="text-sm text-muted" data-testid="notice-readonly">{t(`operations:reason.${d.actions.reason}` as 'operations:reason.read_only')}</p>}
          <ConfirmDialog isOpen={withdrawOpen} onOpenChange={setWithdrawOpen} title={t('operations:notices.withdrawTitle', { ref: d.notice.ref })} effect={t('operations:notices.withdrawEffect')} confirmLabel={t('operations:notices.withdraw')} destructive reasonLabel={t('operations:notices.withdrawReason')} onConfirm={async (reason) => void (await run(`/notices/${d.notice.id}/withdraw`, { reason }, t('operations:notices.withdrawn')))} />
          {editing && <ComposeDrawer isOpen edit={d} onClose={() => setEditing(false)} onDone={() => { setEditing(false); void q.refetch(); onChanged(); }} />}
        </div>
      )}
    </Drawer>
  );
}

/** NOT-003: a short one-way message to an audience; optionally posted as an official notice too. */
export function SendMessagePage() {
  const { t } = useT();
  const toast = useToast();
  const { can } = useSession();
  const fmt = useSocietyFormat();
  const history = useApiQuery<BroadcastMessage[]>({ method: 'GET', path: '/messages' });
  const send = useApiMutation<BroadcastMessage>();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<NoticeAudience>({ scope: 'site', ids: [], roles: ['occupant'] });
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [alsoNotice, setAlsoNotice] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<BroadcastMessage | null>(null);
  const valid = text.trim().length >= 5 && audience.roles.length > 0 && (audience.scope === 'site' || audience.ids.length > 0) && (!alsoNotice || noticeTitle.trim().length >= 5);
  return (
    <div className="@container space-y-5" data-testid="send-message">
      <PageHeader title={t('operations:message.title')} description={t('operations:message.intro')} breadcrumbs={[{ label: t('operations:notices.title'), href: OPS.notices() }, { label: t('operations:message.title') }]} />
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-card border border-border/70 bg-panel p-5 shadow-card">
          <PlainTextArea label={t('operations:message.text')} description={t('operations:message.textHint', { count: 300 - text.length })} value={text} onChange={(v) => setText(v.slice(0, 300))} testId="message-text" />
          <AudienceBuilder value={audience} onChange={setAudience} testId="message-audience" />
          <PreviewBox audience={audience} testId="message-preview" />
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-text">{t('operations:notices.channels')}</legend>
            <p className="text-xs text-muted">{t('operations:notices.inAppAlways')}</p>
            <PlainCheckbox isSelected={sms} onChange={setSms} testId="message-sms">{t('operations:notices.smsCopy')}</PlainCheckbox>
            <PlainCheckbox isSelected={whatsapp} onChange={setWhatsapp} testId="message-whatsapp">{t('operations:notices.whatsappCopy')}</PlainCheckbox>
          </fieldset>
          {can('notices.publish') && (
            <>
              <PlainCheckbox isSelected={alsoNotice} onChange={setAlsoNotice} testId="message-also-notice">{t('operations:message.alsoNotice')}</PlainCheckbox>
              {alsoNotice && <PlainTextField label={t('operations:message.noticeTitle')} value={noticeTitle} onChange={setNoticeTitle} testId="message-notice-title" />}
            </>
          )}
          {error ? <ProblemAlert error={error} /> : null}
          {sent && (
            <InlineAlert tone="success" title={t('operations:message.sentTitle', { ref: sent.ref })} data-testid="message-sent">
              <p>{t('operations:message.sentLine', { inApp: sent.totals.inApp, sms: sent.totals.sms, whatsapp: sent.totals.whatsapp, skipped: sent.totals.skippedNoConsent, noApp: sent.totals.noAppAccount })}</p>
              {sent.notice && <p><Link href={OPS.notice(sent.notice.id)}>{t('operations:message.openNotice', { ref: sent.notice.ref })}</Link></p>}
            </InlineAlert>
          )}
          <Button
            variant="primary"
            icon={Send}
            isPending={send.isPending}
            isDisabled={!valid}
            onPress={async () => {
              setError(null);
              try {
                const m = await send.mutateAsync({ method: 'POST', path: '/messages', body: { text, audience, channels: { sms, whatsapp }, alsoNotice, ...(alsoNotice ? { noticeTitle } : {}) } });
                setSent(m);
                toast.success(t('operations:message.sent'));
                setText('');
                void history.refetch();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="message-send"
          >
            {t('operations:message.send')}
          </Button>
          <p className="text-xs text-muted">{t('operations:message.oneWay')}</p>
        </section>
        <section className="space-y-3" aria-labelledby="sent-messages">
          <h2 id="sent-messages" className="font-semibold text-text">{t('operations:message.history')}</h2>
          {!history.data ? (
            <Loading lines={4} />
          ) : history.data.length === 0 ? (
            <p className="text-sm text-muted">{t('operations:message.none')}</p>
          ) : (
            <ul className="space-y-2" data-testid="message-history">
              {history.data.map((m) => (
                <li key={m.id} className="space-y-1 rounded-tile border border-border/70 bg-panel p-3 text-sm">
                  <p className="text-text [overflow-wrap:anywhere]"><bdi>{m.text}</bdi></p>
                  <p className="text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{m.ref}</bdi> · <When at={m.sentAt} /> · <bdi>{m.sentByName}</bdi> · <AudienceText audience={m.audience} label={m.audienceLabel} />
                  </p>
                  <p className="text-xs text-muted">{t('operations:message.totals', { recipients: fmt.count(m.totals.recipients), inApp: m.totals.inApp, sms: m.totals.sms, whatsapp: m.totals.whatsapp })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
