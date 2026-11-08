import type { FavouriteItem, RecordRef, SavedListResponse, WorkspaceRecordType } from '@repo/contracts';
import { formatCalendarDate, formatInstant, useLocale } from '@repo/i18n';
import { cn, dynamicT, Link, Switch, useAnnounce, useApiQuery, useCan, useT, useToast, useTransport } from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  Car,
  ClipboardList,
  FileClock,
  FileStack,
  FileText,
  History,
  Home,
  Inbox,
  KeyRound,
  Keyboard,
  Landmark,
  ListChecks,
  Megaphone,
  ReceiptText,
  ScrollText,
  Search,
  Star,
  Ticket,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';
import { unbroken, useProblemToast } from '../../society/hr/hkit';

/**
 * Gate E.13 connected-workspace kit: the record row every list uses (search hits, recent records,
 * favourites, tasks, related cards), the favourite toggle, the workspace's quick navigation, page
 * keyboard shortcuts (with an off switch) and formatting. Other slices can reuse these on their own
 * record pages at integration (see REPORT.md, "Integration").
 */
export const HUB = {
  search: (q?: string, type?: string) => `/backoffice/global/unified-search-results${q ? `?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ''}` : ''}`,
  recent: '/backoffice/global/recent-records',
  favourites: '/backoffice/global/favorites',
  tasks: '/backoffice/home/my-tasks',
  queue: '/backoffice/home/work-queue',
  activity: '/backoffice/home/recent-activity',
  documents: '/backoffice/doc/document-preview',
  expiring: '/backoffice/doc/expiring-documents',
  versions: (id?: string) => `/backoffice/doc/document-versions${id ? `?record=${id}` : ''}`,
  templates: '/backoffice/doc/templates-and-policies',
  document: (id: string, extra = '') => `/backoffice/doc/document-preview?record=${id}${extra}`,
  upload: (forId?: string) => `/backoffice/doc/document-preview?drawer=upload${forId ? `&for=${forId}` : ''}`,
} as const;

export const TYPE_ICON: Record<WorkspaceRecordType, LucideIcon> = {
  lead: UserRound,
  party: UserRound,
  unit: Building2,
  project: Building2,
  invoice: ReceiptText,
  document: FileText,
  template: ScrollText,
  lease: KeyRound,
  request: Inbox,
  maintenance: Wrench,
  pass: Ticket,
  vehicle: Car,
  notice: Megaphone,
  tenant: Landmark,
};

export function useHubFormat() {
  const { locale } = useLocale();
  return {
    locale,
    date: (iso: string) => formatCalendarDate(iso.slice(0, 10), locale),
    when: (iso: string) => (iso.length > 10 ? formatInstant(iso, locale, 'dateTime') : formatCalendarDate(iso, locale)),
  };
}

/** The type of a record in the reader's language. */
export function useTypeLabel() {
  const { t } = useT();
  return (type: WorkspaceRecordType) => t(`workspace:hub.types.${type}`);
}

// ---------------------------------------------------------------------------------------------
// Favourites: optimistic toggle, server-confirmed feedback, targeted refresh
// ---------------------------------------------------------------------------------------------
const touches = (path: unknown) => typeof path === 'string' && (path.startsWith('/workspace/favourites') || path.startsWith('/workspace/related'));

export function useFavourites() {
  const { t } = useT();
  const { transport } = useTransport();
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = useAnnounce();
  const problem = useProblemToast();
  const q = useApiQuery<SavedListResponse<FavouriteItem>>({ method: 'GET', path: '/workspace/favourites' });
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const ids = useMemo(() => new Set(q.data?.items.map((i) => i.id) ?? []), [q.data]);
  const isFavourite = useCallback((id: string) => pending[id] ?? ids.has(id), [ids, pending]);
  const toggle = useCallback(
    async (record: Pick<RecordRef, 'id' | 'title'>) => {
      const next = !(pending[record.id] ?? ids.has(record.id));
      setPending((p) => ({ ...p, [record.id]: next }));
      try {
        if (next) await transport.request({ method: 'POST', path: '/workspace/favourites', body: { recordId: record.id } });
        else await transport.request({ method: 'DELETE', path: `/workspace/favourites/${record.id}` });
        await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'api' && touches(query.queryKey[3]) });
        const message = t(next ? 'workspace:hub.favourite.added' : 'workspace:hub.favourite.removed', { title: record.title });
        toast.success(message);
        announce(message);
      } catch (e) {
        problem(e);
      } finally {
        setPending((p) => {
          const { [record.id]: _done, ...rest } = p;
          return rest;
        });
      }
    },
    [announce, ids, pending, problem, queryClient, t, toast, transport],
  );
  return { isFavourite, toggle, ready: !!q.data, list: q };
}

export function FavouriteButton({ record, isFavourite, onToggle, testId = 'favourite-toggle' }: { record: Pick<RecordRef, 'id' | 'title' | 'favouritable'>; isFavourite: boolean; onToggle: () => void; testId?: string }) {
  const { t } = useT();
  if (!record.favouritable) return null;
  return (
    <ToggleButton
      isSelected={isFavourite}
      onChange={onToggle}
      aria-label={t(isFavourite ? 'workspace:hub.favourite.remove' : 'workspace:hub.favourite.add', { title: record.title })}
      className="relative grid size-10 shrink-0 place-items-center rounded-control text-muted outline-none data-hovered:bg-raised data-hovered:text-text data-selected:text-warning data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:size-11"
      data-testid={testId}
      data-record={record.id}
      data-on={isFavourite}
    >
      <Star aria-hidden className={cn('size-5', isFavourite && 'fill-current')} />
    </ToggleButton>
  );
}

// ---------------------------------------------------------------------------------------------
// The record row
// ---------------------------------------------------------------------------------------------
export function RecordLine({ record }: { record: RecordRef }) {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  const dt = dynamicT(t);
  return (
    <span className="block text-xs text-muted [overflow-wrap:anywhere]">
      {typeLabel(record.type)} · <bdi dir="ltr">{unbroken(record.ref)}</bdi>
      {record.subtitleKey ? ` · ${dt(record.subtitleKey)}` : record.subtitle ? (
        <>
          {' · '}
          <bdi>{record.subtitle}</bdi>
        </>
      ) : null}
      {record.project ? (
        <>
          {' · '}
          <bdi>{record.project.name}</bdi>
        </>
      ) : null}
    </span>
  );
}

export function RecordRow({
  record,
  favourite,
  meta,
  actions,
  testId = 'record-row',
  headingLevel,
}: {
  record: RecordRef;
  favourite?: { isFavourite: boolean; onToggle: () => void };
  /** Extra line under the record (a time, a reason …). */
  meta?: ReactNode;
  actions?: ReactNode;
  testId?: string;
  headingLevel?: 2 | 3;
}) {
  const Icon = TYPE_ICON[record.type] ?? FileText;
  const Title = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : 'p';
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid={testId} data-record={record.id} data-type={record.type}>
      <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <Title className="text-sm font-semibold text-text [overflow-wrap:anywhere]">
          <Link href={record.href} data-testid={`${testId}-link`}>
            <bdi>{record.title}</bdi>
          </Link>
        </Title>
        <RecordLine record={record} />
        {meta && <div className="text-xs text-muted">{meta}</div>}
      </div>
      {(actions || favourite) && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {actions}
          {favourite && <FavouriteButton record={record} isFavourite={favourite.isFavourite} onToggle={favourite.onToggle} />}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Quick navigation between the connected screens (no sidebar hunting)
// ---------------------------------------------------------------------------------------------
export type HubSection = 'search' | 'recent' | 'favourites' | 'tasks' | 'queue' | 'activity' | 'documents' | 'expiring' | 'templates';

const SECTIONS: Array<{ id: HubSection; href: string; icon: LucideIcon; documents?: true }> = [
  { id: 'search', href: HUB.search(), icon: Search },
  { id: 'recent', href: HUB.recent, icon: History },
  { id: 'favourites', href: HUB.favourites, icon: Star },
  { id: 'tasks', href: HUB.tasks, icon: ListChecks },
  { id: 'queue', href: HUB.queue, icon: ClipboardList },
  { id: 'activity', href: HUB.activity, icon: Activity },
  { id: 'documents', href: HUB.documents, icon: FileStack, documents: true },
  { id: 'expiring', href: HUB.expiring, icon: FileClock, documents: true },
  { id: 'templates', href: HUB.templates, icon: ScrollText, documents: true },
];

export function HubNav({ current }: { current: HubSection }) {
  const { t } = useT();
  const documents = useCan()('document.view');
  return (
    <nav aria-label={t('workspace:hub.nav.label')} className="-mt-2" data-testid="hub-nav">
      <ul className="flex flex-wrap gap-1.5">
        <li>
          <Link href="/backoffice/home/role-aware-dashboard" variant="plain" className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border bg-panel px-3 text-sm font-medium text-text outline-none hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus">
            <Home aria-hidden className="size-4" />
            {t('workspace:hub.nav.home')}
          </Link>
        </li>
        {SECTIONS.filter((s) => !s.documents || documents).map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`hub-nav-${s.id}`}
            >
              <s.icon aria-hidden className="size-4" />
              {t(`workspace:hub.nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------
// Keyboard shortcuts (documented, discoverable, switchable off: WCAG 2.1.4)
// ---------------------------------------------------------------------------------------------
const SHORTCUT_KEY = 'pref:e13:shortcuts';
const readOn = () => {
  try {
    return globalThis.localStorage?.getItem(SHORTCUT_KEY) !== 'off';
  } catch {
    return true;
  }
};

export interface Shortcut {
  /** Physical key (`KeyboardEvent.code`), so it works with an Urdu keyboard layout too. */
  code: 'Slash' | 'KeyF' | 'KeyU' | 'KeyN';
  label: string;
  run: () => void;
}

const KEY_TEXT: Record<Shortcut['code'], string> = { Slash: '/', KeyF: 'F', KeyU: 'U', KeyN: 'N' };

const typing = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable || !!node.closest?.('[role="dialog"],[role="listbox"],[role="menu"],[role="combobox"]');
};

/**
 * Single keys on this page only, never while typing or inside a dialog, never with Ctrl, Alt or ⌘
 * (so Ctrl+K and the browser's own keys are untouched). They can be switched off.
 */
export function useShortcuts(shortcuts: readonly Shortcut[]) {
  const [on, setOn] = useState(readOn);
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      const s = shortcuts.find((x) => x.code === e.code && (x.code === 'Slash' ? true : !e.shiftKey));
      if (!s) return;
      e.preventDefault();
      s.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, shortcuts]);
  const set = (value: boolean) => {
    setOn(value);
    try {
      globalThis.localStorage?.setItem(SHORTCUT_KEY, value ? 'on' : 'off');
    } catch {
      /* the switch still applies to this page */
    }
  };
  return { on, set };
}

export function ShortcutsHelp({ shortcuts, on, onChange }: { shortcuts: readonly Shortcut[]; on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useT();
  return (
    <details className="group rounded-tile border border-border/70 bg-panel text-sm" data-testid="shortcuts-help">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-tile px-3 font-medium text-text outline-none focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <Keyboard aria-hidden className="size-4 text-muted" />
        {t('workspace:hub.shortcuts.title')}
        <span className="text-xs font-normal text-muted">{on ? t('workspace:hub.shortcuts.stateOn') : t('workspace:hub.shortcuts.stateOff')}</span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {shortcuts.map((s) => (
            <div key={s.code} className="contents">
              <dt>
                <kbd dir="ltr" className="ltr-ref rounded-sm border border-border-control bg-sunken px-2 py-0.5 text-xs">
                  {KEY_TEXT[s.code]}
                </kbd>
              </dt>
              <dd className="text-text">{s.label}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">{t('workspace:hub.shortcuts.hint')}</p>
        <Switch isSelected={on} onChange={onChange} label={t('workspace:hub.shortcuts.toggle')} testId="shortcuts-toggle" />
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------
/** "Kept for this sign-in only" (decision E-35), shown on the saved lists. */
export function SessionNote() {
  const { t } = useT();
  return <p className="text-xs text-muted" data-testid="session-note">{t('workspace:hub.sessionNote')}</p>;
}

/** Group items by calendar day (business date as today). */
export function byDay<T>(items: readonly T[], at: (item: T) => string): Array<{ day: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = at(item).slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, items: list }));
}

export function DayHeading({ day, today, id }: { day: string; today: string; id: string }) {
  const { t } = useT();
  const f = useHubFormat();
  return (
    <h2 id={id} className="text-sm font-semibold text-muted">
      {day === today ? t('workspace:hub.today') : f.date(day)}
    </h2>
  );
}

export { ACCESS_DATE as DEMO_TODAY } from '../../../nav.config';
