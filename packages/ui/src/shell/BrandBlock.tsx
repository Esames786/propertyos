import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useShell } from './ShellContext';

/**
 * Tenant brand: an evergreen monogram tile with a brass hairline, the tenant name in the display
 * face and a quiet product line (app · codename). White-label tenants swap the monogram later.
 */
export function BrandBlock({ tenantName, compact = false, className }: { tenantName: string; compact?: boolean; className?: string }) {
  const { t } = useT();
  const { appName } = useShell();
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <span
        aria-hidden
        className="relative grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary font-display text-xl leading-none text-on-primary shadow-[inset_0_0_0_1px_rgb(181_138_71/0.55)]"
      >
        {tenantName.charAt(0)}
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="line-clamp-2 font-display text-[1rem] leading-tight text-text">
            <bdi>{tenantName}</bdi>
          </span>
          <span className="block truncate text-xs text-muted">
            {appName} · <span title={t('common:app.codenameNote')}>{t('common:app.productName')}</span>
          </span>
        </span>
      )}
    </div>
  );
}
