import type { ReactNode } from 'react';
import { useId } from 'react-aria';
import { cn } from '../lib/cn';

/** A titled card section. Uses container queries so content adapts to the panel, not the window. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 2,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const id = useId();
  const H = `h${headingLevel}` as const;
  return (
    <section aria-labelledby={title ? id : undefined} className={cn('@container rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <H id={id} className="text-lg font-bold tracking-tight text-text">
                {title}
              </H>
            )}
            {description && <div className="mt-1 text-sm text-muted">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
