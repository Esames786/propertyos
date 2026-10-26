import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

/** Page header: breadcrumbs → the page's only H1 → description → primary actions. */
export function PageHeader({
  title,
  titleLang,
  description,
  breadcrumbs = [],
  actions,
  badge,
}: {
  title: string;
  /** Language of the title when it differs from the UI (e.g. an English register name in Urdu UI). */
  titleLang?: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3 pt-2">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="page-title" lang={titleLang} className="font-display text-[1.875rem] leading-tight text-text outline-none sm:text-[2.25rem]">
              {title}
            </h1>
            {badge}
          </div>
          {description && <div className="text-sm text-muted md:text-base">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
