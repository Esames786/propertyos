import { ApiError, CHAT_REPORT_REASONS, type ChatConversation, type ChatGroupSummary, type ChatGroups, type ChatMessageView, type ChatReportReason, type ChatSendResult } from '@repo/contracts';
import { useLocale } from '@repo/i18n';
import { formatInstant } from '@repo/i18n/format';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, Building2, Check, Clock, Flag, Info, Layers, MessageCircle, MessagesSquare, MoreVertical, Send, ShieldAlert, ShieldOff, UserX, Users, UsersRound, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApiQuery } from '../data/TransportProvider';
import { useApiMutation } from '../data/useApi';
import { InlineAlert } from '../feedback/InlineAlert';
import { EmptyState } from '../feedback/States';
import { useToast } from '../feedback/Toast';
import { PlainTextArea } from '../forms/PlainFields';
import { Switch } from '../forms/ChoiceFields';
import { cn } from '../lib/cn';
import { dynamicT, useT } from '../lib/useT';
import { ConfirmDialog } from '../overlays/ConfirmDialog';
import { Drawer } from '../overlays/Drawer';
import { MenuButton } from '../overlays/Menu';
import { useSession } from '../permissions/SessionProvider';
import { ChoiceCards } from '../preferences/ChoiceCards';
import { Button } from '../primitives/Button';
import { useNavigation } from '../navigation/RouterAdapter';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { IconButton } from '../primitives/IconButton';
import { Link } from '../primitives/Link';

/**
 * Gate D.3 community chat, one implementation for the resident app (PORTAL-031/032) and the office
 * (CHAT-001/002): the reader's groups (from facts, never chosen by hand), a conversation with send and
 * read states, a marker for removed or blocked messages, reporting (CHAT-004) and, for residents,
 * blocking a neighbour and leaving a custom group. Wide screens show the list beside the
 * conversation; phones show one at a time (the conversation has its own address). Messages are
 * fictional and stay in this browser. The demo can simulate being offline: messages written then
 * wait on the device and are checked again when it reconnects (rejected if the membership ended).
 */
export interface ChatProps {
  /** `/portal/chat` (residents) or `/ops/chat` (office). */
  api: '/portal/chat' | '/ops/chat';
  groupId: string | null;
  listHref: string;
  groupHref: (groupId: string) => string;
  noticesHref: string;
  /** Residents may block a neighbour and leave custom groups; only they get the offline simulation. */
  resident: boolean;
  /** The site's name (in the whole-community group's description). */
  siteName?: string;
  /** Extra content under the page heading (links to the office's settings, the community home). */
  headerExtra?: ReactNode;
}

const KIND_ICON: Record<ChatGroupSummary['kind'], LucideIcon> = { site: Users, block: Building2, floor: Layers, committee: UsersRound, staff: MessagesSquare, custom: MessageCircle };

/**
 * Text with each short hyphenated word kept on one line ("A-104", "Al-Noor", "move-out"): a narrow
 * line breaks between words, never inside a flat code or a name (Issue #8's rule for codes). A long
 * token still wraps normally.
 */
export function KeepWords({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        part.includes('-') && part.length <= 18 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function useChatGroupName() {
  const { t } = useT();
  return (g: Pick<ChatGroupSummary, 'kind' | 'code' | 'name'>) =>
    g.kind === 'custom' ? (g.name ?? '') : g.kind === 'block' ? t('community:group.block', { code: g.code }) : g.kind === 'floor' ? t('community:group.floor', { code: g.code }) : t(`community:group.${g.kind}`);
}

/** The demo's offline simulation and the messages written meanwhile (per person, in this tab). */
interface Queued {
  groupId: string;
  text: string;
  clientKey: string;
  queuedAt: string;
}
interface Rejected extends Queued {
  reason: 'not_member' | 'other';
}

function useOfflineDemo(personaId: string | undefined) {
  const key = `demo:chat-offline:${personaId ?? ''}`;
  const read = <T,>(suffix: string, fallback: T): T => {
    try {
      const raw = sessionStorage.getItem(`${key}:${suffix}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const [offline, setOffline] = useState(() => read('on', false));
  const [queue, setQueue] = useState<Queued[]>(() => read('queue', []));
  const [rejected, setRejected] = useState<Rejected[]>(() => read('rejected', []));
  const write = (suffix: string, value: unknown) => {
    try {
      sessionStorage.setItem(`${key}:${suffix}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: the simulation lasts until reload */
    }
  };
  return {
    offline,
    queue,
    rejected,
    setOffline: (v: boolean) => {
      write('on', v);
      setOffline(v);
    },
    setQueue: (q: Queued[]) => {
      write('queue', q);
      setQueue(q);
    },
    setRejected: (r: Rejected[]) => {
      write('rejected', r);
      setRejected(r);
    },
  };
}

const newKey = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export function Chat({ api, groupId, listHref, groupHref, noticesHref, resident, siteName, headerExtra }: ChatProps) {
  const { t } = useT();
  const { persona } = useSession();
  const demo = useOfflineDemo(persona?.id);
  const list = useApiQuery<ChatGroups>({ method: 'GET', path: `${api}/groups` }, { enabled: !demo.offline });
  const queryClient = useQueryClient();
  const send = useApiMutation<ChatSendResult>();
  const [syncing, setSyncing] = useState(false);

  // Back online: every message written offline is sent with when it was written; the server checks the
  // membership again. A refused one is not delivered, and that group's copy leaves this device.
  const reconnect = async () => {
    demo.setOffline(false);
    if (!demo.queue.length) return;
    setSyncing(true);
    const left: Queued[] = [];
    const rejected: Rejected[] = [...demo.rejected];
    for (const q of demo.queue) {
      try {
        await send.mutateAsync({ method: 'POST', path: `${api}/groups/${q.groupId}/messages`, body: { text: q.text, clientKey: q.clientKey, queuedAt: q.queuedAt } });
      } catch (e) {
        if (e instanceof ApiError && (e.problem.status === 404 || e.problem.status === 403)) {
          rejected.push({ ...q, reason: e.problem.status === 404 ? 'not_member' : 'other' });
          queryClient.removeQueries({ predicate: (query) => String(query.queryKey[3] ?? '').startsWith(`${api}/groups/${q.groupId}/`) });
        } else left.push(q);
      }
    }
    demo.setQueue(left);
    demo.setRejected(rejected);
    setSyncing(false);
  };

  if (list.isError && !list.data) return <ChatProblem error={list.error} noticesHref={noticesHref} />;
  const data = list.data;
  return (
    <div className="@container space-y-5" data-testid="chat" data-api={api}>
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">
          {t('community:chat.title')}
        </h1>
        {/* With a conversation open on a phone, the conversation comes first: the introduction waits on
            wider screens, and the demo note follows the conversation. */}
        <p className={cn('text-sm text-muted', groupId && 'hidden @4xl:block')}>{t(resident ? 'community:chat.introResident' : 'community:chat.introOffice')}</p>
        <Simulated className={groupId ? 'hidden @4xl:flex' : ''} testId="chat-simulated" />
        {headerExtra && <div className={cn(groupId && 'hidden @4xl:block')}>{headerExtra}</div>}
      </header>
      {demo.rejected.length > 0 && (
        <InlineAlert tone="warning" role="status" title={t('community:offline.rejectedTitle', { count: demo.rejected.length })} data-testid="chat-rejected">
          <p>{t('community:offline.rejectedBody')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {demo.rejected.map((r) => (
              <li key={r.clientKey} className="break-words">
                <bdi>{r.text}</bdi>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="quiet" className="mt-2" onPress={() => demo.setRejected([])} data-testid="chat-rejected-dismiss">
            {t('community:offline.dismiss')}
          </Button>
        </InlineAlert>
      )}
      {!data ? (
        <p role="status" className="text-sm text-muted">
          {t('community:chat.loading')}
        </p>
      ) : !data.available ? (
        <section className="space-y-2 rounded-card border border-border bg-panel p-5" data-testid="chat-not-open">
          <ShieldAlert aria-hidden className="size-6 text-warning" />
          <h2 className="font-semibold text-text">{t('community:chat.notOpenTitle')}</h2>
          <p className="text-sm text-muted">{t(resident ? 'community:chat.notOpenResident' : 'community:chat.notOpenOffice')}</p>
          <Link href={noticesHref} className="inline-flex min-h-11 items-center text-sm">
            {t('community:chat.officialNotices')}
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] @4xl:items-start">
          <GroupList groups={data} selectedId={groupId} groupHref={groupHref} api={api} className={groupId ? 'hidden @4xl:block' : ''} siteName={siteName} />
          <div className={cn('min-w-0', !groupId && 'hidden @4xl:block')}>
            {groupId ? (
              <Conversation
                key={groupId}
                api={api}
                groupId={groupId}
                listHref={listHref}
                resident={resident}
                siteName={siteName}
                offline={demo.offline}
                queue={demo.queue.filter((q) => q.groupId === groupId)}
                onQueue={(q) => demo.setQueue([...demo.queue, q])}
                noticesHref={noticesHref}
              />
            ) : (
              <div className="grid min-h-48 place-content-center gap-2 rounded-card border border-dashed border-border bg-panel p-6 text-center text-muted" data-testid="chat-choose">
                <MessageCircle aria-hidden className="mx-auto size-8" />
                <p>{t('community:chat.chooseGroup')}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {resident && <OfflineDemo offline={demo.offline} queued={demo.queue.length} syncing={syncing} onOffline={() => demo.setOffline(true)} onOnline={() => void reconnect()} />}
      {groupId && <Simulated className="@4xl:hidden" testId="chat-simulated-below" />}
      <p className="text-xs text-muted">
        {t('community:chat.noDirect')}{' '}
        <Link href={noticesHref} className="text-xs">
          {t('community:chat.officialNotices')}
        </Link>
      </p>
    </div>
  );
}

function Simulated({ className, testId }: { className?: string; testId: string }) {
  const { t } = useT();
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted', className)} data-testid={testId}>
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {t('community:chat.simulated')}
    </p>
  );
}

function ChatProblem({ error, noticesHref }: { error: unknown; noticesHref: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const code = error instanceof ApiError ? error.problem.code : undefined;
  const status = error instanceof ApiError ? error.problem.status : 0;
  return (
    <div className="space-y-3 rounded-card border border-border bg-panel p-6" data-testid="chat-unavailable" data-reason={code}>
      <ShieldOff aria-hidden className="size-6 text-muted" />
      <h1 id="page-title" tabIndex={-1} className="text-xl font-bold text-text outline-none">
        {status === 403 ? t('community:notInPlan.title') : status === 404 ? t('community:chat.noGroupsTitle') : t('community:chat.title')}
      </h1>
      <p className="text-sm text-muted">{status === 403 ? t('community:notInPlan.chat') : status === 404 ? t('community:chat.noGroupsBody') : error instanceof ApiError ? dt(error.problem.messageKey) : t('errors:network.unavailable')}</p>
      <Link href={noticesHref} className="inline-flex min-h-11 items-center text-sm">
        {t('community:chat.officialNotices')}
      </Link>
    </div>
  );
}

function OfflineDemo({ offline, queued, syncing, onOffline, onOnline }: { offline: boolean; queued: number; syncing: boolean; onOffline: () => void; onOnline: () => void }) {
  const { t } = useT();
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-tile border p-3', offline ? 'border-warning/50 bg-warning-soft/40' : 'border-border bg-sunken/40')} data-testid="chat-offline-demo" data-offline={offline}>
      <p className="flex min-w-0 flex-[1_1_14em] items-start gap-2 text-sm text-text" role="status">
        <WifiOff aria-hidden className={cn('mt-0.5 size-4 shrink-0', offline ? 'text-warning' : 'text-muted')} />
        <span className="min-w-0">{offline ? t('community:offline.on', { count: queued }) : t('community:offline.off')}</span>
      </p>
      {offline ? (
        <Button size="sm" onPress={onOnline} isPending={syncing} data-testid="chat-go-online">
          {t('community:offline.goOnline')}
        </Button>
      ) : (
        <Button size="sm" variant="quiet" onPress={onOffline} data-testid="chat-go-offline">
          {t('community:offline.goOffline')}
        </Button>
      )}
    </div>
  );
}

function GroupList({ groups, selectedId, groupHref, api, className, siteName }: { groups: ChatGroups; selectedId: string | null; groupHref: (id: string) => string; api: string; className?: string; siteName?: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const name = useChatGroupName();
  const rejoin = useApiMutation();
  const toast = useToast();
  return (
    <nav aria-label={t('community:chat.groups')} className={cn('min-w-0 space-y-3 rounded-card border border-border bg-panel p-3', className)} data-testid="chat-groups">
      <h2 className="px-1 font-semibold text-text">{t('community:chat.groups')}</h2>
      {groups.groups.length === 0 ? (
        <EmptyState title={t('community:chat.noGroupsTitle')} body={t('community:chat.noGroupsBody')} />
      ) : (
        <ul className="space-y-1">
          {groups.groups.map((g) => {
            const Icon = KIND_ICON[g.kind];
            const current = g.id === selectedId;
            return (
              <li key={g.id}>
                <Link
                  href={groupHref(g.id)}
                  variant="plain"
                  aria-current={current ? 'page' : undefined}
                  className={cn('flex min-h-11 w-full items-start gap-3 rounded-tile px-2.5 py-2 text-start hover:bg-raised', current ? 'bg-primary-soft text-primary' : 'text-text')}
                  data-testid="chat-group"
                  data-group={g.id}
                  data-unread={g.unread}
                >
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                  {/* The name keeps the row's width; the date and unread count sit beside it when they fit
                      and move under it on a narrow line (never squeezing the name to a column). */}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="min-w-0 flex-[1_1_8em] font-semibold break-words">
                        <bdi>{name(g)}</bdi>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {g.muted && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <BellOff aria-hidden className="size-3.5" />
                            {t('community:chat.muted')}
                          </span>
                        )}
                        {g.last && <span className="text-xs whitespace-nowrap text-muted">{formatInstant(g.last.at, locale, 'date')}</span>}
                        {g.unread > 0 && (
                          <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs font-semibold', g.muted ? 'bg-sunken text-text' : 'bg-primary text-on-primary')} data-testid="chat-unread">
                            <span aria-hidden>{g.unread}</span>
                            <span className="sr-only">{t('community:chat.unread', { count: g.unread })}</span>
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="block text-xs text-muted">{t(`community:groupAbout.${g.kind}`, { code: g.code ?? '', site: siteName ?? '' })}</span>
                    {g.last && (
                      <span className="mt-0.5 block text-sm break-words text-muted">
                        {g.last.removed ? (
                          t('community:message.removedShort')
                        ) : g.last.preview ? (
                          <>
                            {g.last.senderName ? <bdi className="font-medium">{g.last.senderName}: </bdi> : <span className="font-medium">{t('community:message.you')}: </span>}
                            <bdi>
                              <KeepWords text={g.last.preview.length > 60 ? `${g.last.preview.slice(0, 60).trimEnd()}…` : g.last.preview} />
                            </bdi>
                          </>
                        ) : (
                          t('community:message.hiddenShort')
                        )}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {groups.left.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3" data-testid="chat-left-groups">
          <h3 className="px-1 text-sm font-semibold text-text">{t('community:chat.leftGroups')}</h3>
          <ul className="space-y-2">
            {groups.left.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="min-w-0 text-sm break-words">
                  <bdi>{l.name}</bdi>
                </span>
                <Button
                  size="sm"
                  variant="quiet"
                  isPending={rejoin.isPending}
                  onPress={async () => {
                    try {
                      await rejoin.mutateAsync({ method: 'POST', path: `${api}/groups/${l.id}/rejoin`, body: {} });
                      toast.success(t('community:chat.rejoined', { name: l.name }));
                    } catch {
                      toast.error(t('community:chat.rejoinFailed'));
                    }
                  }}
                  data-testid="chat-rejoin"
                >
                  {t('community:chat.rejoin')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

function When({ iso }: { iso: string }) {
  const { locale } = useLocale();
  return (
    <bdi className="whitespace-nowrap">
      <bdi>{formatInstant(iso, locale, 'date')}</bdi> <bdi>{formatInstant(iso, locale, 'time')}</bdi>
    </bdi>
  );
}

interface ConversationProps {
  api: string;
  groupId: string;
  listHref: string;
  resident: boolean;
  siteName: string | undefined;
  offline: boolean;
  queue: Queued[];
  onQueue: (q: Queued) => void;
  noticesHref: string;
}

function Conversation({ api, groupId, listHref, resident, siteName, offline, queue, onQueue, noticesHref }: ConversationProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const name = useChatGroupName();
  const path = `${api}/groups/${groupId}/messages`;
  const q = useApiQuery<ChatConversation>({ method: 'GET', path }, { enabled: !offline });
  const [older, setOlder] = useState<ChatMessageView[]>([]);
  const [olderMore, setOlderMore] = useState<boolean | null>(null);
  const loadOlder = useApiMutation<ChatConversation>();
  const read = useApiMutation();
  const send = useApiMutation<ChatSendResult>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [reporting, setReporting] = useState<ChatMessageView | null>(null);
  const [blocking, setBlocking] = useState<ChatMessageView | null>(null);
  const [info, setInfo] = useState(false);
  const block = useApiMutation();
  const logRef = useRef<HTMLDivElement>(null);
  const firstUnread = useRef<{ group: string; count: number } | null>(null);
  const composerId = useId();
  const hintId = useId();
  const data = q.data;

  // The count of unread messages when the group was opened (for the "New messages" line).
  if (data && firstUnread.current?.group !== groupId) firstUnread.current = { group: groupId, count: data.group.unread };
  // Opening a group reads it (once per load with something unread).
  useEffect(() => {
    if (data && data.group.unread > 0 && !offline && !read.isPending) void read.mutateAsync({ method: 'POST', path: `${api}/groups/${groupId}/read`, body: {} }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.group.unread, groupId, offline]);
  // The newest messages are at the bottom: show them when the group opens.
  const scrolled = useRef(false);
  useEffect(() => {
    if (data && logRef.current && !scrolled.current) {
      scrolled.current = true;
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [data]);

  const messages = useMemo(() => {
    const all = [...older, ...(data?.messages ?? [])];
    return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i);
  }, [older, data]);

  if (q.isError && !data) {
    const gone = q.error instanceof ApiError && q.error.problem.status === 404;
    return (
      <section className="space-y-3 rounded-card border border-border bg-panel p-5" data-testid="chat-conversation-unavailable">
        <BackLink href={listHref} />
        <h2 className="font-semibold text-text">{gone ? t('community:chat.notMemberTitle') : t('community:chat.loadFailed')}</h2>
        <p className="text-sm text-muted">{gone ? t('community:chat.notMemberBody') : t('community:chat.loadFailedBody')}</p>
      </section>
    );
  }
  if (!data)
    return (
      <section className="rounded-card border border-border bg-panel p-5">
        {offline ? (
          <p className="text-sm text-muted">{t('community:offline.notLoaded')}</p>
        ) : (
          <p role="status" className="text-sm text-muted">
            {t('community:chat.loading')}
          </p>
        )}
      </section>
    );

  const group = data.group;
  const unreadFrom = (() => {
    const n = firstUnread.current?.count ?? 0;
    if (!n) return null;
    const others = messages.filter((m) => !m.sender.isMe && m.state === 'visible');
    return others[others.length - n]?.id ?? null;
  })();
  const submit = async () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    setError(null);
    if (offline) {
      onQueue({ groupId, text, clientKey: newKey(), queuedAt: new Date().toISOString() });
      setDraft('');
      return;
    }
    try {
      await send.mutateAsync({ method: 'POST', path, body: { text, clientKey: newKey() } });
      setDraft('');
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
    } catch (e) {
      setError(e);
    }
  };

  let day = '';
  return (
    <section className="min-w-0 space-y-3 rounded-card border border-border bg-panel p-3 sm:p-4" aria-labelledby={`${composerId}-title`} data-testid="chat-conversation" data-group={groupId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-[1_1_12em] space-y-1">
          <BackLink href={listHref} className="@4xl:hidden" />
          <h2 id={`${composerId}-title`} className="text-lg font-semibold break-words text-text">
            <bdi>{name(group)}</bdi>
          </h2>
          <p className="text-xs text-muted">{t(`community:groupAbout.${group.kind}`, { code: group.code ?? '', site: siteName ?? '' })}</p>
        </div>
        <Button size="sm" variant="quiet" icon={Info} onPress={() => setInfo(true)} data-testid="chat-group-info">
          {t('community:chat.about')}
        </Button>
      </div>
      {offline && (
        <InlineAlert tone="warning" role="status" data-testid="chat-offline-copy">
          {t('community:offline.copy', { time: formatInstant(new Date(q.dataUpdatedAt).toISOString(), locale, 'time') })}
        </InlineAlert>
      )}
      <p className="text-xs text-muted" data-testid="chat-visible-from">
        {t('community:chat.visibleFrom', { date: formatInstant(data.visibleFrom, locale, 'date') })}
      </p>
      {(olderMore ?? data.hasMore) && (
        <Button
          size="sm"
          variant="quiet"
          isPending={loadOlder.isPending}
          onPress={async () => {
            const first = messages[0];
            if (!first) return;
            try {
              const page = await loadOlder.mutateAsync({ method: 'GET', path, query: { before: first.id } });
              setOlder((o) => [...page.messages, ...o]);
              setOlderMore(page.hasMore);
            } catch {
              toast.error(t('community:chat.loadFailed'));
            }
          }}
          data-testid="chat-older"
        >
          {t('community:chat.older')}
        </Button>
      )}
      {/* The scrolling region is the log (new messages are announced); the messages inside stay a list. */}
      <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label={t('community:chat.messagesIn', { group: name(group) })} tabIndex={0} className="max-h-[min(65dvh,42rem)] min-h-40 overflow-y-auto rounded-tile bg-sunken/30 p-2 outline-none focus-visible:outline-2 focus-visible:outline-focus" data-testid="chat-log">
      <ol className="space-y-2">
        {messages.length === 0 && queue.length === 0 && <li className="p-4 text-center text-sm text-muted">{t('community:chat.noMessages')}</li>}
        {messages.map((m) => {
          const d = formatInstant(m.at, locale, 'date');
          const showDay = d !== day;
          day = d;
          return (
            <MessageRow
              key={m.id}
              m={m}
              day={showDay ? d : null}
              newLine={m.id === unreadFrom}
              resident={resident}
              onReport={() => setReporting(m)}
              onBlock={() => setBlocking(m)}
            />
          );
        })}
        {queue.map((qm) => (
          <li key={qm.clientKey} className="flex justify-end" data-testid="chat-queued">
            <div className="max-w-[min(100%,36rem)] rounded-card border border-dashed border-primary/40 bg-primary-soft/30 px-3 py-2">
              <p dir="auto" className="whitespace-pre-wrap break-words text-text">
                {qm.text}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <Clock aria-hidden className="size-3.5" />
                {t('community:message.waiting')}
              </p>
            </div>
          </li>
        ))}
      </ol>
      </div>
      {data.canPost ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          data-testid="chat-composer"
        >
          <label htmlFor={composerId} className="block text-sm font-semibold text-text">
            {t('community:composer.label')}
          </label>
          <textarea
            id={composerId}
            value={draft}
            maxLength={1000}
            rows={3}
            dir="auto"
            aria-describedby={hintId}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            className="block min-h-24 w-full resize-y rounded-control border border-border-control bg-bg p-3 text-text outline-none focus-visible:outline-2 focus-visible:outline-focus"
            data-testid="chat-input"
          />
          <p id={hintId} className="text-xs text-muted">
            {t('community:composer.hint')} {draft.length > 800 ? t('community:composer.left', { count: 1000 - draft.length }) : ''}
          </p>
          {error ? <SendProblem error={error} /> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="submit" variant="primary" icon={Send} isPending={send.isPending} isDisabled={!draft.trim()} data-testid="chat-send">
              {offline ? t('community:composer.queue') : t('community:composer.send')}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-tile border border-border bg-sunken/40 p-3 text-sm text-muted" data-testid="chat-read-only">
          {t('community:composer.readOnly')}
        </p>
      )}
      <ReportDrawer api={api} message={reporting} onClose={() => setReporting(null)} />
      <ConfirmDialog
        isOpen={!!blocking}
        onOpenChange={(o) => !o && setBlocking(null)}
        title={t('community:block.title', { name: blocking?.sender.name ?? '' })}
        effect={t('community:block.effect')}
        confirmLabel={t('community:block.confirm')}
        onConfirm={async () => {
          if (!blocking) return;
          await block.mutateAsync({ method: 'POST', path: `${api}/blocks`, body: { key: blocking.sender.key, blocked: true } });
          toast.success(t('community:block.done', { name: blocking.sender.name }));
          setBlocking(null);
        }}
      />
      <GroupInfo api={api} open={info} onClose={() => setInfo(false)} data={data} name={name(group)} resident={resident} siteName={siteName} listHref={listHref} noticesHref={noticesHref} />
    </section>
  );
}

function BackLink({ href, className }: { href: string; className?: string }) {
  const { t } = useT();
  return (
    <Link href={href} className={cn('inline-flex min-h-11 items-center gap-1.5 text-sm', className)} data-testid="chat-back">
      <DirectionalIcon icon={ArrowLeft} className="size-4" />
      {t('community:chat.allGroups')}
    </Link>
  );
}

function SendProblem({ error }: { error: unknown }) {
  const { t } = useT();
  const dt = dynamicT(t);
  if (error instanceof ApiError) {
    const fields = Object.values(error.problem.errors ?? {}).flat();
    return (
      <InlineAlert tone="error" role="alert" title={dt(error.problem.messageKey)}>
        {fields.length > 0 && (
          <ul className="list-disc ps-5">
            {fields.map((f, i) => (
              <li key={i}>{dt(f.code, f.params)}</li>
            ))}
          </ul>
        )}
      </InlineAlert>
    );
  }
  return (
    <InlineAlert tone="error" role="alert">
      {t('errors:network.unavailable')}
    </InlineAlert>
  );
}

function MessageRow({ m, day, newLine, resident, onReport, onBlock }: { m: ChatMessageView; day: string | null; newLine: boolean; resident: boolean; onReport: () => void; onBlock: () => void }) {
  const { t } = useT();
  const mine = m.sender.isMe;
  const actions = !mine && m.state === 'visible';
  return (
    <>
      {day && (
        <li aria-hidden className="py-1 text-center text-xs font-medium text-muted">
          {day}
        </li>
      )}
      {newLine && (
        <li className="flex items-center gap-2 py-1 text-xs font-semibold text-primary" data-testid="chat-new-line">
          <span aria-hidden className="h-px flex-1 bg-primary/40" />
          {t('community:chat.newMessages')}
          <span aria-hidden className="h-px flex-1 bg-primary/40" />
        </li>
      )}
      <li className={cn('flex', mine ? 'justify-end' : 'justify-start')} data-testid="chat-message" data-state={m.state} data-mine={mine} data-id={m.id}>
        <div className={cn('max-w-[min(100%,36rem)] min-w-0 rounded-card border px-3 py-2', mine ? 'border-primary/30 bg-primary-soft/60' : m.sender.kind === 'office' ? 'border-info/40 bg-panel' : 'border-border bg-panel')}>
          <div className="flex items-start gap-1">
            <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-xs text-muted">
              <span className="font-semibold text-text">{mine ? t('community:message.you') : <bdi>{m.sender.name}</bdi>}</span>
              {m.sender.kind === 'office' && <span className="rounded-full bg-info-soft px-1.5 text-[0.75em] font-medium text-text">{t('community:message.office')}</span>}
              <When iso={m.at} />
            </p>
            {actions && (
              <MenuButton
                label={t('community:message.actions')}
                trigger={<IconButton label={t('community:message.actionsFor', { name: m.sender.name })} icon={MoreVertical} className="-me-2 -mt-1.5" data-testid="chat-message-menu" />}
                groups={[
                  {
                    id: 'm',
                    items: [
                      { id: 'report', label: m.reportedByMe ? t('community:message.alreadyReported') : t('community:message.report'), icon: Flag, isDisabled: m.reportedByMe, testId: 'chat-report' },
                      ...(resident && m.sender.kind === 'resident' ? [{ id: 'block', label: t('community:message.block', { name: m.sender.name }), icon: UserX, testId: 'chat-block' }] : []),
                    ],
                  },
                ]}
                onAction={(id) => (id === 'report' ? onReport() : onBlock())}
              />
            )}
          </div>
          {m.state === 'visible' ? (
            <p dir="auto" className="mt-0.5 whitespace-pre-wrap break-words text-text">
              <KeepWords text={m.text ?? ''} />
            </p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted italic" data-testid="chat-tombstone">
              {m.state === 'removed' ? <ShieldOff aria-hidden className="size-4 shrink-0" /> : <UserX aria-hidden className="size-4 shrink-0" />}
              {m.state === 'removed' ? (mine ? t('community:message.removedMine') : t('community:message.removed')) : t('community:message.blocked')}
            </p>
          )}
          {mine && m.state === 'visible' && (
            <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">
              <Check aria-hidden className="size-3.5" />
              {t('community:message.sent')}
            </p>
          )}
          {m.reportedByMe && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <Flag aria-hidden className="size-3.5" />
              {t('community:message.reportedByYou')}
            </p>
          )}
        </div>
      </li>
    </>
  );
}

function ReportDrawer({ api, message, onClose }: { api: string; message: ChatMessageView | null; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [reason, setReason] = useState<ChatReportReason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const report = useApiMutation<{ id: string }>();
  const close = () => {
    setReason('');
    setNote('');
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={!!message}
      onOpenChange={(o) => !o && close()}
      title={t('community:report.title')}
      subtitle={t('community:report.subtitle')}
      testId="chat-report-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={Flag}
            isPending={report.isPending}
            isDisabled={!reason}
            onPress={async () => {
              if (!message || !reason) return;
              setError(null);
              try {
                await report.mutateAsync({ method: 'POST', path: `${api}/messages/${message.id}/report`, body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } });
                toast.success(t('community:report.sent'));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="chat-report-submit"
          >
            {t('community:report.submit')}
          </Button>
        </div>
      }
    >
      {message && (
        <div className="space-y-4">
          <blockquote className="space-y-1 rounded-tile border-s-4 border-border bg-sunken/40 p-3 text-sm">
            <p className="text-xs text-muted">
              <bdi className="font-semibold text-text">{message.sender.name}</bdi> · <When iso={message.at} />
            </p>
            <p dir="auto" className="whitespace-pre-wrap break-words text-text">
              {message.text}
            </p>
          </blockquote>
          <ChoiceCards<string>
            label={t('community:report.reason')}
            value={reason}
            onChange={(v) => setReason(v as ChatReportReason)}
            columns="list"
            options={CHAT_REPORT_REASONS.map((r) => ({ id: r, label: t(`community:reportReason.${r}`) }))}
            testId="chat-report-reason"
          />
          <PlainTextArea label={reason === 'other' ? t('community:report.noteRequired') : t('community:report.note')} optional={reason !== 'other'} value={note} onChange={setNote} testId="chat-report-note" />
          <p className="text-xs text-muted">{t('community:report.privacy')}</p>
          {error ? <SendProblem error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}

function GroupInfo({ api, open, onClose, data, name, resident, siteName, listHref, noticesHref }: { api: string; open: boolean; onClose: () => void; data: ChatConversation; name: string; resident: boolean; siteName: string | undefined; listHref: string; noticesHref: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const mute = useApiMutation();
  const unblock = useApiMutation();
  const leave = useApiMutation();
  const { navigate } = useNavigation();
  const [leaving, setLeaving] = useState(false);
  const g = data.group;
  return (
    <Drawer isOpen={open} onOpenChange={(o) => !o && onClose()} title={t('community:about.title', { name })} testId="chat-info-drawer">
      <div className="space-y-5 text-sm">
        <section className="space-y-1">
          <h3 className="font-semibold text-text">{t('community:about.who')}</h3>
          <p className="text-muted">{t(`community:groupAbout.${g.kind}`, { code: g.code ?? '', site: siteName ?? '' })}</p>
          <p className="text-muted">{t('community:about.automatic')}</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-text">{t('community:about.history')}</h3>
          <p className="text-muted">{t('community:chat.visibleFrom', { date: formatInstant(data.visibleFrom, locale, 'date') })}</p>
          <p className="text-muted" data-testid="chat-retention">
            {t('community:about.retention', { count: data.retentionDays })}
          </p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-text">{t('community:about.etiquette')}</h3>
          <p className="whitespace-pre-wrap break-words text-text" dir="auto">
            {data.etiquette}
          </p>
        </section>
        <Switch
          isSelected={g.muted}
          label={t('community:about.mute')}
          description={t('community:about.muteHint')}
          onChange={async (on) => {
            try {
              await mute.mutateAsync({ method: 'POST', path: `${api}/groups/${g.id}/mute`, body: { muted: on } });
            } catch {
              toast.error(t('community:chat.saveFailed'));
            }
          }}
          testId="chat-mute"
        />
        {resident && (
          <section className="space-y-2">
            <h3 className="font-semibold text-text">{t('community:about.blocked')}</h3>
            {data.blocked.length === 0 ? (
              <p className="text-muted">{t('community:about.noneBlocked')}</p>
            ) : (
              <ul className="space-y-2">
                {data.blocked.map((b) => (
                  <li key={b.key} className="flex flex-wrap items-center justify-between gap-2">
                    <bdi className="min-w-0 break-words">{b.name}</bdi>
                    <Button
                      size="sm"
                      variant="quiet"
                      onPress={async () => {
                        await unblock.mutateAsync({ method: 'POST', path: `${api}/blocks`, body: { key: b.key, blocked: false } });
                        toast.success(t('community:block.undone', { name: b.name }));
                      }}
                      data-testid="chat-unblock"
                    >
                      {t('community:block.unblock')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {g.canLeave && (
          <section className="space-y-2">
            <Button variant="danger" onPress={() => setLeaving(true)} data-testid="chat-leave">
              {t('community:about.leave')}
            </Button>
            <ConfirmDialog
              isOpen={leaving}
              onOpenChange={setLeaving}
              title={t('community:about.leaveTitle', { name })}
              effect={t('community:about.leaveEffect')}
              confirmLabel={t('community:about.leave')}
              destructive
              onConfirm={async () => {
                await leave.mutateAsync({ method: 'POST', path: `${api}/groups/${g.id}/leave`, body: {} });
                toast.success(t('community:about.left', { name }));
                setLeaving(false);
                onClose();
                navigate(listHref);
              }}
            />
          </section>
        )}
        <p className="text-xs text-muted">
          {t('community:about.notices')}{' '}
          <Link href={noticesHref} className="text-xs">
            {t('community:chat.officialNotices')}
          </Link>
        </p>
      </div>
    </Drawer>
  );
}
