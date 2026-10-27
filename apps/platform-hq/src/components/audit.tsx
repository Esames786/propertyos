import type { PlatformAuditEvent } from '@repo/contracts';
import { dynamicT, useT } from '@repo/ui';
import { useHqFormat } from '../lib/format';
import { ChangeList } from './config';
import { Expandable } from './Expandable';

/**
 * Platform audit events, newest first: what happened, who did it (principal), when, and, for a
 * commercial change, what changed field by field (HQ-019 and the commercial audit trail).
 */
export function AuditTrail({ events, testId = 'audit-trail' }: { events: readonly PlatformAuditEvent[]; testId?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const tr = dynamicT(t);
  if (events.length === 0) return <p className="text-sm text-muted">{t('platform:summary.noAudit')}</p>;
  return (
    <ol className="space-y-3 border-s border-border ps-4" data-testid={testId}>
      {events.map((e) => (
        <li key={e.id} className="text-sm" data-testid={`audit-${e.id}`} data-action={e.action}>
          <p className="text-text">
            {tr(`platform:audit.${e.action}`, {
              ...e.params,
              tenant: e.tenantName ?? '',
              actor: e.actorName,
              ...(e.params.kind ? { kind: tr(`platform:config.kinds.${e.params.kind}`) } : {}),
              ...(e.params.decision ? { decision: tr(`platform:requests.status.${e.params.decision}`) } : {}),
            })}
          </p>
          <p className="text-xs text-muted">
            <bdi>{e.actorName}</bdi> · <bdi dir="ltr">{e.actorId}</bdi> · <time dateTime={e.at}>{fmt.date(e.at)}</time> · {fmt.relative(e.at)}
          </p>
          {e.changes && e.changes.length > 0 && (
            <div className="mt-2">
              <Expandable title={t('platform:config.changesCount', { count: e.changes.length })} testId={`audit-changes-${e.id}`}>
                <ChangeList changes={e.changes} />
              </Expandable>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
