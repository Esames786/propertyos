import type { FlatFact, PersonRow, PersonRole } from '@repo/contracts';
import { Badge, Button, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, PageHeader, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { ChevronRight, Home, KeyRound, Search, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { ACCESS_DATE, SOCIETY } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';

const ROLES = ['all', 'owner', 'occupant', 'payer'] as const;
const PAGE = 20;
const ROLE_ICON = { owner: Home, occupant: KeyRound, payer: Wallet } as const;
const current = (f: FlatFact) => f.from <= ACCESS_DATE && (f.to === undefined || ACCESS_DATE < f.to);

/**
 * CUS-001 People directory, society composition ("Owners & Residents"). One person, many roles:
 * the same person can own one flat, live in another and pay for a third, each shown separately with
 * the flat it is about. Search covers names, phones, references and flat numbers.
 */
export default function PeopleDirectory() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [q] = useQueryParam('q');
  const [role] = useQueryParam('role');
  const [page] = useQueryParam('page');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const filter = (ROLES as readonly string[]).includes(role ?? '') ? (role as (typeof ROLES)[number]) : 'all';
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const list = useApiQuery<PersonRow[]>({ method: 'GET', path: '/people', query: { q: q ?? undefined, role: filter } }, { placeholderData: (prev) => prev });
  const rows = list.data ?? [];
  const pageNo = Math.max(1, Number(page) || 1);
  const shown = rows.slice((pageNo - 1) * PAGE, pageNo * PAGE);

  return (
    <div className="@container space-y-6" data-testid="people-page">
      <PageHeader title={t('nav:party.society')} description={t('sites:people.intro')} />
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex max-w-xl flex-col gap-1.5" data-testid="people-search">
          <Label className="text-sm font-medium text-text">{t('sites:people.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('sites:people.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <FilterPills label={t('sites:people.role')} showLabel value={filter} testId="people-role" onChange={(v) => setParams({ role: v === 'all' ? null : v, page: null })} options={ROLES.map((r) => ({ id: r, label: t(`sites:people.roles.${r}`) }))} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={8} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('sites:people.emptyTitle')} body={t('sites:people.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" role="status" data-testid="people-count">{t('sites:people.count', { count: rows.length })}</p>
          <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="people-list">
            {shown.map((r) => (
              <li key={r.person.id}>
                <Link href={SOCIETY.person(r.person.id)} variant="plain" className="flex h-full items-start gap-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised" data-testid="person-row" data-person={r.person.id}>
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block">
                      <span className="block font-semibold text-text"><bdi>{r.person.displayName}</bdi></span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">{r.person.ref}</bdi>
                        {r.person.phone && <> · <bdi dir="ltr" className="ltr-ref">{r.person.phone}</bdi></>}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {r.facts.filter(current).map((f) => {
                        const Icon = ROLE_ICON[f.role as PersonRole];
                        return (
                          <Badge key={f.id} tone={f.role === 'payer' ? 'info' : 'neutral'} icon={Icon}>
                            {t(`sites:people.fact.${f.role}`, { flat: f.flatCode })}
                          </Badge>
                        );
                      })}
                    </span>
                  </span>
                  <DirectionalIcon icon={ChevronRight} className="mt-1 size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > PAGE && (
            <nav aria-label={t('crm:list.pagination')} className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{t('crm:list.showing', { from: fmt.count((pageNo - 1) * PAGE + 1), to: fmt.count(Math.min(rows.length, pageNo * PAGE)), total: fmt.count(rows.length) })}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" isDisabled={pageNo <= 1} onPress={() => setParams({ page: pageNo - 1 > 1 ? String(pageNo - 1) : null }, { replace: false })}>{t('crm:list.previous')}</Button>
                <Button variant="secondary" size="sm" isDisabled={pageNo * PAGE >= rows.length} onPress={() => setParams({ page: String(pageNo + 1) }, { replace: false })} data-testid="people-next">{t('crm:list.next')}</Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
