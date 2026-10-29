import type { PortalAccessRow, PortalStatus } from '@repo/contracts';
import { formatCalendarDate, useLocale } from '@repo/i18n';
import { ConfirmDialog, Link, MenuButton, useApiMutation, useT, useToast } from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { InviteDrawer } from './InviteDrawer';
import { ConsentChips, PortalStatusBadge, RoleList } from './pkit';

const SITE = 'site_alnoor';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** Whether the person can be (re-)invited: a verified link and no live access. */
export const invitable = (r: PortalAccessRow) => r.verified && ['not_invited', 'expired', 'invited', 'revoked'].includes(r.status);

/**
 * Invite, resend, cancel an invitation and close access, shared by RES-007 and SITE-009. Returns the
 * actions and the drawer/dialog they open; the server re-checks every rule.
 */
export function usePortalActions({ onInvited }: { onInvited?: () => void } = {}) {
  const { t } = useT();
  const toast = useToast();
  const [inviting, setInviting] = useState<PortalAccessRow[] | null>(null);
  const [revoking, setRevoking] = useState<PortalAccessRow | null>(null);
  const mutate = useApiMutation();
  const revokeInvitation = (r: PortalAccessRow) =>
    r.invitation &&
    mutate.mutate(
      { method: 'POST', path: `/portal-invitations/${r.invitation.id}/revoke` },
      { onSuccess: () => toast.success(t('identity:portal.invitationRevoked', { name: r.name })) },
    );
  const overlays = (
    <>
      {inviting && (
        <InviteDrawer
          rows={inviting}
          isOpen
          onOpenChange={(open) => {
            if (open) return;
            setInviting(null);
            onInvited?.();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('identity:portal.revokeTitle', { name: revoking?.name ?? '' })}
        effect={t('identity:portal.revokeEffect')}
        confirmLabel={t('identity:portal.revokeConfirm')}
        destructive
        reasonLabel={t('identity:portal.revokeReason')}
        onConfirm={(reason) => {
          if (!revoking) return;
          mutate.mutate(
            { method: 'POST', path: `/portal-access/${revoking.partyId}/revoke`, body: { reason } },
            { onSuccess: () => toast.success(t('identity:portal.revoked', { name: revoking.name })), onError: () => toast.error(t('identity:portal.revokeFailed')) },
          );
        }}
      />
    </>
  );
  return { invite: setInviting, revoke: setRevoking, revokeInvitation, overlays };
}

/** One person: name and status, their flats and roles, last sign-in or invitation, and consents. */
export function PortalPersonRow({ row, leading, mayInvite, actions, linkFlats = true }: { row: PortalAccessRow; leading?: ReactNode; mayInvite: boolean; actions: ReturnType<typeof usePortalActions>; linkFlats?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const r = row;
  return (
    <li className="rounded-tile border border-border/70 bg-panel p-3 shadow-card sm:p-4" data-testid="portal-row" data-party={r.partyId} data-status={r.status}>
      <div className="flex flex-wrap items-start gap-3">
        {leading ?? (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-sunken text-xs font-semibold text-muted">
            {initials(r.name)}
          </span>
        )}
        <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi className="font-semibold text-text">{r.name}</bdi>
            <PortalStatusBadge status={r.status} />
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {r.flats.map((f, i) => (
              <span key={f.flatId}>
                {i > 0 && ' · '}
                {linkFlats ? (
                  <Link href={SOCIETY.flat(SITE, f.flatId, 'portal')} variant="plain" className="font-medium text-primary hover:underline">
                    <bdi dir="ltr" className="ltr-ref">
                      {f.flatCode}
                    </bdi>
                  </Link>
                ) : (
                  <bdi dir="ltr" className="ltr-ref font-medium text-text">
                    {f.flatCode}
                  </bdi>
                )}{' '}
                <RoleList roles={f.roles} />
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-muted" data-testid="portal-last">
            {r.lastSignInOn
              ? t('identity:portal.lastSignIn', { date: formatCalendarDate(r.lastSignInOn, locale), device: r.lastDevice ? t(`identity:devices.family.${r.lastDevice}` as 'identity:devices.family.android_phone') : t('identity:devices.unknown') })
              : r.invitation
                ? t('identity:portal.invitedOn', { date: formatCalendarDate(r.invitation.sentAt.slice(0, 10), locale), channel: t(`identity:channels.${r.invitation.channel}`), expires: formatCalendarDate(r.invitation.expiresAt.slice(0, 10), locale) })
                : r.verified
                  ? t('identity:portal.neverInvited')
                  : t('identity:portal.unverifiedHint')}
          </p>
          <div className="mt-1.5">
            <ConsentChips consents={r.consents} />
          </div>
        </div>
        {mayInvite && <RowActions row={r} onInvite={() => actions.invite([r])} onRevoke={() => actions.revoke(r)} onRevokeInvitation={() => actions.revokeInvitation(r)} />}
      </div>
    </li>
  );
}

function RowActions({ row, onInvite, onRevoke, onRevokeInvitation }: { row: PortalAccessRow; onInvite: () => void; onRevoke: () => void; onRevokeInvitation: () => void }) {
  const { t } = useT();
  const items: Array<{ id: string; label: string }> = [];
  const st: PortalStatus = row.status;
  if (row.verified && (st === 'not_invited' || st === 'expired' || st === 'revoked')) items.push({ id: 'invite', label: t('identity:portal.actions.invite') });
  if (st === 'invited') items.push({ id: 'resend', label: t('identity:portal.actions.resend') }, { id: 'revokeInvitation', label: t('identity:portal.actions.revokeInvitation') });
  if (st === 'active' || st === 'inactive') items.push({ id: 'revoke', label: t('identity:portal.actions.revoke') });
  if (!items.length) return null;
  return (
    <MenuButton
      label={t('identity:portal.actionsFor', { name: row.name })}
      trigger={
        <AriaButton aria-label={t('identity:portal.actionsFor', { name: row.name })} className="grid size-10 place-items-center rounded-control border border-border text-muted outline-none hover:bg-raised data-focus-visible:outline-2 data-focus-visible:outline-focus" data-testid="portal-row-actions">
          <MoreHorizontal aria-hidden className="size-5" />
        </AriaButton>
      }
      groups={[{ id: 'actions', items: items.map((i) => ({ id: i.id, label: i.label, testId: `portal-action-${i.id}` })) }]}
      onAction={(id) => {
        if (id === 'invite' || id === 'resend') onInvite();
        if (id === 'revoke') onRevoke();
        if (id === 'revokeInvitation') onRevokeInvitation();
      }}
    />
  );
}
