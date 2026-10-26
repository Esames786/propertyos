import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { Reference } from '../data/Reference';
import { useT } from '../lib/useT';
import { Drawer } from '../overlays/Drawer';
import { DirectionalIcon } from '../primitives/DirectionalIcon';

export interface RelatedGroup {
  title: string;
  items: Array<{ id: string; ref: string; title: string; href: string; meta?: ReactNode }>;
}

/** Everything connected to the current record, one click away (blueprint 01 §7). */
export function RelatedDrawer({
  isOpen,
  onOpenChange,
  recordName,
  groups,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  recordName: string;
  groups: RelatedGroup[];
}) {
  const { t } = useT();
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title={t('help:related.title')} subtitle={t('help:related.intro', { name: recordName })} testId="related-drawer">
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="mb-2 text-sm font-semibold text-text">{group.title}</h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 text-sm outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-text">
                        <bdi>{item.title}</bdi>
                      </span>
                      <span className="block text-xs text-muted">
                        <Reference value={item.ref} />
                      </span>
                    </span>
                    {item.meta}
                    <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
