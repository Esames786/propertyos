import type { AppNotification, Floor, Project, Tower, Unit, UnitStatus, UnitType } from '@repo/contracts';
import { generateVisits } from '../crm-data';
import type { TenantDataset } from '../dataset-types';
import { generateParties } from '../people';
import { generateInvoices, generateLeads } from '../records';
import { createRandom, daysFromNow, pad } from '../seed';

/**
 * Crescent Bay Developers (Demo): the two-site tenant for the owner's site-entitlement check
 * (CP2 security correction 2). Crescent Bay Towers is a residential site where sales inventory,
 * construction and handover are licensed; Crescent Bay Plaza is a commercial building the same
 * company manages, where only maintenance is licensed. Sales inventory records of the Plaza exist
 * but are out of reach. Everything is fictional and generated from fixed seeds.
 */
export const CRESCENT_ID = 'tnt_crescent';

const PROJECTS: readonly Project[] = [
  { id: 'prj_cb_towers', ref: 'CBT', name: 'Crescent Bay Towers', city: 'Karachi', kind: 'towers', siteId: 'site_cb_towers', legalEntityId: 'le_crescent' },
  { id: 'prj_cb_plaza', ref: 'CBP', name: 'Crescent Bay Plaza', city: 'Karachi', kind: 'commercial', siteId: 'site_cb_plaza', legalEntityId: 'le_crescent' },
];

const TOWERS: readonly Tower[] = [
  { id: 'twr_cb_a', projectId: 'prj_cb_towers', name: 'A', floorCount: 6 },
  { id: 'twr_cb_b', projectId: 'prj_cb_towers', name: 'B', floorCount: 6 },
  { id: 'twr_cb_p', projectId: 'prj_cb_plaza', name: 'P', floorCount: 3 },
];

const FLOORS: readonly Floor[] = TOWERS.flatMap((t) => Array.from({ length: t.floorCount }, (_, i) => ({ id: `flr_${t.id.slice(4)}_${pad(i + 1, 2)}`, towerId: t.id, level: i + 1 })));

const STATUS: ReadonlyArray<readonly [UnitStatus, number]> = [
  ['available', 50],
  ['held', 6],
  ['reserved', 6],
  ['booked', 24],
  ['allocated', 8],
  ['blocked', 2],
];

function generateUnits(): Unit[] {
  const rnd = createRandom(7_2027);
  const units: Unit[] = [];
  for (const tower of TOWERS) {
    const plaza = tower.projectId === 'prj_cb_plaza';
    for (const floor of FLOORS.filter((f) => f.towerId === tower.id)) {
      for (let n = 1; n <= (plaza ? 6 : 4); n++) {
        const type: UnitType = plaza ? 'shop' : n === 1 || n === 4 ? 'apartment_3bed' : 'apartment_2bed';
        const area = plaza ? rnd.int(220, 900) : type === 'apartment_3bed' ? rnd.int(1500, 1800) : rnd.int(1050, 1250);
        const rate = plaza ? 42000 : 21000 + floor.level * 300;
        const ref = `CB-${tower.name}-${pad(floor.level, 2)}${pad(n, 2)}`;
        units.push({
          id: `unt_${ref.toLowerCase().replace(/-/g, '_')}`,
          ref,
          projectId: tower.projectId,
          towerId: tower.id,
          floorId: floor.id,
          type,
          areaSqft: area,
          price: { amount: `${Math.round((area * rate) / 1000) * 1000}.00`, currency: 'PKR' },
          status: rnd.weighted(STATUS),
        });
      }
    }
  }
  return units;
}

/**
 * A flat imported from the old sales sheet before it was assigned to a project, so it has no site.
 * Inventory is licensed per site, so this record is refused (site_context_missing) until it is
 * assigned: a missing site is never treated as licensed.
 */
const UNASSIGNED: Unit = {
  id: 'unt_cb_import_001', ref: 'CB-IMPORT-001', projectId: 'prj_cb_unassigned', type: 'apartment_2bed',
  areaSqft: 1120, price: { amount: '23520000.00', currency: 'PKR' }, status: 'available',
};
const UNITS = [...generateUnits(), UNASSIGNED];
const PARTIES = generateParties({ seed: 20261103, count: 40, idPrefix: 'pty_cb_', refPrefix: 'CBC-' });
const LEADS = generateLeads({ seed: 5511, parties: PARTIES, count: 36, idPrefix: 'led_cb_', refPrefix: 'CB-LD-', primary: 'prj_cb_towers', secondary: 'prj_cb_plaza', primaryShare: 0.8, owner: 'cb_manager', fallbackOwner: 'cb_manager' });
const INVOICES = generateInvoices({ seed: 9191, units: UNITS.filter((u) => u.projectId === 'prj_cb_towers'), parties: PARTIES, count: 10, idPrefix: 'inv_cb_', refPrefix: 'CB-INV-', refBase: 500 });
const VISITS = generateVisits({ seed: 5252, leads: LEADS, units: UNITS, parties: PARTIES, projects: PROJECTS, count: 10, idPrefix: 'vst_cb_' });

const NOTIFICATIONS: readonly AppNotification[] = [
  {
    id: 'ntf_cb_001', titleKey: 'notifications.leadAssigned.title', bodyKey: 'notifications.leadAssigned.body',
    params: { ref: LEADS[0]!.ref }, createdAt: daysFromNow(0, 7), read: false,
    href: '/backoffice/crm/lead-360-workspace', audience: 'lead.view',
  },
  {
    id: 'ntf_cb_002', titleKey: 'notifications.invoiceOverdue.title', bodyKey: 'notifications.invoiceOverdue.body',
    params: { ref: INVOICES[1]!.ref }, createdAt: daysFromNow(-1, 9), read: false,
    href: '/backoffice/fin/invoice-workspace', audience: 'invoice.view',
  },
];

export const CRESCENT: TenantDataset = {
  tenantId: CRESCENT_ID,
  projects: PROJECTS,
  towers: TOWERS,
  floors: FLOORS,
  blocks: [],
  units: UNITS,
  parties: PARTIES,
  leads: LEADS,
  invoices: INVOICES,
  visits: VISITS,
  notifications: NOTIFICATIONS,
  partyLinks: [],
  refs: { party: 'CBC-', lead: 'CB-LD-', city: 'Karachi' },
};
