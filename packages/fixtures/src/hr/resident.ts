import type { ResidentStaffOnDuty } from '@repo/contracts';
import { requires, type Handler, type HandlerContext } from '../handler-types';
import { residentOps, serviceAllows, type ResidentOps } from '../operations/site';
import { initialsOf } from './rules';
import { hrState } from './state';
import { employeeOf, hrNow, onDutyShifts, roleCounts, type Hr } from './views';

/**
 * PORTAL-036 "Staff on duty" (Gate S.2a). Residents see who is on duty from the published roster
 * only: the duty role, the post and until when; a name or initials only where the staff member
 * consented to that. Never a phone number, identity details, pay, advances, attendance history,
 * address or documents, and nobody whose employment has ended. Rule R, then `hr` with `hr.shifts`
 * for the resident's own site; the chat and hub add-ons play no part.
 */
export const STAFF_SERVICE = { module: 'hr', feature: 'hr.shifts' } as const;

export const residentSeesStaff = (ctx: HandlerContext, res: ResidentOps) => res.flats.some((f) => serviceAllows(ctx, STAFF_SERVICE, f));

export function residentStaff(ctx: HandlerContext, res: ResidentOps): ResidentStaffOnDuty {
  const h: Hr = { site: res.site, state: hrState(ctx, res.site), today: ctx.at, now: hrNow(ctx), me: { principalId: res.principalId, name: res.name }, ctx };
  const { current, next } = onDutyShifts(h, { publishedOnly: true });
  const employed = (id: string) => {
    const e = employeeOf(h.state, id);
    return e && e.status === 'active' && (!e.endDate || e.endDate >= h.today) ? e : undefined;
  };
  const onDuty = current.flatMap((s) =>
    s.staff
      // Absent people and people on leave are not on duty; someone not yet checked in is expected.
      .filter((p) => p.state !== 'absent' && p.state !== 'on_leave')
      .flatMap((p) => {
        const e = employed(p.employeeId);
        if (!e) return [];
        const consent = e.profile.consent;
        return [{ role: e.role, ...(p.post ? { post: p.post } : {}), until: s.end, ...(consent && e.profile.showName ? { name: e.name } : {}), ...(consent && e.profile.showPhoto ? { initials: initialsOf(e.name) } : {}) }];
      }),
  );
  const upcoming = next.flatMap((s) => s.staff.filter((p) => p.state !== 'on_leave' && employed(p.employeeId)).map((p) => ({ role: p.role, startsAt: s.start })));
  return {
    siteName: res.site.name,
    at: h.now,
    onDuty,
    next: roleCounts(upcoming).map((r) => ({ role: r.role as ResidentStaffOnDuty['next'][number]['role'], startsAt: upcoming.find((u) => u.role === r.role)!.startsAt, count: r.count })),
  };
}

export const HR_RESIDENT_HANDLERS: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/portal\/community\/staff$/,
    access: requires('resident_portal', 'portal.use', 'operational'),
    handle: (ctx): ResidentStaffOnDuty => residentStaff(ctx, residentOps(ctx, STAFF_SERVICE)),
  },
];
