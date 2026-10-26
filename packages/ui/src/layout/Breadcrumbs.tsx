import { ChevronRight } from 'lucide-react';
import { Breadcrumb, Breadcrumbs as AriaBreadcrumbs, Link } from 'react-aria-components';
import { useT } from '../lib/useT';
import { DirectionalIcon } from '../primitives/DirectionalIcon';

export interface Crumb {
  label: string;
  href?: string;
}

/** Real links, current page last (aria-current), separators mirror in RTL. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useT();
  if (items.length < 2) return null;
  return (
    <nav aria-label={t('nav:breadcrumb')}>
      <AriaBreadcrumbs className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, i) => (
          <Breadcrumb key={`${item.label}-${i}`} className="flex items-center gap-1">
            <Link
              href={i === items.length - 1 ? undefined : item.href}
              className="rounded-sm data-current:font-medium data-current:text-text data-hovered:underline"
            >
              {item.label}
            </Link>
            {i < items.length - 1 && <DirectionalIcon icon={ChevronRight} className="size-3.5" />}
          </Breadcrumb>
        ))}
      </AriaBreadcrumbs>
    </nav>
  );
}
