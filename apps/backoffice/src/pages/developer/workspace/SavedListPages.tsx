import type { FavouriteItem, RecentItem, RecordRef, SavedListResponse, WorkspaceRecordType } from '@repo/contracts';
import { Button, ConfirmDialog, EmptyState, ErrorState, FilterPills, Link, PageHeader, PlainTextField, useAnnounce, useApiQuery, useQueryParam, useQueryParams, useT, useToast, useTransport } from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Eraser, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Loading } from '../../society/kit';
import { useProblemToast } from '../../society/hr/hkit';
import { byDay, DayHeading, DEMO_TODAY, HUB, HubNav, RecordRow, SessionNote, ShortcutsHelp, useFavourites, useHubFormat, useShortcuts, useTypeLabel, type Shortcut } from './wkit';

/**
 * GLOBAL-005 recent records and GLOBAL-006 favourites. Both are the signed-in person's own lists
 * for this sign-in (decision E-35), filtered by kind and by text; every entry is re-resolved by the
 * server on every read, so a record the person can no longer open is gone at once (never counted).
 */
function useListFilters() {
  const set = useQueryParams();
  const [type] = useQueryParam('type');
  const [q] = useQueryParam('q');
  return { set, type: type ?? 'all', q: q ?? '' };
}

function KindFilter({ items, value, onChange }: { items: readonly RecordRef[]; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  const kinds = [...new Set(items.map((i) => i.type))];
  if (kinds.length < 2 && value === 'all') return null;
  return (
    <FilterPills
      label={t('workspace:hub.search.kinds')}
      options={[{ id: 'all', label: t('workspace:hub.search.allKinds') }, ...kinds.map((k: WorkspaceRecordType) => ({ id: k, label: typeLabel(k), count: items.filter((i) => i.type === k).length }))]}
      value={value}
      onChange={onChange}
      testId="saved-kinds"
    />
  );
}

function TextFilter({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useT();
  return (
    <div ref={inputRef} className="w-full max-w-sm">
      <PlainTextField label={t('workspace:hub.saved.filter')} value={value} onChange={onChange} optional testId="saved-filter" />
    </div>
  );
}

export function RecentRecordsPage() {
  const { t } = useT();
  const f = useHubFormat();
  const { set, type, q } = useListFilters();
  const { transport } = useTransport();
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = useAnnounce();
  const problem = useProblemToast();
  const favourites = useFavourites();
  const [confirm, setConfirm] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const list = useApiQuery<SavedListResponse<RecentItem>>({ method: 'GET', path: '/workspace/recents' }, { placeholderData: (prev) => prev });
  const shortcuts = useMemo<Shortcut[]>(() => [{ code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() }], [t]);
  const keys = useShortcuts(shortcuts);
  const refresh = () => queryClient.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'api' && x.queryKey[3] === '/workspace/recents' });
  const forget = async (r?: RecentItem) => {
    try {
      await transport.request({ method: 'DELETE', path: r ? `/workspace/recents/${r.id}` : '/workspace/recents' });
      await refresh();
      const message = r ? t('workspace:hub.recent.removed', { title: r.title }) : t('workspace:hub.recent.cleared');
      toast.success(message);
      announce(message);
    } catch (e) {
      problem(e);
      return false;
    }
  };
  const all = list.data?.items ?? [];
  const items = all.filter((r) => (type === 'all' || r.type === type) && (!q || `${r.title} ${r.ref} ${r.project?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="@container space-y-5" data-testid="recent-records">
      <PageHeader
        title={t('workspace:hub.recent.title')}
        description={t('workspace:hub.recent.intro')}
        actions={
          all.length > 0 ? (
            <Button variant="quiet" icon={Eraser} onPress={() => setConfirm(true)} data-testid="recent-clear">
              {t('workspace:hub.recent.clear')}
            </Button>
          ) : undefined
        }
      />
      <HubNav current="recent" />
      <SessionNote />
      <div className="flex flex-wrap items-end gap-3">
        <KindFilter items={all} value={type} onChange={(v) => set({ type: v === 'all' ? null : v })} />
        <TextFilter value={q} onChange={(v) => set({ q: v.trim() ? v : null })} inputRef={field} />
      </div>
      <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t(all.length ? 'workspace:hub.saved.noneFiltered' : 'workspace:hub.recent.none')}
          body={t('workspace:hub.recent.noneBody')}
          actions={
            <Link href={HUB.search()} data-testid="recent-empty-search">
              {t('workspace:hub.nav.search')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-5" data-testid="recent-list">
          {byDay(items, (r) => r.viewedAt).map((g) => (
            <section key={g.day} aria-labelledby={`recent-day-${g.day}`} className="space-y-2">
              <DayHeading id={`recent-day-${g.day}`} day={g.day} today={DEMO_TODAY} />
              <ul className="space-y-2">
                {g.items.map((r) => (
                  <RecordRow
                    key={r.id}
                    record={r}
                    testId="recent-row"
                    meta={t('workspace:hub.recent.viewed', { when: f.when(r.viewedAt), count: r.views })}
                    favourite={{ isFavourite: favourites.isFavourite(r.id), onToggle: () => void favourites.toggle(r) }}
                    actions={
                      <Button variant="quiet" size="sm" icon={X} onPress={() => void forget(r)} aria-label={t('workspace:hub.recent.remove', { title: r.title })} data-testid="recent-remove">
                        {t('workspace:hub.recent.removeShort')}
                      </Button>
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <ConfirmDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={t('workspace:hub.recent.clearTitle')}
        effect={t('workspace:hub.recent.clearEffect')}
        confirmLabel={t('workspace:hub.recent.clear')}
        destructive
        onConfirm={() => forget()}
      />
    </div>
  );
}

export function FavouritesPage() {
  const { t } = useT();
  const f = useHubFormat();
  const { set, type, q } = useListFilters();
  const favourites = useFavourites();
  const field = useRef<HTMLDivElement>(null);
  const list = useApiQuery<SavedListResponse<FavouriteItem>>({ method: 'GET', path: '/workspace/favourites' }, { placeholderData: (prev) => prev });
  const shortcuts = useMemo<Shortcut[]>(() => [{ code: 'Slash', label: t('workspace:hub.shortcuts.focusFilter'), run: () => field.current?.querySelector('input')?.focus() }], [t]);
  const keys = useShortcuts(shortcuts);
  const all = list.data?.items ?? [];
  const items = all.filter((r) => (type === 'all' || r.type === type) && (!q || `${r.title} ${r.ref} ${r.project?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="@container space-y-5" data-testid="favourites">
      <PageHeader title={t('workspace:hub.favourites.title')} description={t('workspace:hub.favourites.intro', { limit: list.data?.limit ?? 50 })} />
      <HubNav current="favourites" />
      <SessionNote />
      <div className="flex flex-wrap items-end gap-3">
        <KindFilter items={all} value={type} onChange={(v) => set({ type: v === 'all' ? null : v })} />
        <TextFilter value={q} onChange={(v) => set({ q: v.trim() ? v : null })} inputRef={field} />
      </div>
      <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t(all.length ? 'workspace:hub.saved.noneFiltered' : 'workspace:hub.favourites.none')}
          body={t('workspace:hub.favourites.noneBody')}
          actions={
            <Link href={HUB.search()} data-testid="favourites-empty-search">
              <Search aria-hidden className="me-1 inline size-4" />
              {t('workspace:hub.nav.search')}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="favourites-list">
          {items.map((r) => (
            <RecordRow key={r.id} record={r} testId="favourite-row" meta={t('workspace:hub.favourites.added', { when: f.when(r.addedAt) })} favourite={{ isFavourite: favourites.isFavourite(r.id), onToggle: () => void favourites.toggle(r) }} />
          ))}
        </ul>
      )}
    </div>
  );
}
