import type { DeviceInfo, MySecurity, SecurityEvent, SessionRecord } from '@repo/contracts';
import { formatInstant, useLocale } from '@repo/i18n';
import {
  ArrowLeftRight,
  BadgeCheck,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Monitor,
  ShieldAlert,
  ShieldOff,
  Smartphone,
  Tablet,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiQuery } from '../data/TransportProvider';
import { Badge } from '../data/StatusLabel';
import { useApiMutation } from '../data/useApi';
import { ErrorState } from '../feedback/States';
import { Skeleton } from '../feedback/Skeleton';
import { useToast } from '../feedback/Toast';
import { Panel } from '../layout/Panel';
import { useT } from '../lib/useT';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { useSignOut } from '../permissions/useSignOut';
import { Button } from '../primitives/Button';

const KIND_ICON: Record<DeviceInfo['kind'], LucideIcon> = { desktop: Monitor, phone: Smartphone, tablet: Tablet };
const PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios', 'other'] as const;

/** "Chrome on Windows", in the reader's language (browser and system names stay as they are). */
export function useDeviceName() {
  const { t } = useT();
  const name = (browser: string, platform: string) =>
    t('identity:sessions.device', { browser, platform: t(`identity:sessions.platform.${(PLATFORMS as readonly string[]).includes(platform) ? platform : 'other'}` as 'identity:sessions.platform.other') });
  return {
    ofDevice: (d: DeviceInfo) => name(d.browser, d.platform),
    /** Event labels are stored as "Browser · platform". */
    ofLabel: (label: string) => {
      const [browser, platform] = label.split(' · ');
      return platform ? name(browser!, platform) : label;
    },
  };
}

function useStamp() {
  const { locale } = useLocale();
  return (iso: string, style: 'date' | 'dateTime' = 'dateTime') => formatInstant(iso, locale, style);
}

/**
 * Signed-in devices (GLOBAL-016 in the office app, PORTAL-041 in the resident app). Every active
 * session of this person in this organisation, the one in use first; sign out any other one, or all
 * others at once. Ended sessions stay listed as history. The server only ever returns the caller's
 * own sessions.
 */
export function DevicesPanel() {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const stamp = useStamp();
  const { ofDevice } = useDeviceName();
  const signOutHere = useSignOut();
  const query = useApiQuery<MySecurity>({ method: 'GET', path: '/me/security' });
  const mutate = useApiMutation<{ ended?: number }>();
  const [revoking, setRevoking] = useState<SessionRecord | null>(null);
  const [allOthers, setAllOthers] = useState(false);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data)
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  const sessions = query.data.sessions;
  const active = sessions.filter((s) => s.state === 'active');
  const ended = sessions.filter((s) => s.state !== 'active');
  const others = active.filter((s) => !s.current);

  return (
    <div className="space-y-6" data-testid="devices-panel">
      <Panel
        title={t('identity:sessions.title')}
        description={t('identity:sessions.intro')}
        actions={
          others.length > 0 ? (
            <Button variant="secondary" size="sm" icon={ShieldOff} className="max-w-full whitespace-normal text-start" onPress={() => setAllOthers(true)} data-testid="sessions-sign-out-others">
              {t('identity:sessions.signOutOthers')}
            </Button>
          ) : undefined
        }
      >
        <p className="mb-3 text-sm text-muted" data-testid="sessions-count">
          {t('identity:sessions.activeCount', { count: active.length })}
        </p>
        <ul className="space-y-2.5">
          {active.map((s) => {
            const Icon = KIND_ICON[s.device.kind];
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-tile border border-border/70 bg-raised/50 p-3 sm:p-4" data-testid="session-row" data-current={s.current} data-session={s.id}>
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-text">{ofDevice(s.device)}</span>
                    {s.current && (
                      <Badge tone="success" icon={BadgeCheck} data-testid="session-current">
                        {t('identity:sessions.current')}
                      </Badge>
                    )}
                    <Badge tone="neutral">{t(`identity:sessions.app.${s.app}`)}</Badge>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t('identity:sessions.lastActive', { when: stamp(s.lastActiveAt) })} · {t('identity:sessions.since', { date: stamp(s.createdAt, 'date') })}
                    {s.approxPlace ? ` · ${t('identity:sessions.around', { place: s.approxPlace })}` : ''}
                  </p>
                </div>
                {s.current ? (
                  <Button size="sm" variant="quiet" icon={LogOut} className="max-w-full whitespace-normal text-start" onPress={signOutHere} data-testid="session-sign-out-here">
                    {t('identity:sessions.signOutHere')}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon={LogOut} className="max-w-full whitespace-normal text-start" onPress={() => setRevoking(s)} data-testid="session-revoke">
                    {t('identity:sessions.revoke')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {others.length === 0 && <p className="mt-3 text-sm text-muted">{t('identity:sessions.noOthers')}</p>}
      </Panel>

      {ended.length > 0 && (
        <Panel title={t('identity:sessions.endedTitle')}>
          <ul className="divide-y divide-border" data-testid="sessions-ended">
            {ended.map((s) => {
              const reason = t(`identity:sessions.endReason.${s.endReason ?? 'expired'}`);
              const date = stamp(s.endedAt ?? s.lastActiveAt);
              return (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
                  <span className="text-text">
                    {ofDevice(s.device)} <span className="text-muted">· {t(`identity:sessions.app.${s.app}`)}</span>
                  </span>
                  <span className="text-xs text-muted">{s.endedByName && s.endReason === 'revoked_by_admin' ? t('identity:sessions.endedBy', { reason, name: s.endedByName, date }) : t('identity:sessions.endedOn', { reason, date })}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        isOpen={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('identity:sessions.revokeTitle', { device: revoking ? ofDevice(revoking.device) : '' })}
        effect={t('identity:sessions.revokeEffect')}
        confirmLabel={t('identity:sessions.revoke')}
        destructive
        onConfirm={async () => {
          if (!revoking) return;
          const device = ofDevice(revoking.device);
          try {
            await mutate.mutateAsync({ method: 'POST', path: `/me/sessions/${revoking.id}/revoke` });
            toast.success(t('identity:sessions.revoked', { device }));
            announce(t('identity:sessions.revoked', { device }));
          } catch {
            toast.error(t('identity:sessions.failed'));
          }
        }}
      />
      <ConfirmDialog
        isOpen={allOthers}
        onOpenChange={setAllOthers}
        title={`${t('identity:sessions.signOutOthers')}?`}
        effect={t('identity:sessions.signOutOthersEffect')}
        confirmLabel={t('identity:sessions.signOutOthers')}
        destructive
        onConfirm={async () => {
          try {
            const r = await mutate.mutateAsync({ method: 'POST', path: '/me/sessions/sign-out-others' });
            const msg = t('identity:sessions.othersDone', { count: r.ended ?? 0 });
            toast.success(msg);
            announce(msg);
          } catch {
            toast.error(t('identity:sessions.failed'));
          }
        }}
      />
    </div>
  );
}

const EVENT_ICON: Record<SecurityEvent['kind'], LucideIcon> = {
  signed_in: LogIn,
  signed_out: LogOut,
  session_revoked: ShieldOff,
  other_sessions_signed_out: ShieldOff,
  session_revoked_by_admin: ShieldAlert,
  switched_app: ArrowLeftRight,
  invitation_accepted: UserRoundCheck,
  portal_access_revoked: ShieldAlert,
  code_failed: KeyRound,
  contact_changed: Mail,
  export_requested: BadgeCheck,
  export_downloaded: BadgeCheck,
  privacy_request_submitted: BadgeCheck,
};

/** Recent sign-ins, sign-outs and account changes, newest first (the caller's own only). */
export function SecurityActivity({ audience }: { audience: 'staff' | 'resident' }) {
  const { t } = useT();
  const stamp = useStamp();
  const { ofLabel } = useDeviceName();
  const query = useApiQuery<MySecurity>({ method: 'GET', path: '/me/security' });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const events = query.data?.events;
  return (
    <Panel title={t('identity:activity.title')} description={t('identity:activity.intro')}>
      {!events ? (
        <Skeleton className="h-40 w-full" />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted">{t('identity:activity.empty')}</p>
      ) : (
        <ol className="space-y-1" data-testid="security-activity">
          {events.map((e) => {
            const Icon = EVENT_ICON[e.kind];
            const warn = e.kind === 'code_failed' || e.kind === 'session_revoked_by_admin' || e.kind === 'portal_access_revoked';
            return (
              <li key={e.id} className="flex items-start gap-3 rounded-tile px-1 py-2" data-kind={e.kind}>
                <span aria-hidden className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-pill ${warn ? 'bg-warning-soft text-warning' : 'bg-sunken text-muted'}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    {t(`identity:activity.kind.${e.kind}`)}
                    {e.byName ? <span className="font-normal text-muted"> {t('identity:activity.by', { name: e.byName })}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    <time dateTime={e.at}>{stamp(e.at)}</time> · {t(`identity:sessions.app.${e.app}`)}
                    {e.deviceLabel ? ` · ${ofLabel(e.deviceLabel)}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 border-t border-border pt-3 text-sm text-muted">{audience === 'staff' ? t('identity:activity.unfamiliarStaff') : t('identity:activity.unfamiliarResident')}</p>
    </Panel>
  );
}
