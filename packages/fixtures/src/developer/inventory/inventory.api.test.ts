import type { AvailabilitySnapshot, Project360, ProjectSetupList, ProjectSetupRecord, ProjectsPortfolio, StorageList, StorageUnitView, UnitInventoryDetail, UnitMatrix } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEADS } from '../../records';
import { UNITS } from '../../inventory';
import { HEIGHTS_STORAGE_CLERK, invSession, minus, plus, projectsOnly, refusal, SECOND_OFFICER, type InvSession } from './inv-test-kit';

/**
 * Gate E.2 API tests (provisional, plan §4.2–4.5): scope, no id oracle, owner-only release and hold
 * expiry (Issue #23 rule), no double allocation, cross-project protection, maker ≠ checker, bound
 * idempotency, revocation, nested-history projection, and a byte-identical state after every refusal.
 */

const avail = (projectId: string, skip = 0) => UNITS.filter((u) => u.projectId === projectId && u.status === 'available')[skip]!;
const sold = (projectId: string, skip = 0) => UNITS.filter((u) => u.projectId === projectId && (u.status === 'booked' || u.status === 'allocated'))[skip]!;
const withStatus = (projectId: string, status: string) => UNITS.find((u) => u.projectId === projectId && u.status === status)!;
const openLead = (projectId: string, skip = 0) => LEADS.filter((l) => l.projectId === projectId && ['new', 'assigned', 'contacted', 'qualified'].includes(l.status))[skip]!;
/** A refusal's answer without its correlation id (unknown and hidden ids must answer identically). */
const same = (r: Awaited<ReturnType<typeof refusal>>) => JSON.stringify(r);

let api: InvSession;
beforeEach(() => {
  api = invSession({ personas: [HEIGHTS_STORAGE_CLERK, SECOND_OFFICER] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A request that must be refused and leave every partition byte-identical. */
async function refusedUnchanged(p: () => Promise<unknown>) {
  const before = api.snapshot();
  const r = await refusal(p());
  expect(api.snapshot()).toBe(before);
  return r;
}

describe('PRJ-001 / PRJ-002: projects in scope, figures per licence and permission', () => {
  it('the manager sees both Larkspur projects with figures computed from the units; totals add up', async () => {
    const p = await api.as('manager').get<ProjectsPortfolio>('/projects/portfolio');
    expect(p.items.map((x) => x.id).sort()).toEqual(['prj_gardens', 'prj_heights']);
    const heights = p.items.find((x) => x.id === 'prj_heights')!;
    expect(heights.units!.total).toBe(UNITS.filter((u) => u.projectId === 'prj_heights').length);
    const sum = Object.values(heights.units!.buckets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(heights.units!.total);
    expect(p.totals.units).toBe(UNITS.filter((u) => u.projectId.startsWith('prj_') && ['prj_heights', 'prj_gardens'].includes(u.projectId)).length);
    expect(heights.leads!.total).toBe(LEADS.filter((l) => l.projectId === 'prj_heights').length);
    expect(p.canSetUp).toBe(false);
  });

  it('a Heights-only salesperson never sees Gardens: list, totals, counts, 360 (hidden = unknown)', async () => {
    api.as('sales');
    const p = await api.get<ProjectsPortfolio>('/projects/portfolio');
    expect(p.items.map((x) => x.id)).toEqual(['prj_heights']);
    const text = JSON.stringify(p);
    expect(text).not.toContain('Gardens');
    expect(text).not.toContain('prj_gardens');
    expect(p.totals.units).toBe(UNITS.filter((u) => u.projectId === 'prj_heights').length);
    await api.get('/projects/prj_heights');
    const hidden = await refusedUnchanged(() => api.get('/projects/prj_gardens'));
    const unknown = await refusedUnchanged(() => api.get('/projects/prj_nope'));
    expect(hidden.status).toBe(404);
    expect(same(hidden)).toBe(same(unknown));
  });

  it('the header filter narrows lists, never a record named by id', async () => {
    const p = await api.as('manager').header('prj_heights').get<ProjectsPortfolio>('/projects/portfolio');
    expect(p.items.map((x) => x.id)).toEqual(['prj_heights']);
    const g = await api.get<Project360>('/projects/prj_gardens');
    expect(g.project.id).toBe('prj_gardens');
  });

  it('without project.view or unit.view the area is refused by the transport', async () => {
    const r = await refusal(api.as('finance').get('/projects/portfolio'));
    expect(r).toMatchObject({ status: 403, code: 'permission_missing' });
  });

  it('Crescent Bay: Towers figures shown, Plaza inventory withheld as not in the plan (never zero)', async () => {
    const p = await api.as('cb_manager').get<ProjectsPortfolio>('/projects/portfolio');
    const plaza = p.items.find((x) => x.id === 'prj_cb_plaza')!;
    expect(plaza.units).toBeNull();
    expect(plaza.unitsWithheld).toBe('not_in_plan');
    expect(plaza.storage).toBeNull();
    expect(p.items.find((x) => x.id === 'prj_cb_towers')!.units!.total).toBeGreaterThan(0);
    expect(JSON.stringify(p.totals)).toBe(JSON.stringify({ projects: 2, units: p.items.find((x) => x.id === 'prj_cb_towers')!.units!.total, buckets: p.items.find((x) => x.id === 'prj_cb_towers')!.units!.buckets }));
    const plaza360 = await api.get<Project360>('/projects/prj_cb_plaza');
    expect(plaza360.tabs.find((t) => t.id === 'units')!.state).toBe('not_in_plan');
    expect(plaza360.tabs.find((t) => t.id === 'construction')!.state).toBe('not_in_plan');
    expect(plaza360.inventory).toBeNull();
  });

  it('Project 360 tabs: E.2 tabs live, later slices planned with their gate, unlicensed ones not in the plan', async () => {
    const h = await api.as('manager').get<Project360>('/projects/prj_heights');
    const state = Object.fromEntries(h.tabs.map((t) => [t.id, t.gate ? `${t.state}:${t.gate}` : t.state]));
    expect(state).toMatchObject({ overview: 'live', leads: 'live', units: 'live', activity: 'live', bookings: 'planned:E.5', construction: 'planned:E.10', handover: 'planned:E.11', documents: 'planned:E.13', analytics: 'planned:E.12' });
    expect(h.tabs).toHaveLength(15);
    expect(h.inventory!.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(h.documents.items).toEqual([]);
    // The projects officer reads units but not leads: the leads tab says so, and no lead is returned.
    const o = await api.as('lk_project_officer').get<Project360>('/projects/prj_heights');
    expect(o.tabs.find((t) => t.id === 'leads')!.state).toBe('no_permission');
    expect(o.leads).toBeNull();
    expect(JSON.stringify(o)).not.toMatch(/LD-2026-|led_\d/);
  });
});

describe('INV-001 / INV-002: unit matrix and quick view', () => {
  it('the matrix shows every Heights unit by tower and floor (top floor first); filters mark matches', async () => {
    const m = await api.as('manager').get<UnitMatrix>('/inventory/matrix', { project: 'prj_heights' });
    expect(m.total).toBe(UNITS.filter((u) => u.projectId === 'prj_heights').length);
    expect(m.groups.map((g) => g.label)).toEqual(['A', 'B', 'C']);
    expect(m.groups[0]!.floors![0]!.level).toBe(18);
    expect(m.groups[0]!.floors![0]!.cells.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const f = await api.get<UnitMatrix>('/inventory/matrix', { project: 'prj_heights', bucket: 'available' });
    expect(f.matched).toBe(m.counts.available);
    const cells = f.groups.flatMap((g) => g.floors!.flatMap((fl) => fl.cells));
    expect(cells.filter((c) => c.match).every((c) => c.bucket === 'available')).toBe(true);
  });

  it('out-of-scope projects, towers and units answer exactly like unknown ones', async () => {
    api.as('sales');
    const m = await api.get<UnitMatrix>('/inventory/matrix');
    expect(m.projects.map((p) => p.id)).toEqual(['prj_heights']);
    expect(JSON.stringify(m)).not.toMatch(/LG-P|prj_gardens/);
    const hiddenProject = await refusedUnchanged(() => api.get('/inventory/matrix', { project: 'prj_gardens' }));
    const unknownProject = await refusedUnchanged(() => api.get('/inventory/matrix', { project: 'prj_nope' }));
    expect(same(hiddenProject)).toBe(same(unknownProject));
    const gardenUnit = avail('prj_gardens');
    const hiddenUnit = await refusedUnchanged(() => api.get(`/inventory/units/${gardenUnit.id}`));
    const unknownUnit = await refusedUnchanged(() => api.get('/inventory/units/unt_nope'));
    expect(hiddenUnit.status).toBe(404);
    expect(same(hiddenUnit)).toBe(same(unknownUnit));
  });

  it('Crescent Bay: Plaza and the unassigned import are unreachable; Towers is the only matrix', async () => {
    api.as('cb_manager');
    const m = await api.get<UnitMatrix>('/inventory/matrix');
    expect(m.projects.map((p) => p.id)).toEqual(['prj_cb_towers']);
    expect((await refusal(api.get('/inventory/matrix', { project: 'prj_cb_plaza' }))).status).toBe(404);
    expect((await refusal(api.get('/inventory/units/unt_cb_p_0101'))).status).toBe(404);
    expect((await refusal(api.get('/inventory/units/unt_cb_import_001'))).status).toBe(404);
    const s = await api.get<StorageList>('/inventory/storage');
    expect(s.items.every((x) => x.projectId === 'prj_cb_towers')).toBe(true);
    expect(JSON.stringify(s)).not.toContain('CB-ST-P');
  });

  it('dimensions and the legacy status are both given; a seeded hold is labelled seed and never releasable', async () => {
    const seeded = withStatus('prj_heights', 'held');
    const d = await api.as('sales').get<UnitInventoryDetail>(`/inventory/units/${seeded.id}`);
    expect(d.dimensions.inventory).toBe('held');
    expect(d.legacy).toBe('held');
    expect(d.hold).toEqual({ source: 'seed', mine: false });
    expect(d.canHold).toBe(false);
    expect(d.canRelease).toBe(false);
    const r = await refusedUnchanged(() => api.post(`/inventory/units/${seeded.id}/release`));
    expect(r.status).toBe(404);
  });
});

describe('Holds: one in force per unit, owner-only release, expiry against the demo clock (Issue #23 rule)', () => {
  it('a hold shows everywhere at once; another person can neither hold it again nor release it', async () => {
    const unit = avail('prj_heights');
    const lead = openLead('prj_heights');
    api.as('sales');
    await api.get('/inventory/matrix');
    const res = await api.post<{ until: string }>(`/inventory/units/${unit.id}/hold`, { leadId: lead.id });
    expect(Date.parse(res.until) - Date.now()).toBeGreaterThan(47 * 3_600_000);
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(d.bucket).toBe('held');
    expect(d.hold).toMatchObject({ source: 'live', mine: true, leadRef: lead.ref, holderName: 'Bilal Ahmed' });
    expect(d.canRelease).toBe(true);
    const av = await api.get<AvailabilitySnapshot>('/inventory/availability');
    expect(av.holds.map((h) => h.unitRef)).toContain(unit.ref);
    expect(api.holds()[unit.id]).toMatchObject({ leadId: lead.id, principalId: 'usr_lsp_0002' });

    api.as('manager');
    const again = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights', 1).id }));
    expect(again).toMatchObject({ status: 409, code: 'unit_unavailable' });
    const notMine = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/release`));
    const notHeld = await refusedUnchanged(() => api.post(`/inventory/units/${avail('prj_heights', 3).id}/release`));
    const unknown = await refusedUnchanged(() => api.post('/inventory/units/unt_nope/release'));
    expect(notMine.status).toBe(404);
    expect(same(notMine)).toBe(same(notHeld));
    expect(same(notMine)).toBe(same(unknown));
    const managerView = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(managerView.hold!.mine).toBe(false);
    expect(managerView.canRelease).toBe(false);

    api.as('sales');
    await api.post(`/inventory/units/${unit.id}/release`);
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).bucket).toBe('available');
    expect(api.inv().events.map((e) => e.kind).slice(0, 2)).toEqual(['unit_released', 'unit_held']);
  });

  it('an expired hold no longer counts as held: available again, release refused, re-hold allowed, history kept', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T08:00:00Z'));
    const unit = avail('prj_heights', 1);
    api.as('sales');
    await api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights').id });
    vi.setSystemTime(new Date('2026-11-10T07:59:59Z'));
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).bucket).toBe('held');
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(d.bucket).toBe('available');
    expect(d.hold).toBeUndefined();
    const av = await api.get<AvailabilitySnapshot>('/inventory/availability');
    expect(av.holds.map((h) => h.unitId)).not.toContain(unit.id);
    expect(av.lapsed.map((h) => h.unitId)).toContain(unit.id);
    // The stored hold and its history stay as they were.
    expect(api.holds()[unit.id]).toBeTruthy();
    const r = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/release`));
    expect(r.status).toBe(404);
    api.as('manager');
    await api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights', 2).id });
    const after = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(after.hold).toMatchObject({ mine: true, holderName: 'Nadia Rahman' });
    expect(after.history.filter((e) => e.kind === 'unit_held')).toHaveLength(2);
  });

  it('a legacy hold without a recorded principal (the CRM path today) counts while in force and is never releasable here', async () => {
    const unit = avail('prj_heights', 2);
    api.as('sales');
    await api.post(`/units/${unit.id}/hold`, { leadId: openLead('prj_heights').id });
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(d.bucket).toBe('held');
    expect(d.hold!.mine).toBe(false);
    for (const who of ['sales', 'manager']) {
      const r = await refusedUnchanged(() => api.as(who).post(`/inventory/units/${unit.id}/release`));
      expect(r.status).toBe(404);
    }
  });

  it('the lead must be an open lead of the unit’s project the person may see (hidden = invented)', async () => {
    const unit = avail('prj_heights', 4);
    api.as('sales');
    await api.get('/inventory/matrix');
    const hidden = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_gardens').id }));
    const invented = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/hold`, { leadId: 'led_nope' }));
    expect(hidden).toMatchObject({ status: 422, errors: { leadId: [{ code: 'projects:problems.leadNotEligible' }] } });
    expect(same(hidden)).toBe(same(invented));
    const missing = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/hold`, {}));
    expect(missing.errors).toEqual({ leadId: [{ code: 'projects:problems.leadRequired' }] });
    // The manager may see Gardens leads, but a Gardens lead is still not eligible for a Heights unit.
    const other = await refusedUnchanged(() => api.as('manager').post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_gardens').id }));
    expect(other.status).toBe(422);
  });

  it('seeded reserved and booked stock cannot be held', async () => {
    api.as('manager');
    await api.get('/inventory/matrix');
    for (const status of ['reserved', 'booked', 'held', 'blocked']) {
      const u = withStatus('prj_heights', status);
      const r = await refusedUnchanged(() => api.post(`/inventory/units/${u.id}/hold`, { leadId: openLead('prj_heights').id }));
      expect(r, status).toMatchObject({ status: 409, code: 'unit_unavailable' });
    }
  });

  it('bound idempotency: the identical request replays; any other reuse of the key is refused and changes nothing', async () => {
    const unit = avail('prj_heights', 5);
    const lead = openLead('prj_heights');
    api.as('sales');
    const first = await api.post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id }, { key: 'k-hold-1' });
    const replay = await api.post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id }, { key: 'k-hold-1' });
    expect(replay).toEqual(first);
    expect(api.inv().events.filter((e) => e.kind === 'unit_held')).toHaveLength(1);
    const otherInput = await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights', 1).id }, { key: 'k-hold-1' }));
    const otherTarget = await refusedUnchanged(() => api.post(`/inventory/units/${avail('prj_heights', 6).id}/hold`, { leadId: lead.id }, { key: 'k-hold-1' }));
    const otherPerson = await refusedUnchanged(() => api.as('manager').post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id }, { key: 'k-hold-1' }));
    for (const r of [otherInput, otherTarget, otherPerson]) expect(r).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
  });

  it('unauthorised and revoked: the transport refuses before the handler; state unchanged', async () => {
    const unit = avail('prj_heights', 7);
    api.as('manager');
    await api.get('/inventory/matrix');
    expect(await refusedUnchanged(() => api.as('lk_project_officer').post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights').id }))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusedUnchanged(() => api.as('finance').get('/inventory/matrix'))).toMatchObject({ status: 403 });
    api.as('sales');
    await api.post(`/inventory/units/${unit.id}/hold`, { leadId: openLead('prj_heights').id });
    // Revoked mid-session: the hold permission, then the view permission, then the project.
    api.change('sales', minus('unit.hold'));
    expect(await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/release`))).toMatchObject({ status: 403, code: 'permission_missing' });
    api.change('sales', minus('unit.view'));
    expect(await refusedUnchanged(() => api.get(`/inventory/units/${unit.id}`))).toMatchObject({ status: 403 });
    api.change('sales', projectsOnly('prj_gardens'));
    expect(await refusedUnchanged(() => api.get(`/inventory/units/${unit.id}`))).toMatchObject({ status: 404 });
    expect(await refusedUnchanged(() => api.post(`/inventory/units/${unit.id}/release`))).toMatchObject({ status: 404 });
    api.change('sales', null);
    await api.post(`/inventory/units/${unit.id}/release`);
  });
});

describe('INV-010 storage: dedicated records, allocation history, no double allocation, cross-project protection', () => {
  const heightsLocker = 'stg_lh_a01';

  it('lists the seeded storage of the projects in scope; nobody starts allocated', async () => {
    const s = await api.as('manager').get<StorageList>('/inventory/storage');
    expect(s.items).toHaveLength(22);
    expect(s.counts).toMatchObject({ all: 22, available: 21, allocated: 0, out_of_service: 1 });
    expect(s.canManage).toBe(false);
    const b = await api.as('sales').get<StorageList>('/inventory/storage');
    expect(b.items.every((x) => x.projectId === 'prj_heights')).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/LG-ST|stg_lg/);
  });

  it('allocate to sold stock of the same project, then release with a reason; history kept; no double allocation', async () => {
    const target = sold('prj_heights');
    api.as('lk_project_officer');
    const v = await api.post<StorageUnitView>(`/inventory/storage/${heightsLocker}/allocate`, { unitId: target.id, note: 'Requested at booking (demo)' });
    expect(v).toMatchObject({ state: 'allocated', allocation: { unitRef: target.ref, byName: 'Hina Baig' } });
    const m = await api.get<UnitMatrix>('/inventory/matrix', { project: 'prj_heights' });
    const cell = m.groups.flatMap((g) => g.floors!.flatMap((f) => f.cells)).find((c) => c.id === target.id)!;
    expect(cell.storage).toBe(1);
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${target.id}`);
    expect(d.storage.map((x) => x.storageRef)).toEqual(['LH-ST-A01']);
    const twice = await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/allocate`, { unitId: sold('prj_heights', 1).id }));
    expect(twice).toMatchObject({ status: 409, code: 'storage_unavailable' });
    const short = await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/release`, { reason: 'no' }));
    expect(short.errors).toEqual({ reason: [{ code: 'projects:problems.releaseReason' }] });
    const released = await api.post<StorageUnitView>(`/inventory/storage/${heightsLocker}/release`, { reason: 'Buyer changed locker (demo)' });
    expect(released.state).toBe('available');
    expect(released.history.map((h) => h.action)).toEqual(['released', 'allocated']);
    expect(await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/release`, { reason: 'Again please' }))).toMatchObject({ status: 409, code: 'storage_not_allocated' });
  });

  it('cross-project protection: another project’s unit is refused; hidden units and storage answer like unknown ones', async () => {
    api.as('lk_project_officer');
    await api.get('/inventory/storage');
    const cross = await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/allocate`, { unitId: sold('prj_gardens').id }));
    expect(cross).toMatchObject({ status: 422, code: 'cross_project_forbidden' });
    expect(await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/allocate`, { unitId: avail('prj_heights').id }))).toMatchObject({ status: 422, errors: { unitId: [{ code: 'projects:problems.notSold' }] } });
    expect(await refusedUnchanged(() => api.post('/inventory/storage/stg_lh_b04/allocate', { unitId: sold('prj_heights').id }))).toMatchObject({ status: 409, code: 'storage_unavailable' });

    // A Heights-only allocator (test principal): Gardens storage and units do not exist for them.
    api.as('test_e2_clerk');
    const s = await api.get<StorageList>('/inventory/storage');
    expect(JSON.stringify(s)).not.toMatch(/LG-ST|stg_lg|Gardens/);
    const hiddenUnit = await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/allocate`, { unitId: sold('prj_gardens').id }));
    const inventedUnit = await refusedUnchanged(() => api.post(`/inventory/storage/${heightsLocker}/allocate`, { unitId: 'unt_nope' }));
    expect(hiddenUnit).toMatchObject({ status: 422, errors: { unitId: [{ code: 'projects:problems.targetNotEligible' }] } });
    expect(same(hiddenUnit)).toBe(same(inventedUnit));
    const hiddenStorage = await refusedUnchanged(() => api.post('/inventory/storage/stg_lg_p1_01/allocate', { unitId: sold('prj_heights').id }));
    const unknownStorage = await refusedUnchanged(() => api.post('/inventory/storage/stg_nope/allocate', { unitId: sold('prj_heights').id }));
    expect(hiddenStorage.status).toBe(404);
    expect(same(hiddenStorage)).toBe(same(unknownStorage));
    const targets = await api.get<Array<{ unitRef: string }>>(`/inventory/storage/${heightsLocker}/targets`);
    expect(targets.every((x) => x.unitRef.startsWith('LH-'))).toBe(true);
    expect((await refusal(api.get('/inventory/storage/stg_lg_p1_01/targets'))).status).toBe(404);
  });

  it('bound idempotency on allocation; unauthorised and revoked allocators are refused; state unchanged', async () => {
    api.as('lk_project_officer');
    const t = sold('prj_heights', 2);
    const a = await api.post<StorageUnitView>('/inventory/storage/stg_lh_a02/allocate', { unitId: t.id }, { key: 'k-alloc' });
    const b = await api.post<StorageUnitView>('/inventory/storage/stg_lh_a02/allocate', { unitId: t.id }, { key: 'k-alloc' });
    expect(b).toEqual(a);
    expect(api.inv().storage.find((x) => x.id === 'stg_lh_a02')!.history).toHaveLength(1);
    expect(await refusedUnchanged(() => api.post('/inventory/storage/stg_lh_a03/allocate', { unitId: t.id }, { key: 'k-alloc' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusedUnchanged(() => api.as('manager').post('/inventory/storage/stg_lh_a03/allocate', { unitId: t.id }))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusedUnchanged(() => api.as('sales').post('/inventory/storage/stg_lh_a03/allocate', { unitId: t.id }))).toMatchObject({ status: 403 });
    api.as('lk_project_officer').change('lk_project_officer', minus('storage.manage'));
    expect(await refusedUnchanged(() => api.post('/inventory/storage/stg_lh_a02/release', { reason: 'Revoked test' }))).toMatchObject({ status: 403 });
  });
});

describe('PRJ-003 project setup: draft → submitted → activated by someone else (maker ≠ checker)', () => {
  const basics = { name: 'Larkspur Courtyard (Demo)', code: 'LC', city: 'Lahore', kind: 'towers' };
  const structure = { towers: [{ name: 'A', floors: 12, unitsPerFloor: 6 }, { name: 'B', floors: 10, unitsPerFloor: 6 }] };

  async function prepared(): Promise<ProjectSetupRecord> {
    api.as('lk_project_officer');
    const r = await api.post<ProjectSetupRecord>('/projects', { basics });
    await api.post(`/projects/${r.id}/setup/site`, { value: { siteId: 'site_lk_heights' } });
    await api.post(`/projects/${r.id}/setup/structure`, { value: structure });
    return api.post<ProjectSetupRecord>(`/projects/${r.id}/submit`);
  }

  it('the officer prepares and submits; the director activates; the project then appears for every projects reader', async () => {
    const r = await prepared();
    expect(r).toMatchObject({ state: 'submitted', plannedUnits: 132, canDecide: false, mine: true });
    const list = await api.as('lk_projects_director').get<ProjectSetupList>('/projects/setup');
    expect(list.items[0]).toMatchObject({ id: r.id, canDecide: true, mine: false });
    const done = await api.post<ProjectSetupRecord>(`/projects/${r.id}/activate`);
    expect(done).toMatchObject({ state: 'active', decidedByName: 'Kashan Lodhi' });
    const p = await api.as('manager').get<ProjectsPortfolio>('/projects/portfolio');
    expect(p.items.find((x) => x.id === r.id)).toMatchObject({ name: basics.name, state: 'active', units: { total: 0 } });
    const p360 = await api.get<Project360>(`/projects/${r.id}`);
    expect(p360.setup).toMatchObject({ state: 'active' });
    expect(p360.activity.map((e) => e.kind)).toEqual(['setup_activated', 'setup_submitted', 'setup_saved', 'setup_saved', 'setup_created']);
    // A Heights-only salesperson does not see a project their scope does not name.
    expect((await refusal(api.as('sales').get(`/projects/${r.id}`))).status).toBe(404);
  });

  it('nobody approves their own project, even holding both permissions (checked by principal)', async () => {
    const r = await prepared();
    api.change('lk_project_officer', plus('project.approve'));
    const own = await refusedUnchanged(() => api.as('lk_project_officer').post(`/projects/${r.id}/activate`));
    expect(own).toMatchObject({ status: 403, code: 'separation_of_duties' });
    const view = await api.get<ProjectSetupRecord>(`/projects/${r.id}/setup`);
    expect(view).toMatchObject({ canDecide: false, decideBlocked: 'own_request' });
    // The checker cannot prepare: no project.manage.
    expect(await refusedUnchanged(() => api.as('lk_projects_director').post(`/projects/${r.id}/setup/basics`, { value: basics }))).toMatchObject({ status: 403, code: 'permission_missing' });
    // Nothing is approved twice.
    await api.as('lk_projects_director').post(`/projects/${r.id}/activate`);
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/activate`))).toMatchObject({ status: 409, code: 'setup_not_submitted' });
  });

  it('return with a reason, edit and resubmit; validation of every field before anything is stored', async () => {
    const r = await prepared();
    api.as('lk_projects_director');
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/return`, { reason: 'short' }))).toMatchObject({ status: 422, errors: { reason: [{ code: 'projects:problems.returnReason' }] } });
    const back = await api.post<ProjectSetupRecord>(`/projects/${r.id}/return`, { reason: 'Tower B needs a basement storage plan first.' });
    expect(back).toMatchObject({ state: 'returned', returnReason: 'Tower B needs a basement storage plan first.' });
    api.as('lk_project_officer');
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/basics`, { value: { ...basics, code: 'lh' } }))).toMatchObject({ status: 422, errors: { code: [{ code: 'projects:problems.codeTaken' }] } });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/basics`, { value: { ...basics, code: 'TOO-LONG', name: 'X' } }))).toMatchObject({
      status: 422,
      errors: { code: [{ code: 'projects:problems.codeFormat' }], name: [{ code: 'projects:problems.nameLength' }] },
    });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/structure`, { value: { towers: [{ name: 'A', floors: 0, unitsPerFloor: 99 }], phases: [{ label: 'P', plots: 3 }] } }))).toMatchObject({ status: 422 });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/site`, { value: { siteId: 'site_cb_towers' } }))).toMatchObject({ status: 422, errors: { siteId: [{ code: 'projects:problems.site' }] } });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/site`, { value: { siteId: 'site_lk_heights', legalEntityId: 'le_crescent' } }))).toMatchObject({ status: 422, errors: { legalEntityId: [{ code: 'projects:problems.entityFixed' }] } });
    await api.post(`/projects/${r.id}/setup/structure`, { value: { towers: [{ name: 'A', floors: 12, unitsPerFloor: 6 }] } });
    expect((await api.post<ProjectSetupRecord>(`/projects/${r.id}/submit`)).state).toBe('submitted');
    expect((await api.as('lk_projects_director').post<ProjectSetupRecord>(`/projects/${r.id}/activate`)).state).toBe('active');
  });

  it('an incomplete draft cannot be submitted; a submitted one cannot be edited; only the maker edits', async () => {
    api.as('lk_project_officer');
    const r = await api.post<ProjectSetupRecord>('/projects', { basics: { ...basics, code: 'LQ', kind: 'plots' } });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/submit`))).toMatchObject({ status: 422, errors: { site: [{ code: 'projects:problems.stepMissing.site' }], structure: [{ code: 'projects:problems.stepMissing.structure' }] } });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/structure`, { value: { towers: [{ name: 'A', floors: 3, unitsPerFloor: 3 }] } }))).toMatchObject({ status: 422 });
    await api.post(`/projects/${r.id}/setup/structure`, { value: { phases: [{ label: 'Phase 1', plots: 40 }] } });
    await api.post(`/projects/${r.id}/setup/site`, { value: { siteId: 'site_lk_gardens' } });
    await api.post(`/projects/${r.id}/submit`);
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/basics`, { value: basics }))).toMatchObject({ status: 409, code: 'setup_locked' });
  });

  it('only the person who prepared a draft changes or submits it; another preparer is refused and nothing changes', async () => {
    api.as('lk_project_officer');
    const r = await api.post<ProjectSetupRecord>('/projects', { basics: { ...basics, code: 'LW' } });
    api.as('test_e2_officer2');
    const view = await api.get<ProjectSetupRecord>(`/projects/${r.id}/setup`);
    expect(view).toMatchObject({ mine: false, canEdit: false, canSubmit: false });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/basics`, { value: { ...basics, code: 'LX' } }))).toMatchObject({ status: 403, code: 'not_maker' });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/setup/site`, { value: { siteId: 'site_lk_heights' } }))).toMatchObject({ status: 403, code: 'not_maker' });
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/submit`))).toMatchObject({ status: 403, code: 'not_maker' });
  });

  it('who may see setup: setup people only; a project-scoped reader gets the answer of an unknown id', async () => {
    const r = await prepared();
    expect(await refusal(api.as('sales').get('/projects/setup'))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusal(api.as('manager').get('/projects/setup'))).toMatchObject({ status: 403, code: 'permission_missing' });
    // Readers of the projects area see active projects only: a draft is neither listed nor counted for them.
    const portfolio = await api.as('manager').get<ProjectsPortfolio>('/projects/portfolio');
    expect(portfolio.inSetup).toBe(0);
    expect(JSON.stringify(portfolio)).not.toContain(r.id);
    expect(await refusal(api.get(`/projects/${r.id}`))).toMatchObject({ status: 404 });
    api.as('lk_projects_director').change('lk_projects_director', projectsOnly('prj_heights'));
    const hidden = await refusal(api.get(`/projects/${r.id}/setup`));
    const unknown = await refusal(api.get('/projects/psu_999/setup'));
    expect(hidden.status).toBe(404);
    expect(same(hidden)).toBe(same(unknown));
    expect(await refusedUnchanged(() => api.post(`/projects/${r.id}/activate`))).toMatchObject({ status: 404 });
  });

  it('bound idempotency on create: identical replays the same draft; a changed request with the key is refused', async () => {
    api.as('lk_project_officer');
    const a = await api.post<ProjectSetupRecord>('/projects', { basics: { ...basics, code: 'LK' } }, { key: 'k-create' });
    const b = await api.post<ProjectSetupRecord>('/projects', { basics: { ...basics, code: 'LK' } }, { key: 'k-create' });
    expect(b.id).toBe(a.id);
    expect(api.inv().setup).toHaveLength(1);
    expect(await refusedUnchanged(() => api.post('/projects', { basics: { ...basics, code: 'LZ' } }, { key: 'k-create' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
  });
});

describe('Nested-history projection (§4.4): a narrow reader never receives lead references', () => {
  it('the projects officer reads 360, unit and availability without any lead reference; the manager keeps them', async () => {
    const unit = avail('prj_heights', 8);
    const lead = openLead('prj_heights');
    await api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id });
    await api.as('lk_project_officer').post(`/inventory/storage/stg_lh_c01/allocate`, { unitId: sold('prj_heights', 3).id });
    const narrow = [
      await api.get(`/projects/prj_heights`),
      await api.get(`/inventory/units/${unit.id}`),
      await api.get('/inventory/availability'),
      await api.get('/inventory/matrix', { project: 'prj_heights' }),
    ];
    const text = JSON.stringify(narrow);
    expect(text).not.toContain(lead.ref);
    expect(text).not.toContain(lead.id);
    expect(text).toContain(unit.ref);
    const full = JSON.stringify(await api.as('manager').get(`/inventory/units/${unit.id}`));
    expect(full).toContain(lead.ref);
  });
});
