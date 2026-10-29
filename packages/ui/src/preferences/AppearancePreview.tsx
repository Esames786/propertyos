import { BadgeCheck, CircleAlert, Clock3, ReceiptText } from 'lucide-react';
import { Badge } from '../data/StatusLabel';
import { useT } from '../lib/useT';
import { useSession } from '../permissions/SessionProvider';
import { buttonClass } from '../primitives/Button';
import { useDisplayPreferences } from './DisplayPreferences';
import { percentOf } from './personal';

/**
 * A small piece of the real interface, drawn with the live tokens: it changes the moment a setting
 * changes (so does every page). Nothing here is interactive; the sample actions are drawn with the
 * same styles as the real buttons.
 */
export function AppearancePreview() {
  const { t } = useT();
  const { persona, tenant } = useSession();
  const { resolved } = useDisplayPreferences();
  const first = persona?.displayName.split(/\s+/)[0] ?? t('a11y:hub.preview.someone');
  return (
    <figure
      className="overflow-hidden rounded-card border border-border/70 bg-panel shadow-card"
      data-testid="appearance-preview"
      data-theme={resolved.theme}
      data-palette={resolved.palette}
      data-contrast={resolved.contrast ?? 'system'}
      data-scale={percentOf(resolved.textScale)}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-border/70 bg-raised px-4 py-2.5">
        <span className="text-sm font-semibold text-text">{t('a11y:hub.preview.title')}</span>
        <span className="text-xs text-muted">{t('a11y:hub.preview.live')}</span>
      </figcaption>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-primary text-sm font-semibold text-on-primary">
            {first.slice(0, 1)}
          </span>
          <span className="min-w-0 leading-tight">
            <bdi className="block truncate text-sm font-semibold text-text">{tenant.name}</bdi>
            <span className="block text-xs text-muted">{t('a11y:hub.preview.eyebrow')}</span>
          </span>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">{t('a11y:hub.preview.dueLabel')}</p>
          <p className="text-lg font-bold text-text">{t('a11y:hub.preview.greeting', { name: first })}</p>
          <p className="text-sm text-muted">{t('a11y:hub.preview.body')}</p>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-tile bg-sunken px-3 py-2.5">
          <span className="text-sm text-muted">{t('a11y:hub.preview.amountLabel')}</span>
          <span className="text-xl font-bold tracking-tight text-text">
            <bdi dir="ltr" className="ltr-ref">{t('a11y:hub.preview.amount')}</bdi>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="success" icon={BadgeCheck}>{t('a11y:hub.preview.paid')}</Badge>
          <Badge tone="warning" icon={Clock3}>{t('a11y:hub.preview.pending')}</Badge>
          <Badge tone="error" icon={CircleAlert}>{t('a11y:hub.preview.overdue')}</Badge>
        </div>
        {/* Samples of the action styles (not controls): the real buttons look exactly like these. */}
        <div className="flex flex-wrap gap-2" aria-hidden>
          <span className={buttonClass('primary', 'sm', 'gap-1.5')}>
            <ReceiptText className="size-4" />
            {t('a11y:hub.preview.pay')}
          </span>
          <span className={buttonClass('secondary', 'sm')}>{t('a11y:hub.preview.view')}</span>
        </div>
        <p className="text-sm">
          <span className="font-medium text-primary underline underline-offset-2">{t('a11y:hub.preview.link')}</span>
        </p>
      </div>
    </figure>
  );
}
