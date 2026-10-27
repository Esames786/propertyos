import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../lib/cn';
import { DirectionalIcon } from '../primitives/DirectionalIcon';

/**
 * Section label above a group of cards: a small uppercase heading with an optional "View all" link.
 * A real heading element (default h2) so the page outline stays navigable.
 */
export function SectionHeading({
  id,
  title,
  description,
  action,
  level = 2,
  className,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  action?: { label: string; href: string; testId?: string };
  level?: 2 | 3;
  className?: string;
}) {
  const H = `h${level}` as const;
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <H id={id} className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          {title}
        </H>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          data-testid={action.testId}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none data-hovered:underline data-focus-visible:outline-2 data-focus-visible:outline-focus"
        >
          {action.label}
          <DirectionalIcon icon={ChevronRight} className="size-4" />
        </Link>
      )}
    </div>
  );
}
