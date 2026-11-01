import type { GateRequest, ResidentNotifications } from '@repo/contracts';
import { Button, Dialog, Drawer, IconButton, Link, useApiMutation, useApiQuery, useNavigation, useT, useToast } from '@repo/ui';
import { Bell, CheckCheck, CheckCircle2, DoorClosed, Megaphone, PhoneCall, Wrench, Car, DoorOpen, CalendarCheck, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePortalFormat } from '../portal/shared';
import { DEMO_TODAY, demoNow, useWords } from './rkit';

/**
 * PORTAL-040: a visitor without a pass is at the gate and the guard asked this resident (only the
 * flat's current occupants are asked). The app checks every 15 seconds (simulated; there is no live
 * security service in the prototype). The first answer is final; an unanswered request expires.
 */
export function GatePrompt() {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const q = useApiQuery<{ refreshSeconds: number; items: GateRequest[] }>({ method: 'GET', path: '/portal/gate-requests' }, { retry: false, refetchInterval: 15_000 });
  const act = useApiMutation<GateRequest>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const r = (q.data?.items ?? []).find((x) => !dismissed.includes(x.id));
  if (!r) return null;
  const answer = async (action: 'approve' | 'deny' | 'call') => {
    try {
      await act.mutateAsync({ method: 'POST', path: `/portal/gate-requests/${r.id}/${action}`, body: {} });
      toast.success(t(`operations:gate.answered.${action}`, { name: r.visitorName }));
      if (action !== 'call') setDismissed((d) => [...d, r.id]);
      void q.refetch();
    } catch {
      toast.error(t('operations:gate.tooLate'));
      setDismissed((d) => [...d, r.id]);
      void q.refetch();
    }
  };
  // The countdown reads the server's expiry against the demo day's clock (simulated).
  void now;
  const left = Math.max(0, Math.round((Date.parse(r.expiresAt) - demoNow().getTime()) / 1000));
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && setDismissed((d) => [...d, r.id])}
      role="alertdialog"
      title={t('operations:gate.promptTitle', { flat: r.flat.code })}
      description={t('operations:gate.promptBody', { name: r.visitorName, purpose: w.purpose(r.purpose), guard: r.guardName })}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="primary" size="lg" icon={CheckCircle2} isPending={act.isPending} onPress={() => void answer('approve')} className="justify-center" data-testid="gate-approve">
            {t('operations:gate.approve')}
          </Button>
          <Button variant="secondary" size="lg" icon={DoorClosed} isPending={act.isPending} onPress={() => void answer('deny')} className="justify-center" data-testid="gate-deny">
            {t('operations:gate.deny')}
          </Button>
          <Button variant="quiet" size="lg" icon={PhoneCall} isPending={act.isPending} isDisabled={r.callRequested} onPress={() => void answer('call')} className="justify-center" data-testid="gate-call">
            {r.callRequested ? t('operations:gate.callAsked') : t('operations:gate.call')}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm" data-testid="gate-prompt" data-request={r.id}>
        {r.vehiclePlate && (
          <p className="text-text">
            {t('operations:gate.vehicle')} <bdi dir="ltr" className="ltr-ref font-semibold">{r.vehiclePlate}</bdi>
          </p>
        )}
        <p className="text-muted">{t('operations:gate.askedAt', { time: fmt.instantTime(r.createdAt) })} · {t('operations:gate.expiresIn', { seconds: left })}</p>
        <p className="text-xs text-muted">{t('operations:gate.simulated')}</p>
      </div>
    </Dialog>
  );
}

const KIND_ICON = { notice: Megaphone, message: MessageSquare, request: Wrench, gate: DoorOpen, vehicle: Car, booking: CalendarCheck } as const;

/**
 * PORTAL-042: the resident's notifications behind the bell in the header. Notices, messages and the
 * resident's own requests, gate and vehicle news; checked again every time it is read (a withdrawn
 * notice shows as withdrawn; someone who left a notice's audience no longer sees it). The unread count
 * is spoken as words.
 */
export function NotificationsBell() {
  const { t } = useT();
  const { navigate } = useNavigation();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [open, setOpen] = useState(false);
  const q = useApiQuery<ResidentNotifications>({ method: 'GET', path: '/portal/notifications' }, { retry: false, refetchInterval: 30_000 });
  const read = useApiMutation<ResidentNotifications>();
  if (q.isError || !q.data) return null;
  const unread = q.data.unread;
  return (
    <>
      <span className="relative inline-flex">
        <IconButton label={unread ? t('operations:bell.labelUnread', { count: unread }) : t('operations:bell.label')} icon={Bell} onPress={() => setOpen(true)} data-testid="portal-bell" />
        {unread > 0 && (
          <span aria-hidden className="pointer-events-none absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-pill bg-error px-1 text-[0.7rem] leading-5 font-bold text-on-primary" data-testid="portal-bell-count">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </span>
      <Drawer
        isOpen={open}
        onOpenChange={setOpen}
        title={t('operations:bell.title')}
        subtitle={unread ? t('operations:bell.unread', { count: unread }) : t('operations:bell.allRead')}
        testId="notifications-panel"
        footer={
          unread > 0 ? (
            <Button variant="secondary" icon={CheckCheck} isPending={read.isPending} onPress={async () => { await read.mutateAsync({ method: 'POST', path: '/portal/notifications/read-all', body: {} }); void q.refetch(); }} data-testid="bell-read-all">
              {t('operations:bell.readAll')}
            </Button>
          ) : undefined
        }
      >
        {q.data.items.length === 0 ? (
          <p className="text-sm text-muted">{t('operations:bell.empty')}</p>
        ) : (
          <ul className="space-y-2" data-testid="notification-list">
            {q.data.items.map((n) => {
              const Icon = KIND_ICON[n.kind];
              const values = { ...n.values, ...(n.values.date ? { date: fmt.date(n.values.date) } : {}), ...(n.values.slot ? { slot: t(`operations:slot.${n.values.slot}` as 'operations:slot.morning') } : {}), ...(n.values.amenity ? { amenity: t(`operations:amenity.${n.values.amenity}.name` as 'operations:amenity.gym.name') } : {}) };
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    variant="plain"
                    onPress={async () => {
                      setOpen(false);
                      if (!n.read) await read.mutateAsync({ method: 'POST', path: `/portal/notifications/${n.id}/read`, body: {} }).catch(() => undefined);
                      void q.refetch();
                      navigate(n.href);
                    }}
                    className={`flex items-start gap-3 rounded-tile border p-3 hover:bg-raised ${n.read ? 'border-border' : 'border-primary/40 bg-primary-soft/30'}`}
                    data-testid="notification"
                    data-kind={n.kind}
                    data-read={n.read}
                  >
                    <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className={`block ${n.read ? 'text-text' : 'font-semibold text-text'}`}>{t(`operations:notify.${n.key}` as 'operations:notify.noticePublished', values)}</span>
                      <span className="block text-xs text-muted">
                        {fmt.instantTime(n.at)}
                        {!n.read ? ` · ${t('operations:bell.new')}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">{t('operations:bell.simulated')}</p>
      </Drawer>
    </>
  );
}
