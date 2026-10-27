import { cn } from '@repo/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';

/**
 * A section that opens on demand, for settings most contracts never need (UX review: keep complex
 * commercial settings out of the way until asked for). A real heading with a button, so it is
 * reachable by keyboard and announced with its expanded state; open by default when it holds values.
 */
export function Expandable({
  title,
  summary,
  defaultExpanded = false,
  children,
  testId,
}: {
  title: string;
  /** One line shown under the title while closed, e.g. "No tax · no minimum or cap". */
  summary?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Disclosure defaultExpanded={defaultExpanded} className="group rounded-tile border border-border/70 bg-raised" data-testid={testId}>
      <Heading level={2} className="m-0">
        <Button
          slot="trigger"
          className="flex w-full items-center justify-between gap-3 rounded-tile px-4 py-3 text-start outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-text">{title}</span>
            {summary && <span className="mt-0.5 block text-xs text-muted group-data-expanded:hidden">{summary}</span>}
          </span>
          <ChevronDown aria-hidden className={cn('size-5 shrink-0 text-muted transition-transform duration-[var(--motion-fast)] group-data-expanded:rotate-180')} />
        </Button>
      </Heading>
      <DisclosurePanel className="px-4 pb-4">{children}</DisclosurePanel>
    </Disclosure>
  );
}
