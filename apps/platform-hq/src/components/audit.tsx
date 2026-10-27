import type { PlatformAuditEvent } from '@repo/contracts';
import { dynamicT, useT } from '@repo/ui';
import { useHqFormat } from '../lib/format';

/** Platform audit events, newest first: what happened, who did it and when (HQ-019 basics). */
export function AuditTrail({ events, testId = 'audit-trail' }: { events: readonly PlatformAuditEvent[]; testId?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  if (events.length === 0) return <p className="text-sm text-muted">{t('platform:summary.noAudit')}</p>;
  return (
    <ol className="space-y-3 border-s border-border ps-4" data-testid={testId}>
      {events.map((e) => (
        <li key={e.id} className="text-sm">
          <p className="text-text">{dynamicT(t)(`platform:audit.${e.action}`, { ...e.params, tenant: e.tenantName ?? '', actor: e.actorName })}</p>
          <p className="text-xs text-muted">
            <bdi>{e.actorName}</bdi> · <time dateTime={e.at}>{fmt.date(e.at)}</time> · {fmt.relative(e.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
