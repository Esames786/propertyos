import type { Project } from '@repo/contracts';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { Button as AriaButton, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useApiQuery } from '../data/TransportProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useSession } from '../permissions/SessionProvider';

/** Header project context. Only projects in the persona's scope are listed (scope enforced by the transport too). */
export function ProjectSwitcher() {
  const { t } = useT();
  const { projectId, setProjectId, can } = useSession();
  const announce = useAnnounce();
  const projects = useApiQuery<Project[]>({ method: 'GET', path: '/projects' });
  if (!can('project.context.use')) return null;
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
