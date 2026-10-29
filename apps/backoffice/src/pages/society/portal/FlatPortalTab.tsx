import type { PortalAccessRow } from '@repo/contracts';
import { Button, EmptyState, ErrorState, InlineAlert, Link, Panel, useApiQuery, useCan, useT } from '@repo/ui';
import { ArrowRight, Send } from 'lucide-react';
import { Loading } from '../kit';
import { invitable, PortalPersonRow, usePortalActions } from './PortalPeople';

/**
 * SITE-009 Flat 360 › Resident app. The people linked to this flat, whether each uses the resident
 * app, and the same invite / resend / close actions as RES-007, without leaving the flat.
 */
export function FlatPortalTab({ flatId }: { flatId: string }) {
  const { t } = useT();
  const can = useCan();
  const query = useApiQuery<{ flatCode: string; vacant: boolean; rows: PortalAccessRow[] }>({ method: 'GET', path: `/flats/${flatId}/portal` });
  const actions = usePortalActions();
  const mayInvite = can('portal_access.invite');
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Loading lines={4} />;
  const { rows, vacant } = query.data;
  const ready = rows.filter((r) => invitable(r) && r.status !== 'invited');
  return (
    <Panel
      title={t('identity:portal.flatTab.title')}
      description={t('identity:portal.flatTab.intro')}
      actions={
        mayInvite && ready.length > 1 ? (
          <Button size="sm" variant="secondary" icon={Send} onPress={() => actions.invite(ready)} data-testid="flat-portal-invite-all">
            {t('identity:portal.inviteSelected', { count: ready.length })}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3" data-testid="flat-portal">
        {vacant && <InlineAlert tone="info" title={t('identity:portal.flatTab.vacant')} />}
        {rows.length === 0 ? (
          !vacant && <EmptyState title={t('identity:portal.flatTab.empty')} />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <PortalPersonRow key={r.partyId} row={r} mayInvite={mayInvite} actions={actions} linkFlats={false} />
            ))}
          </ul>
        )}
        <Link href="/backoffice/residents/portal-access" className="inline-flex items-center gap-1.5 text-sm">
          {t('identity:portal.flatTab.all')}
          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
        </Link>
      </div>
      {actions.overlays}
    </Panel>
  );
}
