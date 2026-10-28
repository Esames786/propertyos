import type { AppNotification } from '@repo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Dialog, DialogTrigger, Heading, Link, Popover } from 'react-aria-components';
import { useApiQuery, useTransport } from '../data/TransportProvider';
import { DateTime } from '../data/DateTime';
import { Reference } from '../data/Reference';
import { SkeletonBlock } from '../feedback/Skeleton';
import { ErrorState } from '../feedback/States';
import { cn } from '../lib/cn';
import { dynamicT, useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';

export function useNotifications() {
  return useApiQuery<AppNotification[]>({ method: 'GET', path: '/notifications' });
}

/** Notification list in a popover dialog. Unread state is text + dot, and the count is in the button's name. */
export function NotificationsPanel({ className }: { className?: string }) {
  const { t } = useT();
  const { transport } = useTransport();
  const queryClient = useQueryClient();
  const query = useNotifications();
  const unread = (query.data ?? []).filter((n) => !n.read).length;
  const markAll = useMutation({
    mutationFn: () => transport.request({ method: 'POST', path: '/notifications/read-all' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api'] }),
  });

  return (
    <DialogTrigger>
      <IconButton
        label={unread ? t('nav:header.notificationsUnread', { count: unread }) : t('nav:header.notifications')}
        icon={Bell}
        className={className}
        data-testid="notifications-button"
        badge={
          unread > 0 ? (
            <span aria-hidden className="absolute top-1.5 end-1.5 grid min-w-4 place-items-center rounded-pill bg-error px-1 text-micro font-semibold text-inverse">
              {unread}
            </span>
          ) : null
        }
      />
      <Popover placement="bottom end" offset={6} className="w-[min(24rem,calc(100vw-1rem))] rounded-card border border-border bg-panel shadow-overlay data-entering:animate-overlay-in">
        <Dialog className="outline-none" data-testid="notifications-panel">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <Heading slot="title" className="text-sm font-semibold text-text">
              {t('common:notifications.panelTitle')}
            </Heading>
            {unread > 0 && (
              <Button size="sm" variant="quiet" icon={CheckCheck} isPending={markAll.isPending} onPress={() => markAll.mutate()}>
                {t('common:actions.markAllRead')}
              </Button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <NotificationList />
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/** The notification list itself; used in the header panel and on the full GLOBAL-004 page. */
export function NotificationList() {
  const { t } = useT();
  const query = useNotifications();
  if (query.isPending) return <SkeletonBlock className="p-4" />;
  if (query.isError)
    return (
      <div className="p-3">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  if (query.data.length === 0) return <p className="p-4 text-sm text-muted">{t('common:notifications.empty')}</p>;
  return (
    <ul className="divide-y divide-border" data-testid="notification-list">
      {query.data.map((n) => (
        <li key={n.id}>
          <Link href={n.href} className="flex gap-3 px-4 py-3 outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus">
            <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-pill', n.read ? 'bg-transparent' : 'bg-primary')} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text">
                {!n.read && <span className="sr-only">{t('common:state.unread')}: </span>}
                {dynamicT(t)(`common:${n.titleKey}`)}
              </span>
              <span className="block text-sm text-muted">{renderBody(dynamicT(t)(`common:${n.bodyKey}`, mark(n.params)), n.params)}</span>
              <span className="mt-1 block text-xs text-muted">
                <DateTime value={n.createdAt} relative />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Wrap parameter values in markers, then render them as bidi-isolated references. */
const MARK = '\u0001';
const mark = (params: Record<string, string>) => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, `${MARK}${v}${MARK}`]));

function renderBody(text: string, params: Record<string, string>) {
  const values = new Set(Object.values(params));
  return text.split(MARK).map((part, i) => (values.has(part) ? <Reference key={i} value={part} /> : <span key={i}>{part}</span>));
}
