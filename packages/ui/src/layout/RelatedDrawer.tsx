import { ChevronRight, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { Reference } from '../data/Reference';
import { useT } from '../lib/useT';
import { Drawer } from '../overlays/Drawer';
import { useSession } from '../permissions/SessionProvider';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { workspaceRouteTarget } from '../workspace/tenantWorkspace';

export interface RelatedGroup {
  title: string;
  items: Array<{ id: string; ref: string; title: string; href: string; meta?: ReactNode }>;
}

/**
 * Everything connected to the current record, one click away (blueprint 01 §7). Each link is checked
 * with the same access rule as the address it opens: a related record in a module outside the plan,
 * or an area the role cannot open, is listed as plain text that says so, never as a dead-end link.
 */
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
  const { decide } = useSession();
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title={t('help:related.title')} subtitle={t('help:related.intro', { name: recordName })} testId="related-drawer">
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="mb-2 text-sm font-semibold text-text">{group.title}</h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {group.items.map((item) => {
                const decision = decide(workspaceRouteTarget(item.href.split(/[?#]/)[0]!));
                const body = (
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-text">
                      <bdi>{item.title}</bdi>
                    </span>
                    <span className="block text-xs text-muted">
                      <Reference value={item.ref} />
                    </span>
                  </span>
                );
                return (
                  <li key={item.id}>
                    {decision.allowed ? (
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 text-sm outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus"
                      >
                        {body}
                        {item.meta}
                        <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 text-sm" data-testid="related-locked" data-reason={decision.reason}>
                        {body}
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                          <Lock aria-hidden className="size-3.5" />
                          {decision.reason === 'module_not_licensed' || decision.reason === 'feature_not_licensed' ? t('help:related.lockedPlan') : t('help:related.lockedRole')}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
