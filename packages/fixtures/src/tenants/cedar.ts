import type { Floor, Invoice, InvoiceSettlement, Project, Tower, Unit } from '@repo/contracts';
import type { TenantDataset } from '../dataset-types';
import { generateParties } from '../people';
import { billingAccountOf } from '../records';
import { calendarDaysFromNow, createRandom, pad } from '../seed';

/**
 * Cedar Hills Co-operative (Demo), suspended since 30 Sep 2026 for unpaid platform invoices
 * (CP2 security correction 4). Its treasurer may still read the co-operative's financial history
 * (dues invoices and what was paid) but no operational change goes through while it is suspended.
 */
export const CEDAR_ID = 'tnt_cedar';

const PROJECTS: readonly Project[] = [{ id: 'prj_cedar', ref: 'CH', name: 'Cedar Hills', city: 'Peshawar', kind: 'towers', siteId: 'site_cedar', legalEntityId: 'le_cedar' }];

const TOWERS: readonly Tower[] = ['1', '2', '3', '4'].map((n) => ({ id: `twr_ch_${n}`, projectId: 'prj_cedar', name: `Block ${n}`, floorCount: 5 }));
const FLOORS: readonly Floor[] = TOWERS.flatMap((t) => Array.from({ length: t.floorCount }, (_, i) => ({ id: `flr_${t.id.slice(4)}_${pad(i + 1, 2)}`, towerId: t.id, level: i + 1 })));

const UNITS: readonly Unit[] = TOWERS.flatMap((t, b) =>
  FLOORS.filter((f) => f.towerId === t.id).flatMap((f) =>
    [1, 2, 3].map((n) => {
      const ref = `CH-${b + 1}-${pad(f.level, 2)}${pad(n, 2)}`;
      return { id: `unt_${ref.toLowerCase().replace(/-/g, '_')}`, ref, projectId: 'prj_cedar', towerId: t.id, floorId: f.id, type: 'apartment_2bed' as const, areaSqft: 1100, price: { amount: '0.00', currency: 'PKR' as const }, status: 'occupied' as const };
    }),
  ),
);

const PARTIES = generateParties({ seed: 20261104, count: 24, idPrefix: 'pty_ch_', refPrefix: 'CHM-' });

/** Monthly maintenance dues for 24 flats, July to September 2026 (before the suspension). */
function generateDues(): Invoice[] {
  const rnd = createRandom(6060);
  const invoices: Invoice[] = [];
  const months = [
    { label: '07', due: calendarDaysFromNow(-108) },
    { label: '08', due: calendarDaysFromNow(-77) },
    { label: '09', due: calendarDaysFromNow(-46) },
  ];
  for (const m of months) {
    UNITS.slice(0, 24).forEach((unit, i) => {
      const settlement = rnd.weighted<InvoiceSettlement>([['paid', 7], ['partially_paid', 1], ['unpaid', 2]]);
      const total = '4500.00';
      invoices.push({
        id: `inv_ch_${m.label}_${pad(i + 1, 3)}`,
        ref: `CH-DUES-2026${m.label}-${pad(i + 1, 3)}`,
        partyId: PARTIES[i]!.id,
        unitId: unit.id,
        projectId: unit.projectId,
        billingAccountId: billingAccountOf(unit.id),
        kind: 'maintenance',
        total: { amount: total, currency: 'PKR' },
        paid: { amount: settlement === 'paid' ? total : settlement === 'partially_paid' ? '2000.00' : '0.00', currency: 'PKR' },
        dueDate: m.due,
        issuance: 'issued',
        settlement,
        evidence: settlement === 'paid' ? 'verified' : 'none',
      });
    });
  }
  return invoices;
}

export const CEDAR: TenantDataset = {
  tenantId: CEDAR_ID,
  projects: PROJECTS,
  towers: TOWERS,
  floors: FLOORS,
  blocks: [],
  units: UNITS,
  parties: PARTIES,
  leads: [],
  invoices: generateDues(),
  visits: [],
  notifications: [],
  partyLinks: [],
  refs: { party: 'CHM-', lead: 'CH-LD-', city: 'Peshawar' },
};
