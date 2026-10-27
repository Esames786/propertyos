import { cn, Link, Tooltip, useT } from '@repo/ui';
import { Plus } from 'lucide-react';
import { HQ } from '../nav.config';

const TRIGGER = {
  header:
    'on-primary inline-flex min-h-10 items-center gap-2 rounded-pill bg-primary ps-3 pe-4 text-sm font-medium text-on-primary shadow-[0_8px_18px_-10px_rgb(30_77_66/0.7)] pointer-coarse:min-h-11',
  compact: 'on-primary grid size-10 place-items-center rounded-pill bg-primary text-on-primary pointer-coarse:size-11',
  fab: 'on-primary grid size-14 place-items-center rounded-pill bg-primary text-on-primary shadow-fab ring-4 ring-bg animate-pop-in',
} as const;

/**
 * Platform HQ's primary action, Create tenant, in the three places the backoffice shows Quick create:
 * the header pill (wide), an icon button (tablet) and the raised centre button of the phone bar.
 */
export function CreateTenantAction({ variant }: { variant: keyof typeof TRIGGER }) {
  const { t } = useT();
  const link = (
    <Link
      variant="plain"
      href={HQ.createTenant}
      aria-label={variant === 'header' ? undefined : t('platform:shell.createTenant')}
      data-tour-id={variant === 'fab' ? 'hq-create-fab' : 'hq-create-tenant'}
      data-testid={variant === 'fab' ? 'hq-create-fab' : `hq-create-${variant}`}
      className={cn(
        TRIGGER[variant],
        'outline-none transition-[background-color,translate,scale] duration-[var(--motion-fast)] hover:bg-primary-hover active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
      )}
    >
      <Plus aria-hidden className={variant === 'fab' ? 'size-7' : 'size-5'} strokeWidth={variant === 'fab' ? 2.4 : 2} />
      {variant === 'header' && <span>{t('platform:shell.createTenant')}</span>}
    </Link>
  );
  return variant === 'compact' ? <Tooltip content={t('platform:shell.createTenant')}>{link}</Tooltip> : link;
}
