import type { SessionRecord, StaffUserDetail, StaffUserRow } from '@repo/contracts';
import { formatInstant, useLocale } from '@repo/i18n';
import { Badge, Button, ConfirmDialog, Drawer, ErrorState, InlineAlert, PageHeader, Skeleton, useAnnounce, useApiMutation, useApiQuery, useDeviceName, useQueryParam, useT, useToast } from '@repo/ui';
import { ChevronRight, House, LogOut, ShieldOff } from 'lucide-react';
import { useState } from 'react';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/**
 * ADM-003 User workspace, sessions part (Gate D.1). An administrator sees their own organisation's
 * staff, where each is signed in to the office app and their recent security activity, and can end
 * a session (needs sessions.manage; recorded for the person). Residents never appear here, and no
 * other organisation's people exist for this screen (the server answers "not found").
 */
export default function UserWorkspacePage() {
  const { t } = useT();
  const { locale } = useLocale();
  const [record, setRecord] = useQueryParam('record');
  const query = useApiQuery<StaffUserRow[]>({ method: 'GET', path: '/admin/users' });
  const stamp = (iso: string) => formatInstant(iso, locale, 'dateTime');
  return (
    <div className="@container space-y-6">
      <PageHeader title={t('nav:pages.users')} description={t('identity:users.intro')} />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="staff-list">
          {query.data.map((u) => (
            <li key={u.principalId}>
              <button
                type="button"
                onClick={() => setRecord(u.principalId)}
                className="flex w-full items-start gap-3 rounded-card border border-border/70 bg-panel p-4 text-start shadow-card outline-none hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-focus"
                data-testid="staff-row"
                data-principal={u.principalId}
              >
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary-soft text-sm font-semibold text-primary">
                  {initials(u.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <bdi className="font-semibold text-text">{u.name}</bdi>
                    {u.alsoResident && (
                      <Badge tone="neutral" icon={House}>
                        {t('identity:users.alsoResident')}
                      </Badge>
                    )}
                  </span>
                  <span className="block text-sm text-muted">{t(u.roleKey as 'common:persona.manager')}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {u.activeSessions ? t('identity:users.active', { count: u.activeSessions }) : t('identity:users.none')}
                    {u.lastActiveAt ? ` · ${t('identity:users.lastActive', { when: stamp(u.lastActiveAt) })}` : ''}
                  </span>
                </span>
                <ChevronRight aria-hidden className="mt-2 size-4 shrink-0 text-muted rtl:rotate-180" />
                <span className="sr-only">{t('identity:users.open')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <UserDrawer principalId={record} onClose={() => setRecord(null)} />
    </div>
  );
}

function UserDrawer({ principalId, onClose }: { principalId: string | null; onClose: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const announce = useAnnounce();
  const { ofDevice, ofLabel } = useDeviceName();
  const query = useApiQuery<StaffUserDetail>(principalId ? { method: 'GET', path: `/admin/users/${principalId}` } : null);
  const mutate = useApiMutation<{ ended?: number }>();
  const [ending, setEnding] = useState<SessionRecord | null>(null);
  const [all, setAll] = useState(false);
  const u = query.data;
  const stamp = (iso: string) => formatInstant(iso, locale, 'dateTime');
  const active = u?.sessions.filter((s) => s.state === 'active') ?? [];
  const say = (msg: string) => {
    toast.success(msg);
    announce(msg);
  };
  return (
    <Drawer isOpen={!!principalId} onOpenChange={(open) => !open && onClose()} title={u?.name ?? t('identity:users.open')} subtitle={u ? t(u.roleKey as 'common:persona.manager') : undefined} size="lg" testId="staff-drawer">
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !u ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          <p className="flex flex-wrap gap-2">
            {u.isYou && <Badge tone="success">{t('identity:users.you')}</Badge>}
            <Badge tone="neutral">{t('identity:users.permissions', { count: u.permissions })}</Badge>
            {u.alsoResident && (
              <Badge tone="neutral" icon={House}>
                {t('identity:users.alsoResident')}
              </Badge>
            )}
          </p>
          {u.isYou && <InlineAlert tone="info">{t('identity:users.yoursHint')}</InlineAlert>}
          {!u.canManageSessions && <InlineAlert tone="info">{t('identity:users.noManage')}</InlineAlert>}

          <section aria-labelledby="staff-sessions" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="staff-sessions" className="text-base font-semibold text-text">
                {t('identity:users.sessionsTitle')}
              </h3>
              {u.canManageSessions && !u.isYou && active.length > 0 && (
                <Button size="sm" variant="secondary" icon={ShieldOff} className="max-w-full whitespace-normal text-start" onPress={() => setAll(true)} data-testid="staff-sign-out-all">
                  {t('identity:users.signOutAll')}
                </Button>
              )}
            </div>
            {u.sessions.length === 0 ? (
              <p className="text-sm text-muted">{t('identity:users.noSessions')}</p>
            ) : (
              <ul className="space-y-2" data-testid="staff-sessions">
                {u.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-tile border border-border p-3" data-state={s.state}>
                    <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                        {ofDevice(s.device)}
                        {s.current && <Badge tone="success">{t('identity:sessions.current')}</Badge>}
                        {s.state !== 'active' && <Badge tone="neutral">{t(`identity:sessions.endReason.${s.endReason ?? 'expired'}`)}</Badge>}
                      </p>
                      <p className="text-xs text-muted">
                        {t('identity:sessions.lastActive', { when: stamp(s.lastActiveAt) })}
                        {s.approxPlace ? ` · ${t('identity:sessions.around', { place: s.approxPlace })}` : ''}
                        {s.endedByName ? ` · ${s.endedByName}` : ''}
                      </p>
                    </div>
                    {u.canManageSessions && s.state === 'active' && !s.current && (
                      <Button size="sm" variant="secondary" icon={LogOut} className="max-w-full whitespace-normal text-start" onPress={() => setEnding(s)} data-testid="staff-session-revoke">
                        {t('identity:users.signOutDevice')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{t('identity:users.residentNote')}</p>
          </section>

          <section aria-labelledby="staff-activity" className="space-y-2">
            <h3 id="staff-activity" className="text-base font-semibold text-text">
              {t('identity:users.activityTitle')}
            </h3>
            <ol className="divide-y divide-border">
              {u.events.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <span className="font-medium text-text">{t(`identity:activity.kind.${e.kind}`)}</span>
                  {e.byName && <span className="text-muted"> {t('identity:activity.by', { name: e.byName })}</span>}
                  <span className="block text-xs text-muted">
                    {stamp(e.at)}
                    {e.deviceLabel ? ` · ${ofLabel(e.deviceLabel)}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      <ConfirmDialog
        isOpen={!!ending}
        onOpenChange={(open) => !open && setEnding(null)}
        title={u && ending ? t('identity:users.signOutTitle', { device: ofDevice(ending.device), name: u.name }) : ''}
        effect={u ? t('identity:users.signOutEffect', { name: u.name }) : ''}
        confirmLabel={t('identity:users.signOutDevice')}
        destructive
        onConfirm={async () => {
          if (!u || !ending) return;
          try {
            await mutate.mutateAsync({ method: 'POST', path: `/admin/users/${u.principalId}/sessions/${ending.id}/revoke` });
            say(t('identity:users.signedOut', { device: ofDevice(ending.device), name: u.name }));
          } catch {
            toast.error(t('identity:sessions.failed'));
          }
        }}
      />
      <ConfirmDialog
        isOpen={all}
        onOpenChange={setAll}
        title={u ? t('identity:users.signOutAllTitle', { name: u.name }) : ''}
        effect={u ? t('identity:users.signOutAllEffect', { name: u.name }) : ''}
        confirmLabel={t('identity:users.signOutAll')}
        destructive
        onConfirm={async () => {
          if (!u) return;
          try {
            const r = await mutate.mutateAsync({ method: 'POST', path: `/admin/users/${u.principalId}/sessions/revoke-all` });
            say(t('identity:users.signedOutAll', { count: r.ended ?? 0 }));
          } catch {
            toast.error(t('identity:sessions.failed'));
          }
        }}
      />
    </Drawer>
  );
}
