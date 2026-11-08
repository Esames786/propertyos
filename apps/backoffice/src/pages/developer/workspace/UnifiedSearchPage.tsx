import type { UnifiedSearchResponse, WorkspaceRecordType } from '@repo/contracts';
import { Button, EmptyState, ErrorState, FilterPills, Link, PageHeader, Spinner, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loading } from '../../society/kit';
import { HUB, HubNav, RecordRow, ShortcutsHelp, useFavourites, useShortcuts, useTypeLabel, type Shortcut } from './wkit';

/**
 * GLOBAL-002 universal search: every kind of record the person may open (leads, customers, units,
 * projects, invoices, documents, templates, leases, society people, flats and invoices, requests …),
 * grouped by kind, each kind pageable on its own. The server filters every hit by the record's own
 * rule, so nothing hidden is listed or counted. Ctrl+K's "Search everywhere" opens this page.
 */
export default function UnifiedSearchPage() {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  const set = useQueryParams();
  const [qParam] = useQueryParam('q');
  const [typeParam] = useQueryParam('type');
  const [pageParam] = useQueryParam('page');
  const [text, setText] = useState(qParam ?? '');
  const input = useRef<HTMLInputElement>(null);
  const favourites = useFavourites();
  const page = Math.max(1, Number(pageParam) || 1);

  // Typing updates the address after a short pause (shareable, back-button friendly, no reload); an
  // address changed from elsewhere (Ctrl+K, the back button) updates the field.
  const pushed = useRef(qParam ?? '');
  useEffect(() => {
    if ((qParam ?? '') !== pushed.current) {
      pushed.current = qParam ?? '';
      setText(qParam ?? '');
    }
  }, [qParam]);
  useEffect(() => {
    const id = setTimeout(() => {
      if ((qParam ?? '') !== text.trim()) {
        pushed.current = text.trim();
        set({ q: text.trim() ? text.trim() : null, page: null });
      }
    }, 300);
    return () => clearTimeout(id);
  }, [text, qParam, set]);

  const q = useApiQuery<UnifiedSearchResponse>({ method: 'GET', path: '/workspace/search', query: { q: qParam ?? '', type: typeParam ?? 'all', page } }, { placeholderData: (prev) => prev });
  const d = q.data;
  const shortcuts = useMemo<Shortcut[]>(() => [{ code: 'Slash', label: t('workspace:hub.shortcuts.focusSearch'), run: () => input.current?.focus() }], [t]);
  const keys = useShortcuts(shortcuts);
  const selected = (typeParam ?? 'all') as WorkspaceRecordType | 'all';
  const total = d?.groups.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <div className="@container space-y-5" data-testid="unified-search">
      <PageHeader title={t('workspace:hub.search.title')} description={t('workspace:hub.search.intro')} />
      <HubNav current="search" />
      <form
        role="search"
        aria-label={t('workspace:hub.search.title')}
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: text.trim() ? text.trim() : null, page: null });
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="hub-search-input" className="text-sm font-medium text-text">
            {t('workspace:hub.search.label')}
          </label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <input
              id="hub-search-input"
              ref={input}
              type="search"
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              placeholder={t('workspace:hub.search.placeholder')}
              aria-describedby="hub-search-hint"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-subtle"
              data-testid="hub-search-input"
              autoComplete="off"
            />
            {q.isFetching && <Spinner className="text-muted" />}
          </div>
          <p id="hub-search-hint" className="text-xs text-muted">
            {t('workspace:hub.search.hint')}
          </p>
        </div>
        <Button type="submit" variant="primary" icon={Search} data-testid="hub-search-submit">
          {t('workspace:hub.search.submit')}
        </Button>
      </form>
      <ShortcutsHelp shortcuts={shortcuts} on={keys.on} onChange={keys.set} />
      {d && d.types.length > 1 && (
        <FilterPills
          label={t('workspace:hub.search.kinds')}
          options={[{ id: 'all', label: t('workspace:hub.search.allKinds') }, ...d.types.map((type) => ({ id: type, label: typeLabel(type) }))]}
          value={selected}
          onChange={(v) => set({ type: v === 'all' ? null : v, page: null })}
          testId="hub-search-kinds"
        />
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {d && !d.tooShort ? t('workspace:hub.search.shown', { count: total, query: d.query }) : ''}
      </p>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Loading lines={6} />
      ) : d.tooShort ? (
        <EmptyState
          title={t('workspace:hub.search.startTitle')}
          body={t('workspace:hub.search.startBody')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={HUB.recent}>{t('workspace:hub.nav.recent')}</Link>
              <Link href={HUB.favourites}>{t('workspace:hub.nav.favourites')}</Link>
            </div>
          }
        />
      ) : d.groups.length === 0 ? (
        <EmptyState title={t('workspace:hub.search.noneTitle', { query: d.query })} body={t('workspace:hub.search.noneBody')} />
      ) : (
        <div className="space-y-6" data-testid="hub-search-results">
          {d.groups.map((g) => (
            <section key={g.type} aria-labelledby={`hub-group-${g.type}`} className="space-y-2" data-testid="hub-search-group" data-type={g.type}>
              <h2 id={`hub-group-${g.type}`} className="text-base font-semibold text-text">
                {t(`workspace:hub.typesPlural.${g.type}`)}
              </h2>
              <ul className="space-y-2">
                {g.items.map((r) => (
                  <RecordRow key={r.id} record={r} favourite={{ isFavourite: favourites.isFavourite(r.id), onToggle: () => void favourites.toggle(r) }} testId="hub-hit" />
                ))}
              </ul>
              {selected === 'all' && g.more && (
                <Button variant="quiet" size="sm" icon={ArrowRight} onPress={() => set({ type: g.type, page: null })} data-testid={`hub-more-${g.type}`}>
                  {t('workspace:hub.search.showAll', { kind: t(`workspace:hub.typesPlural.${g.type}`) })}
                </Button>
              )}
            </section>
          ))}
          {selected !== 'all' && (page > 1 || d.groups.some((g) => g.more)) && (
            <nav aria-label={t('workspace:hub.search.pages')} className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={ArrowLeft} isDisabled={page <= 1} onPress={() => set({ page: page - 1 > 1 ? String(page - 1) : null })} data-testid="hub-page-prev">
                {t('workspace:hub.search.previous')}
              </Button>
              <span className="text-sm text-muted">{t('workspace:hub.search.page', { page })}</span>
              <Button variant="secondary" size="sm" icon={ArrowRight} isDisabled={!d.groups.some((g) => g.more)} onPress={() => set({ page: String(page + 1) })} data-testid="hub-page-next">
                {t('workspace:hub.search.next')}
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
