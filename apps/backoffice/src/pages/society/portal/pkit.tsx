import type { ContactConsent, PortalRole, PortalStatus } from '@repo/contracts';
import { Badge, useT, type StatusTone } from '@repo/ui';
import { Ban, CircleCheck, CircleDashed, CircleOff, Clock3, MailX, MoonStar, ShieldQuestion, type LucideIcon } from 'lucide-react';

/** Resident app access (RES-007, SITE-009): status badges that never rely on colour alone. */
const STATUS: Record<PortalStatus, [StatusTone, LucideIcon]> = {
  active: ['success', CircleCheck],
  inactive: ['neutral', MoonStar],
  invited: ['info', Clock3],
  expired: ['warning', MailX],
  not_invited: ['neutral', CircleDashed],
  revoked: ['error', Ban],
  unverified: ['warning', ShieldQuestion],
};

export function PortalStatusBadge({ status }: { status: PortalStatus }) {
  const { t } = useT();
  const [tone, Icon] = STATUS[status];
  return (
    <Badge tone={tone} icon={Icon} data-testid="portal-status" data-status={status}>
      {t(`identity:portal.status.${status}`)}
    </Badge>
  );
}

export function RoleList({ roles }: { roles: readonly PortalRole[] }) {
  const { t } = useT();
  return <>{roles.map((r) => t(`identity:portal.roles.${r}`)).join(' · ')}</>;
}

/** Which channels the person agreed to (service messages); a channel without consent is never used. */
export function ConsentChips({ consents }: { consents: readonly ContactConsent[] }) {
  const { t } = useT();
  if (!consents.length) return <span className="text-xs text-muted">{t('identity:portal.noConsents')}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {consents.map((c) => (
        <span key={c.channel} className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-muted" data-consent={c.channel} data-consented={c.consented}>
          {!c.consented && <CircleOff aria-hidden className="size-3" />}
          {t(`identity:channels.${c.channel}`)}
          <span className="sr-only">{c.consented ? t('identity:portal.consented') : t('identity:portal.notConsented')}</span>
        </span>
      ))}
    </span>
  );
}

/** The resident app's address in this browser (the demo's invitation links open there). */
export { customerOrigin } from '../../../nav.config';
