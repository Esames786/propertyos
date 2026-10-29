import type { SocietyDashboard, SocietyTask } from '@repo/contracts';
import { can, type HandlerContext } from '../handler-types';
import { identityOf } from './state';

/**
 * Gate D.1 additions to the society dashboard (HOME-001): exports that wait for a second person, the
 * resident invitations that ran out, and household members residents asked the office to add. Worded
 * for the reader: theirs to do, or waiting for someone else. Never offered to the person who asked.
 */
export function identityDashboardExtras(ctx: HandlerContext): { approvals: SocietyDashboard['approvals']['items']; tasks: SocietyTask[] } {
  const state = identityOf(ctx);
  const me = ctx.persona!.principalId;
  const approvals: SocietyDashboard['approvals']['items'] = [];
  const tasks: SocietyTask[] = [];
  const approver = can(ctx, 'data_export.approve', 'history_read');
  const waiting = state.exports.filter((e) => e.state === 'awaiting_approval');
  if (approver || waiting.some((e) => e.requestedBy === me)) {
    for (const e of waiting) approvals.push({ kind: 'data_export', id: e.id, label: e.reference, href: `/backoffice/adm/data?tab=exports&record=${e.id}`, yours: approver && e.requestedBy !== me });
    if (waiting.length) tasks.push({ key: 'approve_data_exports', urgency: 'normal', count: waiting.length, yours: approvals.some((a) => a.yours), href: '/backoffice/adm/data?tab=exports' });
  }
  if (can(ctx, 'portal_access.view', 'history_read')) {
    const expired = state.invitations.filter((i) => i.state === 'expired' || (i.state === 'sent' && i.expiresOn < ctx.at)).map((i) => i.partyId);
    // Only people with no newer invitation and no account still need one.
    const open = [...new Set(expired)].filter((p) => !state.portal[p] && !state.invitations.some((i) => i.partyId === p && i.state === 'sent' && i.expiresOn >= ctx.at));
    if (open.length) tasks.push({ key: 'portal_invitations_expired', urgency: 'normal', count: open.length, yours: can(ctx, 'portal_access.invite', 'history_read'), href: '/backoffice/residents/portal-access?status=expired' });
  }
  const requests = state.household.requests.filter((r) => r.state === 'pending');
  if (requests.length && can(ctx, 'residents.view', 'history_read')) tasks.push({ key: 'household_requests', urgency: 'normal', count: requests.length, yours: can(ctx, 'site.manage', 'history_read'), href: '/backoffice/res/household-members?tab=requests' });
  return { approvals, tasks };
}
