import type { HrRole } from '@repo/contracts';
import { ROLE_DEPARTMENT } from '@repo/contracts';
import { nextHr, pkt, templatesFor, type HrSite, type HrState, type StoredEmployee } from './state';

/**
 * A fictional multi-site organisation for the Gate S.2a closure tests (GitHub Issue #12, P0). Test
 * code only: the demo itself has one site. It adds two sites to Al-Noor's HR state:
 * - **Al-Noor Annexe (Demo)**: owned by another legal entity, with its own staff, duties, leave,
 *   corrections, documents and an advance. Nothing of it may reach a person scoped to the main site.
 * - **Al-Noor Block C (Demo)**: owned by Al-Noor's own association. A guard allocated to both the
 *   main site and Block C shows that double booking is still caught across sites, and that the refusal
 *   discloses nothing of the other site.
 * Identity numbers, phones and names are made up.
 */
export const ANNEXE: HrSite = { siteId: 'site_anx_demo', legalEntityId: 'le_anx_demo', legalEntityName: 'Al-Noor Annexe Owners’ Association (Demo)', name: 'Al-Noor Annexe (Demo)', code: 'ANX' };

export interface Fixture {
  main: HrSite;
  annexe: HrSite;
  blockC: HrSite;
  /** Annexe staff (employed by the annexe's own legal entity). */
  sajid: StoredEmployee;
  hina: StoredEmployee;
  /** Employed by Al-Noor, allocated to the main site and Block C. */
  rashid: StoredEmployee;
  /** Block C only (Al-Noor's entity). */
  omer: StoredEmployee;
  ids: { annexeDuty: string; annexeYesterday: string; annexeLeave: string; annexeCorrection: string; annexeAdvance: string; annexeDocument: string; blockCNight: string };
}

export function addFictionalSites(state: HrState): Fixture {
  const main = state.sites[0]!;
  const blockC: HrSite = { siteId: 'site_anc_demo', legalEntityId: main.legalEntityId, legalEntityName: main.legalEntityName, name: 'Al-Noor Block C (Demo)', code: 'ANC' };
  state.sites.push(ANNEXE, blockC);
  state.templates.push(...templatesFor(ANNEXE.siteId, ANNEXE.code), ...templatesFor(blockC.siteId, blockC.code));
  const tpl = (site: HrSite, key: string) => `sht_${site.code.toLowerCase()}_${key}`;
  const by = { by: 'usr_anx_0001', byName: 'Annexe office (Demo)' };

  const hire = (entity: HrSite, name: string, role: HrRole, cnic: string, sites: HrSite[]): StoredEmployee => {
    const { id, ref } = nextHr(state, entity.code, 'employee');
    const e: StoredEmployee = {
      id,
      code: ref,
      name,
      role,
      department: ROLE_DEPARTMENT[role],
      employmentType: 'permanent',
      legalEntityId: entity.legalEntityId,
      status: 'active',
      startDate: '2025-01-01',
      periods: [{ from: '2025-01-01', type: 'permanent' }],
      sites: sites.map((s) => ({ siteId: s.siteId, from: '2025-01-01' })),
      personal: { cnic, phone: `+92 300 00009${cnic.slice(-2)}`, address: `House 9, ${name} Street, Lahore (Demo)` },
      supervises: [],
      profile: { consent: true, consentAt: pkt('2025-01-02', '10:00'), recordedByName: by.byName, showName: true, showPhoto: false },
      history: [{ at: pkt('2025-01-01', '10:00'), ...by, action: 'hired', values: { role } }],
    };
    state.employees.push(e);
    return e;
  };
  const sajid = hire(ANNEXE, 'Sajid Mahmood', 'security_guard', '35202-9000001-1', [ANNEXE]);
  const hina = hire(ANNEXE, 'Hina Akram', 'cleaner', '35202-9000002-2', [ANNEXE]);
  const rashid = hire(main, 'Rashid Latif', 'security_guard', '35202-9000003-3', [main, blockC]);
  const omer = hire(blockC, 'Omer Farooq', 'security_guard', '35202-9000004-4', [blockC]);

  const duty = (site: HrSite, e: StoredEmployee, key: string, date: string, post: string) => {
    const { id } = nextHr(state, site.code, 'assignment');
    state.assignments.push({ id, siteId: site.siteId, employeeId: e.id, templateId: tpl(site, key), date, post, state: 'planned', createdByName: by.byName, createdAt: pkt('2026-10-23', '16:00'), history: [] });
    return id;
  };
  const annexeDuty = duty(ANNEXE, sajid, 'evening', '2026-10-26', 'Main gate');
  const annexeYesterday = duty(ANNEXE, sajid, 'morning', '2026-10-25', 'Main gate');
  duty(ANNEXE, hina, 'housekeeping', '2026-10-26', 'Lobbies');
  const blockCNight = duty(blockC, rashid, 'night', '2026-10-26', 'Patrol');
  duty(blockC, omer, 'night', '2026-10-26', 'Main gate');
  for (const site of [ANNEXE, blockC]) state.weeks.push({ siteId: site.siteId, weekStart: '2026-10-26', state: 'published', publishedAt: pkt('2026-10-23', '17:00'), publishedBy: by.by, publishedByName: by.byName, changesSincePublish: 0 });

  // Yesterday's attendance at the annexe, with a correction waiting.
  state.attendance.push({ assignmentId: annexeYesterday, employeeId: sajid.id, state: 'late', checkIn: pkt('2026-10-25', '07:40'), checkOut: pkt('2026-10-25', '15:02'), recordedBy: by.by, recordedByName: by.byName, recordedAt: pkt('2026-10-25', '07:40'), corrected: false, history: [] });
  const cor = nextHr(state, ANNEXE.code, 'correction');
  state.corrections.push({ id: cor.id, ref: cor.ref, assignmentId: annexeYesterday, employeeId: sajid.id, before: { state: 'late', checkIn: pkt('2026-10-25', '07:40'), checkOut: pkt('2026-10-25', '15:02') }, after: { state: 'present', checkIn: pkt('2026-10-25', '07:05'), checkOut: pkt('2026-10-25', '15:02') }, reason: 'Gate register shows 07:05 at the annexe.', requestedBy: by.by, requestedByName: by.byName, requestedAt: pkt('2026-10-25', '16:00'), state: 'pending', history: [] });

  const lv = nextHr(state, ANNEXE.code, 'leave');
  state.leave.push({ id: lv.id, ref: lv.ref, employeeId: hina.id, type: 'casual', from: '2026-10-29', to: '2026-10-29', reason: 'Family matter at the annexe.', state: 'pending', requestedBy: by.by, requestedByName: by.byName, requestedAt: pkt('2026-10-24', '10:00'), history: [] });

  const doc = nextHr(state, ANNEXE.code, 'document');
  state.documents.push({ id: doc.id, employeeId: sajid.id, kind: 'cnic', fileName: 'sajid-mahmood-cnic.pdf', fileType: 'application/pdf', sizeBytes: 120_000, number: sajid.personal.cnic, issuedOn: '2021-06-01', expiresOn: '2031-06-01', version: 1, uploadedByName: by.byName, uploadedAt: pkt('2025-01-02', '10:00'), history: [] });

  const adv = nextHr(state, ANNEXE.code, 'advance');
  state.advances.push({ id: adv.id, ref: adv.ref, employeeId: sajid.id, kind: 'advance', amount: { amount: '9000.00', currency: 'PKR' }, reason: 'Advance against November at the annexe.', instalments: 1, firstMonth: '2026-11', state: 'submitted', requestedBy: by.by, requestedByName: by.byName, requestedAt: pkt('2026-10-24', '12:00'), evidence: [{ name: 'annexe-request.pdf', type: 'application/pdf', sizeBytes: 9_000 }], history: [] });

  return { main, annexe: ANNEXE, blockC, sajid, hina, rashid, omer, ids: { annexeDuty, annexeYesterday, annexeLeave: lv.id, annexeCorrection: cor.id, annexeAdvance: adv.id, annexeDocument: doc.id, blockCNight } };
}
