import type { ResidentStaffOnDuty } from '@repo/contracts';
import { requires, type Handler, type HandlerContext } from '../handler-types';
import { residentOps, serviceAllows, type ResidentOps } from '../operations/site';
import { initialsOf } from './rules';
import { scopeOfSites } from './scope';
import { hrState, siteOf } from './state';
import { employeeOf, hrNow, onDutyShifts, recordOf, roleCounts, type Hr } from './views';

/**
 * PORTAL-036 "Staff on duty" (Gate S.2a), from the published roster of the resident's own site only.
 *
 * Gate S.2a closure (GitHub Issue #12, P1) keeps three states apart, so a resident can tell recorded
 * staffing from planned staffing:
 * - **confirmed**: the office has recorded the person's arrival for a shift running now, and no
 *   departure. A name or initials only where the staff member consented and chose to show them.
 * - **expected**: on the roster for a shift running now but not checked in. Role and post only,
 *   never a name.
 * - **unavailable**: scheduled but absent, on approved leave or no longer employed, and not
 *   replaced. A count only.
 *
 * Never a check-in time, attendance history, phone number, identity details, pay, advances, address
 * or documents. It is worked out on every read, so attendance, leave, cover and employment changes
 * show at once. Access is Rule R, then `hr` with `hr.shifts` for the resident's site; the chat and
 * hub add-ons play no part. It is not an emergency or security service.
 */
export const STAFF_SERVICE = { module: 'hr', feature: 'hr.shifts' } as const;

export const residentSeesStaff = (ctx: HandlerContext, res: ResidentOps) => res.flats.some((f) => serviceAllows(ctx, STAFF_SERVICE, f));

export function residentStaff(ctx: HandlerContext, res: ResidentOps): ResidentStaffOnDuty {
  const state = hrState(ctx, res.site);
  // The resident's own site: another site of the same organisation is never read.
  const site = state.sites.find((s) => s.siteId === res.site.siteId) ?? siteOf(res.site);
  const h: Hr = { site, scope: scopeOfSites([site]), state, today: ctx.at, now: hrNow(ctx), me: { principalId: res.principalId, name: res.name }, ctx };
  const { current, next } = onDutyShifts(h, { publishedOnly: true });
  const employed = (id: string) => {
    const e = employeeOf(h.state, id);
    return e && e.status === 'active' && (!e.endDate || e.endDate >= h.today) ? e : undefined;
  };
  const confirmed: ResidentStaffOnDuty['confirmed'] = [];
  const expected: ResidentStaffOnDuty['expected'] = [];
  let unavailable = 0;
  for (const s of current) {
    for (const p of s.staff) {
      const e = employed(p.employeeId);
      if (!e || p.state === 'absent' || p.state === 'on_leave') {
        // A replacement is listed on their own (expected until checked in); otherwise the gap counts.
        if (!p.coveredBy) unavailable += 1;
        continue;
      }
      // Checked out: their shift is over for them; neither on duty nor a gap.
      if (recordOf(h.state, p.assignmentId)?.checkOut) continue;
      const where = { role: e.role, ...(p.post ? { post: p.post } : {}), until: s.end };
      if (p.state === 'present' || p.state === 'late') {
        const consent = e.profile.consent;
        confirmed.push({ ...where, ...(consent && e.profile.showName ? { name: e.name } : {}), ...(consent && e.profile.showPhoto ? { initials: initialsOf(e.name) } : {}) });
      } else expected.push(where);
    }
  }
  const upcoming = next.flatMap((s) => s.staff.filter((p) => p.state !== 'on_leave' && employed(p.employeeId)).map((p) => ({ role: p.role, startsAt: s.start })));
  return {
    siteName: site.name,
    at: h.now,
    confirmed,
    expected,
    unavailable,
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
