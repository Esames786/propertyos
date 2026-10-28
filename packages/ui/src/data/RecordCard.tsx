import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../lib/cn';

/**
 * A record as a card (lead, unit, instalment, request): bold title line with chips, actions at the
 * inline end, an optional divider and body. When `href` is set the title is the link and its hit
 * area stretches over the card; the action buttons sit above it, so nothing interactive is nested.
 */
export function RecordCard({
  title,
  titleHref,
  titleLang,
  eyebrow,
  chips,
  actions,
  children,
  footer,
  accent,
  highlight = false,
  headingLevel = 3,
  testId,
  className,
}: {
  title: ReactNode;
  titleHref?: string;
  titleLang?: string;
  eyebrow?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Coloured inline-start edge (e.g. paid vs pending), always paired with a text chip. */
  accent?: 'success' | 'error' | 'warning' | 'info' | 'primary';
  /** Briefly marks a record that was just created or changed. */
  highlight?: boolean;
  headingLevel?: 2 | 3 | 4;
  testId?: string;
  className?: string;
}) {
  const H = `h${headingLevel}` as const;
  const accentClass = accent
    ? { success: 'border-s-success', error: 'border-s-error', warning: 'border-s-warning', info: 'border-s-info', primary: 'border-s-primary' }[accent]
    : undefined;
  return (
    <article
      data-testid={testId}
      className={cn(
        'group relative overflow-hidden rounded-card border border-border/70 bg-panel shadow-card',
        'transition-[translate,box-shadow] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        titleHref && 'has-[a[data-card-link]:hover]:-translate-y-0.5 has-[a[data-card-link]:hover]:shadow-lift',
        accent && cn('border-s-4', accentClass),
        highlight && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-bg',
        className,
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-0.5 text-mini font-semibold tracking-[0.06em] text-muted uppercase">{eyebrow}</div>}
            <H lang={titleLang} className="text-lg leading-snug font-bold tracking-tight text-text">
              {titleHref ? (
                <Link
                  href={titleHref}
                  data-card-link=""
                  className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
                >
                  {title}
                </Link>
              ) : (
                title
              )}
            </H>
            {chips && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{chips}</div>}
          </div>
          {actions && <div className="relative z-10 flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="relative mt-3 border-t border-border/80 pt-3">{children}</div>}
      </div>
      {footer && <div className="relative z-10 border-t border-border/80 px-4 py-3 sm:px-5">{footer}</div>}
    </article>
  );
}
