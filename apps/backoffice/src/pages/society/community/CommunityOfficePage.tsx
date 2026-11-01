import { useState } from 'react';
import { Badge, Button, InlineAlert, Link, PageHeader, useApiMutation, useApiQuery, useSession, useT, useToast } from '@repo/ui';
import { MessageCircle, ShieldAlert, Users, ShieldCheck, Trash2, XCircle } from 'lucide-react';

interface Group { id: string; title: string; kind: 'site' | 'block' | 'floor'; memberCount: number }
interface Config { retentionDays: number | null; groups: Group[]; history: Array<{ days: number; changedAt: string; changedById: string }> }
interface Report {
  id: string; messageId: string; groupId: string; reason: string; reportedAt: string;
  reportedById: string; state: 'open' | 'dismissed' | 'removed';
  message: { text: string; senderName: string; at: string } | null;
}
interface Reports { items: Report[] }

/** D.3: office-only moderation and explicit tenant retention policy (fictional mock data). */
export default function CommunityOfficePage() {
  const { t } = useT();
  const { can } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<'groups' | 'reports'>('groups');
  const [days, setDays] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const config = useApiQuery<Config>({ method: 'GET', path: '/ops/chat/groups' }, { enabled: can('chat.groups.manage'), retry: false });
  const reports = useApiQuery<Reports>({ method: 'GET', path: '/ops/chat/reports' }, { enabled: can('chat.moderate'), retry: false });
  const save = useApiMutation<{ retentionDays: number; available: boolean }>();
  const decide = useApiMutation<{ id: string; state: 'dismissed' | 'removed' }>();
  const retention = days || String(config.data?.retentionDays ?? '');
  const pending = reports.data?.items.filter(r => r.state === 'open') ?? [];
  const reportCount = pending.length;
  return (
    <div className="@container space-y-6" data-testid="office-community-chat">
      <PageHeader title={t('operations:communityOffice.title')} description={t('operations:communityOffice.intro')} />
      <InlineAlert tone="info" role="status">{t('operations:communityOffice.demoOnly')}</InlineAlert>
      <nav aria-label={t('operations:communityOffice.tabs')} className="flex flex-wrap gap-2">
        {can('chat.groups.manage') && <Button variant={tab === 'groups' ? 'primary' : 'secondary'} onPress={() => setTab('groups')} data-testid="office-chat-groups-tab"><Users aria-hidden className="size-4" />{t('operations:communityOffice.groups')}</Button>}
        {can('chat.moderate') && <Button variant={tab === 'reports' ? 'primary' : 'secondary'} onPress={() => setTab('reports')} data-testid="office-chat-reports-tab"><ShieldAlert aria-hidden className="size-4" />{t('operations:communityOffice.reports')} ({reportCount})</Button>}
      </nav>

      {tab === 'groups' && can('chat.groups.manage') && (
        <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,1fr)]">
          <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
            <h2 className="text-lg font-semibold">{t('operations:communityOffice.autoGroups')}</h2>
            <p className="text-sm text-muted">{t('operations:communityOffice.autoGroupsHint')}</p>
            {config.isError && <InlineAlert tone="error" role="alert">{t('operations:communityOffice.couldNotLoad')}</InlineAlert>}
            {!config.data && !config.isError && <p role="status">{t('operations:community.loading')}</p>}
            <ul className="space-y-2">
              {config.data?.groups.map(g => <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-raised p-3">
                <span className="min-w-0">
                  <span className="block break-words font-medium">{g.title}</span>
                  <span className="block text-xs text-muted">{t(`operations:communityOffice.kind.${g.kind}`)}</span>
                </span>
                <Badge tone="neutral" icon={Users}>{t('operations:communityOffice.members', {count:g.memberCount})}</Badge>
              </li>)}
            </ul>
          </section>
          <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck aria-hidden className="size-5 text-primary" />{t('operations:communityOffice.retention')}</h2>
            <p className="text-sm text-muted">{t('operations:communityOffice.retentionHint')}</p>
            <Badge tone={config.data?.retentionDays ? 'success' : 'warning'}>{config.data?.retentionDays ? t('operations:communityOffice.active') : t('operations:communityOffice.notActive')}</Badge>
            <form className="space-y-4" onSubmit={async e => {
              e.preventDefault(); setError(false);
              if (!Number.isInteger(Number(retention)) || Number(retention) < 1 || Number(retention) > 3650 || !reviewed) { setError(true); return; }
              try {
                await save.mutateAsync({method:'PATCH',path:'/ops/chat/policy',body:{retentionDays:Number(retention),legalReviewConfirmed:reviewed}});
                setReviewed(false); setDays(''); await config.refetch(); toast.success(t('operations:communityOffice.saved'));
              } catch { setError(true); }
            }}>
              <label className="block space-y-2 text-sm font-medium" htmlFor="community-retention-days">
                <span>{t('operations:communityOffice.retentionDays')}</span>
                <input id="community-retention-days" type="number" min={1} max={3650} step={1} value={retention} onChange={e => setDays(e.currentTarget.value)}
                  className="block min-h-11 w-full rounded-control border border-border bg-bg px-3 py-2 text-text" />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.currentTarget.checked)}
                  className="mt-1 size-4" />
                <span>{t('operations:communityOffice.reviewAcknowledgement')}</span>
              </label>
              {error && <InlineAlert tone="error" role="alert">{t('operations:communityOffice.invalid')}</InlineAlert>}
              <Button type="submit" isPending={save.isPending} isDisabled={!reviewed || save.isPending}>{t('operations:communityOffice.save')}</Button>
            </form>
            <h3 className="pt-2 font-semibold">{t('operations:communityOffice.history')}</h3>
            <ul className="space-y-1 text-xs text-muted">
              {config.data?.history.map((h,i) => <li key={i}><bdi dir="ltr">{h.changedAt.slice(0,10)}</bdi> · {t('operations:communityOffice.daysValue', {count:h.days})}</li>)}
            </ul>
          </section>
        </div>
      )}

      {tab === 'reports' && can('chat.moderate') && (
        <section className="space-y-4 rounded-card border border-border bg-panel p-4" data-testid="office-chat-reports">
          <h2 className="text-lg font-semibold">{t('operations:communityOffice.reportReview')}</h2>
          <p className="text-sm text-muted">{t('operations:communityOffice.reportPrivacy')}</p>
          {reports.isError && <InlineAlert tone="error" role="alert">{t('operations:communityOffice.couldNotLoad')}</InlineAlert>}
          {!reports.data && !reports.isError && <p role="status">{t('operations:community.loading')}</p>}
          {reports.data && pending.length === 0 && <p className="text-muted">{t('operations:communityOffice.noReports')}</p>}
          <ul className="space-y-4">
            {pending.map(r => <li key={r.id} className="min-w-0 space-y-3 rounded-tile border border-border bg-raised p-4">
              <p className="text-xs text-muted"><bdi dir="ltr">{r.groupId}</bdi> · <bdi dir="ltr">{r.reportedAt.slice(0,16)}</bdi></p>
              <p className="break-words font-medium">{r.reason}</p>
              {r.message && <blockquote className="break-words border-s-4 border-border ps-3 text-sm"><bdi>{r.message.text}</bdi></blockquote>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={XCircle} isDisabled={decide.isPending} onPress={async () => {
                  try { await decide.mutateAsync({method:'POST',path:`/ops/chat/reports/${r.id}/decide`,body:{action:'dismissed'}}); await reports.refetch(); toast.success(t('operations:communityOffice.dismissed')); }
                  catch { toast.error(t('operations:communityOffice.couldNotSave')); }
                }}>{t('operations:communityOffice.dismiss')}</Button>
                {confirmRemove === r.id ? (
                  <>
                    <Button variant="danger" icon={Trash2} isDisabled={decide.isPending} onPress={async () => {
                      try { await decide.mutateAsync({method:'POST',path:`/ops/chat/reports/${r.id}/decide`,body:{action:'removed'}}); setConfirmRemove(null); await reports.refetch(); toast.success(t('operations:communityOffice.removed')); }
                      catch { toast.error(t('operations:communityOffice.couldNotSave')); }
                    }}>{t('operations:communityOffice.confirmRemove')}</Button>
                    <Button variant="quiet" onPress={() => setConfirmRemove(null)}>{t('operations:communityOffice.cancel')}</Button>
                  </>
                ) : <Button variant="danger" icon={Trash2} onPress={() => setConfirmRemove(r.id)}>{t('operations:communityOffice.remove')}</Button>}
              </div>
            </li>)}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted"><MessageCircle aria-hidden className="inline size-4" /> {t('operations:communityOffice.noticesIndependent')} <Link href="/backoffice/res/community-announcements">{t('operations:communityOffice.officialNotices')}</Link></p>
    </div>
  );
}
