import type { SearchRecord, SearchResponse } from '@repo/contracts';
import { formatPkPhone, LOCALE_META, SUPPORTED_LOCALES, useLocale } from '@repo/i18n';
import {
  Building2,
  Compass,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  Landmark,
  Languages,
  LifeBuoy,
  Search,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Dialog,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  SearchField,
  Text,
} from 'react-aria-components';
import { useApiQuery } from '../data/TransportProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useGuidedTour } from '../onboarding/GuidedTourProvider';
import { PRACTICE_LEAD_DRAWER } from '../onboarding/PracticeLeadDrawer';
import { emitTourEvent } from '../onboarding/tourGuard';
import { useSession } from '../permissions/SessionProvider';
import { Spinner } from '../primitives/Spinner';
import { useShell } from '../shell/ShellContext';

const RECORD_ICON: Record<SearchRecord['type'], LucideIcon> = {
  party: UserRound,
  lead: UserRound,
  unit: Building2,
  invoice: FileText,
  project: Building2,
  tenant: Landmark,
  request: Inbox,
};

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD');

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const itemClass =
  'flex cursor-default items-center gap-3 rounded-control px-3 py-2.5 text-sm text-text outline-none data-focused:bg-primary-soft data-focused:text-primary pointer-coarse:py-3';

/**
 * Ctrl+K: screens, real records and allowed actions in one listbox (blueprint 01 §2).
 * Records come from the transport, which applies persona scope before returning anything,
 * so unauthorised records never reach the client. Works in Urdu (search terms in either script).
 */
export function CommandPalette() {
  const { t } = useT();
  const { paletteOpen, setPaletteOpen, destinations, navItems, links } = useShell();
  const { allows, can } = useSession();
  const { navigate, location } = useNavigation();
  const { locale, setLocale } = useLocale();
  const tour = useGuidedTour();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 200);

  useEffect(() => {
    if (paletteOpen) emitTourEvent('commandPalette.opened');
    else {
      setQuery('');
      emitTourEvent('commandPalette.closed');
    }
  }, [paletteOpen]);

  const search = useApiQuery<SearchResponse>(
    { method: 'GET', path: '/search', query: { q: debounced } },
    { enabled: paletteOpen && debounced.length >= 2 },
  );

  const screens = useMemo(() => {
    const all = [
      ...navItems.filter(allows).map((n) => ({ id: n.id, label: t(n.labelKey as 'nav:items.home'), href: n.href, keywords: '' })),
      ...destinations.filter(allows),
    ];
    const q = norm(query.trim());
    return (q ? all.filter((d) => norm(`${d.label} ${d.keywords ?? ''}`).includes(q)) : all).slice(0, 8);
  }, [allows, navItems, destinations, query, t]);

  const otherLocale = SUPPORTED_LOCALES.find((l) => l !== locale)!;
  const essentials = tour.available.find((d) => d.id === 'GLOBAL-TOUR-001');
  const actions = useMemo(() => {
    const list: Array<{ id: string; label: string; icon: LucideIcon; run: () => void }> = [
      { id: 'locale', label: t('common:command.switchLanguage', { language: LOCALE_META[otherLocale].nativeName }), icon: Languages, run: () => setLocale(otherLocale) },
      { id: 'help', label: t('common:command.openHelp'), icon: LifeBuoy, run: () => navigate(`${location.pathname}?help=open`) },
      { id: 'prefs', label: t('common:command.openPreferences'), icon: Settings, run: () => navigate(links.preferences) },
    ];
    if (essentials) list.push({ id: 'tour', label: t('common:command.startTour'), icon: Compass, run: () => tour.start(essentials.id) });
    if (can('lead.create'))
      list.push({ id: 'practice', label: t('common:command.practiceLead'), icon: GraduationCap, run: () => navigate(`${location.pathname}?drawer=${PRACTICE_LEAD_DRAWER}`) });
    const q = norm(query.trim());
    return q ? list.filter((a) => norm(a.label).includes(q)) : list;
  }, [t, otherLocale, setLocale, navigate, location.pathname, links, essentials, tour, can, query]);

  const records = debounced.length >= 2 ? (search.data?.records ?? []) : [];

  const recordSubtitle = (r: SearchRecord) => {
    if (!r.subtitle) return '';
    if (r.type === 'lead') return t(`status:lead.${r.subtitle}` as 'status:lead.new');
    if (r.type === 'unit') return t(`status:unit.${r.subtitle}` as 'status:unit.available');
    if (r.type === 'invoice') return t(`status:settlement.${r.subtitle}` as 'status:settlement.paid');
    return r.subtitle;
  };

  const onAction = (key: string) => {
    setPaletteOpen(false);
    const [kind, ...rest] = key.split(':');
    const value = rest.join(':');
    if (kind === 'screen' || kind === 'record') navigate(value);
    if (kind === 'action') actions.find((a) => a.id === value)?.run();
  };

  return (
    <ModalOverlay
      isOpen={paletteOpen}
      onOpenChange={setPaletteOpen}
      isDismissable
      className="fixed inset-0 z-50 bg-overlay data-entering:animate-overlay-in data-exiting:animate-overlay-out sm:pt-[10vh]"
    >
      <Modal className="mx-auto flex h-dvh w-full flex-col bg-panel shadow-overlay sm:h-auto sm:max-h-[75vh] sm:max-w-2xl sm:rounded-card">
        <Dialog aria-label={t('common:command.title')} className="flex min-h-0 flex-1 flex-col outline-none" data-testid="command-palette">
          <Autocomplete inputValue={query} onInputChange={setQuery}>
            <SearchField aria-label={t('common:command.inputLabel')} autoFocus className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden className="size-5 shrink-0 text-muted" />
              <Input
                placeholder={t('nav:header.searchPlaceholder')}
                className="min-h-14 flex-1 bg-transparent text-base text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
              />
              {search.isFetching && <Spinner className="text-muted" />}
              <kbd className="ltr-ref hidden rounded-sm border border-border px-1.5 text-xs text-muted sm:block">{'Esc'}</kbd>
            </SearchField>
            <p className="sr-only">{t('common:command.hint')}</p>
            <Menu
              aria-label={t('common:command.title')}
              onAction={(key) => onAction(String(key))}
              className="min-h-0 flex-1 overflow-y-auto p-2 outline-none"
              renderEmptyState={() => (
                <p className="px-3 py-6 text-center text-sm text-muted">{t('common:command.noResults', { query: query.trim() })}</p>
              )}
            >
              {screens.length > 0 && (
                <MenuSection>
                  <Header className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{t('common:command.screens')}</Header>
                  {screens.map((s) => (
                    <MenuItem key={s.id} id={`screen:${s.href}`} textValue={s.label} className={itemClass}>
                      <Home aria-hidden className="size-4 shrink-0 text-muted" />
                      <Text slot="label">{s.label}</Text>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
              {records.length > 0 && (
                <MenuSection>
                  <Header className="px-3 pt-3 pb-1 text-xs font-semibold text-muted">
                    {t('common:command.records')} · {t('common:command.recordCount', { count: records.length })}
                  </Header>
                  {records.map((r) => {
                    const Icon = RECORD_ICON[r.type];
                    return (
                      <MenuItem key={`${r.type}-${r.id}`} id={`record:${r.href}`} textValue={`${r.title} ${r.ref}`} className={itemClass} data-testid={`palette-record-${r.type}`}>
                        <Icon aria-hidden className="size-4 shrink-0 text-muted" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <Text slot="label" className="truncate">
                            <bdi>{r.title}</bdi>
                          </Text>
                          <Text slot="description" className="text-xs text-muted">
                            {t(`common:entity.${r.type}`)} · <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi>
                            {r.subtitle && ' · '}
                            {r.type === 'party' ? <bdi dir="ltr" className="ltr-ref">{formatPkPhone(r.subtitle ?? '')}</bdi> : recordSubtitle(r)}
                          </Text>
                        </span>
                      </MenuItem>
                    );
                  })}
                </MenuSection>
              )}
              {actions.length > 0 && (
                <MenuSection>
                  <Header className="px-3 pt-3 pb-1 text-xs font-semibold text-muted">{t('common:command.actions')}</Header>
                  {actions.map((a) => (
                    <MenuItem key={a.id} id={`action:${a.id}`} textValue={a.label} className={cn(itemClass)}>
                      <a.icon aria-hidden className="size-4 shrink-0 text-muted" />
                      <Text slot="label">{a.label}</Text>
                    </MenuItem>
                  ))}
                </MenuSection>
              )}
            </Menu>
          </Autocomplete>
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted">{t('common:command.minChars')}</p>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
