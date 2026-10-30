import type { Project, SiteSummary } from '@repo/contracts';
import { Building, Building2, Check, ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button as AriaButton, Link, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiQuery } from '../data/TransportProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useSession } from '../permissions/SessionProvider';

/**
 * Header context (GLOBAL-013). Developers pick a project; a society's staff see the site they work
 * on as a chip that opens Site 360 (one licensed site in the demo; several would become a picker).
 */
export function ProjectSwitcher() {
  const { can } = useSession();
  if (!can('project.context.use')) return can('site.view') ? <SiteChip /> : null;
  return <ProjectSelect />;
}

/** "Al-Noor Residency" → "Al-Noor": the name people use for the place. */
export const shortSiteName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "Al-Noor" → "AN"; one word → its first two letters. Shown only when even the short name does not fit. */
export const siteInitials = (short: string) => {
  const parts = short.split(/[-\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((p) => p[0]) : [...(parts[0] ?? '').slice(0, 2)]).join('').toUpperCase();
};

function SiteChip() {
  const { t } = useT();
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const site = sites.data?.[0];
  const chipRef = useRef<HTMLAnchorElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const initialsRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<'name' | 'initials' | 'icon'>('name');
  // Phones: the short name in full; when it cannot fit (320 px, large text), its initials; when even
  // those cannot, the building alone. Never a name cut mid-word; the full name is always the chip's
  // accessible name and tooltip, and the organisation's monogram stays at the start of the header.
  useLayoutEffect(() => {
    const chip = chipRef.current;
    const holder = chip?.parentElement;
    if (!chip || !holder || !nameRef.current || !initialsRef.current) return;
    const check = () => {
      // Padding, the icon and the gap, plus the text at full width.
      const style = getComputedStyle(chip);
      const icon = (chip.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      const chrome = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) + icon + parseFloat(style.columnGap || '0');
      const room = holder.clientWidth + 0.5;
      setMode(chrome + nameRef.current!.offsetWidth <= room ? 'name' : chrome + initialsRef.current!.offsetWidth <= room ? 'initials' : 'icon');
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(holder);
    return () => observer.disconnect();
  }, [site?.name]);
  if (!site) return null;
  const short = shortSiteName(site.name);
  return (
    <Link
      ref={chipRef}
      href={`/backoffice/sites/${site.id}`}
      data-testid="site-chip"
      data-tour-id="site-chip"
      data-short={mode}
      aria-label={t('nav:header.siteFor', { site: site.name })}
      className="relative flex min-h-10 max-w-[15rem] min-w-0 items-center gap-2 rounded-pill bg-panel ps-2 pe-3 text-chrome font-medium text-text shadow-inset outline-none transition-shadow duration-[var(--motion-fast)] data-hovered:shadow-card data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:min-h-11 max-sm:pe-2.5"
    >
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
        <Building className="size-3.5" />
      </span>
      {/* Phones show the short name ("Al-Noor") or its initials; the full name stays in the accessible label. */}
      {mode !== 'icon' && (
        <span aria-hidden className="whitespace-nowrap sm:hidden" title={site.name} data-testid="site-chip-text">
          <bdi dir="ltr">{mode === 'initials' ? siteInitials(short) : short}</bdi>
        </span>
      )}
      <span ref={nameRef} aria-hidden className="invisible absolute whitespace-nowrap sm:hidden">
        <bdi dir="ltr">{short}</bdi>
      </span>
      <span ref={initialsRef} aria-hidden className="invisible absolute whitespace-nowrap sm:hidden">
        <bdi dir="ltr">{siteInitials(short)}</bdi>
      </span>
      <span className="truncate max-sm:hidden">
        <bdi>{site.name}</bdi>
      </span>
    </Link>
  );
}

function ProjectSelect() {
  const { t } = useT();
  const { projectId, setProjectId } = useSession();
  const announce = useAnnounce();
  const projects = useApiQuery<Project[]>({ method: 'GET', path: '/projects' });
  const options = [{ id: 'all', label: t('common:state.allProjects') }, ...(projects.data ?? []).map((p) => ({ id: p.id, label: p.name }))];
  const current = options.find((o) => o.id === projectId) ?? options[0]!;
  return (
    <Select
      aria-label={t('nav:header.project')}
      selectedKey={current.id}
      onSelectionChange={(key) => {
        const next = options.find((o) => o.id === key);
        if (!next) return;
        setProjectId(next.id, projects.data?.find((p) => p.id === next.id)?.siteId);
        announce(t('a11y:announce.projectChanged', { project: next.label }));
      }}
      className="min-w-0"
    >
      <AriaButton
        data-tour-id="project-switcher"
        aria-label={t('nav:header.projectFor', { project: current.label })}
        className="flex min-h-10 max-w-[15rem] min-w-0 items-center gap-2 rounded-pill bg-panel ps-2 pe-3 text-sm font-medium text-text shadow-inset outline-none transition-shadow duration-[var(--motion-fast)] data-hovered:shadow-card data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:min-h-11 max-sm:size-10 max-sm:justify-center max-sm:px-0 max-sm:pointer-coarse:size-11"
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
          <Building2 className="size-3.5" />
        </span>
        <SelectValue className="truncate max-sm:sr-only" />
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted max-sm:hidden" />
      </AriaButton>
      <Popover placement="bottom start" offset={6} className="min-w-60 rounded-tile border border-border bg-panel p-1.5 shadow-overlay data-entering:animate-overlay-in">
        <ListBox items={options} className="outline-none">
          {(o) => (
            <ListBoxItem
              id={o.id}
              textValue={o.label}
              className={cn('group flex cursor-default items-center gap-2 rounded-control px-3 py-2.5 text-sm text-text outline-none data-focused:bg-primary-soft pointer-coarse:py-3')}
            >
              <span className="flex-1">{o.label}</span>
              <Check aria-hidden className="size-4 text-primary opacity-0 group-data-selected:opacity-100" />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
