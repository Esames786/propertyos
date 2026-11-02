import { AUDIENCE_ROLES, type AudienceRole, type ChatAudience, type ChatPolicy, type ChatReports, type ChatReportView, type ChatRulePreview, type ChatRules, type ChatRuleView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, InlineAlert, Link, PageHeader, PlainCheckbox, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, Switch, UrlTabs, useApiMutation, useApiQuery, useChatGroupName, useQueryParam, useQueryParams, useSession, useT, useToast } from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { BadgeCheck, Ban, Eye, MessagesSquare, Plus, ShieldAlert, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY, OPS } from '../../../nav.config';
import { Loading, ProblemAlert } from '../kit';
import { HistoryList, WRAP } from '../finance/fkit';
import { When } from '../operations/okit';

/**
 * CHAT-003 chat groups and moderation. Smart groups follow verified facts (current occupancy of the
 * site, a block or a floor; committee terms; staff roles) and can be switched off or made office-only;
 * the office previews who is in each and why. Custom groups follow an audience (part of the site and
 * relationship to the flat). The reports queue shows only reported messages (D-25 (4)); a moderator
 * removes, warns or dismisses with a note, never on their own report or message. The policy sets the
 * retention period (chat stays closed until it is set, no period is presumed) and the etiquette.
 */
export default function ChatSettingsPage() {
  const { t } = useT();
  const { can } = useSession();
  const manage = can('chat.groups.manage');
  const moderate = can('chat.moderate');
  const tabs = [
    ...(manage ? [{ id: 'groups', label: t('community:office.tab.groups') }, { id: 'custom', label: t('community:office.tab.custom') }] : []),
    ...(moderate ? [{ id: 'reports', label: t('community:office.tab.reports') }] : []),
    { id: 'policy', label: t('community:office.tab.policy') },
  ];
  return (
    <div className="@container space-y-5" data-testid="chat-settings">
      <PageHeader
        title={t('community:office.title')}
        description={t('community:office.intro')}
        actions={
          can('chat.use') ? (
            <Link href={COMMUNITY.inbox} className="inline-flex min-h-11 items-center gap-1.5 text-sm" data-testid="chat-inbox-link">
              <MessagesSquare aria-hidden className="size-4" />
              {t('community:office.openInbox')}
            </Link>
          ) : null
        }
      />
      <InlineAlert tone="info">
        {t('community:office.simulated')}
      </InlineAlert>
      <UrlTabs label={t('community:office.tabs')} items={tabs} defaultId={tabs[0]!.id} phoneLimit={2}>
        {(tab) => (tab === 'groups' ? <SmartGroups /> : tab === 'custom' ? <CustomGroups /> : tab === 'reports' ? <Reports /> : <Policy />)}
      </UrlTabs>
      <p className="text-sm text-muted">
        {t('community:office.noticesIndependent')}{' '}
        <Link href={OPS.notices()} className="text-sm">
          {t('community:chat.officialNotices')}
        </Link>
      </p>
    </div>
  );
}

function useRules() {
  return useApiQuery<ChatRules>({ method: 'GET', path: '/ops/chat/rules' });
}

function RuleRow({ rule, onPreview }: { rule: ChatRuleView; onPreview: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const dt = dynamicT(t);
  const name = useChatGroupName();
  const save = useApiMutation<ChatRuleView>();
  const patch = async (body: Partial<Pick<ChatRuleView, 'enabled' | 'postingPolicy'>>) => {
    try {
      await save.mutateAsync({ method: 'PATCH', path: `/ops/chat/rules/${rule.id}`, body });
      toast.success(t('community:office.saved'));
    } catch (e) {
      toast.error(e instanceof ApiError ? dt(e.problem.messageKey) : t('errors:network.unavailable'));
    }
  };
  return (
    <li className="grid gap-3 rounded-tile border border-border bg-panel p-3 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(12rem,1fr)_auto] @3xl:items-center" data-testid="chat-rule" data-group={rule.id} data-enabled={rule.enabled}>
      <div className="min-w-0">
        <p className="font-semibold break-words text-text">
          <bdi>{name(rule)}</bdi>
        </p>
        <p className="text-xs text-muted">{rule.audience ? t('community:office.customAudience', { place: rule.audience.label || t('community:office.wholeSite'), roles: rule.audience.roles.map((r) => t(`community:role.${r}`)).join(', ') }) : t(`community:groupAbout.${rule.kind}`, { code: rule.code ?? '', site: '' })}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
          <Users aria-hidden className="size-3.5" />
          {t('community:office.members', { count: rule.memberCount })}
        </p>
      </div>
      <div className="grid gap-2">
        {rule.kind === 'staff' ? (
          <p className="text-sm text-muted">{t('community:office.staffAlwaysOn')}</p>
        ) : (
          <Switch isSelected={rule.enabled} label={t('community:office.enabled')} onChange={(on) => void patch({ enabled: on })} testId={`rule-enabled-${rule.id}`} />
        )}
        {rule.kind !== 'staff' && (
          <SelectControl
            label={t('community:office.whoPosts')}
            value={rule.postingPolicy}
            onChange={(v) => v && v !== rule.postingPolicy && void patch({ postingPolicy: v as ChatRuleView['postingPolicy'] })}
            options={[
              { id: 'everyone', label: t('community:office.posting.everyone') },
              { id: 'office_only', label: t('community:office.posting.office_only') },
            ]}
            testId={`rule-posting-${rule.id}`}
          />
        )}
      </div>
      <Button size="sm" variant="quiet" icon={Eye} onPress={onPreview} className={WRAP} data-testid="rule-preview">
        {t('community:office.whoIsIn')}
      </Button>
    </li>
  );
}

function SmartGroups() {
  const { t } = useT();
  const q = useRules();
  const [preview, setPreview] = useState<string | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const smart = q.data.groups.filter((g) => g.kind !== 'custom');
  return (
    <div className="space-y-4" data-testid="chat-smart-groups">
      <p className="text-sm text-muted">{t('community:office.smartIntro')}</p>
      <ul className="space-y-2">
        {smart.map((g) => (
          <RuleRow key={g.id} rule={g} onPreview={() => setPreview(g.id)} />
        ))}
      </ul>
      <PreviewDrawer groupId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PreviewDrawer({ groupId, onClose }: { groupId: string | null; onClose: () => void }) {
  const { t } = useT();
  const name = useChatGroupName();
  const q = useApiQuery<ChatRulePreview>(groupId ? { method: 'GET', path: `/ops/chat/rules/${groupId}/preview` } : null, { enabled: !!groupId });
  const reason = (r: ChatRulePreview['members'][number]['reasons'][number]) =>
    r.reason === 'staff' ? t('community:office.reason.staff') : r.reason === 'committee' ? t('community:office.reason.committee', { since: r.since ?? '' }) : t(`community:office.reason.${r.reason}`, { flat: r.flat ?? '', since: r.since ?? '' });
  return (
    <Drawer isOpen={!!groupId} onOpenChange={(o) => !o && onClose()} title={q.data ? t('community:office.previewTitle', { name: name(q.data.group) }) : t('community:office.whoIsIn')} subtitle={q.data ? t('community:office.previewAsOf', { count: q.data.members.length }) : undefined} testId="chat-preview-drawer">
      {q.isError ? (
        <ProblemAlert error={q.error} />
      ) : !q.data ? (
        <Loading lines={5} />
      ) : q.data.members.length === 0 ? (
        <EmptyState title={t('community:office.previewEmpty')} />
      ) : (
        <ul className="space-y-2 text-sm" data-testid="chat-preview-members">
          {q.data.members.map((m, i) => (
            <li key={`${m.name}-${i}`} className="rounded-tile border border-border p-2.5">
              <p className="font-medium break-words text-text">
                <bdi>{m.name}</bdi>
              </p>
              <ul className="text-xs text-muted">
                {m.reasons.map((r, j) => (
                  <li key={j}>{reason(r)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">{t('community:office.previewPrivacy')}</p>
    </Drawer>
  );
}

function CustomGroups() {
  const { t } = useT();
  const q = useRules();
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  const custom = q.data.groups.filter((g) => g.kind === 'custom');
  return (
    <div className="space-y-4" data-testid="chat-custom-groups">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-[1_1_16em] text-sm text-muted">{t('community:office.customIntro')}</p>
        <Button variant="primary" icon={Plus} onPress={() => setCreating(true)} className={WRAP} data-testid="custom-new">
          {t('community:office.newCustom')}
        </Button>
      </div>
      {custom.length === 0 ? (
        <EmptyState title={t('community:office.noCustom')} body={t('community:office.noCustomBody')} />
      ) : (
        <ul className="space-y-2">
          {custom.map((g) => (
            <RuleRow key={g.id} rule={g} onPreview={() => setPreview(g.id)} />
          ))}
        </ul>
      )}
      <NewCustomGroup open={creating} onClose={() => setCreating(false)} blocks={q.data.blocks} />
      <PreviewDrawer groupId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export function AudiencePicker({ value, onChange, blocks, testId }: { value: ChatAudience; onChange: (a: ChatAudience) => void; blocks: Array<{ id: string; code: string }>; testId: string }) {
  const { t } = useT();
  return (
    <fieldset className="space-y-3" data-testid={testId}>
      <legend className="text-sm font-semibold text-text">{t('community:audience.legend')}</legend>
      <SegmentedControl
        label={t('community:audience.where')}
        value={value.scope}
        onChange={(v) => onChange({ ...value, scope: v, ids: v === 'site' ? [] : value.ids })}
        options={[
          { id: 'site', label: t('community:audience.site') },
          { id: 'blocks', label: t('community:audience.blocks') },
        ]}
        testId={`${testId}-scope`}
        wrap
      />
      {value.scope === 'blocks' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label={t('community:audience.blocks')}>
          {blocks.map((b) => (
            <PlainCheckbox key={b.id} isSelected={value.ids.includes(b.id)} onChange={(on) => onChange({ ...value, ids: on ? [...value.ids, b.id] : value.ids.filter((x) => x !== b.id) })} testId={`${testId}-block-${b.code}`}>
              {t('community:group.block', { code: b.code })}
            </PlainCheckbox>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label={t('community:audience.roles')}>
        {AUDIENCE_ROLES.map((r) => (
          <PlainCheckbox key={r} isSelected={value.roles.includes(r)} onChange={(on) => onChange({ ...value, roles: on ? [...value.roles, r] : value.roles.filter((x) => x !== r) })} testId={`${testId}-role-${r}`}>
            {t(`community:role.${r}`)}
          </PlainCheckbox>
        ))}
      </div>
      <p className="text-xs text-muted">{t('community:audience.hint')}</p>
    </fieldset>
  );
}

function NewCustomGroup({ open, onClose, blocks }: { open: boolean; onClose: () => void; blocks: Array<{ id: string; code: string }> }) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState('');
  const [audience, setAudience] = useState<ChatAudience>({ scope: 'site', ids: [], roles: ['owner'] as AudienceRole[] });
  const [posting, setPosting] = useState<'everyone' | 'office_only'>('everyone');
  const [error, setError] = useState<unknown>(null);
  const create = useApiMutation<ChatRuleView>();
  const close = () => {
    setName('');
    setAudience({ scope: 'site', ids: [], roles: ['owner'] });
    setPosting('everyone');
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('community:office.newCustom')}
      testId="custom-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={create.isPending}
            onPress={async () => {
              setError(null);
              try {
                const g = await create.mutateAsync({ method: 'POST', path: '/ops/chat/custom', body: { name, audience, postingPolicy: posting } });
                toast.success(t('community:office.customCreated', { name: g.name ?? name, count: g.memberCount }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="custom-create"
          >
            {t('community:office.create')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <PlainTextField label={t('community:office.groupName')} value={name} onChange={setName} testId="custom-name" />
        <AudiencePicker value={audience} onChange={setAudience} blocks={blocks} testId="custom-audience" />
        <SelectControl
          label={t('community:office.whoPosts')}
          value={posting}
          onChange={(v) => setPosting((v ?? 'everyone') as 'everyone' | 'office_only')}
          options={[
            { id: 'everyone', label: t('community:office.posting.everyone') },
            { id: 'office_only', label: t('community:office.posting.office_only') },
          ]}
          testId="custom-posting"
        />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function Reports() {
  const { t } = useT();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const view = status === 'closed' ? 'closed' : 'open';
  const q = useApiQuery<ChatReports>({ method: 'GET', path: '/ops/chat/reports', query: { status: view } }, { placeholderData: (prev) => prev });
  return (
    <div className="space-y-4" data-testid="chat-reports">
      <p className="text-sm text-muted">{t('community:office.reportsIntro')}</p>
      <SegmentedControl
        label={t('community:office.reportsShow')}
        value={view}
        onChange={(v) => setParams({ status: v === 'open' ? null : v })}
        options={[
          { id: 'open', label: t('community:office.reportsOpen', { count: q.data?.counts.open ?? 0 }) },
          { id: 'closed', label: t('community:office.reportsDecided') },
        ]}
        testId="reports-status"
        wrap
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={view === 'open' ? t('community:office.noReports') : t('community:office.noDecided')} />
      ) : (
        <ul className="space-y-3" data-testid="report-list">
          {q.data.items.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

const DECISION = { hidden: ['error', Ban], warned: ['warning', TriangleAlert], dismissed: ['neutral', BadgeCheck], open: ['info', ShieldAlert] } as const;

function ReportCard({ r }: { r: ChatReportView }) {
  const { t } = useT();
  const toast = useToast();
  const dt = dynamicT(t);
  const name = useChatGroupName();
  const [acting, setActing] = useState<'hide' | 'warn' | 'dismiss' | null>(null);
  const decide = useApiMutation<ChatReportView>();
  const [tone, icon] = DECISION[r.state];
  return (
    <li className="min-w-0 space-y-3 rounded-card border border-border bg-panel p-4" data-testid="report-card" data-state={r.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-[1_1_12em]">
          <p className="font-semibold text-text">
            <bdi dir="ltr">{r.ref}</bdi> · <bdi>{r.group.kind === 'custom' ? (r.group.name ?? '') : name({ kind: r.group.kind, ...(r.group.code ? { code: r.group.code } : {}) })}</bdi>
          </p>
          <p className="text-xs text-muted">
            {t('community:office.reporters', { count: r.reporters })} · {r.reasons.map((x) => t(`community:reportReason.${x}`)).join(', ')} · <When at={r.reportedAt} />
          </p>
        </div>
        <Badge tone={tone} icon={icon}>
          {t(`community:office.reportState.${r.state}`)}
        </Badge>
      </div>
      <blockquote className="space-y-1 rounded-tile border-s-4 border-border bg-sunken/40 p-3 text-sm" data-testid="report-message">
        <p className="text-xs text-muted">
          <bdi className="font-semibold text-text">{r.message.senderName}</bdi> · <When at={r.message.at} />
        </p>
        <p dir="auto" className="whitespace-pre-wrap break-words text-text">
          {r.message.text}
        </p>
      </blockquote>
      {r.notes.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-text">{t('community:office.reporterNotes')}</p>
          <ul className="list-disc ps-5 text-muted">
            {r.notes.map((n, i) => (
              <li key={i} className="break-words">
                <bdi>{n}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.decision && (
        <p className="text-sm break-words text-muted">
          {t('community:office.decidedBy', { name: r.decision.byName })} <When at={r.decision.at} />: <bdi>{r.decision.note}</bdi>
        </p>
      )}
      {r.state === 'open' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="sm" icon={Ban} onPress={() => setActing('hide')} className={WRAP} data-testid="report-hide">
            {t('community:office.hide')}
          </Button>
          <Button size="sm" icon={TriangleAlert} onPress={() => setActing('warn')} className={WRAP} data-testid="report-warn">
            {t('community:office.warn')}
          </Button>
          <Button size="sm" variant="quiet" icon={ShieldCheck} onPress={() => setActing('dismiss')} className={WRAP} data-testid="report-dismiss">
            {t('community:office.dismiss')}
          </Button>
        </div>
      )}
      {r.history.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('community:office.history')}</summary>
          <HistoryList label={t('community:office.history')} items={r.history.map((h) => ({ at: h.at, byName: h.byName || t('community:office.aResident'), label: dt(`community:office.event.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
        </details>
      )}
      <ConfirmDialog
        isOpen={!!acting}
        onOpenChange={(o) => !o && setActing(null)}
        title={acting ? t(`community:office.confirm.${acting}.title`) : ''}
        effect={acting ? t(`community:office.confirm.${acting}.effect`) : ''}
        confirmLabel={acting ? t(`community:office.${acting}`) : ''}
        destructive={acting === 'hide'}
        reasonLabel={t('community:office.decisionNote')}
        onConfirm={async (note) => {
          if (!acting) return;
          try {
            await decide.mutateAsync({ method: 'POST', path: `/ops/chat/reports/${r.id}/${acting}`, body: { note } });
            toast.success(t(`community:office.done.${acting}`));
            setActing(null);
          } catch (e) {
            const fields = e instanceof ApiError ? Object.values(e.problem.errors ?? {}).flat() : [];
            toast.error(e instanceof ApiError ? (fields[0] ? dt(fields[0].code, fields[0].params) : dt(e.problem.messageKey)) : t('errors:network.unavailable'));
          }
        }}
      />
    </li>
  );
}

function Policy() {
  const { t } = useT();
  const toast = useToast();
  const q = useApiQuery<ChatPolicy>({ method: 'GET', path: '/ops/chat/policy' });
  const [days, setDays] = useState<string | null>(null);
  const [etiquette, setEtiquette] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<ChatPolicy>();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const p = q.data;
  const daysValue = days ?? (p.retentionDays ? String(p.retentionDays) : '');
  const etiquetteValue = etiquette ?? p.etiquette;
  return (
    <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="chat-policy">
      <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
        <h2 className="text-lg font-semibold text-text">{t('community:policy.title')}</h2>
        {p.retentionDays ? (
          <p className="text-sm text-text" data-testid="policy-current">
            {t('community:policy.current', { count: p.retentionDays })}
          </p>
        ) : (
          <InlineAlert tone="warning" role="status" data-testid="policy-not-set">
            {t('community:policy.notSet')}
          </InlineAlert>
        )}
        <p className="text-sm text-muted">{t('community:policy.why')}</p>
        {p.held > 0 && <p className="text-sm text-muted">{t('community:policy.held', { count: p.held })}</p>}
        {p.actions.manage ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await save.mutateAsync({ method: 'PATCH', path: '/ops/chat/policy', body: { retentionDays: Number(daysValue), etiquette: etiquetteValue, legalReviewConfirmed: reviewed } });
                toast.success(t('community:policy.saved'));
                setDays(null);
                setEtiquette(null);
                setReviewed(false);
              } catch (err) {
                setError(err);
              }
            }}
            data-testid="policy-form"
          >
            <PlainTextField label={t('community:policy.days')} description={t('community:policy.daysHint')} value={daysValue} onChange={(v) => setDays(v.replace(/[^\d]/g, ''))} inputMode="numeric" dir="ltr" testId="policy-days" />
            <PlainTextArea label={t('community:policy.etiquette')} description={t('community:policy.etiquetteHint')} value={etiquetteValue} onChange={setEtiquette} rows={4} testId="policy-etiquette" />
            <PlainCheckbox isSelected={reviewed} onChange={setReviewed} testId="policy-reviewed">
              {t('community:policy.reviewed')}
            </PlainCheckbox>
            {error ? <ProblemAlert error={error} /> : null}
            <Button type="submit" variant="primary" isPending={save.isPending} data-testid="policy-save">
              {t('community:policy.save')}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">{t('community:policy.readOnly')}</p>
        )}
      </section>
      <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
        <h2 className="text-lg font-semibold text-text">{t('community:policy.rulesTitle')}</h2>
        <ul className="space-y-2 text-sm text-text">
          <li data-testid="policy-dm">{t('community:policy.directOff')}</li>
          <li>{t('community:policy.history')}</li>
          <li>{t('community:policy.revocation')}</li>
          <li>{t('community:policy.moderation')}</li>
        </ul>
        <h3 className="font-semibold text-text">{t('community:policy.versions')}</h3>
        {p.versions.length === 0 ? (
          <p className="text-sm text-muted">{t('community:policy.noVersions')}</p>
        ) : (
          <HistoryList label={t('community:policy.versions')} items={p.versions.map((v) => ({ at: v.changedAt, byName: v.changedByName, label: t('community:policy.version', { version: v.version, count: v.retentionDays }) }))} testId="policy-versions" />
        )}
      </section>
    </div>
  );
}
