import { useState } from 'react';
import { Button, Link, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { NotAvailable, ProblemText } from '../operations/ProblemText';

interface Group { id: string; kind: string; title: string; unread: number }
interface Groups { available: boolean; retentionConfigured: boolean; groups: Group[] }
interface Message { id: string; groupId: string; text: string; senderName: string; senderIsMe: boolean; at: string }
interface Conversation { available: boolean; group: { id: string; title: string }; messages: Message[] }

/** PORTAL-031: fictional group conversations. No DMs, live transport or real push delivery. */
export default function ResidentChatPage() {
  const { t } = useT();
  const toast = useToast();
  const [selected, select] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<unknown>(null);
  const list = useApiQuery<Groups>({ method: 'GET', path: '/portal/chat/groups' }, { retry: false });
  const conversation = useApiQuery<Conversation>({
    method: 'GET',
    path: selected ? `/portal/chat/groups/${encodeURIComponent(selected)}/messages` : '/portal/chat/groups/site/messages',
  }, { retry: false, enabled: Boolean(selected) && list.data?.available === true });
  const send = useApiMutation<Message>();
  const key = () => `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (list.isError) return <NotAvailable error={list.error} />;
  if (!list.data) return <p role="status" className="p-5 text-muted">{t('operations:community.loading')}</p>;
  return (
    <div className="@container space-y-5" data-testid="community-chat">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text">{t('operations:community.chatTitle')}</h1>
        <p className="text-sm text-muted">{t('operations:community.chatDescription')}</p>
        <p className="text-xs text-muted">{t('operations:community.simulated')}</p>
      </header>
      {!list.data.available ? (
        <section className="rounded-card border border-border bg-panel p-5" data-testid="chat-policy-required">
          <ShieldAlert aria-hidden className="size-6 text-warning" />
          <h2 className="mt-3 font-semibold">{t('operations:community.unavailable')}</h2>
          <p className="mt-1 text-sm text-muted">{t('operations:community.retentionRequired')}</p>
          <Link href="/customer/portal/community-notices" className="mt-4 inline-block text-sm">{t('operations:community.notices')}</Link>
        </section>
      ) : (
        <div className="grid gap-4 @2xl:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
          <nav aria-label={t('operations:community.chatGroups')} className="rounded-card border border-border bg-panel p-3">
            <h2 className="px-2 pb-3 font-semibold">{t('operations:community.chatGroups')}</h2>
            <ul className="space-y-1">
              {list.data.groups.map(g => (
                <li key={g.id}>
                  <button type="button" onClick={() => { select(g.id); setError(null); }}
                    aria-current={selected === g.id ? 'page' : undefined}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-tile px-3 py-2 text-start hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus ${selected === g.id ? 'bg-primary-soft text-primary' : 'text-text'}`}>
                    <span className="min-w-0 break-words">{g.title}</span>
                    {g.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{g.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="min-w-0 rounded-card border border-border bg-panel p-4" aria-label={t('operations:community.conversation')}>
            {!selected ? (
              <div className="grid min-h-48 place-content-center gap-2 text-center text-muted"><MessageCircle aria-hidden className="mx-auto size-8" /><p>{t('operations:community.chooseGroup')}</p></div>
            ) : conversation.isError ? <NotAvailable error={conversation.error} /> : !conversation.data ? (
              <p role="status">{t('operations:community.loading')}</p>
            ) : (
              <>
                <h2 className="break-words text-lg font-semibold">{conversation.data.group.title}</h2>
                <ol className="my-4 max-h-[55dvh] min-h-40 space-y-3 overflow-y-auto" aria-label={t('operations:community.messages')}>
                  {conversation.data.messages.length ? conversation.data.messages.map(m => (
                    <li key={m.id} className={`max-w-full rounded-tile border p-3 ${m.senderIsMe ? 'border-primary/30 bg-primary-soft' : 'border-border bg-raised'}`}>
                      <p className="text-xs text-muted">{m.senderIsMe ? t('operations:community.you') : m.senderName} · <bdi dir="ltr">{m.at.slice(0,16).replace('T',' ')}</bdi></p>
                      <p className="mt-1 whitespace-pre-wrap break-words"><bdi>{m.text}</bdi></p>
                    </li>
                  )) : <li className="text-sm text-muted">{t('operations:community.noMessages')}</li>}
                </ol>
                {error ? <ProblemText error={error} /> : null}
                <form className="space-y-2" onSubmit={async e => {
                  e.preventDefault();
                  if (!draft.trim() || !selected || send.isPending) return;
                  try {
                    setError(null);
                    await send.mutateAsync({ method: 'POST', path: `/portal/chat/groups/${encodeURIComponent(selected)}/messages`, body: { text: draft.trim(), clientKey: key() } });
                    setDraft('');
                    await conversation.refetch();
                    toast.success(t('operations:community.sent'));
                  } catch (e) { setError(e); }
                }}>
                  <label htmlFor="community-composer" className="block text-sm font-semibold">{t('operations:community.compose')}</label>
                  <textarea id="community-composer" maxLength={2000} value={draft} onChange={e => setDraft(e.currentTarget.value)}
                    className="min-h-24 w-full resize-y rounded-tile border border-border bg-bg p-3 text-text" />
                  <Button type="submit" isDisabled={!draft.trim() || send.isPending}>
                    <Send aria-hidden className="size-4" />{t('operations:community.send')}
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
